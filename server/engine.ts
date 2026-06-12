import { storage } from "./storage";
import { STAGE_PROBABILITY } from "@shared/schema";
import type { Job } from "@shared/schema";

const DAY = 86400000;
export const daysIn = (ts: number) => (Date.now() - ts) / DAY;

/* ───────── Lead scoring: transparent rule-based 0-100 ───────── */
export function scoreLead(job: Job) {
  const breakdown: { label: string; points: number; detail: string }[] = [];

  // job value (max 30): $0 → 0, $30k+ → 30
  const vPts = Math.round(Math.min(30, (job.value / 30000) * 30));
  breakdown.push({ label: "Job Value", points: vPts, detail: `$${Math.round(job.value).toLocaleString()}` });

  // source quality (max 20)
  const sourceScore: Record<string, number> = {
    Referral: 20, Insurance: 18, Storm: 16, Google: 12, Website: 10, "Door Knock": 8,
  };
  const sPts = sourceScore[job.source || ""] ?? 6;
  breakdown.push({ label: "Source Quality", points: sPts, detail: job.source || "Unknown" });

  // engagement recency (max 20): replied recently scores high
  let ePts = 4;
  if (job.lastReplyAt) {
    const d = daysIn(job.lastReplyAt);
    ePts = d < 2 ? 20 : d < 5 ? 14 : d < 10 ? 8 : 4;
    breakdown.push({ label: "Engagement", points: ePts, detail: `replied ${Math.round(d)}d ago` });
  } else {
    breakdown.push({ label: "Engagement", points: ePts, detail: "no reply yet" });
  }

  // days-in-stage velocity (max 15): faster than SLA = better
  const settings = storage.getSettings();
  const slas: Record<string, number> = settings ? JSON.parse(settings.slasJson || "{}") : {};
  const sla = slas[job.stage] ?? 5;
  const dStage = daysIn(job.stageEnteredAt);
  let velPts = 15;
  if (dStage > sla * 2) velPts = 3;
  else if (dStage > sla) velPts = 8;
  breakdown.push({ label: "Stage Velocity", points: velPts, detail: `${dStage.toFixed(1)}d / ${sla}d SLA` });

  // insurance approved bonus (max 15)
  const iPts = job.insuranceApproved ? 15 : 0;
  breakdown.push({ label: "Insurance Bonus", points: iPts, detail: job.insuranceApproved ? "approved" : "n/a" });

  const total = Math.max(0, Math.min(100, breakdown.reduce((s, b) => s + b.points, 0)));
  return { total, breakdown };
}

export function recomputeAllScores() {
  for (const j of storage.getJobs()) {
    const s = scoreLead(j).total;
    if (s !== j.leadScore) storage.updateJob(j.id, { leadScore: s });
  }
}

/* ───────── WIP / financial engine (ported from controller workbook) ───────── */
export function jobFinancials(jobId: number) {
  const job = storage.getJob(jobId);
  if (!job) return null;
  const budgets = storage.getJobBudgets(jobId);
  const commitments = storage.getJobCommitments(jobId);
  const costs = storage.getJobCosts(jobId);
  const invoices = storage.getJobInvoices(jobId);
  const cos = storage.getJobChangeOrders(jobId);

  const budgetCost = budgets.reduce((s, b) => s + b.budgetCost, 0);
  const costToDate = costs.reduce((s, c) => s + c.amount, 0);
  const openCommitted = commitments.reduce((s, c) => s + Math.max(0, c.committed - c.invoiced), 0);
  const estCostAtCompletion = Math.max(budgetCost, costToDate + openCommitted);

  const approvedCO = cos.filter(c => c.status === "Approved");
  const coRevenue = approvedCO.reduce((s, c) => s + c.amount, 0);
  const contractValue = (job.contractValue || job.value) + coRevenue;

  const pctComplete = estCostAtCompletion > 0 ? Math.min(1, costToDate / estCostAtCompletion) : 0;
  const earnedRevenue = pctComplete * contractValue;
  const billed = invoices.reduce((s, i) => s + i.amount, 0);
  const collected = invoices.reduce((s, i) => s + i.collected, 0);
  const retainage = invoices.reduce((s, i) => s + i.retainage, 0);
  const overUnderBilled = billed - earnedRevenue; // + over, - under
  const projectedProfit = contractValue - estCostAtCompletion;
  const projMargin = contractValue > 0 ? (projectedProfit / contractValue) * 100 : 0;
  const balanceDue = billed - collected;

  // budget vs actual by cost code
  const codes = new Set<string>([...budgets.map(b => b.costCode), ...costs.map(c => c.costCode || "—")]);
  const byCode = Array.from(codes).map(code => {
    const b = budgets.filter(x => x.costCode === code).reduce((s, x) => s + x.budgetCost, 0);
    const a = costs.filter(x => (x.costCode || "—") === code).reduce((s, x) => s + x.amount, 0);
    return { code, budget: b, actual: a, variance: b - a };
  }).sort((x, y) => x.code.localeCompare(y.code));

  return {
    job, budgetCost, costToDate, openCommitted, estCostAtCompletion,
    contractValue, coRevenue, pctComplete, earnedRevenue, billed, collected,
    retainage, overUnderBilled, projectedProfit, projMargin, balanceDue,
    byCode, commitments, costs, invoices, changeOrders: cos, budgets,
  };
}

export function allWIP() {
  return storage.getJobs()
    .filter(j => j.isActiveJob)
    .map(j => jobFinancials(j.id))
    .filter(Boolean);
}

/* ───────── Controller flags (12 checks) ───────── */
export function controllerFlags() {
  const jobs = storage.getJobs();
  const jobIds = new Set(jobs.map(j => j.id));
  const costs = storage.getCosts();
  const commitments = storage.getCommitments();
  const invoices = storage.getInvoices();
  const vendors = storage.getVendors();
  const validCodes = new Set(storage.getCostCodes().map(c => c.code));

  const flags: { key: string; label: string; count: number; severity: string; refs: any[]; type: string }[] = [];
  const add = (key: string, label: string, severity: string, refs: any[], type: string) =>
    flags.push({ key, label, count: refs.length, severity, refs, type });

  add("cost_no_job", "Costs without a job", "high",
    costs.filter(c => !c.jobId).map(c => ({ id: c.id, label: `${c.vendor || "?"} — $${c.amount} (${c.description})` })), "cost");
  add("cost_no_code", "Costs without a cost code", "med",
    costs.filter(c => !c.costCode).map(c => ({ id: c.id, label: `${c.vendor || "?"} — $${c.amount}` })), "cost");
  add("unknown_job", "Costs with unknown job id", "high",
    costs.filter(c => c.jobId && !jobIds.has(c.jobId)).map(c => ({ id: c.id, label: `job #${c.jobId} — $${c.amount}` })), "cost");

  const overBudget: any[] = [], negProfit: any[] = [], overBilled: any[] = [], underBilled: any[] = [];
  for (const j of jobs.filter(x => x.isActiveJob)) {
    const f = jobFinancials(j.id)!;
    if (f.costToDate > f.budgetCost && f.budgetCost > 0) overBudget.push({ id: j.id, jobId: j.id, label: `${j.customer} — cost $${Math.round(f.costToDate).toLocaleString()} > budget $${Math.round(f.budgetCost).toLocaleString()}` });
    if (f.projectedProfit < 0) negProfit.push({ id: j.id, jobId: j.id, label: `${j.customer} — proj profit $${Math.round(f.projectedProfit).toLocaleString()}` });
    if (f.overUnderBilled > 1000) overBilled.push({ id: j.id, jobId: j.id, label: `${j.customer} — over $${Math.round(f.overUnderBilled).toLocaleString()}` });
    if (f.overUnderBilled < -1000) underBilled.push({ id: j.id, jobId: j.id, label: `${j.customer} — under $${Math.round(-f.overUnderBilled).toLocaleString()}` });
  }
  add("over_budget", "Jobs over budget", "high", overBudget, "job");
  add("neg_profit", "Negative projected profit", "high", negProfit, "job");
  add("overbilled", "Overbilled jobs", "med", overBilled, "job");
  add("underbilled", "Underbilled jobs", "med", underBilled, "job");

  add("sub_over", "Subs over-invoiced vs committed", "high",
    commitments.filter(c => c.invoiced > c.committed).map(c => ({ id: c.id, label: `${c.vendorName} — inv $${Math.round(c.invoiced).toLocaleString()} > committed $${Math.round(c.committed).toLocaleString()}` })), "commitment");

  const soon = Date.now() + 30 * 86400000;
  add("ins_expired", "Vendor insurance expired", "high",
    vendors.filter(v => v.insuranceExpiry && v.insuranceExpiry < Date.now()).map(v => ({ id: v.id, label: `${v.name} (${v.trade})` })), "vendor");
  add("ins_expiring", "Vendor insurance expiring <30d", "med",
    vendors.filter(v => v.insuranceExpiry && v.insuranceExpiry >= Date.now() && v.insuranceExpiry < soon).map(v => ({ id: v.id, label: `${v.name} (${v.trade})` })), "vendor");

  // paid subs missing W9: vendor that is 1099 and has paid commitments but no W9
  const paidVendorNames = new Set(commitments.filter(c => c.paid > 0).map(c => c.vendorName));
  add("missing_w9", "Paid subs missing W9", "high",
    vendors.filter(v => v.is1099 && !v.hasW9 && paidVendorNames.has(v.name)).map(v => ({ id: v.id, label: `${v.name} (${v.trade})` })), "vendor");

  add("ar_past_due", "A/R past due >30d", "high",
    invoices.filter(i => (i.amount - i.collected) > 0 && (Date.now() - i.issuedAt) > 30 * 86400000)
      .map(i => { const j = jobs.find(x => x.id === i.jobId); return { id: i.id, jobId: i.jobId, label: `${j?.customer || "?"} — ${i.number} bal $${Math.round(i.amount - i.collected).toLocaleString()}` }; }), "invoice");

  return flags;
}

/* ───────── Commission report ───────── */
export function commissionReport() {
  const users = storage.getUsers();
  const jobs = storage.getJobs();
  return jobs.filter(j => j.repId).map(j => {
    const rep = users.find(u => u.id === j.repId);
    if (!rep || !rep.commissionType) return null;
    const f = jobFinancials(j.id);
    const gp = f ? f.projectedProfit : (j.value * 0.4);
    const cv = j.contractValue || j.value;
    const base = rep.commissionType === "gross_profit" ? gp : cv;
    const commission = base * (rep.commissionRate || 0) / 100;
    const stageOrder = ["Deposit Invoiced", "Ready for Production", "Job Complete", "Invoice Sent", "Paid & Closed"];
    const earned = rep.commissionTrigger === "Paid & Closed"
      ? j.stage === "Paid & Closed"
      : stageOrder.includes(j.stage);
    return { jobId: j.id, customer: j.customer, rep: rep.name, type: rep.commissionType, rate: rep.commissionRate, base, commission, earned, stage: j.stage };
  }).filter(Boolean);
}
