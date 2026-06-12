import { storage } from "./storage";
import { jobFinancials } from "./engine";
import type { Job, Automation } from "@shared/schema";

const DAY = 86400000;

function renderMerge(text: string, job: Job): string {
  const settings = storage.getSettings();
  const est = storage.getJobEstimate(job.id);
  const rep = job.repId ? storage.getUser(job.repId) : null;
  const estTotal = est ? `$${Math.round(job.value).toLocaleString()}` : `$${Math.round(job.value).toLocaleString()}`;
  const map: Record<string, string> = {
    first_name: (job.customer || "").split(" ")[0],
    customer: job.customer || "",
    address: job.address || "",
    estimate_total: estTotal,
    rep_name: rep?.name || "your rep",
    booking_link: "https://book.impactext.com/" + job.id,
    company: settings?.companyName || "Impact Exteriors",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? `{{${k}}}`);
}

function alreadyFired(automationId: number, jobId: number, stage?: string): boolean {
  const runs = storage.getAutomationRuns();
  return runs.some(r => r.automationId === automationId && r.jobId === jobId && (stage === undefined || r.stageAtFire === stage));
}

function fireAction(a: Automation, job: Job) {
  const tpl = a.templateId ? storage.getTemplate(a.templateId) : null;
  if (a.actionType === "send_sms" || a.actionType === "send_email") {
    const channel = a.actionType === "send_sms" ? "sms" : "email";
    const body = tpl ? renderMerge(tpl.body, job) : `[${a.name}]`;
    const subject = tpl?.subject ? renderMerge(tpl.subject, job) : null;
    storage.addOutbox({ jobId: job.id, channel, to: channel === "sms" ? job.phone : job.email, subject, body, status: "Sent", automationId: a.id });
    storage.addActivity({ jobId: job.id, type: "comms", channel, direction: "out", actor: "system", flow: job.flow, message: `Auto ${channel.toUpperCase()} sent — ${a.name}` });
    storage.updateJob(job.id, { lastActivityAt: Date.now() });
  } else if (a.actionType === "create_task") {
    storage.createTask({ jobId: job.id, title: `${a.name} — ${job.customer}`, assigneeId: job.repId, dueAt: Date.now() + DAY, done: false, type: "task" });
    storage.addActivity({ jobId: job.id, type: "task", channel: "system", actor: "system", flow: job.flow, message: `Auto task created — ${a.name}` });
  } else if (a.actionType === "notify") {
    storage.addActivity({ jobId: job.id, type: "system", channel: "system", actor: "system", flow: job.flow, message: `Notification: ${a.name}` });
  } else if (a.actionType === "move_rehash") {
    storage.updateJob(job.id, { stage: "Lead Rehash", stageEnteredAt: Date.now() });
    storage.addActivity({ jobId: job.id, type: "stage_move", channel: "system", actor: "system", flow: job.flow, message: `Auto-moved to Lead Rehash — ${a.name}` });
  }
  storage.addAutomationRun({ automationId: a.id, jobId: job.id, stageAtFire: job.stage });
}

export function evaluateAutomations() {
  const automations = storage.getAutomations().filter(a => a.active);
  const jobs = storage.getJobs();
  const nowTs = Date.now();

  for (const job of jobs) {
    if (job.pauseFollowups) continue;
    // auto-pause: if a reply came after entering the stage, skip new sends for this stage
    const repliedThisStage = job.lastReplyAt && job.lastReplyAt > job.stageEnteredAt;

    for (const a of automations) {
      if (a.flow !== job.flow) continue;
      let due = false, stageKey: string | undefined;

      if (a.triggerType === "stage_entered" && a.triggerStage === job.stage) {
        due = nowTs - job.stageEnteredAt >= (a.delayMinutes || 0) * 60000;
        stageKey = job.stage;
        if (repliedThisStage) due = false;
      } else if (a.triggerType === "inactivity" && a.triggerStage === job.stage) {
        const ref = Math.max(job.stageEnteredAt, job.lastActivityAt);
        due = nowTs - ref >= (a.delayDays || 0) * DAY;
        stageKey = job.stage;
        if (repliedThisStage) due = false;
      } else if (a.triggerType === "estimate_sent" && job.estimateSentAt) {
        due = nowTs - job.estimateSentAt >= (a.delayDays || 0) * DAY;
        if (repliedThisStage) due = false;
      } else if (a.triggerType === "invoice_unpaid") {
        const invs = storage.getJobInvoices(job.id);
        const openInv = invs.find(i => i.amount - i.collected > 0);
        if (openInv) due = nowTs - openInv.issuedAt >= (a.delayDays || 0) * DAY;
      }

      if (due && !alreadyFired(a.id, job.id, stageKey)) {
        fireAction(a, job);
      }
    }
  }
}

let timer: NodeJS.Timeout | null = null;
export function startScheduler() {
  if (timer) return;
  evaluateAutomations();
  timer = setInterval(() => {
    try { evaluateAutomations(); } catch (e) { console.error("[scheduler]", e); }
  }, 30000);
  console.log("[scheduler] started (30s interval)");
}
