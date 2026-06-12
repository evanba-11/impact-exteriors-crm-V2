# Update Spec 4 — Job Types, Custom Mode, Shingle Template Sections, Add-Line, Leaderboard Grid

Keep: design system, hash routing, pricing engine math (worked example must still total $17,939.87 with default settings on a Retail shingle estimate), Team Feed, proposal generator behavior (quantities-only + show-pricing toggle).

## 1. Job types — everywhere job types appear
Canonical job type list (replace any previous job-type/funding enums across leads, jobs, estimates, pipeline filters, dashboards, seeds):
**Retail, Insurance, Commercial, Residential Service, Commercial Service, Soffit/Fascia/Gutters, Siding, Exterior Painting**
- The per-estimate **Settings tab gets a "Job Type" selector** with these 8 options.
- Funding math: job type **Insurance** uses the insurance math (profit = contract − total cost − material tax, O&P allowed on proposal). All other types use retail math (price = cost ÷ (1−margin), deposit rules). The old separate Retail/Insurance funding toggle is replaced by this job type selection.
- Show job type as a badge on estimate list rows, job cards, kanban cards, and the estimate header.

## 2. Tab order + Custom mode
- Estimate workspace tab order: **Settings | Build | Material Summary | Financials | Proposal** (Settings leftmost, before Build).
- Rename the former "Advanced" entry mode to **"Custom"**. Custom mode = fully manual estimating: user can add ANY item from scratch (blank rows with fields: item name, section, qty, unit, unit material cost, labor rate, price/bid) plus pick from the catalog. Everything editable, no required template structure. New estimate flow offers: **Quick Template** or **Custom**.

## 3. Shingle Template — restructured sections
When a Quick Template (Shingle) estimate opens, the Build tab shows ALL of the following sections and items immediately, each with qty inputs (blank by default unless derived from Quick measurements):

- **Tear-Off**: Asphalt Shingle Tear Off (SQ)
- **Shingle Install**: Shingle Install (SQ), Hip and Ridge (LF), Shingle Starter Install (LF), Synthetic Roofing Felt Installation (SQ), Ice and Water Barrier (SQ)
- **Edge Flashings**: Gutter Apron (LF), Drip Edge (LF), Step Flashing (LF), Closed Valley (LF), W-Pan Open Valley (LF), Swamp Cooler Work Around (EA), Swamp Cooler Boot Replacement (EA)
- **Boots, Vents, etc.**: Plumbing Boot (EA), Split Boot (EA), Box Vent (EA), Broan Vent (EA), Turbine Vent (EA), Powered Attic Fan (EA)
- **Misc.**: Permit Fee (EA, editable $), Solar Panel D&R (EA), Skylights (EA), Skylight Flashing Kit (EA), OSB 4x8 Sheet with a **dropdown for thickness: 3/4in, 1/2in, 7/16in** (EA)

Behavior:
- Items with blank/zero quantity do NOT appear on the proposal and do NOT add cost.
- Every line has an **"x" remove control** to drop it from that estimate (per-estimate only; reopening template defaults unaffected for new estimates).
- Pricing: use existing catalog costs/labor rates where they exist (tear-off/install $95/SQ base, hip&ridge, starter, felt, I&W, gutter apron, drip edge, step flashing, valley, boots, box vents, broan, OSB, permits...). For NEW items with no sheet price (turbine vent, powered attic fan, split boot already exists, solar panel D&R, skylights, skylight flashing kit, swamp cooler work around / boot replacement, closed valley vs W-pan open valley, OSB thickness variants), add catalog entries with reasonable editable default costs clearly marked editable — all line costs/rates remain editable per estimate anyway. Closed Valley can map to existing valley metal; W-Pan Open Valley as its own item.

## 4. "Add Line" in EVERY section
Every Build section (in BOTH Quick Template and Custom modes) gets an **"+ Add Line" button** at the section bottom that appends a fully fillable row with the SAME fields as existing rows: item name (free text), qty, unit (dropdown: SQ/LF/EA/SF), unit material cost, labor rate, and bid/price — flows into totals, financials, and proposal (if qty > 0) exactly like catalog lines. User can add material OR labor items this way.

## 5. Leaderboard — compact 2x2 grid, random names, dollars only
- Replace leaderboard names with random fictional names (do NOT use the names from the reference photo: no DeDoncker, Bisnette, Perez, Ottoson, Burks, Karas, Bailey, Densberger, Hickman). Update seeds accordingly (reps can remain app users with these names).
- Layout: a compact **2x2 grid box on the RIGHT side of the dashboard, positioned high on the page** (top region, beside the KPI area not below all charts): Weekly (top-left), Monthly (top-right), Quarterly (bottom-left), Year-to-Date (bottom-right). Each cell: small title + ranked names with dollar amounts only. No charts/graphs/bars in the leaderboard — text rankings only. Keep it tight/small (top ~5 per board, compact type).
- Adjust dashboard layout so this sits high-right; existing KPI cards/flags reflow to accommodate. Do not add new graphs.

## QA + Ship
- Verify worked example still totals $17,939.87 (Retail shingle, default settings).
- Playwright QA desktop 1280 + mobile 375: job type selector + badges, Settings-first tab order, Custom mode manual entry, full shingle template visible with blank items omitted from proposal, x-remove, + Add Line in every section flowing to totals/proposal, leaderboard 2x2 grid placement. Screenshots.
- `npm run build`; restart prod: start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/impact-crm", port=5000); deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html").
- Write /home/user/workspace/impact-crm/UPDATE_4_REPORT.md. Do NOT publish to pplx.app.
