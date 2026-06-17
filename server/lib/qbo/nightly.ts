/**
 * Nightly reconciliation. For every opportunity that has a QBO invoice, refresh
 * the invoice balance/status and pull payments — catching anything webhooks missed.
 * Also drains the sync queue. Server-only; invoked by scripts/qbo_nightly_sync.ts
 * (cron) and an optional in-process interval (see server/index.ts).
 */
import { storage } from "../../storage";
import { pullInvoiceState } from "./invoices";
import { pullPaymentsForInvoice } from "./payments";
import { runSyncQueue } from "./queue";

export async function nightlySync(): Promise<{ invoices: number; errors: string[]; queue: Awaited<ReturnType<typeof runSyncQueue>> }> {
  const conn = storage.getConnection("qbo");
  if (!conn || conn.status !== "active") {
    return { invoices: 0, errors: ["QBO not connected"], queue: { ok: 0, retried: 0, failed: 0 } };
  }
  const errors: string[] = [];
  let invoices = 0;
  for (const job of storage.getJobs()) {
    if (!job.qboInvoiceId) continue;
    try {
      await pullInvoiceState(job.qboInvoiceId, null);
      await pullPaymentsForInvoice(job.qboInvoiceId, null);
      invoices++;
    } catch (e: any) {
      errors.push(`job#${job.id}: ${e?.message || String(e)}`);
    }
  }
  const queue = await runSyncQueue(100);
  storage.addAuditLog({
    integration: "qbo", action: "nightly_sync",
    response: { invoices, errors: errors.length, queue }, status: errors.length ? "error" : "ok",
    error: errors.length ? errors.join("; ") : null,
  });
  return { invoices, errors, queue };
}
