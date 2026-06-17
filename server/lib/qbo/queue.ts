/**
 * QBO sync queue worker. Server-only.
 *
 * Picks up due `qbo_sync_queue` rows and dispatches them by entity type/direction.
 * Failures are retried with exponential backoff (1m, 5m, 30m, 2h, 12h) and then
 * marked `failed` (surfaced in the admin "Sync issues" panel). Permanent (4xx)
 * errors fail immediately; transient (429/5xx/network) errors back off.
 */
import { storage } from "../../storage";
import { QboApiError } from "./client";
import { upsertCustomerForOpportunity } from "./customers";
import { pushEstimate } from "./estimates";
import { pullInvoiceState } from "./invoices";
import { pullPaymentsForInvoice } from "./payments";

/** Backoff steps in milliseconds, by attempt count (after which we mark failed). */
export const BACKOFF_MS = [
  60_000,        // 1m
  5 * 60_000,    // 5m
  30 * 60_000,   // 30m
  2 * 60 * 60_000,  // 2h
  12 * 60 * 60_000, // 12h
];

/** Compute the next attempt timestamp for a given (already-incremented) attempt count. */
export function nextAttemptAt(attempts: number, from = Date.now()): number {
  const idx = Math.min(attempts - 1, BACKOFF_MS.length - 1);
  return from + BACKOFF_MS[idx];
}

/** Whether a queue row should be permanently failed after this attempt. */
export function shouldFail(attempts: number, err: unknown): boolean {
  // Permanent (non-transient) API errors fail immediately.
  if (err instanceof QboApiError && !err.transient && !err.conflict) return true;
  // Otherwise fail once we've exhausted the backoff schedule.
  return attempts > BACKOFF_MS.length;
}

/** Dispatch a single queue row to the right handler. */
async function dispatch(row: { entityType: string; entityId: string; direction: string }): Promise<void> {
  const id = row.entityId;
  switch (row.entityType) {
    case "customer":
      await upsertCustomerForOpportunity(Number(id), null);
      return;
    case "estimate":
      await pushEstimate(Number(id), null);
      return;
    case "invoice":
      await pullInvoiceState(id, null);
      return;
    case "payment":
      await pullPaymentsForInvoice(id, null);
      return;
    case "opportunity":
      // Full end-to-end resync of one opportunity: customer + (best-effort) invoice pull.
      await upsertCustomerForOpportunity(Number(id), null);
      {
        const job = storage.getJob(Number(id));
        if (job?.qboInvoiceId) {
          await pullInvoiceState(job.qboInvoiceId, null);
          await pullPaymentsForInvoice(job.qboInvoiceId, null);
        }
      }
      return;
    default:
      throw new Error(`Unknown sync entity type: ${row.entityType}`);
  }
}

let workerTimer: NodeJS.Timeout | null = null;

/**
 * Start an in-process worker that drains the queue on an interval. This is the
 * simplest deployment (single Express instance). For multi-instance or serverless
 * deployments, disable this and run scripts/qbo_nightly_sync.ts via cron instead.
 */
export function startQboWorker(intervalMs = 60_000) {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    runSyncQueue().catch((e) => console.warn("[qbo] sync queue tick failed:", e?.message || e));
  }, intervalMs);
  // Don't keep the process alive solely for this timer.
  if (typeof workerTimer.unref === "function") workerTimer.unref();
}

/** Process all currently-due queue rows. Returns counts. Safe to call repeatedly. */
export async function runSyncQueue(limit = 25): Promise<{ ok: number; retried: number; failed: number }> {
  const due = storage.dueSyncQueue(limit);
  let ok = 0, retried = 0, failed = 0;
  for (const row of due) {
    storage.updateSyncQueue(row.id, { status: "in_progress" });
    try {
      await dispatch(row);
      storage.updateSyncQueue(row.id, { status: "success", lastError: null });
      ok++;
    } catch (e: any) {
      const attempts = row.attempts + 1;
      const msg = e?.message || String(e);
      if (shouldFail(attempts, e)) {
        storage.updateSyncQueue(row.id, { status: "failed", attempts, lastError: msg });
        failed++;
      } else {
        storage.updateSyncQueue(row.id, {
          status: "pending", attempts, nextAttemptAt: nextAttemptAt(attempts), lastError: msg,
        });
        retried++;
      }
    }
  }
  return { ok, retried, failed };
}
