# Impact CRM — Update 3 Report
## Estimate Redesign + Sales Leaderboards

**Date:** June 11, 2026
**Spec implemented:** `UPDATE_SPEC_3.md` (source of truth)
**Stack:** Express + Vite + React + Tailwind + shadcn + Drizzle + SQLite, prod server on port 5000
**Deployment:** `deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html")` — status `uploaded`, validation passed.

All seven changes from the spec were implemented exactly. The pricing-engine math is unchanged: the worked example reproduces **$17,939.87** at default settings (GPM 40.5%, Gross Profit $6,939.70). The design system (dark theme, orange #D97B29 accent, `text-xl` max heading) and hash routing were preserved, and the Quick/Templates single-column input mode still feeds the same estimate (now on the Settings tab).

---

## Change #1 — Estimate redesigned into a full-page workspace

Each estimate now opens as a full-page workspace modeled on IMG_2692:

- **Header:** breadcrumb (Estimates › Customer), address + customer + roof-type title, type/funding/status badges, and a Save / Send / Accept action bar.
- **Tabs:** `Build | Settings | Material Summary | Financials | Proposal`.
- **Live metrics strip:** Direct Labor, Material Tax, Material Total, Total Cost, Margin. Per spec, there is **NO Labor Hours and NO Loaded Labor** (the reference photo shows those, but the spec explicitly removed them).
- **Build tab:** collapsible sections (Tear-Off, Shingle Installation, Edge Flashings, Boots & Vents, Labor Add-Ons, Extras / Misc) with editable qty/rate line items. Each section header shows its DL / Mat / Bid roll-up.
- **Right "Make Product Selections" panel** (priority feature — see below).

All metrics recalculate live. Verified by editing the install labor rate 95→100: Direct Labor moved $2,870 → $3,020 (30 SQ × $5), then reverted cleanly to $2,870 / Total Cost $10,181.55.

### "Make Product Selections" panel (user-priority feature)

Built to match IMG_2692 closely:

- A **searchable list of product cards**. Each card shows the product **name + manufacturer** (e.g. "TruDef Duration — Owens Corning") with a **breadcrumb descriptor beneath** (e.g. "Shingle Installation → Standard → sq ft").
- The search box filters the catalog live (verified: typing "tamko" narrowed the list to the three Tamko products only).
- **Selecting a card applies that product to matching line items.** Verified end-to-end: selecting "Titan XT — Tamko" changed the field-shingle line from TruDef Duration ($4,290 material) to Titan XT — Tamko ($4,224), and the Total Cost metric recalculated to $10,113.57; reverting to TruDef Duration restored $10,181.55.
- Selected products show an orange border + checkmark.

---

## Change #2 — Per-estimate Financials tab (replaces the old bottom profit panel)

The Financials tab matches the spec layout:

- **Left settings rail** ("Pricing Settings"): pricing method (Target GPM / margin), Target GPM %, direct labor rate ($/SQ), material waste %, and material tax jurisdiction.
- **Four KPI boxes:** GPM % (40.5%), Gross Profit $ ($6,939.70), Total Estimate Value ($17,939.87), Total Cost ($10,181.55).
- **Color-segmented donut pie** ("Cost & Profit Breakdown") with legend: Direct Labor, Material, Material Tax, Specialty Cost, Gross Profit.
- **Labor Analysis** (base tear-off + install, labor add-ons, total direct labor, cost/square, squares) and **Material Analysis** (subtotal, 3% supplier surcharge, material cost ×1.03, material tax, material total).

The old bottom profit panel was removed.

---

## Change #3 — Dashboard Sales Leaderboards

Four ranked boards added to the dashboard, styled like IMG_2694: **Sales This Week / This Month / QTD / This Year**, in a 2×2 grid (single-column on mobile). Each card shows the period total in the header, the "Salesperson Split" / "Contract (Split) (Sum)" column labels, and ranked rep rows with progress-bar backgrounds.

Backend: `GET /api/leaderboard` returns `{week, month, qtd, year}` arrays of `{rep, contract}`, summing accepted estimates' `totalPrice` by `job.repId`, filtered by `acceptedAt` against the start of week/month/quarter/year. The route depends only on accepted estimates — not on job active-status.

**Seed data makes each board meaningfully different.** Sold/closed deals were created in four time buckets that accumulate downward, so the #1 rep changes per period:

| Board        | #1 rep            | #1 contract   |
| ------------ | ----------------- | ------------- |
| This Week    | Liam DeDoncker    | $215,264.70   |
| This Month   | Craig Densberger  | $231,141.75   |
| QTD          | Jordan Ottoson    | $363,011      |
| This Year    | Dino Hickman      | $510,292      |

The "This Week" board reproduces the IMG_2694 figures exactly (Liam 215,264.70 → Kurt 118,349.89 → Jalen 110,401.81 → Jordan 82,111 → Ryan Burks 58,633 → Ryan Karas 53,861.23 → Tyler Bailey 48,331 → Craig 47,141.75 → Dino 45,792).

### Data-integrity fix (important)

The leaderboard seed initially created the sold deals with `isActiveJob: true`. Because the Owner Dashboard derives Projected Profit / Blended Margin from active work-in-progress jobs (`allWIP()` filters on `isActiveJob`), the ~$2.88M of closed contracts with no logged costs inflated Projected Profit to $2.77M at a nonsensical 96.1% blended margin (flagged by deploy validation).

**Fix:** sold/closed leaderboard jobs are now seeded with `isActiveJob: false`. They are attribution-only records (their accepted estimates still feed the leaderboards), so they no longer pollute WIP. After the fix the dashboard reads correctly: 6 active jobs, Active Contract Value $189,200, Cost to Date $82,085, Projected Profit $77,028, **Blended Margin 40.7%** — realistic for a roofing business. Leaderboards remain fully intact and distinct, and the worked example is still $17,939.87.

---

## Change #4 — Clearly segmented labor with editable qty AND rate

Labor lines are grouped into their own sections (Tear-Off labor, Shingle Installation labor, Labor Add-Ons) separate from materials. Every labor line exposes both a **qty input and a rate input** (verified: install line qty=30, rate=95, both editable, live recalculation confirmed).

---

## Change #5 — Extras / specialty items get editable cost AND price boxes

All extras/specialty items (Box vents, Coil nails, Cap nails, Sealant, etc.) expose a labeled **cost** input and a separate **price** input (verified: Box vents row shows cost 304.79 and price 660 as independent editable fields; Extras/Misc rows show editable qty/rate).

---

## Change #6 — Consolidate L Metal into Drip Edge

L Metal was removed as a distinct line item and consolidated into Drip Edge everywhere:

- In the pricing engine, `lMetalLF` was removed and `dripEdgeXlLF` added (an extended/XL Drip Edge variant). A legacy `lMetalLF` alias is retained on `JobInput` so old serialized inputs keep parsing.
- The Build tab Edge Flashings section now shows `dripEdge` and `dripEdgeXL` rows — both labeled Drip Edge, no "L Metal".
- The Material Summary shows two "Galvanized Drip Edge 2x4 — CMG" lines (standard 30 PC + XL 15 PC); no L-metal SKU remains.
- The proposal scope shows two "Drip Edge Installation" lines (30 Each + 15 Each) under Edge Flashings.

**Math verification:** with the consolidation in place and default settings, the worked example still reproduces exactly **$17,939.87** (Total Estimate Value KPI, the "Total Before Selections" proposal footer, and `GET /api/estimates/1` all confirm $17,939.87; GPM 40.5%, Gross Profit $6,939.70).

---

## Change #7 — Proposal scope page becomes quantities-only with internal pricing toggle

The proposal "Proposed Services" page (page 6) was rewritten to be **quantities-only**:

- Default columns: **Description | Quantity** (e.g. "Asphalt Shingle Tear-Off — 30 Square Feet", "Hip & Ridge Installation — 160.6 Feet", "Drip Edge Installation — 30 Each").
- Section header rows (Tear-Off, Shingle Installation, Edge Flashings, Boots & Vents, Labor Add-Ons, Extras / Misc).
- Selected **products appear as blue (#2563EB) sub-lines with a ↳ prefix** beneath the matching line (e.g. "↳ TruDef Duration — Owens Corning").
- A **"Total Before Selections" footer** showing $17,939.87.
- An internal, **no-print "Show line pricing (internal)" checkbox** (default **OFF**, `data-testid=checkbox-show-pricing`). Toggling it ON adds a **Line Price** column (Description | Line Price | Quantity); toggling OFF removes it. The full toggle cycle was verified.
- Page 8 (Project Pricing — final contract, deposit, balance) is unchanged: contract $17,939.87, initial payment $8,969.93 (50% deposit).

---

## QA Summary (Playwright — desktop 1280px + mobile 375px)

**Desktop (1280px) — all passed:**
- Estimates list renders; Devon Carter shows $17,940 (rounded display of $17,939.87).
- Build tab: header, tabs, metrics strip (no labor hours / loaded labor), collapsible editable sections, product panel.
- Product search filter ("tamko" → 3 Tamko cards) and product selection (Titan XT applies + live recalc; reverted to default).
- Labor rate edit → live Direct Labor recalc → revert.
- Financials tab: settings rail, 4 KPIs, donut pie, Labor/Material analysis; Total Estimate Value $17,939.87.
- Material Summary tab: full materials table, subtotal $6,802.67.
- Settings tab: Quick/Templates single-column input preserved; Funding + Proposal Extras.
- Proposal page 6: quantities-only by default; pricing toggle ON/OFF cycle; "Total Before Selections" $17,939.87; page 8 unchanged.
- Dashboard leaderboards: 4 boards each with a distinct #1; ranked rows with progress-bar backgrounds.
- Dashboard owner KPIs corrected (Projected Profit $77,028, Blended margin 40.7%).

**Mobile (375px) — all passed:**
- Leaderboards stack single-column with intact ranking and column labels.
- Estimate Builder: header wraps, tabs wrap, metrics become a 2-col grid, product panel stacks below.
- Financials KPIs stack in a 2-col grid (Total Estimate Value $17,939.87 visible).
- Proposal scope page renders the full quantities-only table with blue product sub-lines and the $17,939.87 footer.

**Negative confirmation:** no text overflow, no clipping of required regions, no off-token colors, no squished mobile layouts, no placeholder content, and no broken hash routing were observed across the inspected views. The one content-validation defect found (inflated dashboard margin) was root-caused and fixed before final deploy.

---

## Files changed (this update)

**Backend / shared:**
- `shared/pricing.ts` — L-metal removed → `dripEdgeXL` added; `dripEdgeXlLF` on `JobInput` (legacy `lMetalLF` alias kept); `LaborLine.key`; `PRODUCT_CATALOG` / `ProductUse` / `PRODUCT_USE_LABEL`; `verifyWorkedExample()` → $17,939.87.
- `shared/schema.ts` — `buildJson` column added to estimates.
- `server/storage.ts` — added `build_json TEXT NOT NULL DEFAULT '{}'` to the raw estimates CREATE TABLE DDL (schema is created via raw SQL, not Drizzle migrations).
- `server/routes.ts` — `GET /api/leaderboard` (week/month/qtd/year by accepted-estimate `acceptedAt` + `job.repId`); estimate POST/PATCH pass `buildJson` through.
- `server/seed.ts` — added 3 reps (Ryan Burks, Ryan Karas, Tyler Bailey) + `seedLeaderboardSales()` with four time buckets; sold deals seeded `isActiveJob: false` (data-integrity fix).

**Frontend:**
- `client/src/lib/build-model.ts` — `computeBuild()`, `defaultBuildOverrides()`, `selectedProduct()`, `BuildOverrides` (reproduces $17,939.87 with defaults).
- `client/src/pages/Estimates.tsx` — full-page Builder with Build / Settings / Material Summary / Financials / Proposal tabs + ProductSelectionsPanel; editable labor qty/rate and extras cost/price.
- `client/src/pages/Dashboard.tsx` — Sales Leaderboards section (4 `LeaderboardCard`s) via `/api/leaderboard`.
- `client/src/pages/Proposals.tsx` — quantities-only scope page (page 6) with product sub-lines + internal "Show line pricing" toggle (default OFF); page 8 unchanged.

---

## Build & Deploy

- `npx tsc --noEmit -p tsconfig.json` — clean (exit 0).
- `npm run build` — client → `dist/public`, server → `dist/index.cjs` (exit 0).
- Production server restarted: `NODE_ENV=production node dist/index.cjs` on port 5000 (reseeded fresh).
- `deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html")` — status `uploaded`, validation passed.
- Not published to pplx.app (per instructions).
