# IMPACT CRM — Build Specification
Custom CRM for Impact Exteriors LLC (roofing & exterior renovation, Fort Collins CO).
Merges the "KanBan CRM" PRD with the "Construction Controller" financial workbook into ONE app.
Owner mindset: margins, pipeline health, accountability. UI must be dense, fast, decision-oriented — an operator's tool, not a toy.

## Stack & Conventions
- Fullstack template: Express + Vite + React + Tailwind + shadcn/ui + Drizzle + SQLite (data.db in project root).
- Hash routing with `Router hook={useHashLocation}`.
- Sidebar nav: Dashboard, Pipeline, Leads, Estimates, Jobs, Financials, Automations, Tasks, Calendar, Settings.
- Seed realistic demo data on first run (≈14 leads/jobs spread across all stages, 2 reps + 1 manager + 1 admin, price list, templates, automations, costs, invoices, change orders) so every screen is alive immediately.
- Art direction: roofing/construction operator tool. Dark-capable. Slate/graphite neutrals + a single ember/copper accent (e.g. ~#D97B29 family) for CTAs and pipeline highlights; semantic green/red for margin and flags. Distinctive Fontshare font (e.g. Satoshi or General Sans) + tabular numerals for all money. NO generic AI look.
- All money displayed $#,##0; margins as %, color-coded (green ≥ target, amber within 5pts, red below).

## 1. Dashboard (owner snapshot)
KPI cards: Pipeline Value (open sales+insurance), Weighted Forecast 30/60/90d (stage-probability weighted), Active Jobs, Contract Value (active), Cost to Date, Projected Profit + Blended Margin %, Open A/R (with >30d past-due portion), Over/(Under) Billed net.
- Charts (Recharts): pipeline by stage funnel, revenue forecast bars (30/60/90), cost by cost code, profitability by job type.
- CONTROLLER FLAGS panel — port the 12 checks from the workbook: costs w/o job, costs w/o cost code, unknown job id, jobs over budget, negative projected profit, overbilled, underbilled, subs over-invoiced vs committed, vendor insurance expired / expiring <30d, paid subs missing W9, AR past due >30d. Each flag: count + severity + click-through to the offending records.
- Activity feed (latest stage moves, comms sent, payments, tasks) filterable by user/flow.

## 2. Pipeline (Kanban) — the core
Four flows as tabs: SALES, INSURANCE, PRODUCTION, BILLING. Exact stages:
- Sales: New Lead → Sending Booking Link → Appointment Scheduled → Creating Estimate → Estimate Approved → Estimate Sent → Estimate Accepted → Deposit Invoiced → Ready for Production. Side exits: Lost, No Damage, Lead Rehash.
- Insurance: Contingency Sent → Signed/Waiting on Adjuster → Adjuster Scheduled → Waiting on Carrier → Approved → Ready for Production. Side exit: No Damage.
- Production: Ready for Production → Materials Ordered → Job Scheduled → Job In Progress → Final Walkthrough → Job Complete.
- Billing: Job Complete → Invoice Sent → Paid & Closed.
Shared stages hand cards off automatically (Ready for Production appears in Production flow; Job Complete appears in Billing flow).
- Drag & drop between stages (use @dnd-kit or html5 dnd). Stage change writes an activity log entry + fires automation triggers.
- Cards show: customer, address, value, rep, days-in-stage (turns amber/red past stage SLA), lead score badge, next follow-up due.
- Click card → Job Detail drawer/page with tabs: Overview, Comms Log, Estimate, Financials, Tasks, Documents(list only), Activity.
- Lead scoring: transparent rule-based score 0-100 (job value, source quality, engagement recency, days-in-stage velocity vs avg, insurance approved bonus). Show the breakdown on hover — no black box.

## 3. Follow-Up Automation Engine (must be real, not decorative)
- Automations table: trigger (entered stage X | inactivity N days in stage X | estimate sent +N days | invoice unpaid +N days), action (send SMS template | send Email template | create task | notify user | move to Lead Rehash), delay, active flag, per-flow.
- Server-side scheduler (setInterval ~30s) evaluates rules against jobs and enqueues messages into an OUTBOX with merge-field rendering ({{first_name}}, {{address}}, {{estimate_total}}, {{rep_name}}, {{booking_link}}).
- Outbox simulates Twilio/SendGrid: messages appear as "Sent" in the job's Comms Log + activity feed; Settings shows where real API keys would plug in.
- Auto-pause cadence per job when a reply is logged or stage changes; "Pause follow-ups" toggle on each job.
- Ship default cadences seeded: e.g. New Lead (SMS @5min, email day 1, task call day 2, SMS day 4), Estimate Sent (day 2 email, day 5 SMS w/ objection-handling angle, day 9 'last call'), Invoice Sent (day 7, 14, 21 escalating). Editable in UI with a clean cadence editor.
- Templates library (SMS + Email) with merge fields, editable. Seed consultative, trust-based roofing copy (still getting bids / waiting on insurance / price concern / spouse).

## 4. Estimating — dual mode (key differentiator)
Price List: items w/ code, name, unit (SQ, LF, EA, HR), unit cost, default margin %, cost code mapping; version history table (who/when/old→new). Admin editable.
Assemblies: named bundles of price-list items with qty formulas driven by inputs (squares, pitch factor, layers, stories, waste %).
- **QUICK MODE (new reps):** pick template (Asphalt Reroof, Roof Repair, Gutters & Downspouts, Siding Section), enter measurements (squares, pitch, layers, stories, waste), app generates all line items from assemblies. Margin locked to company floor (configurable, e.g. 35%) — rep can raise, not lower. One-click summary.
- **ADVANCED MODE (complex bids):** sections (Tear-off, Install, Sheet Metal, Gutters, Extras...), free line items + price-list picker, per-line qty/unit cost/margin% or markup, section subtotals, global adjustments: tax %, O&P 10/10 toggle (insurance jobs), contingency %. Good/Better/Best option groups and optional add-ons the customer can toggle. Live profit panel: total cost, price, gross profit $, blended margin %, commission preview.
- Every line maps to a cost code → on acceptance, estimate auto-creates the JOB BUDGET by cost code (this is the bridge to the financial engine).
- Proposal view: clean client-facing page (print-friendly) with tiers/options, accept button + typed-signature simulation; acceptance advances pipeline stage + logs activity.

## 5. Financials per job (port the workbook)
Job Financials tab + global Financials section:
- Budget by cost code (auto from estimate, editable). Cost codes seeded from workbook LISTS (100 Permits ... 700 Other).
- Committed costs (sub POs): vendor, cost code, committed $, invoiced, paid, retention held, remaining; flag invoiced>committed.
- Cost Ledger: date, job, cost code, vendor, desc, amount, source(QB/Manual), ref.
- Billing: invoices w/ amount, retainage withheld, collected, balance due, days outstanding.
- Change Orders: status Pending/Approved/Rejected, CO amount, CO cost, margin; Approved COs roll into contract value.
- WIP math per job: BudgetCost, CostToDate, OpenCommitted, EstCost@Completion = max(budget, cost+remaining commit), %Complete = cost/ECAC, EarnedRev = %×Contract, Over/(Under)Billed = Billed−Earned, ProjectedProfit, ProjMargin%.
- Views: WIP table (all active jobs), Bid vs Actual by cost code (per job + company), Profitability by job type/customer/rep, Retainage (held from us vs we hold), simple 8-week cash flow (beginning cash + expected collections − expected sub payments).
- Commission tracking: plan per rep (% of gross profit or % of contract), trigger stage (Deposit Invoiced or Paid & Closed), commission report.

## 6. Supporting modules
- Leads: list+detail, quick-create (name, phone, email, address, source, flow, work description), CSV export.
- Tasks: per-job panel + global list, assignee, due date, done; calendar month/week view of appointments+tasks (internal calendar; Google sync listed as integration point in Settings).
- Vendors: trade, W9, 1099, insurance expiry w/ status — feeds flags.
- Users & roles: Admin/Manager/Sales Rep/Production/Billing/Sub. Role switcher in header (demo auth — pick user, UI filters: reps see own pipeline; production sees assigned jobs; billing sees billing). No real password auth needed.
- Settings: company branding (name/accent color), margin floor, stage SLAs, commission plans, cost codes, integration placeholders (Twilio, SendGrid, QuickBooks, Stripe, EagleView, Google Calendar) with status "Not connected".
- Reports: filter by date/rep/type/stage; export CSV.

## Quality bar
- Every interactive element gets data-testid. Loading skeletons + empty states everywhere.
- Mobile responsive (reps in the field): kanban becomes horizontal-scroll columns; job detail stacks.
- Playwright QA desktop 1280 + mobile 375 on Dashboard, Pipeline (incl. drag), Estimate builder (both modes), Job financials, Automations. Fix all overflow/contrast issues before deploy.
- Verify automation engine end-to-end: seed an automation with 0-min delay, move a card, confirm outbox message appears.
