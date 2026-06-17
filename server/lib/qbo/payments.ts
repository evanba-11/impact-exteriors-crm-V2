/**
 * QBO Payment sync. Server-only. Direction: pull-only (QBO authoritative).
 *
 * Payments are recorded in QBO and pulled into `crm_payments`. We list Payments
 * whose lines link to the given invoice, then upsert each into the CRM mirror and
 * refresh the invoice balance/status on the opportunity.
 */
import { storage } from "../../storage";
import { qboQuery, qboRequest } from "./client";
import { pullInvoiceState } from "./invoices";

export interface QboPayment {
  Id: string;
  TotalAmt?: number;
  TxnDate?: string;
  PaymentRefNum?: string;
  PaymentMethodRef?: { value: string; name?: string };
  Line?: Array<{ LinkedTxn?: Array<{ TxnId: string; TxnType: string }> }>;
  [k: string]: any;
}

/** Does this payment apply to the given invoice id? */
export function paymentTargetsInvoice(p: QboPayment, qboInvoiceId: string): boolean {
  return (p.Line || []).some((l) =>
    (l.LinkedTxn || []).some((t) => t.TxnType === "Invoice" && String(t.TxnId) === String(qboInvoiceId)),
  );
}

/** Extract the amount a payment applied to a specific invoice (fallback: TotalAmt). */
export function amountForInvoice(p: QboPayment, qboInvoiceId: string): number {
  for (const l of p.Line || []) {
    for (const t of l.LinkedTxn || []) {
      if (t.TxnType === "Invoice" && String(t.TxnId) === String(qboInvoiceId)) {
        return Number((l as any).Amount ?? p.TotalAmt ?? 0);
      }
    }
  }
  return Number(p.TotalAmt || 0);
}

/**
 * Pull all payments linked to a QBO invoice into `crm_payments`, then refresh the
 * invoice balance/status. Returns the number of payments synced.
 */
export async function pullPaymentsForInvoice(
  qboInvoiceId: string,
  actorUserId: number | null = null,
): Promise<{ synced: number; opportunityId: number | null }> {
  const map = storage.getMapByQbo("Invoice", qboInvoiceId);
  let jobId: number | null = null;
  if (map) {
    const est = storage.getEstimate(Number(map.crmEntityId));
    jobId = est?.jobId ?? null;
  }
  const meta = { action: "payment_query", actorUserId, opportunityId: jobId };

  const resp = await qboQuery<{ QueryResponse: { Payment?: QboPayment[] } }>(
    `SELECT * FROM Payment WHERE Line.LinkedTxn.TxnId = '${qboInvoiceId}'`,
    meta,
  );
  const payments = (resp?.QueryResponse?.Payment || []).filter((p) => paymentTargetsInvoice(p, qboInvoiceId));

  if (jobId != null) {
    for (const p of payments) {
      storage.upsertPayment({
        jobId,
        qboPaymentId: p.Id,
        qboInvoiceId,
        amount: amountForInvoice(p, qboInvoiceId),
        paymentDate: p.TxnDate || null,
        method: p.PaymentMethodRef?.name || p.PaymentMethodRef?.value || null,
        reference: p.PaymentRefNum || null,
      });
    }
  }

  // Refresh invoice balance/status after applying payments.
  await pullInvoiceState(qboInvoiceId, actorUserId);
  return { synced: payments.length, opportunityId: jobId };
}

/** Fetch a single payment (used by webhook Payment.Create when no invoice context). */
export async function getPayment(
  id: string,
  meta: { actorUserId?: number | null; opportunityId?: number | null },
): Promise<QboPayment> {
  const resp = await qboRequest<{ Payment: QboPayment }>({
    path: `payment/${id}?minorversion=65`, method: "GET", action: "payment_get", ...meta,
  });
  return resp.Payment;
}
