/**
 * Client helpers for the QuickBooks Online integration endpoints (Phase 2).
 * Mirrors lib/google-integration.ts: every call sends the acting user's id via
 * x-user-id so the server can enforce RBAC (this app has no JWT; the current user
 * is selected client-side in app-context).
 */
const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

async function call<T>(method: string, url: string, userId: number | null | undefined, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(userId != null ? { "x-user-id": String(userId) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch { /* keep statusText */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface QboStatus {
  connected: boolean;
  status: "active" | "disconnected" | "error" | string;
  realmId: string | null;
  connectedAt: string | number | null;
  lastRefreshedAt: string | number | null;
  tokenExpiresAt: string | number | null;
  lastError: string | null;
  environment: "sandbox" | "production" | string;
}

export interface QboPayment {
  id: number;
  qboPaymentId: string;
  qboInvoiceId: string | null;
  amount: number;
  paymentDate: string | null;
  method: string | null;
  reference: string | null;
}

export interface QboSnapshot {
  opportunityId: number;
  customer: { qboId: string; name: string | null; url: string } | null;
  estimate:
    | { qboId: string; docNumber: string | null; url: string | null }
    | { crmEstimateId: number; total: number; pushed: false }
    | null;
  crmEstimateId: number | null;
  invoice: {
    qboId: string;
    docNumber: string | null;
    total: number | null;
    balance: number | null;
    status: string | null;
    url: string | null;
  } | null;
  payments: QboPayment[];
  lastSyncedAt: string | number | null;
}

export interface QboSyncIssue {
  id: number;
  entityType: string;
  entityId: string;
  direction: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number | null;
}

export function getQboStatus(userId: number | null | undefined) {
  return call<QboStatus>("GET", "/api/integrations/qbo/status", userId);
}

export function startQboOAuth(userId: number | null | undefined) {
  return call<{ url: string }>("GET", "/api/integrations/qbo/oauth/start", userId);
}

export function disconnectQbo(userId: number | null | undefined) {
  return call<{ ok: true }>("POST", "/api/integrations/qbo/disconnect", userId, {});
}

export function getQboSnapshot(opportunityId: number, userId: number | null | undefined) {
  return call<QboSnapshot>(
    "GET", `/api/integrations/qbo/opportunity/${opportunityId}/snapshot`, userId,
  );
}

export function resyncOpportunity(opportunityId: number, userId: number | null | undefined) {
  return call<{ ok: true; snapshot: QboSnapshot }>(
    "POST", `/api/integrations/qbo/sync/opportunity/${opportunityId}`, userId, {},
  );
}

export function resyncAll(userId: number | null | undefined) {
  return call<{ ok: true; enqueued: number }>("POST", "/api/integrations/qbo/sync/all", userId, {});
}

export function pushEstimate(estimateId: number, userId: number | null | undefined) {
  return call<{ qboEstimateId: string; docNumber: string | null }>(
    "POST", `/api/integrations/qbo/estimate/${estimateId}/push`, userId, {},
  );
}

export function createInvoiceFromEstimate(estimateId: number, userId: number | null | undefined) {
  return call<{ qboInvoiceId: string; docNumber: string | null }>(
    "POST", `/api/integrations/qbo/invoice/from-estimate/${estimateId}`, userId, {},
  );
}

export function getQboSyncIssues(userId: number | null | undefined) {
  return call<QboSyncIssue[]>("GET", "/api/integrations/qbo/sync/issues", userId);
}

export function retryQboSyncIssue(id: number, userId: number | null | undefined) {
  return call<{ ok: true }>("POST", `/api/integrations/qbo/sync/issues/${id}/retry`, userId, {});
}
