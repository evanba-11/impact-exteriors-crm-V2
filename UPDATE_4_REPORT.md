# Impact CRM — Update 4 Report
**Job Types + Template Restructure + Leaderboard**

Date: 2026-06-11
Spec implemented: `UPDATE_SPEC_4.md` (source of truth)
Status: ✅ Complete — built, re-seeded, QA'd (desktop 1280 + mobile 375), deployed.

---

## Summary of the five changes

### 1. Canonical job types everywhere
Replaced the old free-text job types and the Retail/Insurance funding toggle with eight canonical job types defined once in `shared/schema.ts`:

> **Retail, Insurance, Commercial, Residential Service, Commercial Service, Soffit/Fascia/Gutters, Siding, Exterior Painting**

- `JOB_TYPES` constant + `JobType` type + `fundingForJobType(jobType)` helper added to `shared/schema.ts`. `fundingForJobType` returns `"Insurance"` only for the **Insurance** job type; **every other type maps to `"Retail"` math**. The pricing engine (`pricing.ts`) is untouched — it still keys off `funding`, which is now derived from the job type.
- Per-estimate **Settings tab** gains a **Job Type selector** (8 buttons) that drives `funding`. The old Retail/Insurance toggle (`FundingCard`) is gone, replaced by `JobTypeCard`.
- **Job type badge** (`JobTypeBadge`, exported from `Estimates.tsx`; Insurance = violet, others = neutral) now appears on:
  - Estimate list rows (new "Job Type" column)
  - Estimate builder header
  - Lead table rows (new "Type" column) — `Leads.tsx`
  - Pipeline kanban cards — `Pipeline.tsx`
  - Jobs table rows (new "Type" column) — `Jobs.tsx`
  - Job drawer header — `JobDrawer.tsx`

### 2. Tab order + Custom mode
- Builder tab order is now **Settings | Build | Material Summary | Financials | Proposal** (Settings leftmost and default-open).
- "Advanced" mode renamed to **Custom** = fully manual (blank rows with item name, section, qty, unit, unit material cost, labor rate, price/bid + catalog picks).
- Settings offers a **Build Mode** selector: **Quick Template** or **Custom**. New estimates default to Quick Template.

### 3. Shingle Quick Template restructured
`client/src/lib/build-model.ts` rewritten. All sections render on open with **blank (zero) qty by default**; blank/zero lines add no cost and never appear on the proposal. Exact sections/items per spec:
- **Tear-Off**: Asphalt Shingle Tear Off (SQ)
- **Shingle Install**: Shingle Install (SQ), Hip and Ridge (LF), Shingle Starter Install (LF), Synthetic Roofing Felt Installation (SQ), Ice and Water Barrier (SQ)
- **Edge Flashings**: Gutter Apron (LF), Drip Edge (LF), Step Flashing (LF), Closed Valley (LF), W-Pan Open Valley (LF), Swamp Cooler Work Around (EA), Swamp Cooler Boot Replacement (EA)
- **Boots, Vents, etc.**: Plumbing Boot, Split Boot, Box Vent, Broan Vent, Turbine Vent, Powered Attic Fan (each EA)
- **Misc.**: Permit Fee (editable $), Solar Panel D&R, Skylights, Skylight Flashing Kit, OSB 4x8 Sheet (thickness dropdown 3/4in, 1/2in, 7/16in)
- Every line has an **"x" remove control** (per-estimate only).

### 4. "+ Add Line" in every Build section, both modes
Each Build section (Quick **and** Custom) has a **+ Add Line** control at its foot. The added fillable row (name, qty, unit, unit material cost, labor rate, bid + catalog pick) flows into totals, Financials, and the Proposal when qty > 0.

### 5. Leaderboard
- Random **fictional rep names** (none on the forbidden list, no "Brennan"): Liam Calloway, Kurt Renner, Jalen Vasquez, Jordan Holt, Craig Mercer, Dino Sandoval, Wes Whitaker, Marco Foss, Shane Lindqvist.
- Dashboard leaderboard is now a **compact 2×2 text-only grid box on the RIGHT, positioned HIGH** beside the KPI cards (not below the charts): **Weekly** (top-left), **Monthly** (top-right), **Quarterly** (bottom-left), **YTD** (bottom-right).
- Each cell shows a small title + ranked names with **dollar amounts only** (top 5). **No charts, bars, or graphs.** KPI cards reflow into the left column. No new graphs added.

---

## Constraints honored
- Design system, hash routing, and pricing engine math unchanged.
- **Worked example still totals `$17,939.87`** (Retail shingle, default settings) — verified via `verifyWorkedExample()` (`pass: true`, total `17939.865…`) and confirmed live on the Devon Carter estimate's Financials tab (`Total Estimate Value = $17,939.87`).
- Team Feed unchanged; Proposal keeps quantities-only + show-pricing toggle and derives Insurance/O&P from `funding` (now driven by job type).
- No forbidden leaderboard names used.

---

## Files changed
- `shared/schema.ts` — `jobType` column on estimates; `JOB_TYPES`, `JobType`, `fundingForJobType`.
- `server/storage.ts` — added `job_type TEXT DEFAULT 'Retail'` to the `estimates` CREATE TABLE (the raw SQL table definition; this was the missing piece that caused the first seed to fail).
- `server/seed.ts` — new fictional rep names (email/role/commission preserved), canonical job types on seeded jobs, leaderboard buckets updated, `jobType` on seeded estimates.
- `client/src/lib/build-model.ts` — full template restructure, custom lines, add-line + remove support, new catalog entries.
- `client/src/pages/Estimates.tsx` — Settings-first tab order, `JobTypeCard` (replaces `FundingCard`), Job Type + Build Mode selectors, exported `JobTypeBadge`, list Job Type/Mode columns, per-section +Add Line and x-remove, custom rows.
- `client/src/pages/Leads.tsx`, `Pipeline.tsx`, `Jobs.tsx`, `client/src/components/JobDrawer.tsx` — canonical `JOB_TYPES` import and `JobTypeBadge`.
- `client/src/pages/Dashboard.tsx` — compact 2×2 text-only leaderboard high-right; `LeaderboardCell` replaces bar-based `LeaderboardCard`; KPI grid reflowed.

---

## Build / deploy
- `npm run build` — clean (no TS errors). Output: `dist/index.cjs`, `dist/public`.
- Database re-seeded by deleting `data.db*` and starting the prod server (seed guard fires on empty DB).
- Production server: `NODE_ENV=production node dist/index.cjs` on port 5000 (via `start_server`).
- Deployed via `deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html")`.
- **Not** published to pplx.app (per instruction).

## QA evidence (Playwright)
Desktop 1280 + mobile 375 screenshots saved in project root:
- `qa_dashboard_desktop.png`, `qa_dashboard_mobile.png`, `qa_leaderboard_mobile.png` — 2×2 text-only leaderboard high-right, new names, KPI reflow.
- `qa_estimates_list.png` — Job Type + Mode columns.
- `qa_builder_settings.png`, `qa_builder_mobile.png` — Settings-first tabs, 8-type Job Type selector, Quick/Custom mode.
- `qa_builder_build.png`, `qa_builder_custom.png` — restructured sections, +Add Line per section, remove controls (29 in quick → 30 after add).
- `qa_builder_financials.png` — total verified $17,939.87.
- `qa_leads_desktop.png`, `qa_pipeline_desktop.png`, `qa_jobs_desktop.png` — job type badges everywhere.

Functional checks: +Add Line increments rows; Insurance job type reveals the carrier-contract input and flips the live badge to violet; switching back to Retail/Quick restores the worked example unchanged (not saved, so the seeded estimate remains $17,939.87 / Retail).
