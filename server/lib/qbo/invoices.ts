/**
 * QBO Invoice sync. Server-only.
 *   - pushInvoice(crmEstimateId): create a QBO Invoice from a finalized CRM estimate
 *     (two-way; CRM triggers creation). Idempotent — never double-pushes on retry.
 *   - pullInvoiceState(qboInvoiceId): refresh balance + status onto the opportunity
 *     (QBO → CRM; webhook + nightly poll).
 */
import { storage } from "../../storage";
import { qboRequest } from "./client";
import { checksum } from "./crypto";
import { upsertCustomerForOpportunity } from "./customers";
import { buildEstimateLines } from "./estimates";
import type { Estimate } from "@shared/schema";

export interface QboInvoice {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  [k: string]: any;
}

/** Map QBO TotalAmt/Balance to the CRM status badge. */
export function invoiceStatus(total: number, balance: number): "Unpaid" | "PartiallyPaid" | "Paid" {
  if (balance <= 0) return "Paid";
  if (balance < total) return "PartiallyPaid";
  return "Unpaid";
}

export function buildInvoicePayload(est: Estimate, qboCustomerId: string): Record<string, unknown> {
  return {
    CustomerRef: { value: qboCustomerId },
    TxnDate: new Date().toISOString().slice(0, 10),
    Line: buildEstimateLines(est),
    TotalAmt: Number(est.totalPrice || 0),
  };
}

/**
 * Create a QBO Invoice from a CRM estimate. Idempotent: if the estimate already has
 * an invoice mapping, returns it without creating a new one (prevents double-push on
 * retry). Stores invoice id, doc number, balance, status, and a deep link on the job.
 */
export async function pushInvoice(
  crmEstimateId: number,
  actorUserId: number | null = null,
): Promise<{ qboInvoiceId: string; docNumber: string | null; created: boolean }> {
  const est = storage.getEstimate(crmEstimateId);
  if (!est) throw new Error(`Estimate ${crmEstimateId} not found`);
  const opportunityId = est.jobId;
  const meta = { actorUserId, opportunityId };

  // Idempotency: one invoice per CRM estimate.
  const existing = storage.getMapByCrm("invoice", crmEstimateId);
  if (existing) {
    return { qboInvoiceId: existing.qboEntityId, docNumber: existing.qboDocNumber, created: false };
  }

  const { qboCustomerId } = await upsertCustomerForOpportunity(opportunityId, actorUserId);
  const payload = buildInvoicePayload(est, qboCustomerId);

  const created = await qboRequest<{ Invoice: QboInvoice }>({
    path: "invoice?minorversion=65", method: "POST", body: payload, action: "invoice_create", ...meta,
  });
  const inv = created.Invoice;
  storage.upsertMap({
    crmEntityType: "invoice", crmEntityId: crmEstimateId, qboEntityType: "Invoice",
    qboEntityId: inv.Id, qboSyncToken: inv.SyncToken, qboDocNumber: inv.DocNumber || null,
    lastSyncDirection: "push", checksum: checksum(payload),
  });
  applyInvoiceToJob(opportunityId, inv);
  return { qboInvoiceId: inv.Id, docNumber: inv.DocNumber || null, created: true };
}

export async function getInvoice(
  id: string,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboInvoice> {
  const resp = await qboRequest<{ Invoice: QboInvoice }>({
    path: `invoice/${id}?minorversion=65`, method: "GET", action: "invoice_get", ...meta,
  });
  return resp.Invoice;
}

/** Refresh balance + status from QBO onto the opportunity (QBO → CRM). */
export async function pullInvoiceState(
  qboInvoiceId: string,
  actorUserId: number | null = null,
): Promise<{ opportunityId: number | null; status: string; balance: number }> {
  const map = storage.getMapByQbo("Invoice", qboInvoiceId);
  const opportunityId = map ? Number(storage.getMapByCrm("invoice", map.crmEntityId)?.crmEntityId ?? NaN) : NaN;
  // Resolve the owning job: invoice map's crmEntityId is the CRM estimate id → estimate.jobId.
  let jobId: number | null = null;
  if (map) {
    const est = storage.getEstimate(Number(map.crmEntityId));
    jobId = est?.jobId ?? null;
  }
  const inv = await getInvoice(qboInvoiceId, { actorUserId, opportunityId: jobId });
  if (map) {
    storage.upsertMap({
      crmEntityType: "invoice", crmEntityId: map.crmEntityId, qboEntityType: "Invoice",
      qboEntityId: qboInvoiceId, qboSyncToken: inv.SyncToken, qboDocNumber: inv.DocNumber || null,
      lastSyncDirection: "pull",
    });
  }
  if (jobId) applyInvoiceToJob(jobId, inv);
  const total = Number(inv.TotalAmt || 0);
  const balance = Number(inv.Balance ?? total);
  return { opportunityId: jobId, status: invoiceStatus(total, balance), balance };
}

function applyInvoiceToJob(opportunityId: number, inv: QboInvoice) {
  const total = Number(inv.TotalAmt || 0);
  const balance = Number(inv.Balance ?? total);
  storage.updateJob(opportunityId, {
    qboInvoiceId: inv.Id,
    qboInvoiceDocNumber: inv.DocNumber || null,
    qboInvoiceTotal: total,
    qboInvoiceBalance: balance,
    qboInvoiceStatus: invoiceStatus(total, balance),
    qboLastSyncedAt: Date.now(),
  } as any);
}
