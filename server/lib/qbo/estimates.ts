/**
 * QBO Estimate push. Server-only. Direction: CRM → QBO (CRM authoritative).
 *
 * A CRM estimate's contract total is pushed as a QBO Estimate. QBO Lines reference
 * Items from the QBO catalog; since this v1 does not sync an item catalog, we push
 * a single descriptive SalesItemLineDetail line for the contract total (and, when
 * the CRM estimate carries section breakdowns, one line per section). Pushing is
 * idempotent via `qbo_entity_map` (keyed by CRM estimate id) + checksum.
 */
import { storage } from "../../storage";
import { qboRequest, QboApiError } from "./client";
import { checksum } from "./crypto";
import { upsertCustomerForOpportunity } from "./customers";
import type { Estimate } from "@shared/schema";

export interface QboEstimate {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TotalAmt?: number;
  [k: string]: any;
}

interface SectionLine { name?: string; total?: number; amount?: number }

/** Derive QBO Lines from a CRM estimate. Falls back to a single contract-total line. */
export function buildEstimateLines(est: Estimate): Array<Record<string, unknown>> {
  let sections: SectionLine[] = [];
  try { sections = JSON.parse(est.sectionsJson || "[]"); } catch { sections = []; }
  const sectionLines = sections
    .map((s) => ({ desc: s.name || "Work", amt: Number(s.total ?? s.amount ?? 0) }))
    .filter((s) => s.amt > 0);

  const total = Number(est.totalPrice || 0);
  const lines = sectionLines.length
    ? sectionLines
    : [{ desc: `Roofing contract — estimate #${est.id}`, amt: total }];

  return lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: l.amt,
    Description: l.desc,
    SalesItemLineDetail: {
      // QBO requires an ItemRef; "1" is the default "Services" item in sandbox seed
      // companies. Production setups should map a real income item (see docs).
      ItemRef: { value: "1" },
      Qty: 1,
      UnitPrice: l.amt,
    },
  }));
}

/** Build a full QBO Estimate payload for a CRM estimate + its customer. */
export function buildEstimatePayload(est: Estimate, qboCustomerId: string): Record<string, unknown> {
  return {
    CustomerRef: { value: qboCustomerId },
    TxnDate: new Date(est.createdAt || Date.now()).toISOString().slice(0, 10),
    Line: buildEstimateLines(est),
    TotalAmt: Number(est.totalPrice || 0),
  };
}

/**
 * Push a finalized CRM estimate to QBO. Ensures the customer exists first, then
 * creates (or updates, with SyncToken round-trip) the QBO Estimate. Stores the QBO
 * estimate id + doc number on the opportunity. Idempotent.
 */
export async function pushEstimate(
  crmEstimateId: number,
  actorUserId: number | null = null,
): Promise<{ qboEstimateId: string; docNumber: string | null; created: boolean }> {
  const est = storage.getEstimate(crmEstimateId);
  if (!est) throw new Error(`Estimate ${crmEstimateId} not found`);
  const opportunityId = est.jobId;
  const meta = { actorUserId, opportunityId };

  const { qboCustomerId } = await upsertCustomerForOpportunity(opportunityId, actorUserId);
  const payload = buildEstimatePayload(est, qboCustomerId);
  const sum = checksum(payload);

  const existing = storage.getMapByCrm("estimate", crmEstimateId);

  if (existing) {
    if (existing.checksum === sum) {
      return { qboEstimateId: existing.qboEntityId, docNumber: existing.qboDocNumber, created: false };
    }
    const updated = await updateEstimate(existing.qboEntityId, existing.qboSyncToken, payload, meta);
    persist(opportunityId, crmEstimateId, updated, sum);
    return { qboEstimateId: updated.Id, docNumber: updated.DocNumber || null, created: false };
  }

  const created = await qboRequest<{ Estimate: QboEstimate }>({
    path: "estimate?minorversion=65", method: "POST", body: payload, action: "estimate_create", ...meta,
  });
  persist(opportunityId, crmEstimateId, created.Estimate, sum);
  return { qboEstimateId: created.Estimate.Id, docNumber: created.Estimate.DocNumber || null, created: true };
}

function persist(opportunityId: number, crmEstimateId: number, e: QboEstimate, sum: string) {
  storage.upsertMap({
    crmEntityType: "estimate", crmEntityId: crmEstimateId, qboEntityType: "Estimate",
    qboEntityId: e.Id, qboSyncToken: e.SyncToken, qboDocNumber: e.DocNumber || null,
    lastSyncDirection: "push", checksum: sum,
  });
  storage.updateJob(opportunityId, {
    qboEstimateId: e.Id, qboEstimateDocNumber: e.DocNumber || null, qboLastSyncedAt: Date.now(),
  } as any);
}

async function updateEstimate(
  id: string,
  syncToken: string | null,
  payload: Record<string, unknown>,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboEstimate> {
  const token = syncToken ?? (await getEstimate(id, meta)).SyncToken;
  const body = { ...payload, Id: id, SyncToken: token, sparse: true };
  try {
    const resp = await qboRequest<{ Estimate: QboEstimate }>({
      path: "estimate?minorversion=65", method: "POST", body, action: "estimate_update", ...meta,
    });
    return resp.Estimate;
  } catch (e) {
    if (e instanceof QboApiError && e.conflict) {
      const fresh = await getEstimate(id, meta);
      const retry = { ...payload, Id: id, SyncToken: fresh.SyncToken, sparse: true };
      const resp = await qboRequest<{ Estimate: QboEstimate }>({
        path: "estimate?minorversion=65", method: "POST", body: retry, action: "estimate_update_retry", ...meta,
      });
      return resp.Estimate;
    }
    throw e;
  }
}

export async function getEstimate(
  id: string,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboEstimate> {
  const resp = await qboRequest<{ Estimate: QboEstimate }>({
    path: `estimate/${id}?minorversion=65`, method: "GET", action: "estimate_get", ...meta,
  });
  return resp.Estimate;
}
