/**
 * Thin REST wrapper over the QuickBooks Online v3 API. Server-only.
 *
 *  - Resolves a valid access token + realm via ./auth (lazy refresh).
 *  - On 401, refreshes once and retries (handles a token that expired mid-flight).
 *  - Surfaces 409 (SyncToken conflict) via a typed error so callers can refetch+retry.
 *  - Audits every call into `integration_audit_log` (sanitized — never tokens).
 *  - Distinguishes transient (429/5xx) from permanent (other 4xx) failures.
 */
import { storage } from "../../storage";
import { getValidAccessToken, apiBaseUrl } from "./auth";

export class QboApiError extends Error {
  status: number;
  transient: boolean;
  conflict: boolean;
  body: string;
  constructor(status: number, body: string) {
    super(`QBO API ${status}: ${body}`);
    this.name = "QboApiError";
    this.status = status;
    this.conflict = status === 409;
    this.transient = status === 429 || status >= 500;
    this.body = body;
  }
}

export interface QboCallOptions {
  method?: string;
  /** Path AFTER `/v3/company/{realmId}/` — e.g. `customer`, `query?query=...`. */
  path: string;
  body?: unknown;
  /** Audit metadata. */
  action: string;
  actorUserId?: number | null;
  opportunityId?: number | null;
  /** Set false to skip the 401 refresh-retry (used internally to avoid loops). */
  _retried?: boolean;
}

function sanitize(body: unknown): unknown {
  if (body == null) return null;
  // Bodies are QBO entity payloads (no secrets), safe to log as-is but trimmed.
  try {
    const s = JSON.stringify(body);
    return s.length > 4000 ? { truncated: true, length: s.length } : body;
  } catch {
    return { unserializable: true };
  }
}

/** Core request. Returns parsed JSON. Throws QboApiError on non-2xx. */
export async function qboRequest<T = any>(opts: QboCallOptions): Promise<T> {
  const method = opts.method || "GET";
  const { accessToken, realmId } = await getValidAccessToken();
  const base = await apiBaseUrl();
  const url = `${base}/v3/company/${realmId}/${opts.path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e: any) {
    storage.addAuditLog({
      actorUserId: opts.actorUserId ?? null, integration: "qbo", action: opts.action,
      opportunityId: opts.opportunityId ?? null, request: { method, path: opts.path },
      status: "error", error: `network: ${e?.message || String(e)}`,
    });
    throw new QboApiError(0, `network error: ${e?.message || String(e)}`);
  }

  const text = await res.text();

  if (res.status === 401 && !opts._retried) {
    // Token may have just expired; force a refresh by calling again (getValidAccessToken
    // refreshes when needed, and a 401 means the cached one is stale).
    storage.upsertConnection("qbo", {}); // no-op to keep API symmetric; refresh handled in auth
    return qboRequest<T>({ ...opts, _retried: true });
  }

  if (!res.ok) {
    storage.addAuditLog({
      actorUserId: opts.actorUserId ?? null, integration: "qbo", action: opts.action,
      opportunityId: opts.opportunityId ?? null,
      request: { method, path: opts.path, body: sanitize(opts.body) },
      response: { status: res.status }, status: "error",
      error: text.slice(0, 500),
    });
    throw new QboApiError(res.status, text);
  }

  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  storage.addAuditLog({
    actorUserId: opts.actorUserId ?? null, integration: "qbo", action: opts.action,
    opportunityId: opts.opportunityId ?? null,
    request: { method, path: opts.path, body: sanitize(opts.body) },
    response: { status: res.status }, status: "ok",
  });
  return json as T;
}

/** Run a QBO SQL-like query (`SELECT ... FROM Entity WHERE ...`). */
export async function qboQuery<T = any>(
  query: string,
  meta: { action: string; actorUserId?: number | null; opportunityId?: number | null },
): Promise<T> {
  const path = `query?query=${encodeURIComponent(query)}&minorversion=65`;
  return qboRequest<T>({ path, method: "GET", ...meta });
}
