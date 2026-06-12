import {
  users, jobs, activities, priceItems, priceHistory, costCodes, estimates,
  templates, automations, automationRuns, outbox, budgets, commitments, costs,
  invoices, changeOrders, vendors, tasks, settings, internalMessages, mentionReads,
  workOrders, materialReturns, materialReturnLines, issues, campaigns, triggers,
} from "@shared/schema";
import type {
  User, Job, Activity, PriceItem, PriceHistory, CostCode, Estimate, Template,
  Automation, AutomationRun, Outbox, Budget, Commitment, Cost, Invoice,
  ChangeOrder, Vendor, Task, Settings, InternalMessage, WorkOrder,
  MaterialReturn, MaterialReturnLine, Issue, Campaign, Trigger,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, asc, and, inArray } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite);

sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, is_new_rep INTEGER NOT NULL DEFAULT 0, commission_type TEXT, commission_rate REAL DEFAULT 0, commission_trigger TEXT);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, source TEXT, flow TEXT NOT NULL, stage TEXT NOT NULL, job_type TEXT, description TEXT, value REAL NOT NULL DEFAULT 0, contract_value REAL DEFAULT 0, rep_id INTEGER, insurance_approved INTEGER DEFAULT 0, is_active_job INTEGER DEFAULT 0, pause_followups INTEGER DEFAULT 0, lead_score INTEGER DEFAULT 0, stage_entered_at INTEGER NOT NULL, last_activity_at INTEGER NOT NULL, last_reply_at INTEGER, estimate_sent_at INTEGER, invoice_sent_at INTEGER, next_followup_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, type TEXT NOT NULL, channel TEXT, direction TEXT, actor TEXT, flow TEXT, message TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS price_items (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL, unit_cost REAL NOT NULL, default_margin REAL NOT NULL, cost_code TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS price_history (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, item_name TEXT NOT NULL, field TEXT NOT NULL, old_value TEXT NOT NULL, new_value TEXT NOT NULL, changed_by TEXT NOT NULL, changed_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cost_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS estimates (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, mode TEXT NOT NULL, template TEXT, status TEXT NOT NULL DEFAULT 'draft', job_type TEXT DEFAULT 'Retail', squares REAL DEFAULT 0, pitch TEXT, layers INTEGER DEFAULT 1, stories INTEGER DEFAULT 1, waste_pct REAL DEFAULT 10, tax_pct REAL DEFAULT 0, op_enabled INTEGER DEFAULT 0, contingency_pct REAL DEFAULT 0, selected_tier TEXT DEFAULT 'better', sections_json TEXT NOT NULL DEFAULT '[]', addons_json TEXT NOT NULL DEFAULT '[]', funding TEXT DEFAULT 'Retail', margin REAL DEFAULT 40, tax_jurisdiction TEXT DEFAULT 'Greeley (80632/33/38/39)', tax_rate REAL DEFAULT 7.01, job_input_json TEXT NOT NULL DEFAULT '{}', extras_json TEXT NOT NULL DEFAULT '{}', build_json TEXT NOT NULL DEFAULT '{}', est_contract_value REAL DEFAULT 0, total_price REAL DEFAULT 0, accepted_at INTEGER, signature TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, channel TEXT NOT NULL, subject TEXT, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS automations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, flow TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_stage TEXT, delay_minutes INTEGER NOT NULL DEFAULT 0, delay_days INTEGER DEFAULT 0, action_type TEXT NOT NULL, template_id INTEGER, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS automation_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, automation_id INTEGER NOT NULL, job_id INTEGER NOT NULL, fired_at INTEGER NOT NULL, stage_at_fire TEXT);
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, channel TEXT NOT NULL, "to" TEXT, subject TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Sent', automation_id INTEGER, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, cost_code TEXT NOT NULL, budget_cost REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS commitments (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, vendor_id INTEGER, vendor_name TEXT NOT NULL, cost_code TEXT NOT NULL, committed REAL NOT NULL DEFAULT 0, invoiced REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, retention_held REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS costs (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, cost_code TEXT, vendor TEXT, description TEXT NOT NULL, amount REAL NOT NULL, source TEXT NOT NULL DEFAULT 'Manual', ref TEXT, date INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, number TEXT NOT NULL, amount REAL NOT NULL, retainage REAL NOT NULL DEFAULT 0, collected REAL NOT NULL DEFAULT 0, issued_at INTEGER NOT NULL, type TEXT NOT NULL DEFAULT 'Progress');
CREATE TABLE IF NOT EXISTS change_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', amount REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vendors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, trade TEXT NOT NULL, has_w9 INTEGER NOT NULL DEFAULT 0, is_1099 INTEGER NOT NULL DEFAULT 0, insurance_expiry INTEGER);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, title TEXT NOT NULL, assignee_id INTEGER, due_at INTEGER, done INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'task');
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, company_name TEXT NOT NULL DEFAULT 'Impact Exteriors LLC', accent_color TEXT NOT NULL DEFAULT '#D97B29', margin_floor REAL NOT NULL DEFAULT 40, slas_json TEXT NOT NULL DEFAULT '{}', default_waste_pct REAL NOT NULL DEFAULT 10, surcharge_pct REAL NOT NULL DEFAULT 3, price_agreement TEXT NOT NULL DEFAULT 'ABC Price Agreement 6/3/2026', price_agreement_expires TEXT NOT NULL DEFAULT '8/31/2026');
CREATE TABLE IF NOT EXISTS internal_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, lead_id INTEGER, author_user_id INTEGER NOT NULL, body TEXT NOT NULL, mentions TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mention_reads (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, read_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS work_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, estimate_id INTEGER, status TEXT NOT NULL DEFAULT 'Draft', subtitle TEXT, prepared_by TEXT, prepared_by_phone TEXT, summary_json TEXT NOT NULL DEFAULT '{}', directions TEXT NOT NULL DEFAULT '', checklist_json TEXT NOT NULL DEFAULT '{}', lines_json TEXT NOT NULL DEFAULT '[]', show_materials INTEGER NOT NULL DEFAULT 1, show_labor INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS material_returns (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, status TEXT NOT NULL DEFAULT 'Pending', submitted_by TEXT, submitted_at INTEGER, approved_by TEXT, approved_at INTEGER, vendor_id INTEGER, total_return_value REAL NOT NULL DEFAULT 0, photos_json TEXT NOT NULL DEFAULT '[]', notes TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS material_return_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, return_id INTEGER NOT NULL, item_id INTEGER, item_name TEXT NOT NULL, vendor_id INTEGER, qty REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'EA', unit_rate REAL NOT NULL DEFAULT 0, line_value REAL NOT NULL DEFAULT 0, category TEXT);
CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'Open', priority TEXT NOT NULL DEFAULT 'Normal', assignee_id INTEGER, created_by TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, section TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#475569', active INTEGER NOT NULL DEFAULT 0, steps INTEGER NOT NULL DEFAULT 0, active_now INTEGER NOT NULL DEFAULT 0, runs_this_week INTEGER NOT NULL DEFAULT 0, total_runs INTEGER NOT NULL DEFAULT 0, last_updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_type TEXT NOT NULL DEFAULT 'Project', project_trigger_type TEXT NOT NULL DEFAULT 'Project Stage', name TEXT NOT NULL, stage TEXT, active INTEGER NOT NULL DEFAULT 0, start_campaign_id INTEGER, stop_action TEXT NOT NULL DEFAULT 'Stop All Workflows For Project', condition_groups_json TEXT NOT NULL DEFAULT '[]');
`);

/* Update 6: add new job columns to existing DBs (idempotent). */
for (const col of [
  "department TEXT", "work_type TEXT", "classification TEXT", "priority TEXT",
  "service_type TEXT", "location TEXT", "lead_source TEXT", "bid_type TEXT",
  "property TEXT", "created_by TEXT",
  "stakeholders_json TEXT NOT NULL DEFAULT '{}'",
  "additional_contacts_json TEXT NOT NULL DEFAULT '[]'",
  "sales_split_json TEXT NOT NULL DEFAULT '[]'",
  // Update 7
  "companycam_project_id TEXT", "companycam_created_at INTEGER",
  "pre_production_checklist_json TEXT NOT NULL DEFAULT '{}'",
  // Update 9
  "ready_for_prod_checklist_json TEXT NOT NULL DEFAULT '{}'",
  "projected_completion_at INTEGER",
]) {
  try { sqlite.exec(`ALTER TABLE jobs ADD COLUMN ${col};`); } catch { /* already exists */ }
}

/* Update 7: add work order display toggles to existing DBs (idempotent). */
for (const col of [
  "show_materials INTEGER NOT NULL DEFAULT 1",
  "show_labor INTEGER NOT NULL DEFAULT 1",
]) {
  try { sqlite.exec(`ALTER TABLE work_orders ADD COLUMN ${col};`); } catch { /* already exists */ }
}

export const now = () => Date.now();

class Storage {
  /* generic helpers */
  // users
  getUsers() { return db.select().from(users).all(); }
  getUser(id: number) { return db.select().from(users).where(eq(users.id, id)).get(); }
  updateUser(id: number, p: Partial<User>) { return db.update(users).set(p).where(eq(users.id, id)).returning().get(); }

  // jobs
  getJobs() { return db.select().from(jobs).all(); }
  getJob(id: number) { return db.select().from(jobs).where(eq(jobs.id, id)).get(); }
  createJob(d: any) { return db.insert(jobs).values(d).returning().get(); }
  updateJob(id: number, p: Partial<Job>) { return db.update(jobs).set(p).where(eq(jobs.id, id)).returning().get(); }
  deleteJob(id: number) { return db.delete(jobs).where(eq(jobs.id, id)).run(); }

  // activities
  getActivities() { return db.select().from(activities).orderBy(desc(activities.createdAt)).all(); }
  getJobActivities(jobId: number) { return db.select().from(activities).where(eq(activities.jobId, jobId)).orderBy(desc(activities.createdAt)).all(); }
  addActivity(d: any) { return db.insert(activities).values({ createdAt: now(), ...d }).returning().get(); }

  // price items
  getPriceItems() { return db.select().from(priceItems).all(); }
  createPriceItem(d: any) { return db.insert(priceItems).values(d).returning().get(); }
  updatePriceItem(id: number, p: Partial<PriceItem>, by = "Admin") {
    const old = this.getPriceItem(id);
    const res = db.update(priceItems).set(p).where(eq(priceItems.id, id)).returning().get();
    if (old) for (const k of Object.keys(p)) {
      const ov = (old as any)[k], nv = (p as any)[k];
      if (ov !== nv) db.insert(priceHistory).values({ itemId: id, itemName: old.name, field: k, oldValue: String(ov), newValue: String(nv), changedBy: by, changedAt: now() }).run();
    }
    return res;
  }
  getPriceItem(id: number) { return db.select().from(priceItems).where(eq(priceItems.id, id)).get(); }
  getPriceHistory() { return db.select().from(priceHistory).orderBy(desc(priceHistory.changedAt)).all(); }

  // cost codes
  getCostCodes() { return db.select().from(costCodes).all(); }

  // estimates
  getEstimates() { return db.select().from(estimates).all(); }
  getEstimate(id: number) { return db.select().from(estimates).where(eq(estimates.id, id)).get(); }
  getJobEstimate(jobId: number) { return db.select().from(estimates).where(eq(estimates.jobId, jobId)).orderBy(desc(estimates.id)).get(); }
  createEstimate(d: any) { return db.insert(estimates).values({ createdAt: now(), ...d }).returning().get(); }
  updateEstimate(id: number, p: Partial<Estimate>) { return db.update(estimates).set(p).where(eq(estimates.id, id)).returning().get(); }

  // templates
  getTemplates() { return db.select().from(templates).all(); }
  getTemplate(id: number) { return db.select().from(templates).where(eq(templates.id, id)).get(); }
  createTemplate(d: any) { return db.insert(templates).values(d).returning().get(); }
  updateTemplate(id: number, p: Partial<Template>) { return db.update(templates).set(p).where(eq(templates.id, id)).returning().get(); }

  // automations
  getAutomations() { return db.select().from(automations).all(); }
  createAutomation(d: any) { return db.insert(automations).values(d).returning().get(); }
  updateAutomation(id: number, p: Partial<Automation>) { return db.update(automations).set(p).where(eq(automations.id, id)).returning().get(); }
  deleteAutomation(id: number) { return db.delete(automations).where(eq(automations.id, id)).run(); }

  // campaigns (Update 9)
  getCampaigns() { return db.select().from(campaigns).orderBy(asc(campaigns.id)).all(); }
  getCampaign(id: number) { return db.select().from(campaigns).where(eq(campaigns.id, id)).get(); }
  createCampaign(d: any) { return db.insert(campaigns).values({ lastUpdatedAt: now(), ...d }).returning().get(); }
  updateCampaign(id: number, p: Partial<Campaign>) { return db.update(campaigns).set({ ...p, lastUpdatedAt: now() }).where(eq(campaigns.id, id)).returning().get(); }
  deleteCampaign(id: number) { return db.delete(campaigns).where(eq(campaigns.id, id)).run(); }
  countCampaigns() { return db.select().from(campaigns).all().length; }

  // triggers (Update 9)
  getTriggers() { return db.select().from(triggers).orderBy(asc(triggers.id)).all(); }
  getTrigger(id: number) { return db.select().from(triggers).where(eq(triggers.id, id)).get(); }
  createTrigger(d: any) { return db.insert(triggers).values(d).returning().get(); }
  updateTrigger(id: number, p: Partial<Trigger>) { return db.update(triggers).set(p).where(eq(triggers.id, id)).returning().get(); }
  deleteTrigger(id: number) { return db.delete(triggers).where(eq(triggers.id, id)).run(); }
  countTriggers() { return db.select().from(triggers).all().length; }

  getAutomationRuns() { return db.select().from(automationRuns).all(); }
  addAutomationRun(d: any) { return db.insert(automationRuns).values({ firedAt: now(), ...d }).returning().get(); }
  clearAutomationRunsForJob(jobId: number) { return db.delete(automationRuns).where(eq(automationRuns.jobId, jobId)).run(); }

  // outbox
  getOutbox() { return db.select().from(outbox).orderBy(desc(outbox.sentAt)).all(); }
  getJobOutbox(jobId: number) { return db.select().from(outbox).where(eq(outbox.jobId, jobId)).orderBy(desc(outbox.sentAt)).all(); }
  addOutbox(d: any) { return db.insert(outbox).values({ sentAt: now(), ...d }).returning().get(); }

  // budgets
  getBudgets() { return db.select().from(budgets).all(); }
  getJobBudgets(jobId: number) { return db.select().from(budgets).where(eq(budgets.jobId, jobId)).all(); }
  createBudget(d: any) { return db.insert(budgets).values(d).returning().get(); }
  updateBudget(id: number, p: Partial<Budget>) { return db.update(budgets).set(p).where(eq(budgets.id, id)).returning().get(); }
  deleteJobBudgets(jobId: number) { return db.delete(budgets).where(eq(budgets.jobId, jobId)).run(); }

  // commitments
  getCommitments() { return db.select().from(commitments).all(); }
  getJobCommitments(jobId: number) { return db.select().from(commitments).where(eq(commitments.jobId, jobId)).all(); }
  createCommitment(d: any) { return db.insert(commitments).values(d).returning().get(); }

  // costs
  getCosts() { return db.select().from(costs).orderBy(desc(costs.date)).all(); }
  getJobCosts(jobId: number) { return db.select().from(costs).where(eq(costs.jobId, jobId)).all(); }
  createCost(d: any) { return db.insert(costs).values({ date: now(), ...d }).returning().get(); }

  // invoices
  getInvoices() { return db.select().from(invoices).all(); }
  getJobInvoices(jobId: number) { return db.select().from(invoices).where(eq(invoices.jobId, jobId)).all(); }
  createInvoice(d: any) { return db.insert(invoices).values({ issuedAt: now(), ...d }).returning().get(); }
  updateInvoice(id: number, p: Partial<Invoice>) { return db.update(invoices).set(p).where(eq(invoices.id, id)).returning().get(); }

  // change orders
  getChangeOrders() { return db.select().from(changeOrders).all(); }
  getJobChangeOrders(jobId: number) { return db.select().from(changeOrders).where(eq(changeOrders.jobId, jobId)).all(); }
  createChangeOrder(d: any) { return db.insert(changeOrders).values({ createdAt: now(), ...d }).returning().get(); }
  updateChangeOrder(id: number, p: Partial<ChangeOrder>) { return db.update(changeOrders).set(p).where(eq(changeOrders.id, id)).returning().get(); }

  // vendors
  getVendors() { return db.select().from(vendors).all(); }
  getVendor(id: number) { return db.select().from(vendors).where(eq(vendors.id, id)).get(); }
  updateVendor(id: number, p: Partial<Vendor>) { return db.update(vendors).set(p).where(eq(vendors.id, id)).returning().get(); }

  // tasks
  getTasks() { return db.select().from(tasks).all(); }
  getJobTasks(jobId: number) { return db.select().from(tasks).where(eq(tasks.jobId, jobId)).all(); }
  createTask(d: any) { return db.insert(tasks).values(d).returning().get(); }
  updateTask(id: number, p: Partial<Task>) { return db.update(tasks).set(p).where(eq(tasks.id, id)).returning().get(); }

  // internal messages (team feed)
  getJobMessages(jobId: number) {
    return db.select().from(internalMessages).where(eq(internalMessages.jobId, jobId)).orderBy(asc(internalMessages.createdAt)).all();
  }
  createMessage(d: any) { return db.insert(internalMessages).values({ createdAt: now(), ...d }).returning().get(); }
  // all messages where a user is mentioned (newest first)
  getMessagesMentioning(userId: number): InternalMessage[] {
    const all = db.select().from(internalMessages).orderBy(desc(internalMessages.createdAt)).all();
    return all.filter((m) => { try { return (JSON.parse(m.mentions) as number[]).includes(userId); } catch { return false; } });
  }
  getReadMessageIds(userId: number): number[] {
    return db.select().from(mentionReads).where(eq(mentionReads.userId, userId)).all().map((r) => r.messageId);
  }
  markMentionsRead(userId: number, messageIds: number[]) {
    if (!messageIds.length) return;
    const already = new Set(this.getReadMessageIds(userId));
    const rows = messageIds.filter((id) => !already.has(id)).map((id) => ({ messageId: id, userId, readAt: now() }));
    if (rows.length) db.insert(mentionReads).values(rows).run();
  }

  // work orders (Update 6)
  getJobWorkOrders(jobId: number) { return db.select().from(workOrders).where(eq(workOrders.jobId, jobId)).orderBy(desc(workOrders.id)).all(); }
  getWorkOrder(id: number) { return db.select().from(workOrders).where(eq(workOrders.id, id)).get(); }
  createWorkOrder(d: any) { return db.insert(workOrders).values({ createdAt: now(), ...d }).returning().get(); }
  updateWorkOrder(id: number, p: Partial<WorkOrder>) { return db.update(workOrders).set(p).where(eq(workOrders.id, id)).returning().get(); }
  deleteWorkOrder(id: number) { return db.delete(workOrders).where(eq(workOrders.id, id)).run(); }

  // material returns (Update 7)
  getMaterialReturns() { return db.select().from(materialReturns).orderBy(desc(materialReturns.id)).all(); }
  getMaterialReturn(id: number) { return db.select().from(materialReturns).where(eq(materialReturns.id, id)).get(); }
  createMaterialReturn(d: any) { return db.insert(materialReturns).values({ createdAt: now(), ...d }).returning().get(); }
  updateMaterialReturn(id: number, p: Partial<MaterialReturn>) { return db.update(materialReturns).set(p).where(eq(materialReturns.id, id)).returning().get(); }
  deleteMaterialReturn(id: number) { db.delete(materialReturnLines).where(eq(materialReturnLines.returnId, id)).run(); return db.delete(materialReturns).where(eq(materialReturns.id, id)).run(); }
  getReturnLines(returnId: number) { return db.select().from(materialReturnLines).where(eq(materialReturnLines.returnId, returnId)).all(); }
  replaceReturnLines(returnId: number, lines: any[]) {
    db.delete(materialReturnLines).where(eq(materialReturnLines.returnId, returnId)).run();
    if (lines.length) db.insert(materialReturnLines).values(lines.map((l) => ({ ...l, returnId }))).run();
    return this.getReturnLines(returnId);
  }

  // issues (Update 7)
  getIssues() { return db.select().from(issues).orderBy(desc(issues.id)).all(); }
  getIssue(id: number) { return db.select().from(issues).where(eq(issues.id, id)).get(); }
  createIssue(d: any) { return db.insert(issues).values({ createdAt: now(), ...d }).returning().get(); }
  updateIssue(id: number, p: Partial<Issue>) { return db.update(issues).set(p).where(eq(issues.id, id)).returning().get(); }
  deleteIssue(id: number) { return db.delete(issues).where(eq(issues.id, id)).run(); }

  // settings
  getSettings() { return db.select().from(settings).where(eq(settings.id, 1)).get(); }
  updateSettings(p: Partial<Settings>) { return db.update(settings).set(p).where(eq(settings.id, 1)).returning().get(); }

  // raw inserts for seeding
  insertRaw(table: string, rows: any[]) {
    const map: any = { users, jobs, activities, priceItems, costCodes, estimates, templates, automations, outbox, budgets, commitments, costs, invoices, changeOrders, vendors, tasks, settings, internalMessages, workOrders, materialReturns, materialReturnLines, issues, campaigns, triggers };
    if (rows.length) db.insert(map[table]).values(rows).run();
  }
  countUsers() { return db.select().from(users).all().length; }
  countIssues() { return db.select().from(issues).all().length; }
  countMaterialReturns() { return db.select().from(materialReturns).all().length; }
}

export const storage = new Storage();
