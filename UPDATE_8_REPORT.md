# UPDATE 8 — Implementation Report

**Project:** Impact Exteriors CRM V2
**Stack:** Express + Vite + React + Tailwind + shadcn + Drizzle + SQLite
**Spec:** `UPDATE_SPEC_8.md`
**Branch:** `update-8` (off `main`)

UPDATE_SPEC_8 substantially overlaps with UPDATE_SPEC_7, which was implemented on the
`update-7` branch and is present in `main`. This pass audited every spec item against the
**actual code** (not just the prior report), marked already-done items, and implemented the
remaining gaps. Baseline `npm run build` passes before any changes.

---

## PIPELINE
- **Insurance: Waiting on Supplements + Supplements Approved (after Approved, before Ready for Production)** — ALREADY DONE. `shared/schema.ts` `STAGES.INSURANCE`.
- **Sales + Insurance: Pre-Production (last before Ready for Production)** — ALREADY DONE. Both flows in `STAGES`.

## MATERIAL RETURNS OVERHAUL
- **Approval workflow / Admin approve** — ALREADY DONE. `MaterialReturns.tsx`, `/api/material-returns`.
- **Vendor + auto-approve when all items have a vendor** — ALREADY DONE.
- **Photos on the form** — ALREADY DONE (`photosJson`).
- **Vendor print slips** — ALREADY DONE (`PrintSlips`).
- **Supplier pricing auto-fill** — ALREADY DONE.
- **Inventory return value total** — ALREADY DONE.

## REVAMPED LIST VIEWS
- **Reusable list infra (search/sort/Mine/CSV/persisted filters)** — ALREADY DONE. `components/ListView.tsx`.
- **Opportunities (Leads), Jobs, Issues lists** — ALREADY DONE.
- **Tasks list** — IMPLEMENTED (was old Tabs-only; converted to full ListView).
- **Estimates list** — IMPLEMENTED (was a plain table; converted to full ListView with financial cols + CSV).
- **Project Tasks** — covered by the Tasks list (single tasks model; no separate project-task entity).
- **Financial columns (Contract, Billings, Cost, Margin)** — IMPLEMENTED. Jobs gains **Billings**; Opportunities gains **Contract/Billings/Cost/Margin** columns + CSV fields.

## CUSTOMER MAP
- **Rectangle-draw area selection** — IMPLEMENTED. New `pages/CustomerMap.tsx` + `/map` route + nav. No Google Maps key / no Leaflet dependency present, so implemented as a self-contained coordinate-plane canvas with rectangle drag-select over geocoded job markers (noted as a substitute for Google Maps).

## WORK ORDERS
- **Full street address** — ALREADY DONE (renders `job.address`; data model stores full address in one field).
- **tap-to-call tel: links (employee + customer)** — ALREADY DONE.
- **Materials/Labor show toggles** — ALREADY DONE (`showMaterials`/`showLabor`).
- **Items inherit parent category** — ALREADY DONE.
- **Zero-qty excluded from WO + proposals** — ALREADY DONE.

## ESTIMATES
- **Spinners removed / blank boxes / zero-qty excluded** — ALREADY DONE.
- **Drag auto-scroll near edges** — ALREADY DONE.
- **Opportunity estimate table: right-aligned currency headers, Bid/Labor/Material/Total Cost/Margin/GPM** — ALREADY DONE (`RecordPage.tsx`).
- **Completion percent cell green/red vs labor %** — IMPLEMENTED (added to the RecordPage estimate table).
- **Substitution improvements (green replacement / red strikethrough / toggles / grouped / dots / carries child selections)** — ALREADY DONE.
- **Copy group from another estimate** — ALREADY DONE (`CopyGroupDrawer`).
- **Duplicate To submenu** — ALREADY DONE.
- **Copy from Base checklist drawer** — ALREADY DONE.
- **Colored left borders on child items** — ALREADY DONE.
- **Unresolved product choices highlighted yellow** — ALREADY DONE.
- **Empty groups hidden from proposal** — ALREADY DONE.

## COMPANYCAM (UI only)
- **Create CompanyCam Project button** — ALREADY DONE (`CompanyCamPanel`).
- **Photo integration placeholder section** — ALREADY DONE.

## OPPORTUNITIES
- **List/kanban toggle** — ALREADY DONE.
- **Status sorted by pipeline order** — ALREADY DONE.
- **KPI bar (Labor/Material/Bid/Margin/GPM)** — ALREADY DONE.
- **Yellow-highlight unfilled segmentation** — ALREADY DONE.
- **Created-by name + timestamp + relative date filter** — ALREADY DONE.
- **Bid Type field (carries to project, in Advanced Settings)** — ALREADY DONE.
- **Convert → Pre-Production Checklist** — ALREADY DONE.

## AR RECONCILIATION & QUICKBOOKS BALANCING
- **Send Payment Link dialog (URL + copy + open)** — ALREADY DONE (`PaymentLinkDialog.tsx`).
- **AR Aging grouped by invoice, expand/collapse, buckets** — ALREADY DONE (`ARaging.tsx`).

---

## Build status
- Baseline `npm run build`: PASS.
- After all changes `npm run build`: PASS (vite client + esbuild server; only the standard >500kB chunk advisory).
- `npm run dev`: boots clean on port 5000; `/api/jobs`, `/api/estimates`, `/api/wip` return 200; client HTML serves.
- Note: `/api/wip` returns `billed`, `pctComplete`, `projMargin` (not `percentComplete`/`margin`). The Jobs/Opportunities financial cells now read those keys with fallbacks, which also corrects a latent display issue on the Jobs list.

## Newly implemented (gaps found in audit)
1. **LIST VIEWS → Tasks** — `client/src/pages/Tasks.tsx`: replaced Tabs with `ListToolbar` + `useListView("tasks")` (search, sort by due, Mine toggle, CSV export, persisted Open/Completed/All status filter).
2. **LIST VIEWS → Estimates list** — `client/src/pages/Estimates.tsx`: new `EstimatesList` using `useListView("estimates")` with sortable Customer/Status/Contract/Cost/Margin columns, Mine, CSV export.
3. **Financial columns** — `client/src/pages/Jobs.tsx`: added **Billings** column + CSV; `client/src/pages/Leads.tsx` (Opportunities): added **Cost** column + sort + CSV.
4. **ESTIMATES completion cell** — `client/src/pages/RecordPage.tsx`: added **Labor %** cell (labor share of bid), green when ≤ 35% labor target (meets/beats), red when above (behind).
5. **CUSTOMER MAP** — new `client/src/pages/CustomerMap.tsx` + `/map` route (`App.tsx`) + nav entry (`Layout.tsx`): rectangle drag-select over jobs plotted on a Northern-Colorado coordinate plane (no Google Maps key / no map lib present — addresses have no lat/lng, so points are deterministically derived from address). Selection lists properties/projects inside the box, links to the record, and exports CSV.

## Files changed
- **New:** `client/src/pages/CustomerMap.tsx`.
- **Edited:** `client/src/pages/Tasks.tsx`, `client/src/pages/Estimates.tsx`, `client/src/pages/Jobs.tsx`, `client/src/pages/Leads.tsx`, `client/src/pages/RecordPage.tsx`, `client/src/App.tsx`, `client/src/components/Layout.tsx`.

---

# SPEC 9 — Second batch (ProLine CRM parity)

Implemented on the same `update-8` branch, committed/pushed incrementally.

## 1. Automations parent nav + three subpages
- **Nav dropdown** (`client/src/components/Layout.tsx`): the "Automations" sidebar item is now a collapsible `NavParent` with children **Triggers**, **Automation Campaigns**, **Active Automations**. Mobile nav flattens the children; header breadcrumb resolves sub-routes.
- **Routes** (`client/src/App.tsx`): `/automations/triggers` → `Triggers`, `/automations/campaigns` → `Campaigns`, `/automations/active` → `Automations`; bare `/automations` redirects to `/automations/triggers`.
- **Automation Campaigns** (`client/src/pages/Campaigns.tsx`, NEW): section-grouped tile grid (SPEED-TO-LEAD / SALES FOLLOW-UP / JOB UPDATES / REVIEWS & REFERRALS / INSURANCE + OTHER bucket) with workflow counts. Each tile: colored icon square, UPPERCASE name, Active/Inactive dot badge, "Last updated:" date, delete/duplicate/toggle icon buttons, 2×2 stat grid (Steps, Active now, Runs this week, Total runs). "New Campaign" button.
- **Triggers** (`client/src/pages/Triggers.tsx`, NEW): tile grid; each tile shows type label (Project Stage / Event Type), UPPERCASE name, Active/Inactive dot, IF/Start/Stop rows, and an "Extra condition sets" count chip.
- **Edit Workflow Trigger modal** — **center-screen** shadcn `Dialog` (satisfies the "centered popup, not a side panel" requirement): Workflow Trigger Status switch; TRIGGER TYPE tab buttons (Project | Job | Event); Project Trigger Type select; Project Stage select; "IF these conditions are true" condition-group cards iterating the six condition fields with "Choose an option…" selects; "+ Add Dynamic Field Condition"; "Take the following actions" (Stop Action + Start Workflow selects); "Add Condition Group"; red Delete + Save.
- **Active Automations** (`client/src/pages/Automations.tsx`): retitled the existing cadences/templates/outbox page header to "Active Automations" — it already lists enabled automation rules with active toggles + an outbox, matching the intent.
- **Data layer:** new `campaigns` and `triggers` tables (`shared/schema.ts`), storage methods + DDL (`server/storage.ts`), REST CRUD routes (`server/routes.ts`), and idempotent `backfillUpdate9()` seed (`server/seed.ts`) of example campaigns and triggers.

## 2. Jobs as pipeline-stage tiles
- `client/src/pages/Jobs.tsx`: added a **Tiles / Table** view toggle. Tiles view groups active jobs into columns by production/billing pipeline stage (deduped, in flow order). Each `JobTile` carries **View Workorder**, **View Material Order**, and **Projected Date of Completion** buttons that open a detail dialog. Table view is preserved unchanged.

## 3. Ready for Production gate
- `client/src/pages/RecordPage.tsx`: when a record's Status is **Ready for Production**, an amber/green checklist card shows the four required checks — **License Valid, Permit Approved, Material Allocated, Build Date Verified**. The Status select is gated: advancing to any later production stage is blocked (destructive toast) until all four are checked. Checklist persists via the job's `readyForProdChecklistJson` column (added in the schema/storage ALTER loop).

## 4. Siding Quick Template
- `client/src/lib/templates.ts`: new `SIDING` `QuickTemplate` with all 10 spec sections and every line item/unit (Siding Removal & Disposal; Substrate Repair & Prep; Weather Barrier / Moisture Management; Siding — Hardie Board; Siding — LP SmartSide; Siding — Vinyl; Trim & Accessories; Soffit & Fascia; Flashing & Sealing; Miscellaneous / Additional Work). "Selector" lines (no unit in the spec) are modeled as EA roster lines. Added to `QUICK_TEMPLATES`; removed "Siding" from `CUSTOM_ONLY_JOB_TYPES` so the Siding job type binds to the template.

## Build status (SPEC 9)
- `npm run build`: **PASS** (vite client 2520 modules + esbuild server; only the standard >500 kB chunk advisory).
- `tsc --noEmit`: clean for all SPEC 9 files. The only remaining errors are 3 pre-existing `client/src/lib/build-model.ts` `BuildLineKind` widenings that predate this branch (verified via `git stash`) and do not affect the build.

## Files changed (SPEC 9)
- **New:** `client/src/pages/Campaigns.tsx`, `client/src/pages/Triggers.tsx`.
- **Edited:** `client/src/App.tsx`, `client/src/components/Layout.tsx`, `client/src/pages/Automations.tsx`, `client/src/pages/Jobs.tsx`, `client/src/pages/RecordPage.tsx`, `client/src/lib/templates.ts`, `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `server/seed.ts`.
