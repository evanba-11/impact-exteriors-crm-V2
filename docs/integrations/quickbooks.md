# QuickBooks Online integration (Phase 2)

Two-way sync of customers, estimates, invoices, and payments between the CRM and
QuickBooks Online (QBO).

This document covers the one-time Intuit app setup, the secrets the server needs,
the database migrations, how to connect, the nightly reconciliation cron, and
troubleshooting.

---

## What this integration does

- **Customers** (CRM → QBO) — an opportunity's customer is created/updated in QBO.
  Duplicate-safe: an existing mapping is reused, and before creating we query QBO
  for a Customer with the same `DisplayName` and adopt it instead of duplicating.
- **Estimates** (CRM → QBO) — a finalized CRM estimate is pushed as a QBO Estimate.
  The CRM is authoritative; pushes are idempotent (keyed on the CRM estimate id).
- **Invoices** (CRM ↔ QBO) — an invoice is created in QBO from a CRM estimate
  (CRM triggers creation, one invoice per estimate), and its balance/status are
  pulled back into the CRM via webhooks and the nightly poll.
- **Payments** (QBO → CRM) — payments recorded in QBO are pulled into the
  `crm_payments` mirror and update the invoice balance/status on the opportunity.
- **Audit log** — every external QBO call is recorded in `integration_audit_log`
  (actor, action, opportunity, request/response status, error).

All QBO calls happen **server-side**. OAuth tokens are encrypted at rest and never
exposed to the browser.

### Sync direction matrix

| Entity    | Direction   | Trigger                                             | Authority |
|-----------|-------------|-----------------------------------------------------|-----------|
| Customer  | CRM → QBO   | Opportunity create, estimate/invoice push, resync   | CRM       |
| Estimate  | CRM → QBO   | "Push to QBO" action                                | CRM       |
| Invoice   | CRM → QBO   | "Create invoice" action                             | CRM       |
| Invoice   | QBO → CRM   | Webhook (`Invoice`), nightly poll, manual resync    | QBO        |
| Payment   | QBO → CRM   | Webhook (`Payment`/`Invoice`), nightly poll         | QBO       |

Out of scope for v1 (per spec): CompanyCam, QuickBooks Desktop, multiple realms,
and refunds/credit-memos.

---

## Stack adaptation note

This repo is an **Express + Vite SPA + Drizzle ORM on SQLite** app with role-based
access via an `x-user-id` header (no JWT). The integration follows the same
patterns Phase 1 established: the **Vault-or-env** secrets module
(`server/lib/secrets.ts`) and the **`integration_audit_log`** table. No new secrets
mechanism was introduced.

The spec's logical roles map onto this CRM's actual roles as:

| Spec role       | CRM role(s)            |
|-----------------|------------------------|
| Admin           | Admin                  |
| Finance         | Billing, Manager       |
| Salesperson     | Sales Rep              |
| Superintendent  | Production             |

### Permission matrix (enforced server-side in `server/integrations/qbo.ts`)

| Action                          | Allowed roles                          |
|---------------------------------|----------------------------------------|
| View accounting / snapshot      | all roles                              |
| Connect / disconnect / resync-all | Admin                                |
| Push estimate                   | Admin, Manager, Billing, Sales Rep     |
| Create invoice / one-off resync / sync-issues | Admin, Manager, Billing  |

---

## 1. Create an Intuit app

1. Sign in at <https://developer.intuit.com> → **Dashboard** → **Create an app** →
   **QuickBooks Online and Payments** → scope **`com.intuit.quickbooks.accounting`**.
2. Under **Keys & OAuth**, note the **Client ID** and **Client Secret**. There are
   separate keys for **Development** (sandbox) and **Production** — use the pair
   that matches `QBO_ENVIRONMENT`.
3. Add a **Redirect URI** that EXACTLY matches `QBO_REDIRECT_URI`, e.g.
   `https://your-host/api/integrations/qbo/oauth/callback`
   (for local dev: `http://localhost:5000/api/integrations/qbo/oauth/callback`).

### Sandbox vs production

- **Sandbox** — set `QBO_ENVIRONMENT=sandbox`. OAuth uses your sandbox company and
  REST calls go to `https://sandbox-quickbooks.api.intuit.com`. Sandbox seed
  companies include a default "Services" income item (`ItemRef` value `1`), which
  is what estimate/invoice lines reference by default.
- **Production** — set `QBO_ENVIRONMENT=production`. REST calls go to
  `https://quickbooks.api.intuit.com`. **Map a real income item**: change the
  `ItemRef` value in `server/lib/qbo/estimates.ts` (`buildEstimateLines`) to a
  valid item id from your production catalog, or build an item-sync step.

---

## 2. Configure webhooks (optional but recommended)

1. In the Intuit app → **Webhooks**, set the endpoint URL to
   `https://your-host/api/integrations/qbo/webhook` (must be publicly reachable
   over HTTPS).
2. Subscribe to **Invoice** and **Payment** (and optionally **Customer**) events.
3. Copy the **Verifier Token** into `QBO_WEBHOOK_VERIFIER_TOKEN`.

The receiver verifies the `intuit-signature` header (HMAC-SHA256 over the raw body)
**before** processing or marking the event processed. Unverified events are stored
with `signatureVerified = false`, audited, and rejected with `401` — never acted on.

If you cannot expose a webhook (e.g. local dev), rely on the **nightly poll**
(section 5) and the per-opportunity **Resync** button instead.

---

## 3. Secrets

Read via `server/lib/secrets.ts` (Supabase Vault if configured, else env vars).
Provide ONE backend.

| Logical name (Vault)         | Env var (fallback)            | Purpose                                            |
|------------------------------|-------------------------------|----------------------------------------------------|
| `qbo_client_id`              | `QBO_CLIENT_ID`               | OAuth client id                                    |
| `qbo_client_secret`          | `QBO_CLIENT_SECRET`           | OAuth client secret                                |
| `qbo_environment`            | `QBO_ENVIRONMENT`             | `sandbox` or `production` (default `production`)   |
| `qbo_redirect_uri`           | `QBO_REDIRECT_URI`            | Must match the Intuit app exactly                  |
| `qbo_webhook_verifier_token` | `QBO_WEBHOOK_VERIFIER_TOKEN`  | HMAC verification of webhooks                      |
| `qbo_token_encryption_key`   | `QBO_TOKEN_ENCRYPTION_KEY`    | 32-byte AES-256-GCM key for token encryption at rest |

**Never commit real secrets.** See `.env.example` for the local-dev template.

### Token encryption at rest

OAuth refresh tokens are long-lived and grant full accounting access, so both
access and refresh tokens are encrypted with **AES-256-GCM** before being written
to `integration_connections`. The key comes from `qbo_token_encryption_key`
(base64, hex, or a passphrase hashed to 32 bytes). Generate one with:

```
openssl rand -base64 32
```

If no key is configured, tokens are stored with a `plain:` marker so data is never
silently lost — acceptable for local dev, **set a real key in production**.

---

## 4. Database migrations

Migrations are **idempotent** and run automatically on server start
(`server/storage.ts`): `CREATE TABLE IF NOT EXISTS` for new tables and a guarded
`ALTER TABLE` loop for the new `jobs` columns. No manual step is required; for an
explicit schema push you can also run `npm run db:push`.

New tables: `integration_connections` (singleton OAuth connection, encrypted
tokens), `qbo_entity_map` (CRM ↔ QBO id mapping + `SyncToken` + change checksum),
`qbo_webhook_events`, `qbo_sync_queue`, `crm_payments`.

New `jobs` columns: `qbo_customer_id`, `qbo_estimate_id`, `qbo_estimate_doc_number`,
`qbo_invoice_id`, `qbo_invoice_doc_number`, `qbo_invoice_balance`,
`qbo_invoice_total`, `qbo_invoice_status`, `qbo_invoice_url`, `qbo_last_synced_at`.

**Safety:** all changes are additive — no columns or tables are dropped or
renamed — so the migration is safe to run against an existing database and is a
no-op on re-run.

---

## 5. Connecting

1. As an **Admin**, go to **Settings → Integrations → QuickBooks Online** and click
   **Connect to QuickBooks**.
2. You're redirected to Intuit to authorize the app; on success Intuit redirects
   back to `QBO_REDIRECT_URI` and the CRM stores the encrypted tokens + realm id.
3. The panel shows the connection status, realm id, and last token refresh.
   Use **Resync all** to enqueue a full reconciliation, or the per-opportunity
   **Accounting** tab to push an estimate / create an invoice / resync one record.

Access tokens (~1h) are refreshed lazily; Intuit rotates the refresh token on every
refresh, and the new one is persisted automatically.

---

## 6. Nightly reconciliation (cron)

Catches anything webhooks missed and drains the retry queue:

```
npm run qbo:nightly
```

Run once a day via your scheduler (Vercel Cron, system cron, etc.). It requires the
same secrets as the server. It is idempotent and exits non-zero if any opportunity
failed (so cron can alert).

A single-instance deployment also runs an **in-process queue worker** every 60s
(`startQboWorker` in `server/lib/qbo/queue.ts`). For multi-instance/serverless
deployments, disable that and rely on the cron job instead.

Failed queue rows back off exponentially (1m → 5m → 30m → 2h → 12h) and are then
marked `failed`, surfacing in the **Sync issues** panel where an Admin can retry.

---

## 7. Troubleshooting

- **"QuickBooks is not connected" / connection shows *disconnected*** — the refresh
  token expired or was revoked (refresh tokens last ~100 days; reconnecting resets
  the clock). An Admin must re-connect from Settings.
- **OAuth state mismatch** — the connect flow was started in a different
  browser/session, or the connection row was reset mid-flow. Retry the connection.
- **Redirect URI mismatch error from Intuit** — `QBO_REDIRECT_URI` must match the
  value registered on the Intuit app character-for-character (scheme, host, path).
- **Webhooks rejected (401)** — `QBO_WEBHOOK_VERIFIER_TOKEN` doesn't match the
  app's verifier token, or a proxy altered the raw request body before it reached
  the receiver (signature is computed over the raw bytes).
- **Estimate/invoice push fails with an item error in production** — the default
  `ItemRef` value `1` doesn't exist in your production catalog. Map a real income
  item (see section 1, "Sandbox vs production").
- **409 conflict (`SyncToken`)** — handled automatically: the entity is refetched
  and the write retried once. Persistent 409s indicate concurrent edits in QBO.
- **Inspect failures** — `integration_audit_log` records every QBO call; the
  **Sync issues** panel lists failed queue rows with their last error.
