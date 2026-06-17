/**
 * Nightly QuickBooks reconciliation job. Run via cron (Vercel Cron, system cron,
 * or any scheduler) once a day:
 *
 *   npm run qbo:nightly
 *
 * For every opportunity with a QBO invoice it refreshes balance/status and pulls
 * payments, then drains the retry queue. Idempotent and safe to run repeatedly.
 * Requires the same secrets as the server (Supabase Vault or QBO_* env vars) — see
 * docs/integrations/quickbooks.md. Exits non-zero if any opportunity failed.
 */
import "dotenv/config";
import { nightlySync } from "../server/lib/qbo/nightly";

async function main() {
  console.log("[qbo-nightly] starting reconciliation…");
  const { invoices, errors, queue } = await nightlySync();
  console.log(`[qbo-nightly] invoices reconciled=${invoices} queue=${JSON.stringify(queue)} errors=${errors.length}`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error("[qbo-nightly] fatal:", e);
  process.exit(1);
});
