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
- (updated below as work proceeds)

## Files changed
- (updated below as work proceeds)
