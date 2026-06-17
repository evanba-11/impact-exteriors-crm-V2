import type { Express } from "express";
import type { Server } from "node:http";
import { storage, db } from "./storage";
import { sql } from "drizzle-orm";
import { seedIfEmpty, backfillUpdate7 } from "./seed";

/* Update 5: one-time rename of legacy job types across jobs + estimates. */
function migrateJobTypes() {
  try {
    db.run(sql`UPDATE jobs SET job_type = 'Residential Re-Roof' WHERE job_type = 'Retail'`);
    db.run(sql`UPDATE jobs SET job_type = 'Residential Insurance Re-Roof' WHERE job_type = 'Insurance'`);
    db.run(sql`UPDATE estimates SET job_type = 'Residential Re-Roof' WHERE job_type = 'Retail'`);
    db.run(sql`UPDATE estimates SET job_type = 'Residential Insurance Re-Roof' WHERE job_type = 'Insurance'`);
  } catch (e) { console.warn("[migrate] job-type rename skipped", e); }
}
import { scoreLead, recomputeAllScores, jobFinancials, allWIP, controllerFlags, commissionReport } from "./engine";
import { startScheduler, evaluateAutomations } from "./automation";
import { budgetByCostCode, defaultExtras, type JobInput, type ProposalExtras } from "@shared/pricing";
import { registerGoogleRoutes, ensureOpportunityFolder } from "./integrations/google";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  seedIfEmpty();
  migrateJobTypes();
  backfillUpdate7();
  startScheduler();

  const ok = (res: any, data: any) => res.json(data);

  /* ───── Google Workspace integration (Phase 1) ───── */
  registerGoogleRoutes(app);

  /* ───── Users ───── */
  app.get("/api/users", (_r, res) => ok(res, storage.getUsers()));
  app.patch("/api/users/:id", (req, res) => ok(res, storage.updateUser(+req.params.id, req.body)));

  /* ───── Jobs ───── */
  app.get("/api/jobs", (_r, res) => {
    const jobs = storage.getJobs().map(j => ({ ...j, score: scoreLead(j) }));
    ok(res, jobs);
  });
  app.get("/api/jobs/:id", (req, res) => {
    const job = storage.getJob(+req.params.id);
    if (!job) return res.status(404).json({ message: "not found" });
    ok(res, { ...job, score: scoreLead(job) });
  });
  app.post("/api/jobs", (req, res) => {
    const t = Date.now();
    const job = storage.createJob({
      flow: "SALES", stage: "New Lead",
      value: 0, contractValue: 0, leadScore: 0, createdAt: t, lastActivityAt: t,
      stageEnteredAt: t, ...req.body,
    });
    storage.addActivity({ jobId: job.id, type: "system", actor: "system", flow: job.flow, message: `Lead created: ${job.customer}` });
    storage.updateJob(job.id, { leadScore: scoreLead(job).total });
    evaluateAutomations();
    // Phase 1: auto-provision a Drive folder. Fire-and-forget — never block the
    // create response; failures are logged to integration_audit_log and the UI
    // surfaces a "Create Drive folder" retry button.
    const actorUserId = req.body?.repId ? Number(req.body.repId) : null;
    ensureOpportunityFolder(job.id, actorUserId).catch((e) => {
      console.warn(`[google] auto folder provision failed for job ${job.id}:`, e?.message || e);
    });
    ok(res, job);
  });
  app.patch("/api/jobs/:id", (req, res) => {
    const id = +req.params.id;
    const prev = storage.getJob(id);
    const body = { ...req.body };
    // stage change handling
    if (prev && body.stage && body.stage !== prev.stage) {
      body.stageEnteredAt = Date.now();
      body.lastActivityAt = Date.now();
      // shared-stage flow handoff
      if (body.stage === "Ready for Production") body.flow = "PRODUCTION", body.isActiveJob = true;
      if (body.stage === "Job Complete") body.flow = "BILLING", body.isActiveJob = true;
      if (body.stage === "Materials Ordered" || body.stage === "Job Scheduled" || body.stage === "Job In Progress" || body.stage === "Final Walkthrough") body.isActiveJob = true;
      // reset cadence on stage change (auto-pause / restart)
      storage.clearAutomationRunsForJob(id);
      storage.addActivity({ jobId: id, type: "stage_move", channel: "system", actor: body._actor || "system", flow: body.flow || prev.flow, message: `Moved to ${body.stage}` });
    }
    delete body._actor;
    const job = storage.updateJob(id, body);
    storage.updateJob(id, { leadScore: scoreLead(job).total });
    evaluateAutomations();
    ok(res, storage.getJob(id));
  });
  app.post("/api/jobs/:id/reply", (req, res) => {
    const id = +req.params.id;
    const job = storage.getJob(id);
    if (!job) return res.status(404).json({ message: "nf" });
    storage.updateJob(id, { lastReplyAt: Date.now(), lastActivityAt: Date.now() });
    storage.addActivity({ jobId: id, type: "comms", channel: req.body.channel || "sms", direction: "in", actor: job.customer, flow: job.flow, message: `Reply from ${job.customer}: "${req.body.message || "Got it, thanks"}"` });
    ok(res, storage.getJob(id));
  });
  // Update 7: Convert opportunity → route through Pre-Production after checklist
  app.post("/api/jobs/:id/convert", (req, res) => {
    const id = +req.params.id;
    const job = storage.getJob(id);
    if (!job) return res.status(404).json({ message: "nf" });
    const checklist = req.body.checklist || {};
    const upd: any = {
      stage: "Pre-Production",
      stageEnteredAt: Date.now(),
      lastActivityAt: Date.now(),
      preProductionChecklistJson: JSON.stringify(checklist),
    };
    if (req.body.bidType) upd.bidType = req.body.bidType;
    storage.clearAutomationRunsForJob(id);
    const updated = storage.updateJob(id, upd);
    storage.addActivity({ jobId: id, type: "stage_move", channel: "system", actor: req.body._actor || "system", flow: updated.flow, message: "Pre-Production checklist completed — moved to Pre-Production" });
    evaluateAutomations();
    ok(res, storage.getJob(id));
  });
  app.post("/api/jobs/:id/pause", (req, res) => {
    const id = +req.params.id;
    const job = storage.updateJob(id, { pauseFollowups: !!req.body.pause });
    storage.addActivity({ jobId: id, type: "system", actor: "system", flow: job.flow, message: req.body.pause ? "Follow-ups paused" : "Follow-ups resumed" });
    ok(res, job);
  });

  /* ───── Activities ───── */
  app.get("/api/activities", (_r, res) => ok(res, storage.getActivities()));
  app.get("/api/jobs/:id/activities", (req, res) => ok(res, storage.getJobActivities(+req.params.id)));
  app.get("/api/jobs/:id/outbox", (req, res) => ok(res, storage.getJobOutbox(+req.params.id)));

  /* ───── Price list ───── */
  app.get("/api/price-items", (_r, res) => ok(res, storage.getPriceItems()));
  app.post("/api/price-items", (req, res) => ok(res, storage.createPriceItem(req.body)));
  app.patch("/api/price-items/:id", (req, res) => ok(res, storage.updatePriceItem(+req.params.id, req.body, req.body._by || "Admin")));
  app.get("/api/price-history", (_r, res) => ok(res, storage.getPriceHistory()));
  app.get("/api/cost-codes", (_r, res) => ok(res, storage.getCostCodes()));

  /* ───── Estimates ───── */
  app.get("/api/estimates", (_r, res) => ok(res, storage.getEstimates()));
  app.get("/api/estimates/:id", (req, res) => {
    const est = storage.getEstimate(+req.params.id);
    if (!est) return res.status(404).json({ message: "not found" });
    ok(res, est);
  });
  app.get("/api/jobs/:id/estimate", (req, res) => ok(res, storage.getJobEstimate(+req.params.id) || null));
  app.post("/api/estimates", (req, res) => ok(res, storage.createEstimate(req.body)));
  app.patch("/api/estimates/:id", (req, res) => ok(res, storage.updateEstimate(+req.params.id, req.body)));
  app.post("/api/estimates/:id/send", (req, res) => {
    const est = storage.updateEstimate(+req.params.id, { status: "sent" });
    const job = storage.getJob(est.jobId)!;
    const upd: any = { estimateSentAt: Date.now(), value: req.body.total ?? job.value };
    if (job.flow === "SALES") upd.stage = "Estimate Sent", upd.stageEnteredAt = Date.now();
    storage.updateJob(est.jobId, upd);
    storage.clearAutomationRunsForJob(est.jobId);
    storage.addActivity({ jobId: est.jobId, type: "system", actor: "system", flow: job.flow, message: `Estimate sent: $${Math.round(req.body.total ?? job.value).toLocaleString()}` });
    evaluateAutomations();
    ok(res, est);
  });
  // acceptance bridge: create budget by cost code + advance pipeline
  app.post("/api/estimates/:id/accept", (req, res) => {
    const est = storage.updateEstimate(+req.params.id, { status: "accepted", acceptedAt: Date.now(), signature: req.body.signature || "Customer" });
    const job = storage.getJob(est.jobId)!;
    const total: number = req.body.total ?? est.totalPrice ?? job.value;
    // build budget by cost code. Prefer the V3 job-input model (Quick mode) when present,
    // else fall back to legacy section-based lines (Advanced mode).
    let byCode: Record<string, number> = {};
    let jiRaw = est.jobInputJson || "{}";
    let ji: any = {};
    try { ji = JSON.parse(jiRaw); } catch { ji = {}; }
    if (ji && typeof ji.squares === "number" && ji.squares > 0) {
      let ex: ProposalExtras = defaultExtras();
      try { ex = { ...ex, ...JSON.parse(est.extrasJson || "{}") }; } catch { /* keep default */ }
      byCode = budgetByCostCode(ji as JobInput, ex);
    } else {
      const sections = JSON.parse(est.sectionsJson || "[]");
      for (const sec of sections) for (const ln of sec.lines || []) {
        const c = ln.costCode || "700";
        byCode[c] = (byCode[c] || 0) + (ln.qty || 0) * (ln.unitCost || 0);
      }
    }
    storage.deleteJobBudgets(est.jobId);
    for (const [code, amt] of Object.entries(byCode)) storage.createBudget({ jobId: est.jobId, costCode: code, budgetCost: amt });
    // advance pipeline
    const upd: any = { stage: "Ready for Production", flow: "PRODUCTION", isActiveJob: true, stageEnteredAt: Date.now(), contractValue: total, value: total };
    storage.updateJob(est.jobId, upd);
    storage.clearAutomationRunsForJob(est.jobId);
    storage.addActivity({ jobId: est.jobId, type: "stage_move", actor: "system", flow: "PRODUCTION", message: `Estimate accepted ($${Math.round(total).toLocaleString()}) — budget created, moved to Ready for Production` });
    evaluateAutomations();
    ok(res, { estimate: est, job: storage.getJob(est.jobId) });
  });

  /* ───── Work Orders (Update 6) ───── */
  app.get("/api/jobs/:id/work-orders", (req, res) => ok(res, storage.getJobWorkOrders(+req.params.id)));
  app.get("/api/work-orders/:id", (req, res) => {
    const wo = storage.getWorkOrder(+req.params.id);
    if (!wo) return res.status(404).json({ message: "not found" });
    ok(res, wo);
  });
  app.post("/api/jobs/:id/work-orders", (req, res) => {
    const wo = storage.createWorkOrder({ jobId: +req.params.id, ...req.body });
    ok(res, wo);
  });
  app.patch("/api/work-orders/:id", (req, res) => ok(res, storage.updateWorkOrder(+req.params.id, req.body)));
  app.delete("/api/work-orders/:id", (req, res) => ok(res, storage.deleteWorkOrder(+req.params.id)));

  /* ───── Templates ───── */
  app.get("/api/templates", (_r, res) => ok(res, storage.getTemplates()));
  app.post("/api/templates", (req, res) => ok(res, storage.createTemplate(req.body)));
  app.patch("/api/templates/:id", (req, res) => ok(res, storage.updateTemplate(+req.params.id, req.body)));

  /* ───── Automations ───── */
  app.get("/api/automations", (_r, res) => ok(res, storage.getAutomations()));
  app.post("/api/automations", (req, res) => ok(res, storage.createAutomation(req.body)));
  app.patch("/api/automations/:id", (req, res) => ok(res, storage.updateAutomation(+req.params.id, req.body)));
  app.delete("/api/automations/:id", (req, res) => ok(res, storage.deleteAutomation(+req.params.id)));
  app.post("/api/automations/run", (_r, res) => { evaluateAutomations(); ok(res, { ran: true }); });

  /* ───── Outbox ───── */
  app.get("/api/outbox", (_r, res) => ok(res, storage.getOutbox()));

  /* ───── Financials ───── */
  app.get("/api/jobs/:id/financials", (req, res) => {
    const f = jobFinancials(+req.params.id);
    if (!f) return res.status(404).json({ message: "nf" });
    ok(res, f);
  });
  app.get("/api/wip", (_r, res) => ok(res, allWIP()));
  app.get("/api/flags", (_r, res) => ok(res, controllerFlags()));
  app.get("/api/commissions", (_r, res) => ok(res, commissionReport()));

  app.get("/api/budgets", (_r, res) => ok(res, storage.getBudgets()));
  app.patch("/api/budgets/:id", (req, res) => ok(res, storage.updateBudget(+req.params.id, req.body)));
  app.get("/api/costs", (_r, res) => ok(res, storage.getCosts()));
  app.post("/api/costs", (req, res) => ok(res, storage.createCost(req.body)));
  app.get("/api/commitments", (_r, res) => ok(res, storage.getCommitments()));
  app.post("/api/commitments", (req, res) => ok(res, storage.createCommitment(req.body)));
  app.get("/api/invoices", (_r, res) => ok(res, storage.getInvoices()));
  app.post("/api/invoices", (req, res) => {
    const inv = storage.createInvoice(req.body);
    const job = storage.getJob(inv.jobId);
    if (job && job.flow === "BILLING" && job.stage === "Job Complete") {
      storage.updateJob(inv.jobId, { stage: "Invoice Sent", stageEnteredAt: Date.now(), invoiceSentAt: Date.now() });
    }
    ok(res, inv);
  });
  app.patch("/api/invoices/:id", (req, res) => {
    const inv = storage.updateInvoice(+req.params.id, req.body);
    if (req.body.collected !== undefined) {
      const job = storage.getJob(inv.jobId);
      const all = storage.getJobInvoices(inv.jobId);
      const fullyPaid = all.every(i => i.collected >= i.amount);
      if (job && fullyPaid && job.flow === "BILLING") {
        storage.updateJob(inv.jobId, { stage: "Paid & Closed", stageEnteredAt: Date.now() });
        storage.addActivity({ jobId: inv.jobId, type: "payment", actor: "Billing", flow: "BILLING", message: "Paid in full — closed" });
      }
    }
    ok(res, inv);
  });
  app.get("/api/change-orders", (_r, res) => ok(res, storage.getChangeOrders()));
  app.post("/api/change-orders", (req, res) => ok(res, storage.createChangeOrder(req.body)));
  app.patch("/api/change-orders/:id", (req, res) => {
    const co = storage.updateChangeOrder(+req.params.id, req.body);
    if (req.body.status === "Approved") {
      const job = storage.getJob(co.jobId)!;
      const approved = storage.getJobChangeOrders(co.jobId).filter(c => c.status === "Approved").reduce((s, c) => s + c.amount, 0);
      storage.updateJob(co.jobId, { contractValue: (job.value || 0) + approved });
      storage.addActivity({ jobId: co.jobId, type: "system", actor: "system", flow: job.flow, message: `Change order approved: +$${Math.round(co.amount).toLocaleString()}` });
    }
    ok(res, co);
  });

  /* ───── Vendors ───── */
  app.get("/api/vendors", (_r, res) => ok(res, storage.getVendors()));
  app.patch("/api/vendors/:id", (req, res) => ok(res, storage.updateVendor(+req.params.id, req.body)));

  /* ───── Tasks ───── */
  app.get("/api/tasks", (_r, res) => ok(res, storage.getTasks()));
  app.get("/api/jobs/:id/tasks", (req, res) => ok(res, storage.getJobTasks(+req.params.id)));
  app.post("/api/tasks", (req, res) => ok(res, storage.createTask(req.body)));
  app.patch("/api/tasks/:id", (req, res) => ok(res, storage.updateTask(+req.params.id, req.body)));

  /* ───── Internal Messages (Team Feed) ───── */
  app.get("/api/jobs/:id/messages", (req, res) => ok(res, storage.getJobMessages(+req.params.id)));
  app.post("/api/jobs/:id/messages", (req, res) => {
    const jobId = +req.params.id;
    const { authorUserId, body, mentions } = req.body;
    const msg = storage.createMessage({
      jobId,
      authorUserId: +authorUserId,
      body: String(body || ""),
      mentions: JSON.stringify(Array.isArray(mentions) ? mentions : []),
    });
    ok(res, msg);
  });
  // mentions inbox: messages mentioning a user, annotated w/ read status + job/customer info
  app.get("/api/mentions", (req, res) => {
    const userId = +(req.query.userId as string);
    if (!userId) return ok(res, []);
    const msgs = storage.getMessagesMentioning(userId);
    const readIds = new Set(storage.getReadMessageIds(userId));
    const out = msgs.map((m) => {
      const job = m.jobId ? storage.getJob(m.jobId) : undefined;
      const author = storage.getUser(m.authorUserId);
      return {
        ...m,
        read: readIds.has(m.id),
        jobCustomer: job?.customer || null,
        authorName: author?.name || "Unknown",
      };
    });
    ok(res, out);
  });
  app.post("/api/mentions/read", (req, res) => {
    const { userId, messageIds } = req.body;
    storage.markMentionsRead(+userId, Array.isArray(messageIds) ? messageIds.map(Number) : []);
    ok(res, { ok: true });
  });

  /* ───── Sales Leaderboards (Dashboard) ───── */
  // Ranks reps by contract $ of SOLD work (accepted estimates) across four periods:
  // This Week, This Month, Quarter-to-Date, This Year. Attribution = job.repId.
  app.get("/api/leaderboard", (_r, res) => {
    const now = Date.now();
    const d = new Date(now);
    const startOfWeek = (() => { const x = new Date(d); const day = x.getDay(); const diff = (day + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - diff); return x.getTime(); })();
    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const startOfQuarter = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime();
    const startOfYear = new Date(d.getFullYear(), 0, 1).getTime();

    const users = storage.getUsers();
    const repName = (id: number | null | undefined) => users.find(u => u.id === id)?.name || "Unassigned";
    const estimates = storage.getEstimates().filter(e => e.status === "accepted" && e.acceptedAt);
    const jobs = storage.getJobs();
    const jobById = (id: number) => jobs.find(j => j.id === id);

    const build = (since: number) => {
      const tally: Record<string, number> = {};
      for (const e of estimates) {
        if ((e.acceptedAt || 0) < since) continue;
        const job = jobById(e.jobId);
        if (!job) continue;
        const name = repName(job.repId);
        const amount = e.totalPrice || job.contractValue || job.value || 0;
        tally[name] = (tally[name] || 0) + amount;
      }
      return Object.entries(tally)
        .map(([rep, contract]) => ({ rep, contract: Math.round(contract * 100) / 100 }))
        .sort((a, b) => b.contract - a.contract);
    };

    ok(res, {
      week: build(startOfWeek),
      month: build(startOfMonth),
      qtd: build(startOfQuarter),
      year: build(startOfYear),
    });
  });

  /* ───── Material Returns (Update 7) ───── */
  const returnWithLines = (id: number) => {
    const r = storage.getMaterialReturn(id);
    return r ? { ...r, lines: storage.getReturnLines(id) } : null;
  };
  const recomputeReturn = (id: number) => {
    const lines = storage.getReturnLines(id);
    const total = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitRate || 0), 0);
    const vendorIds = Array.from(new Set(lines.map((l) => l.vendorId).filter((v): v is number => v != null)));
    const allToVendor = lines.length > 0 && lines.every((l) => l.vendorId != null);
    const vendorId = vendorIds.length === 1 ? vendorIds[0] : null;
    return { total, allToVendor, vendorId };
  };
  app.get("/api/material-returns", (_r, res) => ok(res, storage.getMaterialReturns().map((r) => ({ ...r, lines: storage.getReturnLines(r.id) }))));
  app.get("/api/material-returns/:id", (req, res) => {
    const r = returnWithLines(+req.params.id);
    if (!r) return res.status(404).json({ message: "not found" });
    ok(res, r);
  });
  app.post("/api/material-returns", (req, res) => {
    const { lines = [], ...body } = req.body;
    const created = storage.createMaterialReturn({
      status: "Pending", submittedAt: Date.now(), ...body,
    });
    storage.replaceReturnLines(created.id, lines.map((l: any) => ({
      itemId: l.itemId ?? null, itemName: l.itemName || "", vendorId: l.vendorId ?? null,
      qty: Number(l.qty) || 0, unit: l.unit || "EA", unitRate: Number(l.unitRate) || 0,
      lineValue: (Number(l.qty) || 0) * (Number(l.unitRate) || 0), category: l.category ?? null,
    })));
    const { total, allToVendor, vendorId } = recomputeReturn(created.id);
    const patch: any = { totalReturnValue: total, vendorId };
    if (allToVendor) { patch.status = "Approved"; patch.approvedBy = "system"; patch.approvedAt = Date.now(); }
    storage.updateMaterialReturn(created.id, patch);
    ok(res, returnWithLines(created.id));
  });
  app.patch("/api/material-returns/:id", (req, res) => {
    const id = +req.params.id;
    const { lines, ...body } = req.body;
    if (Array.isArray(lines)) {
      storage.replaceReturnLines(id, lines.map((l: any) => ({
        itemId: l.itemId ?? null, itemName: l.itemName || "", vendorId: l.vendorId ?? null,
        qty: Number(l.qty) || 0, unit: l.unit || "EA", unitRate: Number(l.unitRate) || 0,
        lineValue: (Number(l.qty) || 0) * (Number(l.unitRate) || 0), category: l.category ?? null,
      })));
      const { total, vendorId } = recomputeReturn(id);
      body.totalReturnValue = total; body.vendorId = vendorId;
    }
    storage.updateMaterialReturn(id, body);
    ok(res, returnWithLines(id));
  });
  app.post("/api/material-returns/:id/approve", (req, res) => {
    const id = +req.params.id;
    storage.updateMaterialReturn(id, { status: "Approved", approvedBy: req.body.by || "Admin", approvedAt: Date.now() });
    ok(res, returnWithLines(id));
  });
  app.post("/api/material-returns/:id/reject", (req, res) => {
    const id = +req.params.id;
    storage.updateMaterialReturn(id, { status: "Rejected", approvedBy: req.body.by || "Admin", approvedAt: Date.now() });
    ok(res, returnWithLines(id));
  });
  app.delete("/api/material-returns/:id", (req, res) => ok(res, storage.deleteMaterialReturn(+req.params.id)));

  /* ───── Issues (Update 7) ───── */
  app.get("/api/issues", (_r, res) => ok(res, storage.getIssues()));
  app.get("/api/jobs/:id/issues", (req, res) => ok(res, storage.getIssues().filter((i) => i.jobId === +req.params.id)));
  app.post("/api/issues", (req, res) => ok(res, storage.createIssue(req.body)));
  app.patch("/api/issues/:id", (req, res) => ok(res, storage.updateIssue(+req.params.id, req.body)));
  app.delete("/api/issues/:id", (req, res) => ok(res, storage.deleteIssue(+req.params.id)));

  /* ───── Settings ───── */
  app.get("/api/settings", (_r, res) => ok(res, storage.getSettings()));
  app.patch("/api/settings", (req, res) => { const s = storage.updateSettings(req.body); recomputeAllScores(); ok(res, s); });

  return httpServer;
}
