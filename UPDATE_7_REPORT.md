# UPDATE 7 — Pipeline, Material Returns, List Views, Work Orders, Estimates, CompanyCam, Opportunities, AR — Implementation Report

**Project:** Impact Exteriors CRM
**Stack:** Express + Vite + React + Tailwind + shadcn + Drizzle + SQLite (dev/prod on port 5000)
**Spec:** `UPDATE_SPEC_7.md` (source of truth)
**Branch:** `update-7`
**Status:** ✅ Complete — `npm run build` passes (vite client + esbuild server), `npm run dev` boots clean on port 5000, existing `data.db` migrated in place, demo data backfilled.

---

## Scope guardrails honored
- **Customer Map** — skipped (explicitly out of scope).
- **CompanyCam, payment links, QuickBooks** — placeholders only. No real external API calls anywhere.
- Changes are additive and surgical. The role switcher, follow-up automation engine, estimating engine, and proposal/work-order generation are all preserved and untouched in behavior.

---

## The 8 areas — all delivered

### 1. Pipeline stages ✅
- `shared/schema.ts` `STAGES`:
  - **INSURANCE**: added **Waiting on Supplements**, **Supplements Approved**, **Pre-Production** after "Approved".
  - **SALES**: added **Pre-Production** before "Ready for Production".
- `DEFAULT_SLAS` and `STAGE_PROBABILITY` extended for the new stages.
- Kanban (`Pipeline.tsx`) renders the new columns automatically off `STAGES[flow]`.

### 2. Material Returns overhaul ✅
- New tables `material_returns` + `material_return_lines` (`shared/schema.ts`), storage CRUD + line replace (`storage.ts`), REST group under `/api/material-returns` (`routes.ts`).
- **Approval workflow** (Admin-only approve/reject). **Auto-approve** when every line carries a `vendorId`.
- **Photo data-URL uploads** stored in `photosJson`.
- **Per-vendor print slips**, **supplier pricing auto-fill** from price items, **live warehouse vs vendor totals**.
- Page `MaterialReturns.tsx` + route `/material-returns` + sidebar nav entry.

### 3. Revamped list views ✅
- Reusable `ListView.tsx`: `useListView(key, initial?)` (search + sort + **Mine** filter + arbitrary filters, all persisted to `localStorage` under `list:{name}:filters`), `applyList()`, `exportCsv()`, `ListToolbar`, `SortHead`.
- Applied to **Opportunities** (`Leads.tsx`), **Jobs** (`Jobs.tsx` — adds **Cost** column + CSV + Mine + sortable financial columns), and the new **Issues** list.
- New minimal `issues` table + `/api/issues` REST group + `Issues.tsx` page + `/issues` route.

### 4. Work Orders ✅
- Full street **address** on the printable order; **tap-to-call** `tel:` links for both the prepared-by employee and the customer.
- **Materials / Labor checkboxes** in the action bar driven by new `showMaterials` / `showLabor` columns.
- Child items inherit their parent category (grouping via `woGroupsFor`).
- **Zero-qty lines excluded** from work orders (and from proposals — see §5). Quantity inputs are blank fillable boxes with spinners removed.

### 5. Estimates ✅
**Already shipped earlier in this branch:**
- **Spinner arrows removed** + **blank fillable boxes** instead of "0" across every BuildRow numeric input (qty / rate / cost / bid / custom mat / custom lab) via the shared `.no-spin` class, `inputMode="decimal"`, and `numVal`/`numOrZero` helpers (a 0 renders as an empty field showing its placeholder).
- **Zero-qty lines excluded from proposals** (`Proposals.tsx` scope builder filters `qty <= 0` and drops now-empty groups).
- **Drag auto-scroll near edges** on the Pipeline kanban (`Pipeline.tsx`): an `onDragMove` handler pans the board left/right via a rAF loop when a dragged card nears either edge.
- **RecordPage estimate table reorder**: the Estimates tab renders a real table with right-aligned **Bid / Labor / Material / Total Cost / Margin / GPM** columns, GPM colored **green ≥ 35% / red below** (`metricsFor` per estimate).

**Builder substitution + group tooling (this pass):**
1. **Substitution improvements** — `SubstitutePopover` (`Estimates.tsx`) offers a **bid / material / labor** `ToggleGroup`; candidate options are grouped **by base estimate section**, each with a colored category **dot** (`SECTION_DOT`/`dotFor`); substituting a **bid** item carries over its child-item keys (`childKeys`). Rendering: the **original line is struck through in red** (`substitutedOriginal` → `line-through text-red-500/80` + red left border, dollar contribution zeroed) and the **green replacement** (`isSubstitute`) is inserted immediately after. Post-process lives in `applySubstitutions(build, overrides)` (`build-model.ts`), shared by both the engine and template compute paths; totals recomputed via bid/labor/material deltas.
2. **Copy group from another estimate** — `CopyGroupDrawer` (`Estimates.tsx`) reconstructs sibling estimates' sections from their persisted `buildJson.custom` lines (same `jobId`, excluding the current estimate) and imports a whole group via `copyLinesTo`.
3. **"Duplicate to" submenu** — each line's `MoreVertical` row menu (`BuildRow`) has a **Duplicate to** submenu listing every add-on group (`addOnTitles`), calling `duplicateLineTo(l, title)`.
4. **"Copy from Base" on add-on groups** — `SectionActions` on add-on sections opens `CopyChecklistDrawer`, a checkbox list of base-group items (with colored kind dots) for bulk import via `copyLinesTo`.
5. **Colored left borders on child items** — `borderClass` in `BuildRow`: **green** `border-l` for `kind === "labor"`, **blue** for `kind === "material"` (red for substituted original, solid emerald for the substitute).
6. **Unresolved product choices** — `unresolvedProduct` (a product-selectable line with no resolved selection) highlights the row **yellow** (`bg-amber-400/15`), amber select border, and a "· choose a product" hint.
7. **Drag auto-scroll on estimate-line reorder** — per-section `DndContext`/`SortableContext` with `useSortable` drag handles + `arrayMove`; `onDragMove` pans the Builder body (located via the new `data-estimate-scroll` attribute on the scroll container) through a rAF velocity loop (`stepScroll`) when the cursor nears the top/bottom edge. Order persisted in `overrides.order` and re-applied by `applySubstitutions`.

### 6. CompanyCam placeholders ✅
- `RecordPage.tsx` `CompanyCamPanel`: **Create CompanyCam Project** button writes a fake `companyCamProjectId` (`CC-{id}-{random}`) + `companyCamCreatedAt` and toasts "integration pending". When linked, shows a badge, an "Open in CompanyCam" affordance (toast only), and a placeholder photo gallery. No network calls.

### 7. Opportunities ✅
- **List / Kanban toggle** (persisted to `opps:view`); kanban grouped and ordered by pipeline stage order.
- **KPI bar** aggregating **Labor / Material / Bid / Margin / GPM** across the filtered set (client-side via `metricsFor` over each opportunity's estimates — prefers Accepted, else latest).
- **Yellow-highlight** chip warning for unfilled segmentation fields.
- **createdBy** column + **date-range** filter (all / today / 7d / 30d / 90d), persisted.
- **Bid Type** editable, carried through on convert, and exposed in Advanced Settings.
- **Convert → Pre-Production Checklist** modal (5 required checks) that blocks the convert until all are checked; stores `preProductionChecklistJson` and routes the job through **Pre-Production**. Convert lives on the record page.

### 8. AR Reconciliation ✅
- **Send Payment Link** dialog (`PaymentLinkDialog.tsx`) with a placeholder URL (no real provider call).
- `ARaging.tsx` page with standard aging buckets + sidebar nav entry (`/ar-aging`).

---

## Data migration & seeding
- Schema changes use idempotent `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE` in try/catch, so the existing `data.db` migrates in place on boot with no data loss.
- `seedIfEmpty()` is gated to fresh databases, so the previously-seeded `data.db` (44 jobs) would not pick up the new demo rows. Added **`backfillUpdate7()`** (called from `routes.ts` after `seedIfEmpty`): idempotently inserts demo **Issues** (4) and **Material Returns** (3: a pending warehouse return, an auto-approved single-vendor return, and a mixed return) only when those tables are empty. Verified populated and the committed `data.db` checkpointed to include them.

---

## Verification
- `npm run build` → vite client build + esbuild server bundle both succeed (only the standard chunk-size advisory).
- `npm run dev` → boots on port 5000, scheduler starts, `/api/issues` and `/api/material-returns` return the backfilled demo rows (200 OK).
- Pre-existing `tsc --noEmit` advisories in `client/src/lib/build-model.ts` (3, `kind: string` widening — present on `main` before this branch) are unchanged and out of scope; the project gates on `npm run build`, which is clean. The two new type errors introduced during this work (`JobTypeBadge` not accepting `null`) were fixed by widening its prop to `string | null`.

---

## Files
**New:** `client/src/components/ListView.tsx`, `client/src/components/PaymentLinkDialog.tsx`, `client/src/pages/ARaging.tsx`, `client/src/pages/Issues.tsx`, `client/src/pages/MaterialReturns.tsx`.
**Edited:** `App.tsx`, `Layout.tsx`, `WorkOrder.tsx`, `index.css`, `Estimates.tsx`, `Financials.tsx`, `Jobs.tsx`, `Leads.tsx`, `Pipeline.tsx`, `Proposals.tsx`, `RecordPage.tsx`, `server/routes.ts`, `server/seed.ts`, `server/storage.ts`, `shared/schema.ts`.
