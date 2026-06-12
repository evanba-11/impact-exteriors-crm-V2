# CRM Update 5 — Renames + 4 New Templates

**Status:** ✅ Complete · Build passing · Production server running on port 5000 · Deployed to preview.
**Worked example:** Residential Re-Roof estimate with defaults **still totals $17,939.87** (verified in code and end-to-end in the proposal).

---

## 1. Job-Type Renames

Two job-type **labels** were renamed everywhere they surface; the internal pricing-engine `funding` field ("Retail"/"Insurance") was left unchanged so the math is unaffected.

| Old label   | New label                          |
| ----------- | ---------------------------------- |
| Retail      | **Residential Re-Roof**            |
| Insurance   | **Residential Insurance Re-Roof**  |

- `shared/schema.ts` — `JOB_TYPES` enum renamed (8 types total); `fundingForJobType()` returns `"Insurance"` only when `jobType === "Residential Insurance Re-Roof"`, else `"Retail"`. `migrateJobType()` helper added.
- `server/seed.ts` — seed job types renamed.
- `server/routes.ts` — `migrateJobTypes()` raw-SQL migration runs on server start to rewrite any legacy "Retail"/"Insurance" rows.
- `client/src/pages/Estimates.tsx` — `JobTypeBadge`, default job type, Carrier/Insurance conditions, and the job-type selector all use the new labels.
- `client/src/pages/Proposals.tsx` — insurance branch keys off `ji.funding === "Insurance"` (driven by the renamed job type).

**Architecture note:** `funding` stays `"Retail"`/`"Insurance"` as the pricing-engine driver. Only the user-facing **labels** changed, which is why the worked example is preserved byte-for-byte.

---

## 2. Residential Re-Roof Template Edits (engine-driven shingle build)

`client/src/lib/build-model.ts` — `computeBuild()` math unchanged. `SHINGLE_ROSTER` expanded with new editable ($0 placeholder) items:

- **Edge Flashings:** Counter Flashing, Headwall / Apron Flashing, Chimney Flashing — Base, Chimney Flashing — Counter/Cap, Dormer Flashing, Wall Flashing (LF); Kick-Out Flashing (EA).
- **Boots, Vents, etc.:** Ridge Vent add ($5.75/LF = $3.75 material + $2.00 cut-in labor), Gable Vent (EA), Deck Intake (EA).
- **Misc.:** Dumpster Fee (Flat), Haul-Off / Dump Fee (Flat), Dump Fee Overage (EA), Antenna Removal (EA), Scaffold Rental (Day, alt Week), Caulking / Sealant (LF, alt Flat), Satellite Dish Removal (EA), Additional Labor (HR).

**Dropdowns added in `BuildRow`:**
- All product selections render as inline `<select>` dropdowns (`product-select-<id>`), even single-option.
- **OSB thickness dropdown** (`thickness-select-<id>`) on the OSB decking line: **3/4in, 1/2in, 7/16in**.
- Unit dropdowns (`unit-select-<id>`) on lines carrying `altUnits`.

Catalog costs were reused where matched; everything else is a $0 editable placeholder. **No pricing was invented.**

---

## 3. Four New Data-Driven Quick Templates

Implemented as a single **data-driven template module** (`client/src/lib/templates.ts`) — one `QUICK_TEMPLATES` array, **not five copies**. A new roster-only builder `computeTemplateBuild()` in `build-model.ts` renders them.

| Job type                 | Source file                    | Notes                                                    |
| ------------------------ | ------------------------------ | -------------------------------------------------------- |
| Residential Service      | REPAIR-TEMPLATE.txt            | 15 sections incl. % "After-hours surcharge"              |
| Soffit/Fascia/Gutters    | GUTTER-ESTIMATE.txt            | 7 sections; "X or Y" units default to first w/ alternates |
| Exterior Painting        | EXTERIOR-PAINTING.txt          | 3 parent sections with **no line items render empty + Add Line** |
| Commercial Service       | COMMERCIAL-SERVICEROOFING.txt  | **17 sections**                                          |

Behavior verified against spec:
- Opens with **all sections and items visible**.
- **Blank-qty items cost nothing** (qty 0 → bid $0.00) and **stay off the proposal** (omitted from `computeTemplateBuild` scope).
- **x-remove** and **+ Add Line** on every section (including the empty Exterior Painting sections).
- **"X or Y" units** default to the first option, with alternates available in the unit dropdown (e.g. "SF or %" → defaults SF, % available).
- **"%" units compute the bid as a percent of the non-% bid subtotal** (verified: 10% surcharge on a $1,630.83 line = $163.08).
- Existing catalog costs used where matched; $0 editable placeholders elsewhere — no invented pricing.

**Job-type auto-pick:** `chooseJobType()` auto-selects the matching template and sets build mode. `Commercial` and `Siding` have no template and **fall back to Custom gracefully** with the note: *"No Quick Template for this job type yet — Custom mode only for now."*

---

## 4. Proposals Routing

`client/src/pages/Proposals.tsx` — `buildScopeGroups()` now routes by job type:
- Shingle re-roof types → `computeBuild()` (engine-driven).
- The four Quick Templates → `computeTemplateBuild()`.
- Commercial/Siding → `computeBuild()` fallback.

Proposal scope **section names follow the template's section names** automatically (verified: a Soffit/Fascia/Gutters estimate's proposal shows "Gutter Removal & Disposal", "Gutters", "Downspouts", etc.).

---

## 5. QA Summary (Playwright — desktop 1280 + mobile 375)

**Functional:**
- ✅ Estimates list shows renamed "Residential Re-Roof" badges; worked example $17,940.
- ✅ Estimate Settings: all 8 renamed job types in selector; "Retail math." / template hint shown; margin 40.5% · $6,940.
- ✅ Build tab (shingle): 9 product dropdowns, OSB thickness dropdown (3/4in,1/2in,7/16in), 2 unit dropdowns; all new Edge Flashings / Boots / Misc items present at qty 0 / $0 placeholders with x-remove + Add Line.
- ✅ Residential Service / Soffit-Fascia-Gutters / Exterior Painting / Commercial Service templates each open with all sections + items; Exterior Painting's 3 empty parent sections render empty + Add Line; Commercial Service shows all 17 sections.
- ✅ % surcharge math: 10% → bid = 10% of non-% subtotal ($163.08 on $1,630.83).
- ✅ "SF or %" unit dropdown defaults to SF with % alternate.
- ✅ Commercial and Siding → Custom mode auto-switch with note.
- ✅ Proposal (Residential Re-Roof, est 1): engine-driven scope, 6 shingle sections, scope total + contract total **$17,939.87**; product sub-lines render blue.
- ✅ Proposal (Soffit/Fascia/Gutters): template-driven scope, section names = template sections, $0.00 total (all blank).

**Visual:**
- ✅ Desktop 1280: clean layout, no overflow/clipping; leaderboard 2x2 grid intact on dashboard.
- ✅ Mobile 375: job-type selector wraps cleanly, KPI cards stack 2-up, build rows + product panel usable, no horizontal overflow.

**Preserved:** design system, hash routing, Team Feed, proposal quantities-only behavior, leaderboard 2x2 grid.

**Negative checks (not found):** no text overflow, no off-token colors, no broken routing, no console page errors during QA, no regression to the worked-example total.

---

## 6. Build & Deploy

- `npm run build` — ✅ client + server build clean (no TS errors).
- Worked example verified via `verifyWorkedExample()`: `pass: true`, total `17939.87`.
- Production server restarted: `start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/impact-crm", port=5000)` — ready, pid live.
- Deployed preview: `deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html")`.
- **Not** published to pplx.app (per instructions).

---

## Key Files Touched

- `shared/schema.ts` — JOB_TYPES enum + fundingForJobType + migrateJobType.
- `server/seed.ts`, `server/routes.ts` — renames + migration.
- `client/src/lib/templates.ts` — `QUICK_TEMPLATES` (4), `templateForJobType`, `SHINGLE_REROOF_JOB_TYPES`, `CUSTOM_ONLY_JOB_TYPES`, `templateHint`, `ALL_UNIT_OPTIONS`.
- `client/src/lib/build-model.ts` — expanded `SHINGLE_ROSTER`, `OSB_THICKNESS`, `computeTemplateBuild()`, `BuildOverrides`/`BuildLine` additions (altUnits, hasThickness, isPct, thickness).
- `client/src/pages/Estimates.tsx` — job-type wiring, build routing, dropdowns in BuildRow.
- `client/src/pages/Proposals.tsx` — template-aware scope routing.

## QA Screenshots (saved)
- `qa_proposal_scope.jpg` — proposal scope of work (engine-driven, $17,939.87).
