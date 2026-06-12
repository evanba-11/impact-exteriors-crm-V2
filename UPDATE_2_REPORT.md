# Impact CRM — Update 2 Report

**Scope:** UI fixes, internal team tagging, and a print-ready proposal generator, implemented per `UPDATE_SPEC_2.md` (the source of truth).
**Stack:** Express + Vite + React + Tailwind + shadcn + Drizzle + SQLite. Production server on port 5000; hash routing preserved.
**Status:** All 4 changes complete, QA'd on desktop (1280px) and mobile (375px), built, and deployed.

---

## Constraint compliance (verified)

| Constraint | Result |
|---|---|
| Do NOT touch the pricing engine math — worked example must still total **$17,939.87** | **PASS.** Estimate #1 (Devon Carter, quick/Retail) verified at **$17,939.87** via API, proposal page-6 scope total, and proposal page-8 contract total. No pricing files were modified. |
| Do NOT redesign unrelated pages | **PASS.** Only Estimates, Leads, Proposals (new), Layout, JobDrawer, schema, storage, routes, seed, and proposal CSS were touched. |
| Keep hash routing | **PASS.** `Router hook={useHashLocation}` retained; a routing bug in query parsing was fixed without changing the routing strategy (see below). |

---

## Change 1 — Widen quantity / numeric inputs in Advanced estimate mode

**Problem:** 3–4 digit quantities were clipped in Advanced-mode line-item rows.

**Fix (`client/src/pages/Estimates.tsx`):**
- Quantity input given `min-w-[4.5rem]` (72px floor) with `px-2` padding so 4-digit values render fully.
- The line-item table given `min-w-[720px]` inside a horizontally scrollable wrapper so all numeric columns (Qty, Cost, Margin) keep their full width instead of compressing.
- All numeric inputs in the row (qty, unit cost, margin) use `tabular-nums` and right alignment for legibility.

**QA evidence:**
- Desktop: qty `1250`, cost `144`, margin `150` all fully visible.
- Mobile (375px): typed `1250` into a qty cell → `scrollWidth (82) === clientWidth (82)`, `clipped: false`. Input width 84px, value fully shown. (Test line was not saved — Devon's verified estimate untouched.)

---

## Change 2 — Stack Quick/Templates roof inputs in a single column

**Problem:** Quick (job-input) mode laid roof inputs in a multi-column grid that crowded on smaller widths.

**Fix (`client/src/pages/Estimates.tsx`):** Quick-mode `NumField` rows now render one item per row in a single column, grouped by section header. Each row: label on the left, a right-aligned `tabular-nums w-36 shrink-0` value input on the right.

**QA evidence:**
- Mobile (375px), "ROOF SYSTEM" group: Shingle, Squares (30), Pitch (6), Layers (1), Stories (1) each on their own full-width row.
- "ROOF MEASUREMENTS — LINEAR (LF)" group: Eaves (120), Rakes (150), Ridges (90), Hips (56), Valleys (35), Step/headwall (20) — single column, grouped, all values visible.

---

## Change 3 — Internal team messaging ("Team Feed") with @mentions + mentions inbox

A live-updating internal feed on every customer/job account, never customer-facing.

**Schema (`shared/schema.ts`):** added `internalMessages` (id, jobId, leadId, authorUserId, body, mentions JSON-text, createdAt) and `mentionReads` (per-user read tracking), plus `insertInternalMessageSchema` and types.

**Storage (`server/storage.ts`):** `createMessage`, `getJobMessages`, `getMessagesMentioning`, `getReadMessageIds`, `markMentionsRead`.

**Routes (`server/routes.ts`):**
- `GET /api/jobs/:id/messages` — feed for a job
- `POST /api/jobs/:id/messages` — post a message (mentions parsed from `@Name` tokens into user-id array)
- `GET /api/mentions?userId=` — mentions for a user, annotated with `read`, `jobCustomer`, `authorName`
- `POST /api/mentions/read` — mark mentions read

**UI:**
- **Team Feed tab** (`client/src/components/JobDrawer.tsx`) on the customer/job drawer. Renders messages with initials avatars, author name, `(you)` self-label, relative timestamps, and an "Internal only — never customer-facing" banner.
- `@Name` tokens are highlighted (`text-primary font-semibold bg-primary/10 rounded`).
- **@mention autocomplete:** typing `@` opens a popover of matching users (name · role); selecting inserts the full `@First Last` token.
- **5-second polling** (`refetchInterval: 5000`) so the feed updates live.
- **Ctrl/Cmd+Enter** posts; composer clears on success.
- **Mentions inbox** (`client/src/components/Layout.tsx` — `MentionsBell`): bell icon in the top bar with an unread-count badge; popover lists mentions (author, customer, highlighted token, timestamp) and marks them read on open; clicking navigates to the relevant job.
- **Seeded demo messages** (`server/seed.ts`): 4 messages across Devon Carter (job 5) and Hannah Berg (job 16), including one referencing the `$17,939.87` estimate.

**QA evidence (desktop + mobile):**
- Posted "Following up @Priya Nair please confirm the gutter color with the customer." via @mention autocomplete + Ctrl+Enter → message appeared with highlighted `@Priya Nair` token, `(you)` label, "just now"; composer cleared.
- Backend persisted it: `GET /api/mentions?userId=4` returns it with `mentions:"[4]"`, `read:false`, author "Dale Rourke", job 16.
- Mobile: switched user to Priya → bell badge showed **2**, inbox listed both unread mentions with highlighted tokens, authors, customers, and timestamps.

---

## Change 4 — "Generate Proposal" action → full 11-page print-ready proposal/contract

**Entry points (`client/src/pages/Estimates.tsx`):**
- Per-row "Proposal" button on the estimates list (`button-generate-proposal-${id}`).
- "Generate Proposal" button in the Builder sticky bar (`button-generate-proposal`, enabled once the estimate is saved).
- Both navigate to `/proposals/:estimateId` (hash route registered in `client/src/App.tsx`).

**Document (`client/src/pages/Proposals.tsx`, 11 pages):**
- **Page 1 — Cover:** `attached_assets/banner.jpg` rendered **full-width** at the top (`@assets/banner.jpg`, `proposal-banner`), then "DRIVEN BY IMPACT", "PROPOSAL", and dynamic property address, Prepared By (rep), and Prepared For (customer) pulled from the estimate/job.
- **Pages 2–5:** Static copy **verbatim** from `attached_assets/proposal_text.txt` (About, Safety, Insurance, Process, Supplements).
- **Page 6 — Scope of work:** Dynamic itemized scope table driven by the estimate. Quick mode: materials (×1.03 ×marginMult), labor (×marginMult), specialty (fixed), taxes; advanced mode: estimate sections. Total ties out to **$17,939.87** for Devon.
- **Page 7:** Inclusions / exclusions / install-day notes.
- **Page 8 — Project Pricing + Payment Schedule:** Roofing system line, blank placeholders for gutters/siding/permits/overhead/upgrades when absent, Total Contract Price (tax included), and a payment table. For Devon: contract **$17,939.87**, initial **$8,969.93**, balance **$8,969.93** (50% retail deposit).
- **Page 9:** Acknowledgments + signature blocks.
- **Pages 10–11:** 22 verbatim Terms & Conditions clauses.

**Styling:** Orange (`#E05A26`) angled (clip-path) section-header bars. Print via `window.print()` ("Print / Download PDF" button); a "Back to estimate" button returns to `/estimates?job=${jobId}`.

**Print CSS (`client/src/index.css`):** `.proposal-page` fixed at 8.5in × 11in; `@media print` hides app chrome (aside/header/nav/`.no-print`), sets `@page letter`, page breaks per page, and resets on-screen scaling.

**Mobile fit fix (this update):** The fixed 8.5in (816px) pages overflowed narrow viewports. Added screen-only breakpoint scaling on a new `.proposal-pages` wrapper using CSS `zoom` (reflows layout, no leftover whitespace; unitless value stepped by breakpoint — 0.84 / 0.70 / 0.58 / 0.46 / 0.42). `@media print` resets `zoom: 1` so PDF/print output remains true letter size. At 375px the pages render ~343px wide with no horizontal scroll.

**QA evidence:**
- Desktop screenshots: page 1 (banner + dynamic Tyler Boone / Devon Carter / 905 Cherry St), page 6 (scope total **$17,939.87**), page 8 (contract **$17,939.87**, initial/balance **$8,969.93**), orange angled headers.
- Mobile screenshots: cover, scope table, and pricing all fit within 375px (`scrollWidth: 375`, no horizontal overflow), banner and totals fully visible.

---

## Routing fix (required to make the new navigation work)

**Bug:** wouter 3.10's `useHashLocation` writes the `?query` portion into the real `location.search`, but `currentHashLocation()` returns the full hash, so links like `/leads?job=5` 404'd when the query lived in the hash. `navigate("/leads?job=5")` correctly puts the query in `location.search` with hash `#/leads`.

**Fix:** In `Leads.tsx` and `Estimates.tsx`, the `open`/job-id initializer now reads `window.location.search` first and falls back to the hash query:
`new URLSearchParams(window.location.search || ("?" + (window.location.hash.split("?")[1] || "")))`.
Routing strategy (`useHashLocation`) was not changed — only query parsing.

---

## Build, server, deploy

- `npm run build` — success. `dist/index.cjs` (~987 kb server bundle); `dist/public` with `index.html`, hashed JS/CSS, and `banner-B2l4eTZH.jpg` bundled.
- Production server restarted: `NODE_ENV=production node dist/index.cjs` on port 5000 (healthy; `/api/estimates/1` returns 200, mentions API populated, DB seeded).
- `deploy_website(project_path="/home/user/workspace/impact-crm/dist/public", site_name="impact-crm", entry_point="index.html")` — uploaded (4 files). Deploy validation screenshot confirmed the dashboard + mentions bell render correctly.
- **Not** published to pplx.app (per instruction).

---

## QA summary

| Feature | Desktop 1280 | Mobile 375 |
|---|---|---|
| 1 — Advanced wide numeric inputs | PASS (1250/144/150 visible) | PASS (1250 unclipped) |
| 2 — Quick stacked single-column inputs | PASS (verified prior) | PASS (grouped, single column) |
| 3 — Team Feed + @mention autocomplete + highlighted tokens + 5s polling + mentions inbox/unread badge | PASS (post + highlight + persist) | PASS (feed renders; Priya badge=2, inbox lists 2) |
| 4 — Proposal generator (banner, dynamic data, orange angled headers, totals, print) | PASS (pages 1/6/8) | PASS (zoom-scaled, fits, totals visible) |

**Pricing integrity:** Devon Carter estimate = **$17,939.87** confirmed at API, proposal scope total, and proposal contract total. Pricing engine untouched.

**Negative checks:** No horizontal overflow at 375px on proposal or estimate pages (`document.scrollWidth === 375`); no clipped numeric inputs; @mention tokens render highlighted in both feed and inbox; composer clears after post; no console-blocking storage APIs introduced.

**Known/accepted item:** The app's top navigation bar is a horizontal row that visually clips its last item at 375px. This is pre-existing chrome (not part of this update's scope) and the page itself does not scroll horizontally; left unchanged per the "do not redesign unrelated pages" constraint.
