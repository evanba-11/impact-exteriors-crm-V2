# Google Workspace integration (Phase 1)

Address validation + per-opportunity Google Drive folders.

This document covers the one-time Google Cloud / Workspace setup, the secrets
the server needs, and how the integration maps onto this codebase.

---

## What this integration does

- **Address validation** — when creating/editing an opportunity, the address is
  validated against Google's **Address Validation API** (with a **Geocoding API**
  fallback). The canonical address, `place_id`, lat/lng, and a Google Maps link
  are stored on the opportunity. Results are cached for 24h keyed on the raw input.
- **Drive folders** — every opportunity gets a Google Drive folder named
  `{id} — {customer} — {street}`, created under a single root folder. The CRM
  lists, uploads, opens, and (Admin-only) deletes files in that folder.
- **Audit log** — every external Google call is recorded in `integration_audit_log`
  (actor, action, opportunity, status, error).

All Google calls happen **server-side**. The service-account JSON and the
server Maps key are never exposed to the browser.

---

## Stack adaptation note (read this)

The original Phase 1 spec assumed a Next.js + Supabase + Vault + Supabase-JWT
stack. This repository is an **Express + Vite SPA + Drizzle ORM on SQLite** app
with no Supabase-JWT auth. The integration was adapted as follows; behavior and
security intent are preserved:

| Spec assumption | This codebase |
| --- | --- |
| Supabase Vault for secrets | `server/lib/secrets.ts` reads Supabase Vault **if** configured, else falls back to env vars with the same logical names |
| Supabase JWT identifies the user | RBAC resolves the acting user from the `x-user-id` header → `users.role` lookup |
| Next.js API routes | Express routes registered in `server/integrations/google.ts` |
| Multipart upload | Uploads are sent as base64 JSON (no `multer` dependency) |
| Postgres migrations | Idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN` in `server/storage.ts` |

---

## 1. Google Cloud project setup

1. Create (or pick) a GCP project.
2. **Enable APIs** (APIs & Services → Library):
   - Address Validation API
   - Geocoding API
   - Google Drive API
   - (Optional, only if you later embed a map) Maps JavaScript API
3. **Create the server API key** (APIs & Services → Credentials → Create API key):
   - Restrict it to **Address Validation API** and **Geocoding API** only.
   - This is the value of `google_maps_api_key` / `GOOGLE_MAPS_API_KEY`.
   - Keep it server-side only.
4. **(Optional) Create a separate browser Maps key** restricted by HTTP referrer
   and to the Maps JavaScript API only. This is the only key that may ever be
   exposed to the client (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`). The CRM today
   only builds Maps *links*, so this is not currently required.

## 2. Service account + domain-wide delegation (Drive)

1. APIs & Services → Credentials → **Create service account**.
2. Create a **JSON key** for it and download it. The full JSON file (one line) is
   `google_service_account_json` / `GOOGLE_SERVICE_ACCOUNT_JSON`.
3. On the service account, **enable domain-wide delegation** and note its
   **Client ID**.
4. In the **Google Workspace Admin console** → Security → Access and data control
   → **API controls** → **Domain-wide delegation** → Add new:
   - Client ID: the service account's client ID.
   - OAuth scope: `https://www.googleapis.com/auth/drive`
5. Pick a Workspace **admin/ops user** for the service account to impersonate.
   Its email is `google_workspace_impersonation_email` /
   `GOOGLE_WORKSPACE_IMPERSONATION_EMAIL`. This user must have access to the root
   Drive folder.

## 3. Drive root folder

1. As the impersonated user, create a Drive folder to hold all opportunity
   folders (e.g. "CRM Opportunities").
2. Copy its folder ID from the URL
   (`https://drive.google.com/drive/folders/<THIS_ID>`).
3. That ID is `google_drive_root_folder_id` / `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

---

## 4. Secrets

The server reads these via `server/lib/secrets.ts`. Provide **one** backend:

### Option A — env vars (local dev / simple deploys)

Copy `.env.example` to `.env` and set:

| Env var | Purpose |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account key JSON (single line) |
| `GOOGLE_WORKSPACE_IMPERSONATION_EMAIL` | Impersonated Workspace user |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Root Drive folder ID |
| `GOOGLE_MAPS_API_KEY` | Server key for Address Validation + Geocoding |
| `GOOGLE_WORKSPACE_DOMAIN` | Your primary Workspace domain (docs/reference) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | Optional browser Maps key |

### Option B — Supabase Vault (production)

Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and create Vault entries with
these **logical names** (read via `vault.decrypted_secrets`, service role only):

| Vault entry name |
| --- |
| `google_service_account_json` |
| `google_workspace_impersonation_email` |
| `google_drive_root_folder_id` |
| `google_maps_api_key` |

**Never commit secret values.** Only the names above and the placeholders in
`.env.example` belong in the repo.

---

## 5. Database migrations

Migrations are idempotent and run automatically at server start
(`server/storage.ts`). They add:

- Columns on the opportunities (`jobs`) table: address fields, `place_id`,
  `latitude`, `longitude`, `google_maps_url`, `address_verified`,
  `address_validation_response`, `drive_folder_id`, `drive_folder_url`,
  `drive_folder_created_at`.
- New tables: `integration_audit_log`, `validation_cache`.
- Indexes: `idx_jobs_place_id`, `idx_validation_cache_raw`.

They are safe to re-run: column adds are wrapped to ignore "already exists"
errors, and tables use `CREATE TABLE IF NOT EXISTS`. No existing data is
modified, so the change is effectively reversible (drop the added
columns/tables to roll back).

---

## 6. Backfill existing opportunities

To create Drive folders for opportunities that predate this integration:

```bash
npm run backfill:drive -- --dry-run     # preview
npm run backfill:drive                  # create all missing folders
npm run backfill:drive -- --limit 50    # cap how many are processed
```

The script is idempotent — it only touches rows missing a `drive_folder_id`.

---

## 7. API surface

All routes require a valid `x-user-id` header resolving to a `users` row.

| Method & path | Allowed roles |
| --- | --- |
| `POST /api/integrations/google/validate-address` | Admin, Manager, Sales Rep, Production, Billing |
| `POST /api/integrations/google/drive/ensure-folder` | Admin, Manager, Sales Rep, Production, Billing |
| `GET  /api/integrations/google/drive/files` | Admin, Manager, Sales Rep, Production, Billing |
| `POST /api/integrations/google/drive/upload` | Admin, Manager, Sales Rep, Production, Billing |
| `DELETE /api/integrations/google/drive/files/:fileId` | **Admin only** |
| `GET  /api/integrations/audit-log` | Admin, Manager |

Drive folders are also auto-provisioned (fire-and-forget) when an opportunity is
created via `POST /api/jobs`.

---

## 8. Verifying the setup

1. Start the server with secrets configured.
2. Create a new opportunity with a real address → validate it → the verdict and
   canonical address should appear, and a Drive folder should be created.
3. Open the opportunity's **Files** tab → upload a file → confirm it appears in
   the Drive folder, and "Open in Drive" works.
4. As a non-Admin user, confirm the delete control is hidden / the DELETE route
   returns 403; as Admin, confirm delete works.
5. Check `GET /api/integrations/audit-log` (as Admin/Manager) for entries.
