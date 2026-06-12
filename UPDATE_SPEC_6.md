# Update Spec 6 — Opportunities, Full-Page Records, Estimate Settings Simplification, Work Orders, Leaderboard Sizing

Reference images (READ ALL FOUR FIRST):
- `/home/user/workspace/uploaded_attachments/f06d73c064584de481c1cde3dc8049ee/Screenshot-2026-05-13-204248-1.jpg` — target full-page Opportunity view (header, tabs, color metric strip, Opportunity Details: customer/property/status dropdowns, created-by line, Additional Contacts, Stakeholders chips, Adjust Sales Split, Description).
- `/home/user/workspace/uploaded_attachments/f06d73c064584de481c1cde3dc8049ee/Screenshot-2026-05-13-204304-2.jpg` — "Segmentation & Details" dropdown block + Estimates section with "+ New Estimate".
- `/home/user/workspace/uploaded_attachments/f06d73c064584de481c1cde3dc8049ee/Screenshot-2026-06-11-133358.jpg` — the app's current Quick/Templates Job Input panel = the ONLY content the estimate Settings tab should now hold (macro job info).
- `/home/user/workspace/uploaded_attachments/f06d73c064584de481c1cde3dc8049ee/3F14A59F-188B-4C2E-88B0-9D7A25188FF2.jpeg` — Work Order framework (IGNORE the handwriting; reproduce the printed structure).

Keep: design system, hash routing, pricing engine math (worked example still $17,939.87), all templates from Update 5, Team Feed, proposals, Financials tab (its left settings rail with pricing method/GPM/labor rate/waste/tax STAYS there).

## 1. "Leads" → "Opportunities"
Rename everywhere: nav item, page title, routes (keep old hash redirecting if trivial), buttons ("New Opportunity"), kanban references, dashboards, seeds, search placeholders. An opportunity converts to a Job as before.

## 2. Segmentation & Details on new opportunity entry
The New Opportunity form gains a "Segmentation & Details" block with dropdowns (match screenshot 2): Department (Roofing, Gutters, Siding, Painting, Service), Work Type (Shingles / Composite Roofing, Metal Roofing, Flat / Low-Slope, Gutters & Downspouts, Siding, Exterior Painting, Repair / Service), Classification (Residential, Commercial, Multi-Family, HOA), Priority (Low, Normal, High, Urgent), Service Type (Evaluation, Re-Roof, Repair, Maintenance, New Construction), Location (Fort Collins, Loveland, Greeley, Windsor, Denver, Grand Junction, Other), Lead Source (Google, Referral, Door Knock, Facebook, Website, Repeat Customer, Insurance Partner, Other), Bid Type (Private, Insurance, Bid/GC, Warranty). Store on the opportunity record; editable later on the detail page.

## 3. Full-page record views (NO right-side drawer)
Clicking any customer/opportunity/job ANYWHERE (opportunities list, kanban card, jobs table, dashboard links) opens a FULL PAGE (own route), never a slide-over drawer. Remove/retire the drawer pattern for these records. The Opportunity full page matches screenshot 1 as closely as possible:
- Breadcrumb header: "Opportunity › {address} - {date}" + Save button.
- Tabs: Overview | Tasks | Notes | Team Feed | Estimates | Work Orders | Photos (use our app's real features; Convert action button on the right of the tab row).
- Color-coded metric strip across the top (from the opportunity's primary estimate): Labor $ (red tint), Material $ (orange tint), Bid $ (blue tint), Margin $ (green tint), GPM % (green tint).
- **Opportunity Details** section: Customer (dropdown), Property address (dropdown/input), Status (dropdown of pipeline stages), "Created by {user} · {datetime}" line, Additional Contacts (+ Contact adds name/phone/email rows), Stakeholders (chips to assign: Salesperson, Project Manager, Foreman, Superintendent, Estimator, Scheduler — assigned person shows as avatar chip with x), "Adjust Sales Split" collapsible (split % between salespeople), Description textarea.
- **Segmentation & Details** block (same dropdowns as #2, editable).
- **Estimates** section: list of the opportunity's estimates + "+ New Estimate".
- Job full page: same pattern, with the job card content (budget, cost codes, financials summary, documents, Team Feed) as full page instead of drawer.

## 4. Estimate Settings tab = macro job info ONLY
The estimate Settings tab (leftmost) now contains ONLY the macro job-input info (screenshot 3 style): customer/opportunity link display, Job Type selector, and the template's Job Input panel (e.g. Roof System: Shingle product dropdown, Squares, Pitch, Layers, Stories, Waste % for re-roof; equivalent macro inputs for other templates). REMOVE pricing method/target GPM/labor rate/tax controls from the Settings tab — those live ONLY on the Financials tab left rail now. (Waste % stays in Settings as part of job input; it syncs with Financials rail.)

## 5. Work Orders (per opportunity/job)
A "Work Orders" tab on the opportunity/job full page: "+ Create Work Order" generates a work order from the opportunity's estimate; it is clickable, fillable by the employee, and PRINTABLE (print CSS like the proposal). Structure per the photo (ignore handwriting):
- Header: "WORK ORDER" + work type subtitle ("Shingles / Composite Roofing") + address line; right side: Prepared By (user name + phone), Customer (name + phone). Project/task code line ("P{jobNumber} : {address} : {work type}").
- Summary boxes row: SQUARES, LAYERS, DAYS, SHINGLE (product), HIP AND RIDGE (bundles), STARTER (bundles) — auto-filled from estimate where possible, all editable.
- **Directions & Job Details**: large free-text multiline area (the blue handwritten-style notes section in the photo: scheduling notes, building breakdown, special instructions e.g. dogs/nail cleanup/skylight handling) — editable, persisted.
- Two checklist tables side by side (editable values; Yes/No/“—” selects + free text):
  Left: Time Frame (Normal/Rush), Do By Date (if applicable), Roofing all buildings on the property? (if no explain in notes), Able to Roof Load? (if no explain), Desired dumpster location (if discussed), Dishes? (explain in notes if needed).
  Right: Solar Panels? (explain plan in notes), Replacing ALL Gutters & Downspouts? (if no explain), Other Work to be completed on the Project? (explain), Extended Warranty Sold?, All Colors Approved by the Customer? (Shingles, Drip Edge, Gutter Apron, Valley Metal, Plumbing Boots).
- **Estimate items pull in automatically**: section-grouped table like the photo (Tear-Off, Edge Flashings, ...): qty | unit | item name, with product selection sub-lines ("→ {product} " in accent color) and labor sub-lines ("→ (Labor) — {pitch}"). Quantities-only, NO pricing on work orders. Lines editable/removable; refresh-from-estimate button.
- Print button → clean letter-format printout (hide app chrome).
- Persist work orders (new table) with status (Draft, Issued, Completed).

## 6. Leaderboard tiles 15% larger
Increase the dashboard leaderboard 2x2 grid tiles ~15% (width/height/typography scale) while keeping placement high-right and dollars-only format.

## QA + Ship
- Verify worked example still totals $17,939.87.
- Playwright QA desktop 1280 + mobile 375: Opportunities rename, segmentation dropdowns on create + detail, full-page opportunity (no drawer anywhere), metric strip, stakeholders chips, estimate Settings shows only macro inputs (pricing controls only on Financials), work order create/fill/print with auto-pulled items, leaderboard sizing. Screenshots.
- `npm run build`; restart prod: start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/impact-crm", port=5000); deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html").
- Write /home/user/workspace/impact-crm/UPDATE_6_REPORT.md. Do NOT publish to pplx.app.
