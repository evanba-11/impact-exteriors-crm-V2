/**
 * QuickBooks Online integration routes (Phase 2). Server-only.
 *
 * RBAC follows the same `x-user-id` header → users.role pattern Phase 1 established.
 * The spec's permission matrix uses logical roles (Admin / Finance / Salesperson /
 * Superintendent); this CRM's actual roles are Admin / Manager / Sales Rep /
 * Production / Billing / Sub. Mapping used here:
 *   Admin        → Admin
 *   Finance      → Billing (+ Manager, who acts as office/finance staff)
 *   Salesperson  → Sales Rep
 *   Superintendent → Production
 *
 * Every external QBO call is audited inside lib/qbo/client.ts; route-level guards
 * only add audit rows for non-API actions (oauth start/callback, disconnect).
 */
import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { storage } from "../storage";
import { getSecret } from "../lib/secrets";
import {
  buildAuthorizeUrl, exchangeCodeForTokens, persistTokens, revokeToken, getValidAccessToken,
} from "../lib/qbo/auth";
import { decryptToken } from "../lib/qbo/crypto";
import { qboQuery } from "../lib/qbo/client";
import { upsertCustomerForOpportunity } from "../lib/qbo/customers";
import { pushEstimate } from "../lib/qbo/estimates";
import { pushInvoice, pullInvoiceState } from "../lib/qbo/invoices";
import { pullPaymentsForInvoice } from "../lib/qbo/payments";
import { verifySignature, processPayload } from "../lib/qbo/webhooks";
import { runSyncQueue } from "../lib/qbo/queue";

/* ── Role sets (mapped from the spec matrix to this CRM's roles) ── */
const CONNECT_ROLES = ["Admin"];                                   // connect/disconnect, global resync
const VIEW_ROLES = ["Admin", "Manager", "Sales Rep", "Production", "Billing", "Sub"]; // view accounting
const PUSH_ESTIMATE_ROLES = ["Admin", "Manager", "Billing", "Sales Rep"]; // not Production (Superintendent)
const INVOICE_ROLES = ["Admin", "Manager", "Billing"];            // create invoice, manual one-off resync

function actingUser(req: Request) {
  const headerId = req.header("x-user-id");
  const id = headerId ? Number(headerId) : (req.body?._actorUserId ? Number(req.body._actorUserId) : NaN);
  if (!Number.isFinite(id)) return null;
  return storage.getUser(id) || null;
}

function requireRole(req: Request, res: Response, allowed: string[]) {
  const user = actingUser(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized: missing or unknown user (set x-user-id)" });
    return null;
  }
  if (!allowed.includes(user.role)) {
    res.status(403).json({ message: `Forbidden: role ${user.role} not permitted` });
    return null;
  }
  return user;
}

/** Accounting snapshot for an opportunity (customer/estimate/invoice/payments). */
function snapshot(opportunityId: number) {
  const job = storage.getJob(opportunityId);
  if (!job) return null;
  const est = storage.getJobEstimate(opportunityId);
  const customerMap = storage.getMapByCrm("customer", opportunityId);
  const env = (process.env.QBO_ENVIRONMENT || "production");
  const appHost = env === "sandbox" ? "https://app.sandbox.qbo.intuit.com" : "https://app.qbo.intuit.com";
  const link = (entity: string, id?: string | null) =>
    id ? `${appHost}/app/${entity}?txnId=${id}` : null;
  return {
    opportunityId,
    customer: job.qboCustomerId
      ? { qboId: job.qboCustomerId, name: job.customer, url: `${appHost}/app/customerdetail?nameId=${job.qboCustomerId}` }
      : null,
    estimate: job.qboEstimateId
      ? { qboId: job.qboEstimateId, docNumber: job.qboEstimateDocNumber, url: link("estimate", job.qboEstimateId) }
      : (est ? { crmEstimateId: est.id, total: est.totalPrice, pushed: false } : null),
    crmEstimateId: est?.id ?? null,
    invoice: job.qboInvoiceId
      ? {
          qboId: job.qboInvoiceId, docNumber: job.qboInvoiceDocNumber,
          total: job.qboInvoiceTotal, balance: job.qboInvoiceBalance,
          status: job.qboInvoiceStatus, url: link("invoice", job.qboInvoiceId),
        }
      : null,
    payments: storage.getJobPayments(opportunityId),
    lastSyncedAt: job.qboLastSyncedAt ?? null,
  };
}

export function registerQboRoutes(app: Express) {
  /* ───── Status ───── */
  app.get("/api/integrations/qbo/status", async (req, res) => {
    const user = requireRole(req, res, VIEW_ROLES);
    if (!user) return;
    const conn = storage.getConnection("qbo");
    res.json({
      connected: conn?.status === "active",
      status: conn?.status || "disconnected",
      realmId: conn?.realmId || null,
      connectedAt: conn?.connectedAt || null,
      lastRefreshedAt: conn?.lastRefreshedAt || null,
      tokenExpiresAt: conn?.tokenExpiresAt || null,
      lastError: conn?.lastError || null,
      environment: (await getSecret("qboEnvironment")) || "production",
    });
  });

  /* ───── OAuth start (Admin only) ───── */
  app.get("/api/integrations/qbo/oauth/start", async (req, res) => {
    const user = requireRole(req, res, CONNECT_ROLES);
    if (!user) return;
    try {
      const state = crypto.randomBytes(16).toString("hex");
      // Stash the nonce + actor on the connection row (created if needed) for callback validation.
      storage.upsertConnection("qbo", { lastError: `oauth_state:${state}:${user.id}` });
      const url = await buildAuthorizeUrl(state);
      storage.addAuditLog({ actorUserId: user.id, integration: "qbo", action: "oauth_start", status: "ok" });
      res.json({ url });
    } catch (e: any) {
      res.status(500).json({ message: `Could not start QBO OAuth: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── OAuth callback (public per Intuit; validates state nonce) ───── */
  app.get("/api/integrations/qbo/oauth/callback", async (req, res) => {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const realmId = String(req.query.realmId || req.query.realmid || "");
    const conn = storage.getConnection("qbo");
    const stash = conn?.lastError || "";
    const [, savedState, savedUser] = stash.startsWith("oauth_state:") ? stash.split(":") : [];

    if (!code || !state || !realmId) {
      return res.status(400).send("Missing code/state/realmId");
    }
    if (!savedState || savedState !== state) {
      storage.addAuditLog({ integration: "qbo", action: "oauth_callback", status: "error", error: "state mismatch" });
      return res.status(400).send("OAuth state mismatch — please retry the connection.");
    }
    try {
      const tokens = await exchangeCodeForTokens(code);
      await persistTokens(tokens, { realmId, connectedByUserId: savedUser ? Number(savedUser) : null });
      storage.addAuditLog({
        actorUserId: savedUser ? Number(savedUser) : null, integration: "qbo",
        action: "oauth_callback", response: { realmId }, status: "ok",
      });
      // Redirect back to the Settings → Integrations tab (hash router).
      res.redirect("/#/settings?qbo=connected");
    } catch (e: any) {
      storage.upsertConnection("qbo", { status: "error", lastError: e?.message || String(e) });
      storage.addAuditLog({ integration: "qbo", action: "oauth_callback", status: "error", error: e?.message || String(e) });
      res.status(502).send(`QBO connection failed: ${e?.message || "unknown error"}`);
    }
  });

  /* ───── Disconnect (Admin only) ───── */
  app.post("/api/integrations/qbo/disconnect", async (req, res) => {
    const user = requireRole(req, res, CONNECT_ROLES);
    if (!user) return;
    const conn = storage.getConnection("qbo");
    try {
      if (conn?.refreshToken) {
        const rt = await decryptToken(conn.refreshToken);
        if (rt) await revokeToken(rt);
      }
    } catch { /* best-effort */ }
    storage.upsertConnection("qbo", {
      status: "disconnected", accessToken: null, refreshToken: null,
      tokenExpiresAt: null, lastError: null,
    });
    storage.addAuditLog({ actorUserId: user.id, integration: "qbo", action: "disconnect", status: "ok" });
    res.json({ ok: true });
  });

  /* ───── Snapshot for opportunity (view) ───── */
  app.get("/api/integrations/qbo/opportunity/:id/snapshot", (req, res) => {
    const user = requireRole(req, res, VIEW_ROLES);
    if (!user) return;
    const snap = snapshot(Number(req.params.id));
    if (!snap) return res.status(404).json({ message: "Opportunity not found" });
    res.json(snap);
  });

  /* ───── Manual resync one opportunity (Admin/Finance) ───── */
  app.post("/api/integrations/qbo/sync/opportunity/:id", async (req, res) => {
    const user = requireRole(req, res, INVOICE_ROLES);
    if (!user) return;
    const opportunityId = Number(req.params.id);
    const job = storage.getJob(opportunityId);
    if (!job) return res.status(404).json({ message: "Opportunity not found" });
    try {
      await upsertCustomerForOpportunity(opportunityId, user.id);
      if (job.qboInvoiceId) {
        await pullInvoiceState(job.qboInvoiceId, user.id);
        await pullPaymentsForInvoice(job.qboInvoiceId, user.id);
      }
      res.json({ ok: true, snapshot: snapshot(opportunityId) });
    } catch (e: any) {
      res.status(502).json({ message: `Resync failed: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Global resync (Admin only) — enqueues all opportunities ───── */
  app.post("/api/integrations/qbo/sync/all", (req, res) => {
    const user = requireRole(req, res, CONNECT_ROLES);
    if (!user) return;
    const jobs = storage.getJobs();
    let enqueued = 0;
    for (const j of jobs) {
      storage.enqueueSync({ entityType: "opportunity", entityId: j.id, direction: "push" });
      enqueued++;
    }
    storage.addAuditLog({ actorUserId: user.id, integration: "qbo", action: "sync_all", response: { enqueued }, status: "ok" });
    res.json({ ok: true, enqueued });
  });

  /* ───── Push a finalized estimate (Admin/Finance/Salesperson) ───── */
  app.post("/api/integrations/qbo/estimate/:estimateId/push", async (req, res) => {
    const user = requireRole(req, res, PUSH_ESTIMATE_ROLES);
    if (!user) return;
    const estimateId = Number(req.params.estimateId);
    if (!storage.getEstimate(estimateId)) return res.status(404).json({ message: "Estimate not found" });
    try {
      const out = await pushEstimate(estimateId, user.id);
      res.json(out);
    } catch (e: any) {
      res.status(502).json({ message: `Push to QBO failed: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Create invoice from estimate (Admin/Finance) ───── */
  app.post("/api/integrations/qbo/invoice/from-estimate/:estimateId", async (req, res) => {
    const user = requireRole(req, res, INVOICE_ROLES);
    if (!user) return;
    const estimateId = Number(req.params.estimateId);
    if (!storage.getEstimate(estimateId)) return res.status(404).json({ message: "Estimate not found" });
    try {
      const out = await pushInvoice(estimateId, user.id);
      res.json(out);
    } catch (e: any) {
      res.status(502).json({ message: `Invoice creation failed: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Sync issues (Admin/Finance) + retry ───── */
  app.get("/api/integrations/qbo/sync/issues", (req, res) => {
    const user = requireRole(req, res, INVOICE_ROLES);
    if (!user) return;
    res.json(storage.failedSyncQueue(Number(req.query.limit) || 100));
  });
  app.post("/api/integrations/qbo/sync/issues/:id/retry", async (req, res) => {
    const user = requireRole(req, res, INVOICE_ROLES);
    if (!user) return;
    const id = Number(req.params.id);
    storage.updateSyncQueue(id, { status: "pending", nextAttemptAt: Date.now(), lastError: null });
    const result = await runSyncQueue();
    res.json({ ok: true, result });
  });

  /* ───── Webhook receiver (public; verify signature BEFORE processing) ───── */
  app.post("/api/integrations/qbo/webhook", async (req, res) => {
    const raw: Buffer | string = (req as any).rawBody || JSON.stringify(req.body || {});
    const signature = req.header("intuit-signature");
    const verified = await verifySignature(raw, signature);

    let payload: any = {};
    try { payload = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString("utf8")); }
    catch { payload = req.body || {}; }

    const realmId = payload?.eventNotifications?.[0]?.realmId || null;
    const event = storage.addWebhookEvent({
      eventId: req.header("intuit-notification-id") || null,
      realmId, rawPayload: typeof raw === "string" ? raw : raw.toString("utf8"),
      signatureVerified: verified,
    });

    if (!verified) {
      storage.addAuditLog({ integration: "qbo", action: "webhook_rejected", status: "error", error: "bad signature" });
      // Acknowledge to stop Intuit retries, but do NOT process.
      return res.status(401).json({ message: "invalid signature" });
    }

    // Acknowledge immediately; process asynchronously so Intuit doesn't time out.
    res.status(200).json({ ok: true });
    try {
      const { errors } = await processPayload(payload);
      storage.markWebhookProcessed(event.id, errors.length ? errors.join("; ") : null);
      storage.addAuditLog({
        integration: "qbo", action: "webhook_processed",
        response: { eventId: event.id, errors: errors.length }, status: errors.length ? "error" : "ok",
        error: errors.length ? errors.join("; ") : null,
      });
    } catch (e: any) {
      storage.markWebhookProcessed(event.id, e?.message || String(e));
    }
  });

  /* ───── Manual queue tick (Admin) — useful without a cron ───── */
  app.post("/api/integrations/qbo/queue/run", async (req, res) => {
    const user = requireRole(req, res, CONNECT_ROLES);
    if (!user) return;
    const result = await runSyncQueue(Number(req.body?.limit) || 25);
    res.json(result);
  });

  /* ───── Connection health probe (Admin) — verifies token by a cheap query ───── */
  app.get("/api/integrations/qbo/health", async (req, res) => {
    const user = requireRole(req, res, CONNECT_ROLES);
    if (!user) return;
    try {
      await getValidAccessToken();
      const info = await qboQuery<{ QueryResponse: any }>(
        "SELECT * FROM CompanyInfo", { action: "company_info", actorUserId: user.id },
      );
      const name = info?.QueryResponse?.CompanyInfo?.[0]?.CompanyName || null;
      res.json({ ok: true, companyName: name });
    } catch (e: any) {
      res.status(502).json({ ok: false, message: e?.message || "unknown error" });
    }
  });
}
