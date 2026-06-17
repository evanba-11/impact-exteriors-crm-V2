/**
 * QuickBooks Online OAuth 2.0 — authorize URL, code exchange, token refresh.
 * Server-only. Uses raw fetch against Intuit's OAuth endpoints (no SDK) to keep
 * the dependency surface small and the logic easy to unit-test.
 *
 * The connection is a singleton row in `integration_connections` (provider='qbo').
 * Access tokens are short-lived (~1h); refresh tokens are long-lived (~100 days)
 * and ROTATE on every refresh — Intuit returns a new refresh token that must
 * overwrite the stored one. Both are encrypted at rest (see ./crypto).
 */
import { storage } from "../../storage";
import { getSecret, requireSecret } from "../secrets";
import { encryptToken, decryptToken } from "./crypto";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
/** Refresh when the access token is within this window of expiring. */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;            // seconds for the access token
  x_refresh_token_expires_in?: number;
  token_type?: string;
}

/** Build the Intuit authorize URL. `state` is a random nonce persisted by the caller. */
export async function buildAuthorizeUrl(state: string): Promise<string> {
  const clientId = await requireSecret("qboClientId");
  const redirectUri = await requireSecret("qboRedirectUri");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: QBO_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function basicAuthHeader(): Promise<string> {
  const id = await requireSecret("qboClientId");
  const secret = await requireSecret("qboClientSecret");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/** Exchange an authorization code for tokens (OAuth callback step). */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const redirectUri = await requireSecret("qboRedirectUri");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: await basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`QBO token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Refresh access token using the stored (decrypted) refresh token. */
export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: await basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`QBO token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Persist a fresh token set (encrypting both tokens) onto the singleton connection. */
export async function persistTokens(
  tokens: TokenResponse,
  extra: { realmId?: string; connectedByUserId?: number | null } = {},
): Promise<void> {
  const update: Record<string, unknown> = {
    accessToken: await encryptToken(tokens.access_token),
    refreshToken: await encryptToken(tokens.refresh_token),
    tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    lastRefreshedAt: Date.now(),
    status: "active",
    lastError: null,
  };
  if (extra.realmId) update.realmId = extra.realmId;
  if (extra.connectedByUserId !== undefined) update.connectedByUserId = extra.connectedByUserId;
  if (extra.realmId) update.connectedAt = Date.now();
  storage.upsertConnection("qbo", update);
}

/**
 * Returns a valid access token + realmId, refreshing (and persisting the rotated
 * refresh token) when within REFRESH_SKEW_MS of expiry. Throws if not connected.
 */
export async function getValidAccessToken(): Promise<{ accessToken: string; realmId: string }> {
  const conn = storage.getConnection("qbo");
  if (!conn || conn.status === "disconnected" || !conn.refreshToken || !conn.realmId) {
    throw new Error("QuickBooks is not connected");
  }

  const notExpired = conn.tokenExpiresAt && conn.tokenExpiresAt - Date.now() > REFRESH_SKEW_MS;
  if (notExpired && conn.accessToken) {
    const at = await decryptToken(conn.accessToken);
    if (at) return { accessToken: at, realmId: conn.realmId };
  }

  // Refresh.
  const refreshToken = await decryptToken(conn.refreshToken);
  if (!refreshToken) throw new Error("QuickBooks refresh token unavailable");
  try {
    const tokens = await refreshTokens(refreshToken);
    await persistTokens(tokens, { realmId: conn.realmId });
    return { accessToken: tokens.access_token, realmId: conn.realmId };
  } catch (e: any) {
    // Invalid refresh token => connection is dead; mark it so the UI can prompt a reconnect.
    storage.upsertConnection("qbo", { status: "disconnected", lastError: e?.message || String(e) });
    throw new Error("QuickBooks connection expired — an Admin must reconnect");
  }
}

/** Best-effort token revocation on disconnect. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: await basicAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* non-fatal: we still clear the local connection */
  }
}

/** Base REST URL for the configured environment. */
export async function apiBaseUrl(): Promise<string> {
  const env = (await getSecret("qboEnvironment")) || "production";
  return env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}
