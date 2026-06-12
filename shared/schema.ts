import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ───────────────────────── Users & Roles ───────────────────────── */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(), // Admin | Manager | Sales Rep | Production | Billing | Sub
  isNewRep: integer("is_new_rep", { mode: "boolean" }).notNull().default(false),
  commissionType: text("commission_type"), // gross_profit | contract
  commissionRate: real("commission_rate").default(0),
  commissionTrigger: text("commission_trigger"), // Deposit Invoiced | Paid & Closed
});

/* ───────────────────────── Jobs / Leads (cards) ───────────────────────── */
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customer: text("customer").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  source: text("source"), // Referral | Door Knock | Google | Storm | Insurance | Website
  flow: text("flow").notNull(), // SALES | INSURANCE | PRODUCTION | BILLING
  stage: text("stage").notNull(),
  jobType: text("job_type"), // Asphalt Reroof | Roof Repair | Gutters | Siding | Insurance
  description: text("description"),
  value: real("value").notNull().default(0), // estimated/contract value
  contractValue: real("contract_value").default(0), // signed contract (+approved COs)
  repId: integer("rep_id"),
  insuranceApproved: integer("insurance_approved", { mode: "boolean" }).default(false),
  isActiveJob: integer("is_active_job", { mode: "boolean" }).default(false), // in production/billing
  pauseFollowups: integer("pause_followups", { mode: "boolean" }).default(false),
  leadScore: integer("lead_score").default(0),
  stageEnteredAt: integer("stage_entered_at").notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
  lastReplyAt: integer("last_reply_at"),
  estimateSentAt: integer("estimate_sent_at"),
  invoiceSentAt: integer("invoice_sent_at"),
  nextFollowupAt: integer("next_followup_at"),
  createdAt: integer("created_at").notNull(),
  // ── Update 6: Segmentation & Details ──
  department: text("department"),       // Roofing | Gutters | Siding | Painting | Service
  workType: text("work_type"),          // Shingles / Composite Roofing | Metal Roofing | ...
  classification: text("classification"), // Residential | Commercial | Multi-Family | HOA
  priority: text("priority"),           // Low | Normal | High | Urgent
  serviceType: text("service_type"),    // Evaluation | Re-Roof | Repair | Maintenance | New Construction
  location: text("location"),           // Fort Collins | Loveland | ...
  leadSource: text("lead_source"),      // Google | Referral | Door Knock | ...
  bidType: text("bid_type"),            // Private | Insurance | Bid/GC | Warranty
  property: text("property"),            // property address (may differ from billing)
  createdBy: text("created_by"),         // user name who created
  // JSON text columns (SQLite has no arrays)
  stakeholdersJson: text("stakeholders_json").notNull().default("{}"),       // {Salesperson:userId, ProjectManager:userId, ...}
  additionalContactsJson: text("additional_contacts_json").notNull().default("[]"), // [{name,phone,email}]
  salesSplitJson: text("sales_split_json").notNull().default("[]"),          // [{userId, pct}]
  // ── Update 7 ──
  companyCamProjectId: text("companycam_project_id"),        // placeholder integration id
  companyCamCreatedAt: integer("companycam_created_at"),     // when CompanyCam project was created
  preProductionChecklistJson: text("pre_production_checklist_json").notNull().default("{}"), // {colorsFinal,estimateCorrect,contactCorrect,depositReceived,supplementsAck}
  // ── Update 9: Ready-for-Production gate ──
  readyForProdChecklistJson: text("ready_for_prod_checklist_json").notNull().default("{}"), // {licenseValid,permitApproved,materialAllocated,buildDateVerified}
  projectedCompletionAt: integer("projected_completion_at"),                                 // projected date of completion
});

/* ───────────────────────── Work Orders (Update 6) ───────────────────────── */
export const workOrders = sqliteTable("work_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  estimateId: integer("estimate_id"),
  status: text("status").notNull().default("Draft"), // Draft | Issued | Completed
  subtitle: text("subtitle"),            // work type subtitle
  preparedBy: text("prepared_by"),       // user name
  preparedByPhone: text("prepared_by_phone"),
  summaryJson: text("summary_json").notNull().default("{}"),   // {squares, layers, days, shingle, hipRidge, starter}
  directions: text("directions").notNull().default(""),         // free-text directions & job details
  checklistJson: text("checklist_json").notNull().default("{}"), // {key:{value,note}}
  linesJson: text("lines_json").notNull().default("[]"),        // section-grouped pulled lines
  showMaterials: integer("show_materials", { mode: "boolean" }).notNull().default(true), // Update 7
  showLabor: integer("show_labor", { mode: "boolean" }).notNull().default(true),         // Update 7
  createdAt: integer("created_at").notNull(),
});

/* ───────────────────────── Activity feed ───────────────────────── */
export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  type: text("type").notNull(), // stage_move | comms | payment | task | note | system
  channel: text("channel"), // sms | email | call | system
  direction: text("direction"), // out | in
  actor: text("actor"), // user name or "system"
  flow: text("flow"),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
});

/* ───────────────────────── Price list ───────────────────────── */
export const priceItems = sqliteTable("price_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull(), // SQ | LF | EA | HR
  unitCost: real("unit_cost").notNull(),
  defaultMargin: real("default_margin").notNull(), // %
  costCode: text("cost_code").notNull(), // e.g. "300"
});

export const priceHistory = sqliteTable("price_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull(),
  itemName: text("item_name").notNull(),
  field: text("field").notNull(),
  oldValue: text("old_value").notNull(),
  newValue: text("new_value").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: integer("changed_at").notNull(),
});

/* ───────────────────────── Cost codes ───────────────────────── */
export const costCodes = sqliteTable("cost_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

/* ───────────────────────── Estimates ───────────────────────── */
export const estimates = sqliteTable("estimates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  mode: text("mode").notNull(), // quick | advanced
  template: text("template"),
  status: text("status").notNull().default("draft"), // draft | sent | accepted
  // measurements (quick)
  squares: real("squares").default(0),
  pitch: text("pitch"),
  layers: integer("layers").default(1),
  stories: integer("stories").default(1),
  wastePct: real("waste_pct").default(10),
  // adjustments (advanced)
  taxPct: real("tax_pct").default(0),
  opEnabled: integer("op_enabled", { mode: "boolean" }).default(false),
  contingencyPct: real("contingency_pct").default(0),
  selectedTier: text("selected_tier").default("better"), // good | better | best
  sectionsJson: text("sections_json").notNull().default("[]"), // [{name, lines:[...]}] (advanced)
  addonsJson: text("addons_json").notNull().default("[]"),
  // ── Real pricing engine (Estimator V3) ──
  jobType: text("job_type").default("Residential Re-Roof"), // canonical JOB_TYPES; drives funding math
  funding: text("funding").default("Retail"), // Retail | Insurance math driver (derived from jobType)
  margin: real("margin").default(40), // retail margin %
  taxJurisdiction: text("tax_jurisdiction").default("Greeley (80632/33/38/39)"),
  taxRate: real("tax_rate").default(7.01),
  jobInputJson: text("job_input_json").notNull().default("{}"), // full sheet job-input model
  extrasJson: text("extras_json").notNull().default("{}"), // proposal extras
  buildJson: text("build_json").notNull().default("{}"), // build-tab overrides (line qty/rate, product selections, extras cost/price)
  contractValue: real("est_contract_value").default(0), // insurance carrier amount
  totalPrice: real("total_price").default(0), // computed contract total (cache)
  acceptedAt: integer("accepted_at"),
  signature: text("signature"),
  createdAt: integer("created_at").notNull(),
});

/* ───────────────────────── Templates (comms) ───────────────────────── */
export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  channel: text("channel").notNull(), // sms | email
  subject: text("subject"),
  body: text("body").notNull(),
});

/* ───────────────────────── Automations (cadences) ───────────────────────── */
export const automations = sqliteTable("automations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  flow: text("flow").notNull(),
  triggerType: text("trigger_type").notNull(), // stage_entered | inactivity | estimate_sent | invoice_unpaid
  triggerStage: text("trigger_stage"),
  delayMinutes: integer("delay_minutes").notNull().default(0), // for stage_entered
  delayDays: integer("delay_days").default(0), // for inactivity / estimate / invoice
  actionType: text("action_type").notNull(), // send_sms | send_email | create_task | notify | move_rehash
  templateId: integer("template_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/* ───────────────────────── Automation Campaigns (workflows) — Update 9 ───────────────────────── */
export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  section: text("section").notNull(), // SPEED-TO-LEAD | SALES FOLLOW-UP | JOB UPDATES | REVIEWS & REFERRALS | INSURANCE
  color: text("color").notNull().default("#475569"), // tile icon color
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  steps: integer("steps").notNull().default(0),
  activeNow: integer("active_now").notNull().default(0),
  runsThisWeek: integer("runs_this_week").notNull().default(0),
  totalRuns: integer("total_runs").notNull().default(0),
  lastUpdatedAt: integer("last_updated_at").notNull(),
});

/* ───────────────────────── Workflow Triggers — Update 9 ───────────────────────── */
export const triggers = sqliteTable("triggers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  triggerType: text("trigger_type").notNull().default("Project"), // Project | Job | Event
  projectTriggerType: text("project_trigger_type").notNull().default("Project Stage"), // Project Stage | ...
  name: text("name").notNull(), // stage or event name (display)
  stage: text("stage"), // PROJECT STAGE value (when project stage trigger)
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  startCampaignId: integer("start_campaign_id"), // workflow to start
  stopAction: text("stop_action").notNull().default("Stop All Workflows For Project"),
  conditionGroupsJson: text("condition_groups_json").notNull().default("[]"), // [{conditions:{...}}]
});

/* fired automations log — prevents re-firing the same rule for same job */
export const automationRuns = sqliteTable("automation_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  automationId: integer("automation_id").notNull(),
  jobId: integer("job_id").notNull(),
  firedAt: integer("fired_at").notNull(),
  stageAtFire: text("stage_at_fire"),
});

/* ───────────────────────── Outbox (simulated SMS/email) ───────────────────────── */
export const outbox = sqliteTable("outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  channel: text("channel").notNull(),
  to: text("to"),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull().default("Sent"),
  automationId: integer("automation_id"),
  sentAt: integer("sent_at").notNull(),
});

/* ───────────────────────── Job budget by cost code ───────────────────────── */
export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  costCode: text("cost_code").notNull(),
  budgetCost: real("budget_cost").notNull().default(0),
});

/* ───────────────────────── Committed sub costs (POs) ───────────────────────── */
export const commitments = sqliteTable("commitments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  vendorId: integer("vendor_id"),
  vendorName: text("vendor_name").notNull(),
  costCode: text("cost_code").notNull(),
  committed: real("committed").notNull().default(0),
  invoiced: real("invoiced").notNull().default(0),
  paid: real("paid").notNull().default(0),
  retentionHeld: real("retention_held").notNull().default(0),
});

/* ───────────────────────── Cost ledger ───────────────────────── */
export const costs = sqliteTable("costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"), // null => cost w/o job (flag)
  costCode: text("cost_code"), // null => cost w/o cost code (flag)
  vendor: text("vendor"),
  description: text("description").notNull(),
  amount: real("amount").notNull(),
  source: text("source").notNull().default("Manual"), // QB | Manual
  ref: text("ref"),
  date: integer("date").notNull(),
});

/* ───────────────────────── Billing invoices ───────────────────────── */
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  number: text("number").notNull(),
  amount: real("amount").notNull(),
  retainage: real("retainage").notNull().default(0),
  collected: real("collected").notNull().default(0),
  issuedAt: integer("issued_at").notNull(),
  type: text("type").notNull().default("Progress"), // Deposit | Progress | Final
});

/* ───────────────────────── Change orders ───────────────────────── */
export const changeOrders = sqliteTable("change_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("Pending"), // Pending | Approved | Rejected
  amount: real("amount").notNull().default(0), // revenue
  cost: real("cost").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

/* ───────────────────────── Vendors ───────────────────────── */
export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  trade: text("trade").notNull(),
  hasW9: integer("has_w9", { mode: "boolean" }).notNull().default(false),
  is1099: integer("is_1099", { mode: "boolean" }).notNull().default(false),
  insuranceExpiry: integer("insurance_expiry"),
});

/* ───────────────────────── Tasks ───────────────────────── */
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  title: text("title").notNull(),
  assigneeId: integer("assignee_id"),
  dueAt: integer("due_at"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  type: text("type").notNull().default("task"), // task | appointment
});

/* ───────────────────────── Internal team messaging ───────────────────────── */
export const internalMessages = sqliteTable("internal_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),   // customer/job account (jobs table holds both leads & jobs)
  leadId: integer("lead_id"), // reserved for an alternate lead type; jobs cover both in this app
  authorUserId: integer("author_user_id").notNull(),
  body: text("body").notNull(),
  mentions: text("mentions").notNull().default("[]"), // JSON array of userIds
  createdAt: integer("created_at").notNull(),
});

// per-(message, user) read tracking for the mentions inbox
export const mentionReads = sqliteTable("mention_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  readAt: integer("read_at").notNull(),
});

/* ───────────────────────── Settings (single row) ───────────────────────── */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyName: text("company_name").notNull().default("Impact Exteriors LLC"),
  accentColor: text("accent_color").notNull().default("#D97B29"),
  marginFloor: real("margin_floor").notNull().default(40),
  slasJson: text("slas_json").notNull().default("{}"), // { stage: days }
  defaultWastePct: real("default_waste_pct").notNull().default(10),
  surchargePct: real("surcharge_pct").notNull().default(3),
  priceAgreement: text("price_agreement").notNull().default("ABC Price Agreement 6/3/2026"),
  priceAgreementExpires: text("price_agreement_expires").notNull().default("8/31/2026"),
});

/* ───────────────────────── Material Returns (Update 7) ───────────────────────── */
export const materialReturns = sqliteTable("material_returns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  status: text("status").notNull().default("Pending"), // Pending | Approved | Rejected
  submittedBy: text("submitted_by"),
  submittedAt: integer("submitted_at"),
  approvedBy: text("approved_by"),
  approvedAt: integer("approved_at"),
  vendorId: integer("vendor_id"), // single vendor if all lines share one
  totalReturnValue: real("total_return_value").notNull().default(0),
  photosJson: text("photos_json").notNull().default("[]"), // [{name, dataUrl}]
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
});

export const materialReturnLines = sqliteTable("material_return_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  returnId: integer("return_id").notNull(),
  itemId: integer("item_id"),
  itemName: text("item_name").notNull(),
  vendorId: integer("vendor_id"), // null => returns to warehouse/inventory
  qty: real("qty").notNull().default(0),
  unit: text("unit").notNull().default("EA"),
  unitRate: real("unit_rate").notNull().default(0),
  lineValue: real("line_value").notNull().default(0),
  category: text("category"),
});

/* ───────────────────────── Issues (Update 7) ───────────────────────── */
export const issues = sqliteTable("issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("Open"), // Open | In Progress | Resolved
  priority: text("priority").notNull().default("Normal"), // Low | Normal | High | Urgent
  assigneeId: integer("assignee_id"),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
});

export const ISSUE_STATUSES = ["Open", "In Progress", "Resolved"] as const;
export const MATERIAL_RETURN_STATUSES = ["Pending", "Approved", "Rejected"] as const;

/* ───────────────────────── Insert schemas & types ───────────────────────── */
const ins = <T extends Parameters<typeof createInsertSchema>[0]>(t: T) =>
  createInsertSchema(t);

export const insertUserSchema = ins(users);
export const insertJobSchema = createInsertSchema(jobs).omit({ id: true });
export const insertActivitySchema = createInsertSchema(activities).omit({ id: true });
export const insertPriceItemSchema = createInsertSchema(priceItems).omit({ id: true });
export const insertCostCodeSchema = createInsertSchema(costCodes).omit({ id: true });
export const insertEstimateSchema = createInsertSchema(estimates).omit({ id: true });
export const insertTemplateSchema = createInsertSchema(templates).omit({ id: true });
export const insertAutomationSchema = createInsertSchema(automations).omit({ id: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true });
export const insertTriggerSchema = createInsertSchema(triggers).omit({ id: true });
export const insertOutboxSchema = createInsertSchema(outbox).omit({ id: true });
export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true });
export const insertCommitmentSchema = createInsertSchema(commitments).omit({ id: true });
export const insertCostSchema = createInsertSchema(costs).omit({ id: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true });
export const insertChangeOrderSchema = createInsertSchema(changeOrders).omit({ id: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export const insertInternalMessageSchema = createInsertSchema(internalMessages).omit({ id: true });
export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({ id: true });
export const insertMaterialReturnSchema = createInsertSchema(materialReturns).omit({ id: true });
export const insertMaterialReturnLineSchema = createInsertSchema(materialReturnLines).omit({ id: true });
export const insertIssueSchema = createInsertSchema(issues).omit({ id: true });

export type User = typeof users.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type PriceItem = typeof priceItems.$inferSelect;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type CostCode = typeof costCodes.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type Outbox = typeof outbox.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type Cost = typeof costs.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type InternalMessage = typeof internalMessages.$inferSelect;
export type MentionRead = typeof mentionReads.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type WorkOrder = typeof workOrders.$inferSelect;
export type MaterialReturn = typeof materialReturns.$inferSelect;
export type MaterialReturnLine = typeof materialReturnLines.$inferSelect;
export type Issue = typeof issues.$inferSelect;

export type InsertJob = z.infer<typeof insertJobSchema>;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type InsertAutomation = z.infer<typeof insertAutomationSchema>;

/* ───────────────────────── Shared constants ───────────────────────── */
// Canonical job types used everywhere (leads, jobs, estimates, kanban, filters, badges, seeds)
export const JOB_TYPES = [
  "Residential Re-Roof",
  "Residential Insurance Re-Roof",
  "Commercial",
  "Residential Service",
  "Commercial Service",
  "Soffit/Fascia/Gutters",
  "Siding",
  "Exterior Painting",
] as const;
export type JobType = (typeof JOB_TYPES)[number];
// "Residential Insurance Re-Roof" uses insurance math (O&P allowed); everything else uses retail math.
export function fundingForJobType(jobType: string | null | undefined): "Retail" | "Insurance" {
  return jobType === "Residential Insurance Re-Roof" ? "Insurance" : "Retail";
}

// Legacy → canonical job-type migration (Update 5 rename).
export function migrateJobType(jobType: string | null | undefined): string {
  if (jobType === "Retail") return "Residential Re-Roof";
  if (jobType === "Insurance") return "Residential Insurance Re-Roof";
  return jobType || "Residential Re-Roof";
}

export const FLOWS = ["SALES", "INSURANCE", "PRODUCTION", "BILLING"] as const;

/* ───── Update 6: Segmentation & Details option lists ───── */
export const SEG_DEPARTMENT = ["Roofing", "Gutters", "Siding", "Painting", "Service"] as const;
export const SEG_WORK_TYPE = ["Shingles / Composite Roofing", "Metal Roofing", "Flat / Low-Slope", "Gutters & Downspouts", "Siding", "Exterior Painting", "Repair / Service"] as const;
export const SEG_CLASSIFICATION = ["Residential", "Commercial", "Multi-Family", "HOA"] as const;
export const SEG_PRIORITY = ["Low", "Normal", "High", "Urgent"] as const;
export const SEG_SERVICE_TYPE = ["Evaluation", "Re-Roof", "Repair", "Maintenance", "New Construction"] as const;
export const SEG_LOCATION = ["Fort Collins", "Loveland", "Greeley", "Windsor", "Denver", "Grand Junction", "Other"] as const;
export const SEG_LEAD_SOURCE = ["Google", "Referral", "Door Knock", "Facebook", "Website", "Repeat Customer", "Insurance Partner", "Other"] as const;
export const SEG_BID_TYPE = ["Private", "Insurance", "Bid/GC", "Warranty"] as const;
export const STAKEHOLDER_ROLES = ["Salesperson", "Project Manager", "Foreman", "Superintendent", "Estimator", "Scheduler"] as const;
export const WORK_ORDER_STATUSES = ["Draft", "Issued", "Completed"] as const;

export const STAGES: Record<string, string[]> = {
  SALES: [
    "New Lead", "Sending Booking Link", "Appointment Scheduled", "Creating Estimate",
    "Estimate Approved", "Estimate Sent", "Estimate Accepted", "Deposit Invoiced",
    "Pre-Production",
    "Ready for Production",
  ],
  INSURANCE: [
    "Contingency Sent", "Signed/Waiting on Adjuster", "Adjuster Scheduled",
    "Waiting on Carrier", "Approved",
    "Waiting on Supplements", "Supplements Approved", "Pre-Production",
    "Ready for Production",
  ],
  PRODUCTION: [
    "Ready for Production", "Materials Ordered", "Job Scheduled",
    "Job In Progress", "Final Walkthrough", "Job Complete",
  ],
  BILLING: ["Job Complete", "Invoice Sent", "Paid & Closed"],
};

export const SIDE_EXITS: Record<string, string[]> = {
  SALES: ["Lost", "No Damage", "Lead Rehash"],
  INSURANCE: ["No Damage"],
  PRODUCTION: [],
  BILLING: [],
};

// default days-in-stage SLA per stage
export const DEFAULT_SLAS: Record<string, number> = {
  "New Lead": 1, "Sending Booking Link": 1, "Appointment Scheduled": 3,
  "Creating Estimate": 2, "Estimate Approved": 1, "Estimate Sent": 4,
  "Estimate Accepted": 2, "Deposit Invoiced": 3, "Ready for Production": 5,
  "Contingency Sent": 3, "Signed/Waiting on Adjuster": 7, "Adjuster Scheduled": 5,
  "Waiting on Carrier": 10, "Approved": 3,
  "Waiting on Supplements": 7, "Supplements Approved": 2, "Pre-Production": 2,
  "Materials Ordered": 4,
  "Job Scheduled": 5, "Job In Progress": 7, "Final Walkthrough": 2,
  "Job Complete": 3, "Invoice Sent": 7, "Paid & Closed": 999,
};

// stage probability for weighted forecast
export const STAGE_PROBABILITY: Record<string, number> = {
  "New Lead": 0.1, "Sending Booking Link": 0.15, "Appointment Scheduled": 0.25,
  "Creating Estimate": 0.4, "Estimate Approved": 0.5, "Estimate Sent": 0.6,
  "Estimate Accepted": 0.85, "Deposit Invoiced": 0.95, "Ready for Production": 1,
  "Contingency Sent": 0.2, "Signed/Waiting on Adjuster": 0.35, "Adjuster Scheduled": 0.45,
  "Waiting on Carrier": 0.55, "Approved": 0.9,
  "Waiting on Supplements": 0.7, "Supplements Approved": 0.92, "Pre-Production": 0.97,
};

/* ───── Update 9: Automations + Ready-for-Production ───── */
// Campaign tile sections (display order on the Automation Campaigns page).
export const CAMPAIGN_SECTIONS = ["SPEED-TO-LEAD", "SALES FOLLOW-UP", "JOB UPDATES", "REVIEWS & REFERRALS", "INSURANCE"] as const;

// Trigger condition fields (the conditional dropdown rows in the Edit Workflow Trigger modal).
export const TRIGGER_CONDITION_FIELDS = [
  "Project Location Is", "Project Category Is", "Project Type Is",
  "Lead Source Is", "Project Services Include", "Project Tags Include",
] as const;
export const TRIGGER_TYPES = ["Project", "Job", "Event"] as const;
export const PROJECT_TRIGGER_TYPES = ["Project Stage", "Event Type"] as const;
export const STOP_ACTIONS = ["Stop All Workflows For Project", "Don't Stop Workflows"] as const;

// Required Ready-for-Production gate checkboxes (all must be checked to advance).
export const READY_FOR_PROD_CHECKLIST = [
  { key: "licenseValid", label: "License Valid" },
  { key: "permitApproved", label: "Permit Approved" },
  { key: "materialAllocated", label: "Material Allocated" },
  { key: "buildDateVerified", label: "Build Date Verified" },
] as const;

// All distinct pipeline stages, in flow order, for the Jobs tile board.
export const ALL_STAGES_ORDERED: string[] = Array.from(
  new Set([...STAGES.SALES, ...STAGES.INSURANCE, ...STAGES.PRODUCTION, ...STAGES.BILLING])
);
