# Update Spec 2 — UI Fixes, Internal Tagging, Proposal Generator

Four changes to the existing app. Do NOT redesign unrelated pages. Keep existing design system, hash routing, and the verified pricing engine intact (worked example must still produce $17,939.87).

## 1. Advanced estimate — quantity input width (BUG FIX)
The quantity input ("bubble") on Advanced-mode estimate line items is too narrow: double- and triple-digit numbers are cut off. Widen it so 3–4 digit numbers (e.g. 120, 1500) are fully visible at desktop AND mobile widths. Check every numeric stepper/input in the estimate builder for the same problem and fix all instances. Verify with Playwright by typing "150" and "1250" and screenshotting.

## 2. Templates (Quick) estimate — stack roof inputs vertically
In the Templates/Quick estimate mode, the roof measurement inputs currently flow into a multi-column grid ("random rows"). Change to a single column: every roof item stacked top-to-bottom in a clean labeled list (label left, input right is fine — but ONE item per row). Keep logical section grouping (Roof Measurements, Penetrations & Vents, Job Factors, etc.) but within each section items must be one per row. Applies at all breakpoints.

## 3. Internal team messaging with @mentions + live feed per customer
Every customer/job account gets an internal "Team Feed" — an ongoing, live-updating message thread visible to internal users only (never customer-facing).
- New DB table: `internalMessages` (id, jobId or leadId — support both customer types the app has, authorUserId, body text, mentions JSON array of userIds, createdAt).
- UI: a "Team Feed" tab/panel on the customer/job detail view. Chronological feed, newest at bottom, author avatar/initials, timestamp, auto-scroll.
- Composer with @mention autocomplete: typing "@" opens a popover listing the seeded users (filter as you type); selecting inserts a highlighted @Name token. Mentions render highlighted in posted messages.
- Live: poll with TanStack Query `refetchInterval: 5000` (no websockets needed).
- Mentions inbox: a bell/mentions indicator in the top bar for the current user showing unread mention count; clicking lists messages where they were tagged, each linking to that customer's feed. Mark-as-read on view. Add storage + routes for unread tracking (simple `readAt` per mention or a mentionReads table).
- Seed 2–3 example feed messages with mentions on demo jobs.

## 4. Proposal generator — populate estimate data into the contract
A "Generate Proposal" action on any estimate opens a full proposal/contract document as a print-ready view (new route, e.g. /#/proposals/:estimateId), reproducing the company's 11-page proposal contract. Static copy is verbatim in `attached_assets/proposal_text.txt`; the source PDF is `attached_assets/proposal_contract.pdf` (read it if structure unclear).

Design language of the document (match the PDF):
- US Letter pages (print CSS: @page letter, margins; on screen show as stacked white pages on a neutral backdrop with a Print/Download PDF button that calls window.print()).
- BANNER: place `attached_assets/banner.jpg` (import via @assets/banner.jpg) full-width at the very top of page 1 (cover), above "DRIVEN BY IMPACT / PROPOSAL". It's a dark 3:1 banner with the Impact X logo — do not stretch/distort.
- Orange (#E05A26-ish, sample from banner) section header bars with white bold uppercase condensed text, angled right edge (clip-path). Header strip on each page: "Residential & Commercial Exteriors — Full Restoration and Maintenance". Footer: "Impact Exteriors LLC | 110 16th St, Ste 1460, Denver, CO 80202 | Colorado Licensed & Insured" + "Page N".
- This document is print-first: serif-free clean sans (existing app font OK), black text on white.

Pages (static copy verbatim from proposal_text.txt unless noted as dynamic):
1. Cover — banner at top; DRIVEN BY IMPACT; PROPOSAL; Property Address (dynamic: customer address); Prepared by: rep name / Impact Exteriors LLC (dynamic: estimate owner); Prepared for: customer name (dynamic).
2. About Us + LICENSED / 10-YEAR / CO-BUILT badges.
3. Safety + Insurance.
4. Our Process (5 numbered steps).
5. Understanding Insurance Supplements (include for insurance-funded estimates; include always is fine).
6. ESTIMATE / SCOPE OF WORK — DYNAMIC: render the CRM estimate line items table here (item, qty, unit, unit price, line total per the estimate's mode; group sections like the builder; totals row). Replace the "CRM-generated estimate to be inserted here" placeholder.
7. Standard Scope of Work Inclusions (checkbox list) / Exclusions / What to Expect on Install Day (3-row table with Initial: ___ blanks).
8. PROJECT PRICING — DYNAMIC: Roofing system $ (estimate roof total), Gutters & Downspouts $, Siding $, Permit fees $, Overhead & Profit $ (insurance only, else blank/—), Customer-selected upgrades $, "+ supplements as approved", TOTAL CONTRACT PRICE (tax included) $ — all from the estimate's proposal extras. PAYMENT SCHEDULE copy verbatim; bottom row DYNAMIC: Initial Payment / Deposit $ and Balance Due at Completion $ from the estimate (50% retail deposit or ACV initial payment).
9. Customer Acknowledgments (checkbox list) + Signatures blocks.
10–11. Terms & Conditions (all 22 clauses verbatim + final acknowledgment initial line).
- Dollar values formatted $#,##0.00. Blank lines (____) where data absent.
- Print CSS: page-break-after on each page container; hide app chrome (sidebar/nav/buttons) via @media print.

Wire-up: "Generate Proposal" button on estimate detail/builder (and estimates list row menu). Route loads estimate + customer + extras from the API.

## QA + Ship
- Playwright: verify all 4 features desktop 1280 + mobile 375. Screenshot proposal pages 1, 6, 8 and check banner renders, dynamic values populate from the worked-example estimate, no text overflow.
- `npm run build`; restart prod server: start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/impact-crm", port=5000); then deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html").
- Write summary to /home/user/workspace/impact-crm/UPDATE_2_REPORT.md.
- Do NOT publish to pplx.app.
