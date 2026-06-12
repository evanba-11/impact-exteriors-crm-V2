# Update Spec 5 — Job Type Renames, Re-Roof Template Add-Ons, Four New Quick Templates

Source template files (READ ALL FIVE, they are the exact source of truth for sections/items/units):
`/home/user/workspace/impact-crm/attached_assets/templates/`
- `Residential-Reroof-Template-add-ons.txt` — EDITS to the existing shingle re-roof template
- `REPAIR-TEMPLATE.txt` — new Quick Template for job type **Residential Service**
- `GUTTER-ESTIMATE.txt` — new Quick Template for job type **Soffit/Fascia/Gutters**
- `EXTERIOR-PAINTING.txt` — new Quick Template for job type **Exterior Painting**
- `COMMERCIAL-SERVICEROOFING.txt` — new Quick Template for job type **Commercial Service**

Keep: design system, hash routing, pricing engine math (worked example must still total $17,939.87 on a Residential Re-Roof shingle estimate with defaults), Team Feed, proposal quantities-only + toggle, leaderboard grid, x-remove, + Add Line everywhere.

## 1. Job type renames
- "Retail" → **"Residential Re-Roof"**
- "Insurance" → **"Residential Insurance Re-Roof"**
Full list becomes: Residential Re-Roof, Residential Insurance Re-Roof, Commercial, Residential Service, Commercial Service, Soffit/Fascia/Gutters, Siding, Exterior Painting. Update enum, selectors, badges, filters, seeds, dashboards everywhere. Funding math: Residential Insurance Re-Roof = insurance math; all others retail math. Migrate/reseed existing data.

## 2. Residential Re-Roof template edits (applies to BOTH Residential Re-Roof and Residential Insurance Re-Roof; per Residential-Reroof-Template-add-ons.txt)
- **All "Product Selections" must be dropdowns** with the options listed, even when only one option exists (e.g. shingle product, hip&ridge, pipe boot, box vent, gutter apron, drip edge, underlayment, I&W). The right-hand Make Product Selections panel stays, but each selectable product line ALSO gets a dropdown control.
- **OSB thickness dropdown was missing — fix it** (3/4in, 1/2in, 7/16in options on the OSB 4x8 Sheet line).
- Add to **Edge Flashings** section: Counter Flashing (LF), Headwall / Apron Flashing (LF), Chimney Flashing — Base (LF), Chimney Flashing — Counter/Cap (LF), Dormer Flashing (LF), Wall Flashing (LF), Kick-Out Flashing (EA).
- Add to **Boots, Vents, etc.**: Ridge Vent (LF — use the existing $3.75/LF material + $2/LF cut-in labor), Gable Vent (EA), Deck Air Intake (EA).
- Add to **Misc./Additional Work**: Dumpster Fee (Flat), Haul-Off / Dump Fee (Flat), Dump Fee Overage (EA), Antenna Removal (EA), Scaffold Rental (Day or Week), Caulking / Sealant (LF or Flat), Satellite Dish Removal Only — no reset (EA), Additional Labor (HR).

## 3. Four new Quick Templates — exact sections and line items from the txt files
Each of the four job types gets its own Quick Template that opens with ALL its sections and line items visible (blank qty = no cost, omitted from proposal; x-remove per line; + Add Line per section; every line: editable qty, unit, unit cost, labor/rate, bid — same field model as the shingle template).
- **Residential Service** ← REPAIR-TEMPLATE.txt (15 sections: Tear-Off & Disposal … Emergency Services). 
- **Soffit/Fascia/Gutters** ← GUTTER-ESTIMATE.txt (7 sections).
- **Exterior Painting** ← EXTERIOR-PAINTING.txt. NOTE: its parent section list includes "Gutters & Downspouts — Paint Application", "Deck / Porch — Paint Application", "Foundation & Masonry — Paint Application" but the file provides no line items for those three — include them as empty sections with just "+ Add Line".
- **Commercial Service** ← COMMERCIAL-SERVICEROOFING.txt (17 sections, large — implement ALL line items).
Implementation notes:
- Where a unit is given as "X or Y" (e.g. "Flat or SQ", "LF or EA", "Day or Week", "% or Flat"), default to the FIRST unit and let the unit dropdown include the alternates (unit dropdown options: SQ, SF, LF, EA, Flat, HR, Day, Week, %, Sheet, Stick).
- "%"-unit lines (e.g. After-hours surcharge) compute as % of the estimate subtotal.
- Default costs: where the existing catalog has a match (tear-off, OSB, underlayment, I&W, ridge vent, box vent, gutter apron, drip edge, step flashing, permits, etc.) use it; otherwise create catalog entries with $0.00 or sensible placeholder defaults — ALL editable per line. Do not invent fake "accurate" pricing; placeholders are acceptable since every field is editable.
- New estimate flow: choosing a job type picks the matching Quick Template automatically (Residential Re-Roof / Residential Insurance Re-Roof → shingle re-roof template; the four above → their templates; Commercial and Siding → Custom only for now, note this in the UI gracefully). Custom mode remains available for every job type.
- Template structure should be data-driven (one template definition module), not five copies of page code.
- Proposal scope sections follow the template's section names for these job types.

## QA + Ship
- Verify worked example still totals $17,939.87.
- Playwright QA desktop 1280 + mobile 375: renamed job type badges/selector; re-roof template shows new flashings/vents/misc items + product dropdowns + OSB thickness dropdown; each of the 4 new templates opens with all sections/items, add-line works, blank items stay off proposal; % surcharge math. Screenshots.
- `npm run build`; restart prod: start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/impact-crm", port=5000); deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html").
- Write /home/user/workspace/impact-crm/UPDATE_5_REPORT.md. Do NOT publish to pplx.app.
