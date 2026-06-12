# Impact CRM — Deployment Report

**Status:** DEPLOYED SUCCESSFULLY ✅
**Deployed:** Wed June 10, 2026

## Deploy call (parent MUST re-run this exact call so the site surfaces as a component in main chat)

```
deploy_website(
  project_path="/home/user/workspace/impact-crm/dist/public",
  site_name="impact-crm",
  entry_point="index.html"
)
```

- Deploy result: `status: uploaded` (validation passed on 3rd attempt)
- Permanent shareable URL: https://www.perplexity.ai/computer/a/impact-crm-vCtD.j1hRceXsApoWbuU7w
- asset_id: bc2b43fa-3d61-45c7-97b0-0a6859bb94ef
- Files: index.html, assets/index-BZDkaT7C.js, assets/index-5YcWr1_S.css

## Prerequisite to deploy: production server must be running
The app has an Express backend (SQLite). The production server must stay up for API calls to work via port proxy:
```
pplx-tool start_server  (api_credentials=["pplx-tool:start_server"])
  {"command":"NODE_ENV=production node dist/index.cjs","project_path":"/home/user/workspace/impact-crm","port":5000}
```
Currently running (pid 2951). queryClient uses `__PORT_5000__` token replaced at deploy time.

## Build
- `cd /home/user/workspace/impact-crm && npm run build` → client (dist/public) + server (dist/index.cjs). Clean, tsc passes.
- data.db was deleted before final build so `seedIfEmpty()` repopulated clean demo data.

## Final QA fixes made this session (deploy validator caught real visual bugs)
1. **Dashboard "Pipeline by Stage" chart** — replaced the recharts FunnelChart (labels overlapped bars) with a horizontal BarChart: stage names on left Y-axis, job-count X-axis, per-stage colored cells. Added short-label map (e.g. "Sending Booking Link"→"Booking Link") and dynamic height (`funnelData.length * 30`) so all 11 stages have comfortable spacing with no label/bar overlap.
2. **"Over/(Under) Billed" KPI color** — overbilled was misleadingly green (emerald). Changed to neutral foreground for overbilled, amber for underbilled — neither state reads as "good."

## QA coverage (verified end-to-end before deploy)
- All 11 pages render correctly at desktop (1280) + mobile (375): Dashboard, Pipeline, Leads, Estimates, Jobs, Financials, Automations, Tasks, Calendar, Vendors, Settings.
- **Pillar 1 — Kanban pipeline:** 4 flows, drag-and-drop verified (card moved stages, days-in-stage reset), SLA coloring, lead score badges, shared-stage handoffs (Ready for Production → flow=PRODUCTION).
- **Pillar 2 — Automation engine:** verified firing end-to-end. Created lead → ran scheduler → SMS landed in outbox with rendered merge fields ("Hi QA, this is Tyler Boone with Impact Exteriors…"). Activity feed on Dashboard shows auto-sent SMS/email entries. Auto-pause on reply/stage change confirmed via repliedThisStage + automationRuns dedup.
- **Pillar 3 — Dual-mode estimating:** Quick + Advanced modes; margin floor (35%) locked for new rep (Priya, lock icon on Advanced tab); live profit panel (overlap bug fixed earlier); accept-to-budget verified (Holloway accepted → job budget created → pipeline advanced to Ready for Production, contractValue $17,468).
- **Pillar 4 — Job financial engine:** 12 controller flags all render on Dashboard with click-through; WIP math, budget vs actual by cost code, billing/retainage, change orders, commission tracking. Role switcher (6 users) recomputes commission preview per role.

## Seeded demo data (clean, post-reseed)
6 users, 10 cost codes, 15 price items, 6 vendors, 9 templates, 10–11 automations, 20 jobs, 12 controller flags populated with realistic values.

## Deferred / by-design items
- Commission-plan editing in Settings is read-only (display only); cost codes & SLAs are editable.
- No POST endpoints for vendors/settings (PATCH only) — by design.
- Documents tab in JobDrawer is list-only (no file upload).
- All 6 integrations (Twilio/SendGrid/QuickBooks/Stripe/EagleView/Google Calendar) are "Not connected" placeholders per spec.
- Bundle is ~1MB JS (single chunk); functions fine, code-splitting not applied (non-blocking).

## Note for parent
The deployed static bundle calls the backend through the port-5000 proxy. Keep the production server running (or restart it with the start_server call above) for the live app to load data. If the server is down, the UI shell renders but API-backed views will be empty.
