import { storage, db, now } from "./storage";
import { settings, priceHistory } from "@shared/schema";
import { DEFAULT_SLAS } from "@shared/schema";
import { recomputeAllScores } from "./engine";
import {
  MATERIALS, SHINGLE_OPTIONS, SPECIALTY, PRICE_AGREEMENT, DEFAULT_MARGIN,
  defaultJobInput, defaultExtras, calcEstimateV3, type JobInput,
} from "@shared/pricing";

const DAY = 86400000;
const ago = (d: number) => Date.now() - d * DAY;
const future = (d: number) => Date.now() + d * DAY;

export function seedIfEmpty() {
  if (storage.countUsers() > 0) return;
  console.log("[seed] populating demo data…");

  /* settings */
  db.insert(settings).values({
    id: 1, companyName: "Impact Exteriors LLC", accentColor: "#D97B29",
    marginFloor: DEFAULT_MARGIN, slasJson: JSON.stringify(DEFAULT_SLAS),
    defaultWastePct: 10, surchargePct: 3,
    priceAgreement: PRICE_AGREEMENT.label, priceAgreementExpires: PRICE_AGREEMENT.expires,
  }).run();

  /* users */
  storage.insertRaw("users", [
    { name: "Dale Rourke", email: "dale@impactext.com", role: "Admin", isNewRep: false, commissionType: null, commissionRate: 0, commissionTrigger: null },
    { name: "Marcy Vance", email: "marcy@impactext.com", role: "Manager", isNewRep: false, commissionType: "contract", commissionRate: 2, commissionTrigger: "Paid & Closed" },
    { name: "Tyler Boone", email: "tyler@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 10, commissionTrigger: "Deposit Invoiced" },
    { name: "Priya Nair", email: "priya@impactext.com", role: "Sales Rep", isNewRep: true, commissionType: "gross_profit", commissionRate: 8, commissionTrigger: "Deposit Invoiced" },
    { name: "Gus Hammond", email: "gus@impactext.com", role: "Production", isNewRep: false, commissionType: null, commissionRate: 0, commissionTrigger: null },
    { name: "Renee Ford", email: "renee@impactext.com", role: "Billing", isNewRep: false, commissionType: null, commissionRate: 0, commissionTrigger: null },
    // Additional sales reps for the leaderboards
    { name: "Liam Calloway", email: "liam@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 10, commissionTrigger: "Deposit Invoiced" },
    { name: "Kurt Renner", email: "kurt@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 10, commissionTrigger: "Deposit Invoiced" },
    { name: "Jalen Vasquez", email: "jalen@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 9, commissionTrigger: "Deposit Invoiced" },
    { name: "Jordan Holt", email: "jordan@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 9, commissionTrigger: "Deposit Invoiced" },
    { name: "Craig Mercer", email: "craig@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 8, commissionTrigger: "Deposit Invoiced" },
    { name: "Dino Sandoval", email: "dino@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 8, commissionTrigger: "Deposit Invoiced" },
    { name: "Wes Whitaker", email: "wwhitaker@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 9, commissionTrigger: "Deposit Invoiced" },
    { name: "Marco Foss", email: "marco@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 10, commissionTrigger: "Deposit Invoiced" },
    { name: "Shane Lindqvist", email: "shane@impactext.com", role: "Sales Rep", isNewRep: false, commissionType: "gross_profit", commissionRate: 8, commissionTrigger: "Deposit Invoiced" },
  ]);
  const users = storage.getUsers();
  const tyler = users.find(u => u.name === "Tyler Boone")!.id;
  const priya = users.find(u => u.name === "Priya Nair")!.id;
  const gus = users.find(u => u.name === "Gus Hammond")!.id;

  /* cost codes (aligned to PRICING_SPEC estimate→budget mapping) */
  storage.insertRaw("costCodes", [
    { code: "100", name: "Permits" },
    { code: "200", name: "Roofing Materials" },
    { code: "310", name: "Equipment / Rental" },
    { code: "340", name: "Subs / Specialty (gutters, siding, vents)" },
    { code: "410", name: "Disposal" },
    { code: "500", name: "Roofing Labor" },
    { code: "550", name: "Carpentry / Decking" },
    { code: "700", name: "Other" },
  ]);

  /* price list — ABC Supply Price Agreement catalog (materials + shingle options + specialty) */
  const priceRows: any[] = [];
  // Shingle options ($/SQ)
  for (const s of SHINGLE_OPTIONS) {
    priceRows.push({
      code: "SH-" + s.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase(),
      name: "Shingle: " + s.name + (s.isDefault ? " (default)" : ""),
      unit: "SQ", unitCost: s.perSQ, defaultMargin: DEFAULT_MARGIN, costCode: "200",
    });
  }
  // Material catalog (derived cost/unit)
  for (const m of MATERIALS) {
    if (m.key === "iceWaterAlt") continue; // alt shown via toggle, keep main
    priceRows.push({
      code: "MAT-" + m.key.toUpperCase(),
      name: m.name + "  ·  " + m.abcSource,
      unit: m.unit, unitCost: Math.round(m.costPerUnit * 10000) / 10000,
      defaultMargin: DEFAULT_MARGIN, costCode: m.costCode,
    });
  }
  // Specialty (fixed price)
  for (const sp of SPECIALTY) {
    priceRows.push({
      code: "SPEC-" + sp.key.toUpperCase(),
      name: "Specialty: " + sp.name,
      unit: "EA", unitCost: sp.cost, defaultMargin: 0, costCode: sp.costCode,
    });
  }
  storage.insertRaw("priceItems", priceRows);
  // Log the initial import as the ABC Price Agreement version-history entry
  const importedItems = storage.getPriceItems();
  const importTs = Date.now();
  db.insert(priceHistory).values(
    importedItems.map((it) => ({
      itemId: it.id, itemName: it.name, field: "import",
      oldValue: "—", newValue: PRICE_AGREEMENT.label + " (exp " + PRICE_AGREEMENT.expires + ")",
      changedBy: "ABC Supply Import", changedAt: importTs,
    }))
  ).run();

  /* vendors */
  storage.insertRaw("vendors", [
    { name: "Front Range Roofing Crews", trade: "Roofing Labor", hasW9: true, is1099: true, insuranceExpiry: future(120) },
    { name: "Summit Sheet Metal", trade: "Sheet Metal", hasW9: true, is1099: true, insuranceExpiry: future(15) },
    { name: "Poudre Gutter Co", trade: "Gutters", hasW9: false, is1099: true, insuranceExpiry: future(200) },
    { name: "ABC Supply", trade: "Material Supplier", hasW9: true, is1099: false, insuranceExpiry: future(300) },
    { name: "Mountain Dumpsters", trade: "Disposal", hasW9: false, is1099: true, insuranceExpiry: ago(20) },
    { name: "Castillo Siding LLC", trade: "Siding", hasW9: true, is1099: true, insuranceExpiry: future(8) },
  ]);
  const vendors = storage.getVendors();
  const vId = (n: string) => vendors.find(v => v.name === n)?.id;

  /* templates */
  storage.insertRaw("templates", [
    { name: "New Lead — Intro SMS", channel: "sms", subject: null, body: "Hi {{first_name}}, this is {{rep_name}} with Impact Exteriors. Thanks for reaching out about your roof at {{address}}. When's a good time for a free inspection? Book here: {{booking_link}}" },
    { name: "New Lead — Day 1 Email", channel: "email", subject: "Your free roof inspection, {{first_name}}", body: "Hi {{first_name}},\n\nThanks for considering Impact Exteriors for {{address}}. We're a local Fort Collins crew and we'd love to take a look — no pressure, no obligation.\n\nGrab a time that works: {{booking_link}}\n\n— {{rep_name}}, Impact Exteriors" },
    { name: "Estimate Sent — Day 2 Email", channel: "email", subject: "Questions on your {{estimate_total}} estimate?", body: "Hi {{first_name}},\n\nWanted to make sure the estimate for {{address}} made sense. Happy to walk through the line items anytime. A lot of folks are still getting bids — totally fair. We're confident our scope and warranty stand up to anyone's.\n\n— {{rep_name}}" },
    { name: "Estimate Sent — Day 5 SMS (objection)", channel: "sms", subject: null, body: "Hi {{first_name}}, {{rep_name}} here. Common question on the {{estimate_total}} bid: \"why not cheaper?\" — we use full synthetic underlayment + ice/water and a real crew, not the lowest corner-cutters. Worth a quick call?" },
    { name: "Estimate Sent — Day 9 Last Call SMS", channel: "sms", subject: null, body: "Hi {{first_name}}, closing out files this week. Still want us to do the roof at {{address}}? Lock your spot before we book out. — {{rep_name}}" },
    { name: "Invoice — Day 7 Reminder", channel: "email", subject: "Invoice reminder — {{address}}", body: "Hi {{first_name}},\n\nFriendly reminder your invoice for {{address}} is open. You can reply here with any questions.\n\nThank you,\nImpact Exteriors Billing" },
    { name: "Invoice — Day 14 SMS", channel: "sms", subject: null, body: "Hi {{first_name}}, just a heads up the balance on {{address}} is still open. Let us know if you need anything. — Impact Exteriors" },
    { name: "Invoice — Day 21 Escalation", channel: "email", subject: "Past-due balance — {{address}}", body: "Hi {{first_name}},\n\nYour balance for {{address}} is now past due. Please reach out so we can resolve this. We value your business.\n\nImpact Exteriors Billing" },
    { name: "Insurance — Waiting on Adjuster", channel: "sms", subject: null, body: "Hi {{first_name}}, {{rep_name}} here. Has the adjuster from your carrier reached out yet? We'd like to be on-site to meet them. — Impact Exteriors" },
  ]);
  const tpl = storage.getTemplates();
  const tplId = (n: string) => tpl.find(t => t.name === n)?.id;

  /* automations — seeded default cadences */
  storage.insertRaw("automations", [
    { name: "New Lead — Intro SMS (5 min)", flow: "SALES", triggerType: "stage_entered", triggerStage: "New Lead", delayMinutes: 5, delayDays: 0, actionType: "send_sms", templateId: tplId("New Lead — Intro SMS"), active: true },
    { name: "New Lead — Day 1 Email", flow: "SALES", triggerType: "inactivity", triggerStage: "New Lead", delayMinutes: 0, delayDays: 1, actionType: "send_email", templateId: tplId("New Lead — Day 1 Email"), active: true },
    { name: "New Lead — Day 2 Call Task", flow: "SALES", triggerType: "inactivity", triggerStage: "New Lead", delayMinutes: 0, delayDays: 2, actionType: "create_task", templateId: null, active: true },
    { name: "Estimate Sent — Day 2 Email", flow: "SALES", triggerType: "estimate_sent", triggerStage: null, delayMinutes: 0, delayDays: 2, actionType: "send_email", templateId: tplId("Estimate Sent — Day 2 Email"), active: true },
    { name: "Estimate Sent — Day 5 SMS", flow: "SALES", triggerType: "estimate_sent", triggerStage: null, delayMinutes: 0, delayDays: 5, actionType: "send_sms", templateId: tplId("Estimate Sent — Day 5 SMS (objection)"), active: true },
    { name: "Estimate Sent — Day 9 Last Call", flow: "SALES", triggerType: "estimate_sent", triggerStage: null, delayMinutes: 0, delayDays: 9, actionType: "send_sms", templateId: tplId("Estimate Sent — Day 9 Last Call SMS"), active: true },
    { name: "Invoice Unpaid — Day 7", flow: "BILLING", triggerType: "invoice_unpaid", triggerStage: null, delayMinutes: 0, delayDays: 7, actionType: "send_email", templateId: tplId("Invoice — Day 7 Reminder"), active: true },
    { name: "Invoice Unpaid — Day 14", flow: "BILLING", triggerType: "invoice_unpaid", triggerStage: null, delayMinutes: 0, delayDays: 14, actionType: "send_sms", templateId: tplId("Invoice — Day 14 SMS"), active: true },
    { name: "Invoice Unpaid — Day 21", flow: "BILLING", triggerType: "invoice_unpaid", triggerStage: null, delayMinutes: 0, delayDays: 21, actionType: "send_email", templateId: tplId("Invoice — Day 21 Escalation"), active: true },
    { name: "Insurance — 3-day adjuster nudge", flow: "INSURANCE", triggerType: "inactivity", triggerStage: "Signed/Waiting on Adjuster", delayMinutes: 0, delayDays: 3, actionType: "send_sms", templateId: tplId("Insurance — Waiting on Adjuster"), active: true },
  ]);

  /* ───── JOBS across all flows/stages ───── */
  type J = any;
  const mk = (o: J) => {
    const base = {
      phone: o.phone || "970-555-0" + Math.floor(100 + Math.random() * 899),
      email: (o.customer.split(" ")[0].toLowerCase()) + "@example.com",
      createdAt: o.createdAt || ago(o.stageDays + 5),
      lastActivityAt: o.lastActivityAt || ago(o.stageDays * 0.5),
      stageEnteredAt: ago(o.stageDays),
      value: o.value, contractValue: o.isActiveJob ? o.value : 0,
    };
    return storage.createJob({ ...base, ...o });
  };

  const jobs: any[] = [];
  // SALES flow
  jobs.push(mk({ customer: "Karen Whitfield", address: "412 Mulberry St, Fort Collins CO", source: "Referral", flow: "SALES", stage: "New Lead", jobType: "Residential Re-Roof", description: "Hail damage, full reroof likely", value: 18500, repId: tyler, stageDays: 0.2 }));
  jobs.push(mk({ customer: "Marcus Delgado", address: "88 Remington St, Fort Collins CO", source: "Google", flow: "SALES", stage: "Sending Booking Link", jobType: "Residential Service", description: "Leak over kitchen", value: 4200, repId: priya, stageDays: 1 }));
  jobs.push(mk({ customer: "The Holloway Group", address: "2201 S College Ave, Fort Collins CO", source: "Website", flow: "SALES", stage: "Appointment Scheduled", jobType: "Residential Re-Roof", description: "Commercial flat-to-pitch", value: 64000, repId: tyler, stageDays: 2 }));
  jobs.push(mk({ customer: "Janet Pierce", address: "1740 Lakeshore Dr, Loveland CO", source: "Door Knock", flow: "SALES", stage: "Creating Estimate", jobType: "Soffit/Fascia/Gutters", description: "Full gutter + guard", value: 6900, repId: priya, stageDays: 1.5 }));
  jobs.push(mk({ customer: "Devon Carter", address: "905 Cherry St, Fort Collins CO", source: "Storm", flow: "SALES", stage: "Estimate Sent", jobType: "Residential Re-Roof", description: "30sq architectural reroof", value: 21300, repId: tyler, stageDays: 6, estimateSentAt: ago(6) }));
  jobs.push(mk({ customer: "Olivia Brennan", address: "330 Smith St, Fort Collins CO", source: "Referral", flow: "SALES", stage: "Estimate Sent", jobType: "Siding", description: "Partial siding + trim", value: 15800, repId: priya, stageDays: 3, estimateSentAt: ago(3), lastReplyAt: ago(1) }));
  jobs.push(mk({ customer: "Frank Mooney", address: "55 Riverbend Ct, Windsor CO", source: "Google", flow: "SALES", stage: "Estimate Accepted", jobType: "Residential Re-Roof", description: "Accepted better tier", value: 24750, repId: tyler, stageDays: 1, estimateSentAt: ago(5), lastReplyAt: ago(1) }));
  jobs.push(mk({ customer: "Sandra Quinn", address: "1212 W Elizabeth St, Fort Collins CO", source: "Referral", flow: "SALES", stage: "Deposit Invoiced", jobType: "Residential Re-Roof", description: "Deposit sent", value: 28900, repId: priya, stageDays: 2, estimateSentAt: ago(9), lastReplyAt: ago(3) }));
  // side exits
  jobs.push(mk({ customer: "Greg Halstead", address: "70 Spring Creek Ln, Fort Collins CO", source: "Door Knock", flow: "SALES", stage: "Lost", jobType: "Residential Service", description: "Went with competitor", value: 3800, repId: tyler, stageDays: 12 }));
  jobs.push(mk({ customer: "Lena Ortiz", address: "640 Stover St, Fort Collins CO", source: "Storm", flow: "SALES", stage: "No Damage", jobType: "Residential Re-Roof", description: "Inspection found no storm damage", value: 0, repId: priya, stageDays: 20 }));

  // INSURANCE flow
  jobs.push(mk({ customer: "Bill Tran", address: "915 Peterson St, Fort Collins CO", source: "Insurance", flow: "INSURANCE", stage: "Contingency Sent", jobType: "Residential Insurance Re-Roof", description: "State Farm claim", value: 22000, repId: tyler, stageDays: 2 }));
  jobs.push(mk({ customer: "Nadia Foster", address: "1450 Welch St, Fort Collins CO", source: "Insurance", flow: "INSURANCE", stage: "Signed/Waiting on Adjuster", jobType: "Residential Insurance Re-Roof", description: "Allstate, adjuster pending", value: 26500, repId: priya, stageDays: 5 }));
  jobs.push(mk({ customer: "Roy Castellano", address: "388 Locust St, Fort Collins CO", source: "Insurance", flow: "INSURANCE", stage: "Waiting on Carrier", jobType: "Residential Insurance Re-Roof", description: "Supplement submitted", value: 31200, repId: tyler, stageDays: 8 }));
  jobs.push(mk({ customer: "Erin Salas", address: "77 Mountain Ave, Fort Collins CO", source: "Insurance", flow: "INSURANCE", stage: "Approved", jobType: "Residential Insurance Re-Roof", description: "Claim approved, ready to schedule", value: 29800, repId: priya, stageDays: 2, insuranceApproved: true, lastReplyAt: ago(1) }));

  // ACTIVE jobs (Production + Billing) — these get full financials
  const p1 = mk({ customer: "Wade Sutter", address: "210 Garfield St, Fort Collins CO", source: "Referral", flow: "PRODUCTION", stage: "Materials Ordered", jobType: "Residential Re-Roof", description: "Materials staged at ABC", value: 27400, repId: tyler, stageDays: 3, isActiveJob: true, insuranceApproved: false });
  const p2 = mk({ customer: "Hannah Berg", address: "1801 Springfield Dr, Fort Collins CO", source: "Storm", flow: "PRODUCTION", stage: "Job In Progress", jobType: "Residential Re-Roof", description: "Crew on-site day 2", value: 33600, repId: priya, stageDays: 4, isActiveJob: true });
  const p3 = mk({ customer: "Otis Reyes", address: "640 Buckeye St, Fort Collins CO", source: "Insurance", flow: "PRODUCTION", stage: "Final Walkthrough", jobType: "Residential Insurance Re-Roof", description: "Walkthrough scheduled", value: 30900, repId: tyler, stageDays: 2, isActiveJob: true, insuranceApproved: true });
  const b1 = mk({ customer: "Pauline Stark", address: "12 Aspen Grove, Fort Collins CO", source: "Referral", flow: "BILLING", stage: "Invoice Sent", jobType: "Residential Re-Roof", description: "Final invoice issued", value: 25600, repId: priya, stageDays: 9, isActiveJob: true, invoiceSentAt: ago(9) });
  const b2 = mk({ customer: "Hector Maldonado", address: "455 Laporte Ave, Fort Collins CO", source: "Google", flow: "BILLING", stage: "Paid & Closed", jobType: "Residential Re-Roof", description: "Closed, paid in full", value: 23100, repId: tyler, stageDays: 30, isActiveJob: true });
  const b3 = mk({ customer: "Diane Whitlock", address: "98 Sycamore St, Fort Collins CO", source: "Storm", flow: "BILLING", stage: "Invoice Sent", jobType: "Residential Insurance Re-Roof", description: "Past-due invoice", value: 41200, repId: tyler, stageDays: 38, isActiveJob: true, invoiceSentAt: ago(38), insuranceApproved: true });

  /* budgets + commitments + costs + invoices + COs for active jobs */
  const seedFinancials = (job: any, opts: { pct: number; over?: boolean; coApproved?: boolean }) => {
    const v = job.value;
    const targetCost = v * 0.62;
    const budgetRows = [
      { jobId: job.id, costCode: "100", budgetCost: 285 },
      { jobId: job.id, costCode: "410", budgetCost: targetCost * 0.14 },
      { jobId: job.id, costCode: "200", budgetCost: targetCost * 0.42 },
      { jobId: job.id, costCode: "500", budgetCost: targetCost * 0.34 },
      { jobId: job.id, costCode: "340", budgetCost: targetCost * 0.08 },
    ];
    storage.insertRaw("budgets", budgetRows);
    // commitments
    storage.insertRaw("commitments", [
      { jobId: job.id, vendorId: vId("Front Range Roofing Crews"), vendorName: "Front Range Roofing Crews", costCode: "500", committed: targetCost * 0.34, invoiced: targetCost * 0.34 * opts.pct, paid: targetCost * 0.34 * opts.pct * 0.9, retentionHeld: targetCost * 0.34 * opts.pct * 0.1 },
      { jobId: job.id, vendorId: vId("ABC Supply"), vendorName: "ABC Supply", costCode: "200", committed: targetCost * 0.42, invoiced: targetCost * 0.42 * Math.min(1, opts.pct + 0.2) * (opts.over ? 1.15 : 1), paid: targetCost * 0.42 * opts.pct, retentionHeld: 0 },
    ]);
    // costs ledger
    const costRows = [
      { jobId: job.id, costCode: "100", vendor: "City of Fort Collins", description: "Building permit", amount: 285, source: "QB", ref: "PMT-" + job.id, date: ago(opts.pct * 10 + 5) },
      { jobId: job.id, costCode: "200", vendor: "ABC Supply", description: "Shingles + underlayment (ABC Price Agreement)", amount: targetCost * 0.42 * opts.pct * (opts.over ? 1.18 : 1), source: "QB", ref: "INV-" + job.id + "A", date: ago(opts.pct * 8) },
      { jobId: job.id, costCode: "500", vendor: "Front Range Roofing Crews", description: "Install labor draw", amount: targetCost * 0.34 * opts.pct, source: "Manual", ref: "PO-" + job.id, date: ago(opts.pct * 6) },
      { jobId: job.id, costCode: "410", vendor: "Mountain Dumpsters", description: "Disposal", amount: targetCost * 0.14 * opts.pct, source: "QB", ref: "DMP-" + job.id, date: ago(opts.pct * 7) },
    ];
    storage.insertRaw("costs", costRows);
    // invoices
    if (job.flow === "BILLING") {
      storage.insertRaw("invoices", [
        { jobId: job.id, number: "INV-" + (1000 + job.id), amount: v, retainage: 0, collected: job.stage === "Paid & Closed" ? v : (job.id === b3.id ? 0 : v * 0.4), issuedAt: job.invoiceSentAt || ago(10), type: "Final" },
      ]);
    } else {
      storage.insertRaw("invoices", [
        { jobId: job.id, number: "DEP-" + (1000 + job.id), amount: v * 0.3, retainage: 0, collected: v * 0.3, issuedAt: ago(opts.pct * 12 + 4), type: "Deposit" },
        { jobId: job.id, number: "PRG-" + (1000 + job.id), amount: v * opts.pct * 0.5, retainage: v * opts.pct * 0.5 * 0.1, collected: v * opts.pct * 0.4, issuedAt: ago(opts.pct * 4), type: "Progress" },
      ]);
    }
    if (opts.coApproved) {
      storage.insertRaw("changeOrders", [
        { jobId: job.id, description: "Replace 6 sheets rotten decking", status: "Approved", amount: 1850, cost: 980, createdAt: ago(3) },
        { jobId: job.id, description: "Upgrade to ridge vent", status: "Pending", amount: 720, cost: 410, createdAt: ago(1) },
      ]);
      storage.updateJob(job.id, { contractValue: v + 1850 });
    }
  };

  seedFinancials(p1, { pct: 0.15 });
  seedFinancials(p2, { pct: 0.55, coApproved: true });
  seedFinancials(p3, { pct: 0.92, over: true });
  seedFinancials(b1, { pct: 1 });
  seedFinancials(b2, { pct: 1 });
  seedFinancials(b3, { pct: 1, coApproved: true });

  /* a stray cost without job + cost without code (flag fodder) */
  storage.insertRaw("costs", [
    { jobId: null, costCode: "700", vendor: "Office Depot", description: "Yard signs (unassigned)", amount: 240, source: "Manual", ref: "MISC-1", date: ago(4) },
    { jobId: p2.id, costCode: null, vendor: "Summit Sheet Metal", description: "Flashing (uncoded)", amount: 410, source: "QB", ref: "SM-99", date: ago(2) },
  ]);

  /* estimates for a couple of jobs — new job-input (V3) model */
  // Demo 1 (jobs[4] Devon Carter, Estimate Sent) = the VERIFIED worked example, Retail
  const wj: JobInput = {
    ...defaultJobInput(),
    shingle: "Tamko StormFight FLEX CL4", squares: 30, pitch: 6, layers: 1, stories: 1,
    eaves: 120, rakes: 150, ridges: 90, hips: 56, valleys: 35, step: 20,
    pipeBoots: 5, boxVents: 12, gutterApronLF: 120, dripEdgeXlLF: 150,
    wastePct: 10, stripFt: 3, taxRate: 7.010, taxJurisdiction: "Greeley (80632/33/38/39)",
    funding: "Retail", margin: DEFAULT_MARGIN,
  };
  const wExtras = { ...defaultExtras(), depositPct: 50 };
  const wRes = calcEstimateV3(wj, wExtras);
  storage.createEstimate({
    jobId: jobs[4].id, mode: "quick", template: "Asphalt Reroof", status: "sent",
    squares: wj.squares, pitch: "6/12", layers: wj.layers, stories: wj.stories, wastePct: wj.wastePct,
    taxPct: wj.taxRate, opEnabled: false, contingencyPct: 0, selectedTier: "good",
    sectionsJson: "[]", addonsJson: "[]",
    jobType: "Residential Re-Roof", funding: wj.funding, margin: wj.margin, taxJurisdiction: wj.taxJurisdiction, taxRate: wj.taxRate,
    jobInputJson: JSON.stringify(wj), extrasJson: JSON.stringify(wExtras),
    contractValue: 0, totalPrice: Math.round(wRes.totalWithExtras * 100) / 100,
  });
  // Demo 2 (jobs[6] Frank Mooney, Estimate Accepted) — Retail, smaller roof, accepted
  const fj: JobInput = {
    ...defaultJobInput(),
    shingle: "OC TruDef Duration", squares: 28, pitch: 5, layers: 1, stories: 1,
    eaves: 110, rakes: 130, ridges: 70, hips: 0, valleys: 28, step: 0,
    pipeBoots: 4, boxVents: 8, gutterApronLF: 110, dripEdgeXlLF: 0,
    wastePct: 10, stripFt: 3, taxRate: 7.010, taxJurisdiction: "Greeley (80632/33/38/39)",
    funding: "Retail", margin: DEFAULT_MARGIN,
  };
  const fExtras = { ...defaultExtras(), gutters: 1800, permits: 285, depositPct: 50 };
  const fRes = calcEstimateV3(fj, fExtras);
  storage.createEstimate({
    jobId: jobs[6].id, mode: "quick", template: "Asphalt Reroof", status: "accepted",
    squares: fj.squares, pitch: "5/12", layers: fj.layers, stories: fj.stories, wastePct: fj.wastePct,
    taxPct: fj.taxRate, opEnabled: false, contingencyPct: 0, selectedTier: "good",
    sectionsJson: "[]", addonsJson: "[]",
    jobType: "Residential Re-Roof", funding: fj.funding, margin: fj.margin, taxJurisdiction: fj.taxJurisdiction, taxRate: fj.taxRate,
    jobInputJson: JSON.stringify(fj), extrasJson: JSON.stringify(fExtras),
    contractValue: 0, totalPrice: Math.round(fRes.totalWithExtras * 100) / 100,
    acceptedAt: ago(1), signature: "Frank Mooney",
  });

  /* tasks */
  storage.insertRaw("tasks", [
    { jobId: jobs[0].id, title: "Call Karen to book inspection", assigneeId: tyler, dueAt: future(0), done: false, type: "task" },
    { jobId: jobs[2].id, title: "On-site appointment — Holloway", assigneeId: tyler, dueAt: future(1), done: false, type: "appointment" },
    { jobId: jobs[4].id, title: "Follow up on sent estimate", assigneeId: tyler, dueAt: future(2), done: false, type: "task" },
    { jobId: p2.id, title: "Order ridge vent material", assigneeId: gus, dueAt: future(0), done: false, type: "task" },
    { jobId: p3.id, title: "Final walkthrough w/ homeowner", assigneeId: gus, dueAt: future(1), done: false, type: "appointment" },
    { jobId: b3.id, title: "Call Diane re: past-due balance", assigneeId: null, dueAt: ago(2), done: false, type: "task" },
    { jobId: jobs[11].id, title: "Meet adjuster on-site", assigneeId: priya, dueAt: future(3), done: false, type: "appointment" },
  ]);

  /* seed some activity + outbox so comms logs aren't empty */
  for (const j of [jobs[4], jobs[5], b1, b3]) {
    storage.addActivity({ jobId: j.id, type: "comms", channel: "sms", direction: "out", actor: "system", flow: j.flow, message: `SMS sent to ${j.customer}: follow-up`, createdAt: ago(2) });
    storage.addOutbox({ jobId: j.id, channel: "sms", to: j.phone, subject: null, body: `Hi ${j.customer.split(" ")[0]}, following up on ${j.address}. — Impact Exteriors`, status: "Sent", automationId: null, sentAt: ago(2) });
  }
  storage.addActivity({ jobId: jobs[5].id, type: "comms", channel: "sms", direction: "in", actor: jobs[5].customer, flow: "SALES", message: `Reply from ${jobs[5].customer}: "Still comparing a couple bids, will let you know"`, createdAt: ago(1) });
  storage.addActivity({ jobId: p2.id, type: "stage_move", channel: "system", direction: null, actor: "Gus Hammond", flow: "PRODUCTION", message: "Moved to Job In Progress", createdAt: ago(4) });
  storage.addActivity({ jobId: b2.id, type: "payment", channel: "system", actor: "Renee Ford", flow: "BILLING", message: `Payment received: $${b2.value.toLocaleString()} — closed`, createdAt: ago(5) });

  /* internal team feed messages w/ @mentions (Feature 3 demo) */
  const dale = users.find(u => u.name === "Dale Rourke")!.id;
  storage.createMessage({ jobId: jobs[4].id, authorUserId: tyler, body: `Sent Devon the $17,939.87 estimate this morning. @Priya Nair can you double-check the shingle tier before I follow up?`, mentions: JSON.stringify([priya]), createdAt: ago(2) });
  storage.createMessage({ jobId: jobs[4].id, authorUserId: priya, body: `Looks good — StormFight FLEX CL4 is right for that neighborhood. @Tyler Boone go ahead and push the proposal.`, mentions: JSON.stringify([tyler]), createdAt: ago(1.5) });
  storage.createMessage({ jobId: p2.id, authorUserId: gus, body: `Crew is on-site day 2 at Hannah's. Decking looks solid. @Dale Rourke we may need a ridge-vent change order — flagging early.`, mentions: JSON.stringify([dale]), createdAt: ago(1) });
  storage.createMessage({ jobId: p2.id, authorUserId: dale, body: `Thanks @Gus Hammond — approve the change order if it's under $1k, otherwise loop me in.`, mentions: JSON.stringify([gus]), createdAt: ago(0.5) });

  /* ───── Update 7: demo jobs in the new Pre-Production / Supplements stages ───── */
  mk({ customer: "Theo Marsh", address: "120 Oak Ridge Dr, Loveland CO", source: "Referral", flow: "SALES", stage: "Pre-Production", jobType: "Residential Re-Roof", description: "Verified pre-prod checklist, scheduling crew", value: 26400, repId: tyler, stageDays: 1,
    department: "Roofing", workType: "Shingles / Composite Roofing", classification: "Residential", priority: "High", serviceType: "Re-Roof", location: "Loveland", leadSource: "Referral", bidType: "Private", createdBy: "Tyler Boone",
    preProductionChecklistJson: JSON.stringify({ colorsFinal: true, estimateCorrect: true, contactCorrect: true, depositReceived: true, supplementsAck: true }) });
  mk({ customer: "Gloria Pennington", address: "744 Hilltop Ave, Greeley CO", source: "Insurance", flow: "INSURANCE", stage: "Waiting on Supplements", jobType: "Residential Insurance Re-Roof", description: "Supplement for code upgrades submitted to carrier", value: 38900, repId: priya, stageDays: 4, insuranceApproved: true,
    department: "Roofing", workType: "Shingles / Composite Roofing", classification: "Residential", priority: "Normal", serviceType: "Re-Roof", location: "Greeley", leadSource: "Insurance Partner", bidType: "Insurance", createdBy: "Priya Nair" });
  mk({ customer: "Dale & Co Property Mgmt", address: "300 Commerce Blvd, Windsor CO", source: "Insurance", flow: "INSURANCE", stage: "Supplements Approved", jobType: "Residential Insurance Re-Roof", description: "Carrier approved supplements, prepping pre-production", value: 52200, repId: tyler, stageDays: 2, insuranceApproved: true,
    department: "Roofing", workType: "Metal Roofing", classification: "Commercial", priority: "High", serviceType: "Re-Roof", location: "Windsor", leadSource: "Insurance Partner", bidType: "Insurance", createdBy: "Tyler Boone" });

  /* ───── Update 7: created-by / segmentation backfill for a couple existing opportunities ───── */
  storage.updateJob(jobs[0].id, { createdBy: "Tyler Boone", department: "Roofing", classification: "Residential", bidType: "Private" });
  storage.updateJob(jobs[4].id, { createdBy: "Tyler Boone", department: "Roofing", workType: "Shingles / Composite Roofing", classification: "Residential", priority: "Normal", serviceType: "Re-Roof", location: "Fort Collins", leadSource: "Storm", bidType: "Private" });

  /* ───── Update 7: Material Returns ───── */
  const shingleItem = importedItems.find(i => i.name.startsWith("Shingle:"));
  const matItem = importedItems.find(i => i.code.startsWith("MAT-"));
  const matItem2 = importedItems.filter(i => i.code.startsWith("MAT-"))[1] || matItem;
  // (a) Pending warehouse return (no vendor) with a photo placeholder
  const rPending = storage.createMaterialReturn({
    jobId: p2.id, status: "Pending", submittedBy: "Gus Hammond", submittedAt: ago(1),
    photosJson: JSON.stringify([{ name: "overage-pallet.jpg", dataUrl: "" }]),
    notes: "Leftover shingles + underlayment back to the warehouse.",
  });
  storage.replaceReturnLines(rPending.id, [
    { itemId: shingleItem?.id ?? null, itemName: shingleItem?.name || "Shingle: Architectural", vendorId: null, qty: 4, unit: "SQ", unitRate: shingleItem?.unitCost || 110, lineValue: 4 * (shingleItem?.unitCost || 110), category: "Roofing Materials" },
    { itemId: matItem?.id ?? null, itemName: matItem?.name || "Underlayment", vendorId: null, qty: 2, unit: "RL", unitRate: matItem?.unitCost || 45, lineValue: 2 * (matItem?.unitCost || 45), category: "Roofing Materials" },
  ]);
  storage.updateMaterialReturn(rPending.id, { totalReturnValue: 4 * (shingleItem?.unitCost || 110) + 2 * (matItem?.unitCost || 45), vendorId: null });
  // (b) Auto-approved return — all lines to one vendor (ABC Supply)
  const abcId = vId("ABC Supply") || null;
  const rVendor = storage.createMaterialReturn({
    jobId: p1.id, status: "Approved", submittedBy: "Gus Hammond", submittedAt: ago(2), approvedBy: "system", approvedAt: ago(2),
    vendorId: abcId, photosJson: "[]", notes: "Unopened materials returned to ABC Supply for credit.",
  });
  storage.replaceReturnLines(rVendor.id, [
    { itemId: matItem?.id ?? null, itemName: matItem?.name || "Drip Edge", vendorId: abcId, qty: 6, unit: "EA", unitRate: matItem?.unitCost || 12, lineValue: 6 * (matItem?.unitCost || 12), category: "Roofing Materials" },
    { itemId: matItem2?.id ?? null, itemName: matItem2?.name || "Ridge Vent", vendorId: abcId, qty: 3, unit: "EA", unitRate: matItem2?.unitCost || 28, lineValue: 3 * (matItem2?.unitCost || 28), category: "Roofing Materials" },
  ]);
  storage.updateMaterialReturn(rVendor.id, { totalReturnValue: 6 * (matItem?.unitCost || 12) + 3 * (matItem2?.unitCost || 28), vendorId: abcId });
  // (c) Mixed/standalone pending return (no job)
  const rMixed = storage.createMaterialReturn({
    jobId: null, status: "Pending", submittedBy: "Priya Nair", submittedAt: ago(0.5), photosJson: "[]",
    notes: "Mixed: some to vendor, some to warehouse.",
  });
  storage.replaceReturnLines(rMixed.id, [
    { itemId: matItem?.id ?? null, itemName: matItem?.name || "Pipe boots", vendorId: abcId, qty: 5, unit: "EA", unitRate: matItem?.unitCost || 9, lineValue: 5 * (matItem?.unitCost || 9), category: "Roofing Materials" },
    { itemId: matItem2?.id ?? null, itemName: matItem2?.name || "Nails", vendorId: null, qty: 2, unit: "BX", unitRate: matItem2?.unitCost || 35, lineValue: 2 * (matItem2?.unitCost || 35), category: "Roofing Materials" },
  ]);
  storage.updateMaterialReturn(rMixed.id, { totalReturnValue: 5 * (matItem?.unitCost || 9) + 2 * (matItem2?.unitCost || 35), vendorId: null });

  /* ───── Update 7: Issues ───── */
  storage.insertRaw("issues", [
    { jobId: p2.id, title: "Skylight flashing leak reported", description: "Homeowner reports minor drip near skylight after rain. Needs crew re-seal.", status: "Open", priority: "High", assigneeId: gus, createdBy: "Hannah Berg", createdAt: ago(1) },
    { jobId: p1.id, title: "Material delivery short 2 squares", description: "ABC delivery was 2 SQ short vs PO. Follow up for credit/redelivery.", status: "In Progress", priority: "Normal", assigneeId: gus, createdBy: "Gus Hammond", createdAt: ago(2) },
    { jobId: b3.id, title: "Customer disputing final balance", description: "Diane disputes a line on the final invoice. Billing reviewing.", status: "Open", priority: "Urgent", assigneeId: null, createdBy: "Renee Ford", createdAt: ago(3) },
    { jobId: null, title: "Yard sign inventory low", description: "Down to ~6 yard signs across trucks. Reorder.", status: "Resolved", priority: "Low", assigneeId: tyler, createdBy: "Dale Rourke", createdAt: ago(6) },
  ]);

  seedLeaderboardSales(users);

  recomputeAllScores();
  console.log("[seed] done.");
}

/* ─────────────────────────────────────────────────────────────────────
   Update 7 backfill — idempotently adds demo rows for the new Issues and
   Material Returns features to a DB that was already seeded by an earlier
   build (seedIfEmpty short-circuits on those). Runs after seedIfEmpty on
   every boot; each block no-ops once its table has rows.
──────────────────────────────────────────────────────────────────── */
export function backfillUpdate7() {
  const users = storage.getUsers();
  if (!users.length) return; // empty DB → seedIfEmpty already handled everything
  const uid = (name: string) => users.find((u) => u.name === name)?.id ?? null;
  const jobs = storage.getJobs();
  const pick = (i: number) => jobs[i % jobs.length];

  if (storage.countIssues() === 0 && jobs.length) {
    const gus = uid("Gus Hammond");
    const tyler = uid("Tyler Boone");
    storage.insertRaw("issues", [
      { jobId: pick(0).id, title: "Skylight flashing leak reported", description: "Homeowner reports minor drip near skylight after rain. Needs crew re-seal.", status: "Open", priority: "High", assigneeId: gus, createdBy: "Hannah Berg", createdAt: ago(1) },
      { jobId: pick(1).id, title: "Material delivery short 2 squares", description: "ABC delivery was 2 SQ short vs PO. Follow up for credit/redelivery.", status: "In Progress", priority: "Normal", assigneeId: gus, createdBy: "Gus Hammond", createdAt: ago(2) },
      { jobId: pick(2).id, title: "Customer disputing final balance", description: "Customer disputes a line on the final invoice. Billing reviewing.", status: "Open", priority: "Urgent", assigneeId: null, createdBy: "Renee Ford", createdAt: ago(3) },
      { jobId: null, title: "Yard sign inventory low", description: "Down to ~6 yard signs across trucks. Reorder.", status: "Resolved", priority: "Low", assigneeId: tyler, createdBy: "Dale Rourke", createdAt: ago(6) },
    ]);
    console.log("[backfill] seeded demo issues");
  }

  if (storage.countMaterialReturns() === 0 && jobs.length) {
    const vendors = storage.getVendors();
    const abcId = vendors.find((v) => v.name === "ABC Supply")?.id ?? vendors[0]?.id ?? null;
    const items = storage.getPriceItems();
    const it = (i: number) => items[i % items.length];
    const a = it(0), b = it(1);
    const rPending = storage.createMaterialReturn({
      jobId: pick(0).id, status: "Pending", submittedBy: "Gus Hammond", submittedAt: ago(1), photosJson: "[]",
      notes: "Leftover bundles + accessories from the tear-off.",
    });
    storage.replaceReturnLines(rPending.id, [
      { itemId: a?.id ?? null, itemName: a?.name || "Shingles", vendorId: null, qty: 4, unit: "BD", unitRate: a?.unitCost || 110, lineValue: 4 * (a?.unitCost || 110), category: "Roofing Materials" },
      { itemId: b?.id ?? null, itemName: b?.name || "Drip Edge", vendorId: null, qty: 2, unit: "EA", unitRate: b?.unitCost || 45, lineValue: 2 * (b?.unitCost || 45), category: "Roofing Materials" },
    ]);
    storage.updateMaterialReturn(rPending.id, { totalReturnValue: 4 * (a?.unitCost || 110) + 2 * (b?.unitCost || 45), vendorId: null });

    const rVendor = storage.createMaterialReturn({
      jobId: pick(1).id, status: "Approved", submittedBy: "Gus Hammond", submittedAt: ago(2), approvedBy: "system", approvedAt: ago(2),
      vendorId: abcId, photosJson: "[]", notes: "Unopened materials returned to ABC Supply for credit.",
    });
    storage.replaceReturnLines(rVendor.id, [
      { itemId: b?.id ?? null, itemName: b?.name || "Drip Edge", vendorId: abcId, qty: 6, unit: "EA", unitRate: b?.unitCost || 12, lineValue: 6 * (b?.unitCost || 12), category: "Roofing Materials" },
      { itemId: a?.id ?? null, itemName: a?.name || "Ridge Vent", vendorId: abcId, qty: 3, unit: "EA", unitRate: a?.unitCost || 28, lineValue: 3 * (a?.unitCost || 28), category: "Roofing Materials" },
    ]);
    storage.updateMaterialReturn(rVendor.id, { totalReturnValue: 6 * (b?.unitCost || 12) + 3 * (a?.unitCost || 28), vendorId: abcId });

    const rMixed = storage.createMaterialReturn({
      jobId: null, status: "Pending", submittedBy: "Priya Nair", submittedAt: ago(0.5), photosJson: "[]",
      notes: "Mixed: some to vendor, some to warehouse.",
    });
    storage.replaceReturnLines(rMixed.id, [
      { itemId: a?.id ?? null, itemName: a?.name || "Pipe boots", vendorId: abcId, qty: 5, unit: "EA", unitRate: a?.unitCost || 9, lineValue: 5 * (a?.unitCost || 9), category: "Roofing Materials" },
      { itemId: b?.id ?? null, itemName: b?.name || "Nails", vendorId: null, qty: 2, unit: "BX", unitRate: b?.unitCost || 35, lineValue: 2 * (b?.unitCost || 35), category: "Roofing Materials" },
    ]);
    storage.updateMaterialReturn(rMixed.id, { totalReturnValue: 5 * (a?.unitCost || 9) + 2 * (b?.unitCost || 35), vendorId: null });
    console.log("[backfill] seeded demo material returns");
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Leaderboard sales data
   Creates SOLD work (closed jobs + accepted estimates) attributed to reps
   via job.repId, with estimate.acceptedAt timestamps placed in four
   reporting windows so the four Dashboard leaderboards (This Week /
   This Month / QTD / This Year) each rank reps DIFFERENTLY.

   Window math mirrors /api/leaderboard:
     week  : acceptedAt >= start-of-week   (≈ last 0–3.6 days as of seed)
     month : acceptedAt >= start-of-month  (calendar month, June)
     qtd   : acceptedAt >= start-of-quarter (calendar quarter, Apr 1)
     year  : acceptedAt >= start-of-year    (Jan 1)
   Totals accumulate downward (a week deal also counts in month/qtd/year),
   so each bucket below adds NEW deals in a window that does NOT overlap a
   shorter one, reshuffling the cumulative ranking per board.
──────────────────────────────────────────────────────────────────── */
export function seedLeaderboardSales(users: any[]) {
  const DAYx = 86400000;
  const agoX = (d: number) => Date.now() - d * DAYx;
  const repId = (name: string) => users.find(u => u.name === name)?.id ?? null;

  let seq = 0;
  // Create one sold job + matching accepted estimate worth `amount`,
  // attributed to `rep`, accepted `daysAgo` days ago.
  const sale = (rep: string, amount: number, daysAgo: number) => {
    seq++;
    const accepted = agoX(daysAgo);
    const job = storage.createJob({
      customer: `${rep.split(" ")[0]} Account #${seq}`,
      phone: "970-555-1" + String(100 + seq).slice(-3),
      email: "sold" + seq + "@example.com",
      address: `${1000 + seq} Sold Deal Rd, Fort Collins CO`,
      source: "Referral", flow: "BILLING", stage: "Paid & Closed",
      jobType: "Residential Re-Roof", description: "Closed/sold contract",
      value: amount, contractValue: amount, repId: repId(rep),
      // Sold/closed deals exist for leaderboard attribution (via accepted
      // estimates) only — they are NOT active WIP. Keeping isActiveJob false
      // prevents them from inflating Dashboard projected profit / blended margin.
      isActiveJob: false, insuranceApproved: false,
      stageEnteredAt: accepted, lastActivityAt: accepted,
      lastReplyAt: accepted, estimateSentAt: agoX(daysAgo + 4),
      createdAt: agoX(daysAgo + 10),
    });
    storage.createEstimate({
      jobId: job.id, mode: "quick", template: "Asphalt Reroof", status: "accepted",
      squares: 0, pitch: "6/12", layers: 1, stories: 1, wastePct: 10,
      taxPct: 7.01, opEnabled: false, contingencyPct: 0, selectedTier: "good",
      sectionsJson: "[]", addonsJson: "[]",
      jobType: "Residential Re-Roof", funding: "Retail", margin: DEFAULT_MARGIN,
      taxJurisdiction: "Greeley (80632/33/38/39)", taxRate: 7.01,
      jobInputJson: "{}", extrasJson: "{}", buildJson: "{}",
      contractValue: 0, totalPrice: Math.round(amount * 100) / 100,
      acceptedAt: accepted, signature: job.customer,
    });
  };

  // ── WEEK bucket (0.3–3.0 days ago) — matches IMG_2694 "Sales This Week".
  //    These amounts also flow into Month/QTD/Year totals.
  const week: Array<[string, number]> = [
    ["Liam Calloway", 215264.70],
    ["Kurt Renner", 118349.89],
    ["Jalen Vasquez", 110401.81],
    ["Jordan Holt", 82111.00],
    ["Wes Whitaker", 58633.00],
    ["Marco Foss", 53861.23],
    ["Shane Lindqvist", 48331.00],
    ["Craig Mercer", 47141.75],
    ["Dino Sandoval", 45792.00],
  ];
  week.forEach(([rep, amt], i) => sale(rep, amt, 0.4 + i * 0.25));

  // ── MONTH-ONLY bucket (5–9 days ago, still June) — NOT in the week window.
  //    Boost mid/low-week reps so the monthly board reorders the top.
  const monthOnly: Array<[string, number]> = [
    ["Craig Mercer", 184000],
    ["Dino Sandoval", 152500],
    ["Shane Lindqvist", 96000],
    ["Jalen Vasquez", 41250],
    ["Jordan Holt", 18900],
  ];
  monthOnly.forEach(([rep, amt], i) => sale(rep, amt, 5 + i * 0.8));

  // ── QTD-ONLY bucket (20–65 days ago, still Q2) — NOT in the month window.
  //    Different reps surge so the QTD board ranks differently again.
  const qtdOnly: Array<[string, number]> = [
    ["Jordan Holt", 262000],
    ["Marco Foss", 208400],
    ["Kurt Renner", 61500],
    ["Liam Calloway", 33700],
    ["Wes Whitaker", 47800],
  ];
  qtdOnly.forEach(([rep, amt], i) => sale(rep, amt, 20 + i * 9));

  // ── YEAR-ONLY bucket (80–150 days ago, still 2026) — NOT in the QTD window.
  //    Heavy early-year producers reshape the annual board.
  const yearOnly: Array<[string, number]> = [
    ["Dino Sandoval", 312000],
    ["Wes Whitaker", 258900],
    ["Jalen Vasquez", 121400],
    ["Shane Lindqvist", 71300],
    ["Craig Mercer", 39600],
  ];
  yearOnly.forEach(([rep, amt], i) => sale(rep, amt, 80 + i * 16));
}
