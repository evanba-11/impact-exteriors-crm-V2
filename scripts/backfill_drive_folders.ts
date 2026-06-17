/**
 * One-off backfill: create Google Drive folders for existing opportunities (jobs)
 * that don't have one yet. Idempotent — re-running only touches rows still missing
 * a drive_folder_id.
 *
 * Usage:
 *   npm run backfill:drive            # process all jobs missing a folder
 *   npm run backfill:drive -- --limit 50
 *   npm run backfill:drive -- --dry-run
 *
 * Requires the same secrets as the running server (Supabase Vault or env vars):
 *   google_service_account_json, google_workspace_impersonation_email,
 *   google_drive_root_folder_id. See docs/integrations/google-workspace.md.
 */
import "dotenv/config";
import { storage } from "../server/storage";
import { ensureOpportunityFolder } from "../server/integrations/google";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;

  const jobs = storage.getJobs().filter((j) => !j.driveFolderId);
  const targets = jobs.slice(0, Number.isFinite(limit) ? limit : undefined);

  console.log(`[backfill] ${jobs.length} opportunities missing a Drive folder; processing ${targets.length}${dryRun ? " (dry run)" : ""}.`);

  let ok = 0, failed = 0;
  for (const job of targets) {
    if (dryRun) {
      console.log(`  would create folder for #${job.id} — ${job.customer}`);
      continue;
    }
    try {
      const { driveFolderId, created } = await ensureOpportunityFolder(job.id, null);
      console.log(`  #${job.id} ${created ? "created" : "exists"} → ${driveFolderId}`);
      ok++;
    } catch (e: any) {
      console.error(`  #${job.id} FAILED: ${e?.message || e}`);
      failed++;
    }
  }

  console.log(`[backfill] done. created/exists=${ok} failed=${failed}.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[backfill] fatal:", e);
  process.exit(1);
});
