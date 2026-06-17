/**
 * QBO webhook verification + processing. Server-only.
 *
 * Intuit signs each webhook POST with HMAC-SHA256 over the RAW request body using
 * the app's verifier token, base64-encoded in the `intuit-signature` header. We
 * verify BEFORE storing the event as processed or acting on it.
 *
 * Payload shape:
 *   { eventNotifications: [ { realmId, dataChangeEvent: { entities: [
 *       { name: "Invoice", id: "130", operation: "Update", lastUpdated: "..." } ] } } ] }
 */
import crypto from "node:crypto";
import { storage } from "../../storage";
import { getSecret } from "../secrets";
import { upsertCustomerForOpportunity } from "./customers";
import { pullInvoiceState } from "./invoices";
import { pullPaymentsForInvoice, getPayment } from "./payments";

export interface WebhookEntity {
  name: string;       // Customer | Estimate | Invoice | Payment
  id: string;
  operation: string;  // Create | Update | Delete | Void | Merge | Emailed
  lastUpdated?: string;
}

export interface WebhookPayload {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: { entities?: WebhookEntity[] };
  }>;
}

/**
 * Verify the Intuit signature against the raw body. Uses a timing-safe compare.
 * Returns false (never throws) so the route can record an unverified event.
 */
export async function verifySignature(rawBody: string | Buffer, signatureHeader: string | undefined): Promise<boolean> {
  if (!signatureHeader) return false;
  const token = await getSecret("qboWebhookVerifierToken");
  if (!token) return false;
  const expected = crypto.createHmac("sha256", token).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Flatten a webhook payload into entity events. */
export function extractEntities(payload: WebhookPayload): WebhookEntity[] {
  const out: WebhookEntity[] = [];
  for (const n of payload.eventNotifications || []) {
    for (const e of n.dataChangeEvent?.entities || []) out.push(e);
  }
  return out;
}

/**
 * Process a single verified webhook entity event. Routes by entity name to the
 * appropriate puller. Unknown entities/operations are ignored (no-op).
 */
export async function processEntity(entity: WebhookEntity): Promise<void> {
  const name = entity.name;
  const op = entity.operation;
  if (op === "Delete" || op === "Merge") return; // out of scope for v1 reconciliation

  if (name === "Customer") {
    const map = storage.getMapByQbo("Customer", entity.id);
    if (map) await upsertCustomerForOpportunity(Number(map.crmEntityId), null);
    return;
  }
  if (name === "Estimate") {
    // Estimate is CRM-authoritative; we only note the event (status pull is optional).
    return;
  }
  if (name === "Invoice") {
    await pullInvoiceState(entity.id, null);
    await pullPaymentsForInvoice(entity.id, null);
    return;
  }
  if (name === "Payment") {
    // Resolve which invoice(s) this payment touches, then refresh those.
    const payment = await getPayment(entity.id, { actorUserId: null });
    const invoiceIds: string[] = [];
    for (const l of payment.Line || []) {
      for (const t of l.LinkedTxn || []) {
        if (t.TxnType === "Invoice" && !invoiceIds.includes(String(t.TxnId))) {
          invoiceIds.push(String(t.TxnId));
        }
      }
    }
    for (const invId of invoiceIds) await pullPaymentsForInvoice(invId, null);
    return;
  }
}

/** Process every entity in a verified payload, recording per-entity errors. */
export async function processPayload(payload: WebhookPayload): Promise<{ processed: number; errors: string[] }> {
  const entities = extractEntities(payload);
  const errors: string[] = [];
  let processed = 0;
  for (const e of entities) {
    try {
      await processEntity(e);
      processed++;
    } catch (err: any) {
      errors.push(`${e.name}#${e.id}: ${err?.message || String(err)}`);
    }
  }
  return { processed, errors };
}
