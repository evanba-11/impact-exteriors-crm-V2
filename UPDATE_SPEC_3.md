# Update Spec 3 — Estimate Page Redesign, Per-Estimate Financials Tab, Leaderboards, Labor Segmentation, Proposal Quantities-Only

Reference images (READ ALL THREE FIRST with the read tool):
- `/home/user/workspace/uploaded_attachments/ab6b1895106d440fb148bd1df760300b/IMG_2692.jpg` — target estimate page layout (White Castle Roofing CRM). Match as closely as possible.
- `/home/user/workspace/uploaded_attachments/ab6b1895106d440fb148bd1df760300b/Screenshot-2026-02-25-105832-2.jpg` — target proposal "Proposed Services" format (quantities only, product choices, optional add-ons).
- `/home/user/workspace/uploaded_attachments/ab6b1895106d440fb148bd1df760300b/IMG_2694-1.jpg` — target leaderboard (ranked salesperson + contract $ sum).

Keep: existing design system (dark, orange accent), hash routing, pricing engine MATH (catalog costs, labor rates, margin/waste/tax/surcharge formulas — worked example must still total $17,939.87 with default settings). The estimate UI around the engine is being redesigned; the engine itself is not.

## 1. Estimate page redesign (match IMG_2692)
Each estimate opens into a full-page workspace with:
- **Header**: address + customer name + job type (e.g. "10981 Mesa St - Betty Driscoll - Shingles" style), breadcrumb back to Estimates.
- **Tab bar**: Build | Settings | Material Summary | Financials | Proposal.
- **Metrics strip** (always visible, live): Direct Labor $, Material Tax $, Material Total $, Total Cost $, Margin $ (and GPM %). Do NOT show Labor Hours or Loaded Labor anywhere — user explicitly excluded them.
- **Build tab** (the core, like the photo):
  - Left/main: collapsible SECTIONS stacked vertically: Tear-Off, Shingle Installation, Edge Flashings, Boots & Vents, Labor Add-Ons, Extras/Misc. Each section has its quantity input rows (one per row, label + editable qty + unit) and its line items listed beneath: item name with breadcrumb-style descriptor ("Shingle Installation → Standard → Shingle Roofing" style), and columns: Qty | Direct Labor | Material | Bid (per line). Quantities auto-derive from the measurements (eaves/rakes → drip edge LF etc.) but every line's qty AND unit cost/rate are directly editable (override stored per estimate line).
  - Right sidebar: **"Make Product Selections"** panel — searchable card list of catalog products grouped by use (shingle, hip & ridge, pipe boot, box vent, gutter apron, drip edge...). Selecting swaps the product used by matching line items (e.g. pick Tamko Titan XT vs StormFight vs OC Duration). Card shows name + small descriptor like the photo.
  - Keep both entry experiences: "Templates" (Quick single-column inputs, unchanged from Update 2) and "Advanced" — this redesigned Build page replaces what Advanced was, and Quick inputs feed the same sections. One unified estimate model; Quick is just the simplified input form that populates the Build sections.
- **Settings tab** (per estimate; ALSO show same controls as a left rail on the Financials tab per the user's request):
  - Labor & Material settings: Pricing method (radio: "Target GPM" = price from margin, or "Manual" = direct bid edits), Target GPM % (default 40).
  - Cost settings: Direct labor rate $/SQ (default 95 — feeds the base tear-off+install labor), Material waste % (10/12/15/custom), Tax on material % (jurisdiction picker + custom).
  - NO "total hours of labor", NO "loaded labor" options.
- **Material Summary tab**: table of all materials with qty, unit, unit cost, surcharge, tax, extended — read-only rollup.

## 2. Financials tab — per estimate (replaces the old bottom live-profit panel; REMOVE that bottom panel)
- Left rail: the same Labor & Material settings + Cost settings described above (editable here too, synced).
- Main area:
  - **Color-segmented pie chart** (donut OK) of the estimate value split: Material Cost, Labor Cost, Labor Add-Ons, Extras/Specialty Cost, Material Tax, Gross Profit — each segment a distinct color from the app's chart palette, with legend + $ labels.
  - **4 KPI boxes**: Gross Profit Margin %, Gross Profit $, Total Estimate Value $, Total Cost $.
  - **Labor Analysis** card: Cost per Square $, Square Total (SQ), Total Cost of Labor $, Labor Add-Ons $ (add-ons = layers/pitch/story adders, trash walk, loading, ridge vent cut-in, flashing labor — itemized list).
  - **Material Analysis** card: like IMG_2692's material columns — Material Subtotal, CC Surcharge (3%), Material Tax, Material Total, plus waste % applied.

## 3. Dashboard leaderboards (match IMG_2694)
Right side of the dashboard homepage: a "Leaderboard" panel with 4 sub-boards switchable by tabs or stacked: **Sales This Week**, **Sales This Month**, **Sales QTD**, **Sales This Year**. Each: ranked list of salesperson name + summed contract value (accepted/sold estimates attributed to that rep in the period), formatted like the image (name left, $ right, descending). Use seeded users as reps; make sure seed data has sold jobs across periods so all 4 boards show meaningful, DIFFERENT rankings. Top spot subtly highlighted (orange).

## 4. Clear labor segmentation + editability
In the Build tab, labor must be its own clearly segmented area (sections "Shingle Installation" labor lines + a "Labor Add-Ons" section), with EVERY labor line shown as: name, qty (editable), rate (editable, prefilled from the labor sheet: base $95/SQ; +$10/SQ per extra layer; +$10/SQ per pitch step >7; +$10/SQ per story >1; trash walk $10/SQ; loading $9/SQ (+$2 if pitch ≥10); ridge vent cut-in $2/LF; flashing labor $1/LF; mod bit $120/SQ), and line total. Overrides persist on the estimate.

## 5. Editable extras pricing
All "extras"/specialty items (OSB sheets, cricket, Broan kits/vents, box vents, permits, gutters $, siding $, any misc) get editable price AND cost boxes per estimate line — sheet values are defaults (the sheet prices are the company's COST), never locked. Show both Cost and Price columns for extras.

## 6. Consolidate L Metal into Drip Edge
L Metal and Drip Edge are the same material: remove "L-metal" as a separate catalog item/input; a single **Drip Edge** item ($18/10' pc cost) covers both. Migration: anywhere L-metal LF was an input, fold it into Drip Edge LF (eaves+rakes+former L-metal). Update Quick inputs, catalog, Price List page, seeds, and the worked-example verification accordingly — IMPORTANT: the $17,939.87 worked example included gutter apron 120 LF + L-metal 150 LF as separate lines; after consolidation the same inputs (150 LF that was L-metal now entered as drip edge) must still produce the same total — verify the math equivalence since L-metal and drip edge had the same $18/pc cost; document result in the report.

## 7. Proposal: quantities only + show-pricing toggle
Rework proposal page 6 (Estimate/Scope) to match Screenshot-2026-02-25-105832-2.jpg: "Proposed Services" sections listing items with QUANTITIES + units ONLY (e.g. "Asphalt Shingle Tear-Off — 1,922 Square Feet"), selected products shown as blue sub-lines ("↳ StormFighter Flex - Tamko" style). NO per-line pricing by default. Add an internal-side checkbox on the proposal generation screen/estimate: "Show line pricing on proposal" (default OFF) — when ON, line bid amounts appear. Page 8 project pricing totals remain as-is regardless of toggle. Also include Product Choices (good/better) and Optional Add-Ons blocks with prices like the screenshot if the estimate has upgrade options; otherwise omit gracefully.

## QA + Ship
- Verify worked example still totals $17,939.87 (engine self-test + UI).
- Playwright QA desktop 1280 + mobile 375: Build tab editing (qty + rate overrides update totals live), product selection swap, Financials pie + KPIs + settings sync, leaderboards on dashboard, proposal quantities-only and with pricing toggle ON. Screenshot each.
- `npm run build`; restart prod: start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/impact-crm", port=5000); deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html").
- Write /home/user/workspace/impact-crm/UPDATE_3_REPORT.md.
- Do NOT publish to pplx.app.
