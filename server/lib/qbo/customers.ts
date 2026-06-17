/**
 * QBO Customer sync. Server-only.
 *
 * Direction: CRM → QBO (create/update) with QBO → CRM webhook updates handled
 * elsewhere. Duplicate prevention is two-layered:
 *   1. `qbo_entity_map` lookup by CRM job id (authoritative once a mapping exists).
 *   2. Before creating, query QBO for an existing Customer with the same DisplayName
 *      and ADOPT it into the map rather than creating a duplicate.
 * Updates always round-trip the stored SyncToken; on a 409 conflict we refetch the
 * customer, re-apply, and retry once.
 */
import { storage } from "../../storage";
import { qboRequest, qboQuery, QboApiError } from "./client";
import { checksum } from "./crypto";
import type { Job } from "@shared/schema";

export interface QboCustomer {
  Id: string;
  SyncToken: string;
  DisplayName: string;
  [k: string]: any;
}

/** Escape a value for use inside a QBO query string literal. */
function q(value: string): string {
  return value.replace(/'/g, "\\'");
}

/** Build the QBO Customer payload from a CRM job (opportunity). */
export function buildCustomerPayload(job: Job): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    DisplayName: job.customer,
    CompanyName: job.classification === "Commercial" ? job.customer : undefined,
  };
  if (job.email) payload.PrimaryEmailAddr = { Address: job.email };
  if (job.phone) payload.PrimaryPhone = { FreeFormNumber: job.phone };
  const line1 = job.addressLine1 || job.address || job.property;
  if (line1 || job.city || job.state || job.postalCode) {
    payload.BillAddr = {
      Line1: line1 || undefined,
      City: job.city || undefined,
      CountrySubDivisionCode: job.state || undefined,
      PostalCode: job.postalCode || undefined,
    };
  }
  return payload;
}

/** Find an existing QBO customer by exact DisplayName (dedupe before create). */
export async function findCustomerByDisplayName(
  name: string,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboCustomer | null> {
  const resp = await qboQuery<{ QueryResponse: { Customer?: QboCustomer[] } }>(
    `SELECT * FROM Customer WHERE DisplayName = '${q(name)}'`,
    { action: "customer_query", ...meta },
  );
  return resp?.QueryResponse?.Customer?.[0] || null;
}

/** Fetch a single customer (used to refresh SyncToken on 409). */
export async function getCustomer(
  id: string,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboCustomer> {
  const resp = await qboRequest<{ Customer: QboCustomer }>({
    path: `customer/${id}?minorversion=65`, method: "GET", action: "customer_get", ...meta,
  });
  return resp.Customer;
}

/**
 * Create or update the QBO customer for an opportunity. Idempotent: re-runs reuse
 * the mapping and skip the write if the payload is unchanged (checksum match).
 * Returns the QBO customer id.
 */
export async function upsertCustomerForOpportunity(
  opportunityId: number,
  actorUserId: number | null = null,
): Promise<{ qboCustomerId: string; created: boolean }> {
  const job = storage.getJob(opportunityId);
  if (!job) throw new Error(`Opportunity ${opportunityId} not found`);
  const meta = { actorUserId, opportunityId };
  const payload = buildCustomerPayload(job);
  const sum = checksum(payload);

  const existing = storage.getMapByCrm("customer", opportunityId);

  // Already mapped — update only if the payload changed.
  if (existing) {
    if (existing.checksum === sum) {
      return { qboCustomerId: existing.qboEntityId, created: false };
    }
    await updateCustomer(existing.qboEntityId, existing.qboSyncToken, payload, meta);
    storage.upsertMap({
      crmEntityType: "customer", crmEntityId: opportunityId, qboEntityType: "Customer",
      qboEntityId: existing.qboEntityId, lastSyncDirection: "push", checksum: sum,
    });
    storage.updateJob(opportunityId, { qboCustomerId: existing.qboEntityId, qboLastSyncedAt: Date.now() } as any);
    return { qboCustomerId: existing.qboEntityId, created: false };
  }

  // Not mapped — dedupe by DisplayName before creating.
  const dupe = await findCustomerByDisplayName(job.customer, meta);
  if (dupe) {
    storage.upsertMap({
      crmEntityType: "customer", crmEntityId: opportunityId, qboEntityType: "Customer",
      qboEntityId: dupe.Id, qboSyncToken: dupe.SyncToken, lastSyncDirection: "push", checksum: sum,
    });
    storage.updateJob(opportunityId, { qboCustomerId: dupe.Id, qboLastSyncedAt: Date.now() } as any);
    return { qboCustomerId: dupe.Id, created: false };
  }

  const created = await qboRequest<{ Customer: QboCustomer }>({
    path: "customer?minorversion=65", method: "POST", body: payload, action: "customer_create", ...meta,
  });
  const c = created.Customer;
  storage.upsertMap({
    crmEntityType: "customer", crmEntityId: opportunityId, qboEntityType: "Customer",
    qboEntityId: c.Id, qboSyncToken: c.SyncToken, lastSyncDirection: "push", checksum: sum,
  });
  storage.updateJob(opportunityId, { qboCustomerId: c.Id, qboLastSyncedAt: Date.now() } as any);
  return { qboCustomerId: c.Id, created: true };
}

/** Sparse update with SyncToken round-trip and a single 409 refetch+retry. */
async function updateCustomer(
  id: string,
  syncToken: string | null,
  payload: Record<string, unknown>,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboCustomer> {
  const token = syncToken ?? (await getCustomer(id, meta)).SyncToken;
  const body = { ...payload, Id: id, SyncToken: token, sparse: true };
  try {
    const resp = await qboRequest<{ Customer: QboCustomer }>({
      path: "customer?minorversion=65", method: "POST", body, action: "customer_update", ...meta,
    });
    return resp.Customer;
  } catch (e) {
    if (e instanceof QboApiError && e.conflict) {
      const fresh = await getCustomer(id, meta);
      const retry = { ...payload, Id: id, SyncToken: fresh.SyncToken, sparse: true };
      const resp = await qboRequest<{ Customer: QboCustomer }>({
        path: "customer?minorversion=65", method: "POST", body: retry, action: "customer_update_retry", ...meta,
      });
      return resp.Customer;
    }
    throw e;
  }
}
