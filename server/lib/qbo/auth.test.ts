import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../secrets", () => ({
  getSecret: vi.fn(async (name: string) => {
    if (name === "qboEnvironment") return "production";
    if (name === "qboTokenEncryptionKey") return null; // use plain: fallback so we can read values back
    return null;
  }),
  requireSecret: vi.fn(async (name: string) => {
    const map: Record<string, string> = {
      qboClientId: "CID", qboClientSecret: "CSECRET", qboRedirectUri: "https://app/cb",
    };
    return map[name] ?? "x";
  }),
}));

const conn = { value: null as any };
const upserts: any[] = [];
vi.mock("../../storage", () => ({
  storage: {
    getConnection: () => conn.value,
    upsertConnection: (_p: string, patch: any) => {
      conn.value = { ...(conn.value || {}), ...patch };
      upserts.push(patch);
    },
  },
}));

import { getValidAccessToken, persistTokens, REFRESH_SKEW_MS } from "./auth";

beforeEach(() => {
  conn.value = null;
  upserts.length = 0;
  vi.restoreAllMocks();
});

describe("persistTokens", () => {
  it("stores access + (rotated) refresh tokens and an expiry, marking the connection active", async () => {
    await persistTokens(
      { access_token: "AT1", refresh_token: "RT_NEW", expires_in: 3600 },
      { realmId: "R1", connectedByUserId: 9 },
    );
    expect(conn.value).toMatchObject({ status: "active", realmId: "R1", connectedByUserId: 9 });
    // Tokens are stored via the plain: fallback (no key configured in this test).
    expect(conn.value.accessToken).toBe("plain:AT1");
    expect(conn.value.refreshToken).toBe("plain:RT_NEW");
    expect(conn.value.tokenExpiresAt).toBeGreaterThan(Date.now());
  });
});

describe("getValidAccessToken", () => {
  it("throws when not connected", async () => {
    conn.value = null;
    await expect(getValidAccessToken()).rejects.toThrow(/not connected/);
  });

  it("returns the cached access token when it is not near expiry", async () => {
    conn.value = {
      status: "active", realmId: "R1",
      accessToken: "plain:AT_CACHED", refreshToken: "plain:RT1",
      tokenExpiresAt: Date.now() + REFRESH_SKEW_MS + 60_000,
    };
    const out = await getValidAccessToken();
    expect(out).toEqual({ accessToken: "AT_CACHED", realmId: "R1" });
  });

  it("refreshes when near expiry and PERSISTS THE ROTATED refresh token", async () => {
    conn.value = {
      status: "active", realmId: "R1",
      accessToken: "plain:AT_OLD", refreshToken: "plain:RT_OLD",
      tokenExpiresAt: Date.now() + 1000, // within skew → refresh
    };
    const fetchMock = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "AT_NEW", refresh_token: "RT_ROTATED", expires_in: 3600 }),
      text: async () => "",
    } as any);

    const out = await getValidAccessToken();
    expect(out.accessToken).toBe("AT_NEW");
    // The new refresh token must overwrite the old one.
    expect(conn.value.refreshToken).toBe("plain:RT_ROTATED");
    expect(conn.value.status).toBe("active");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("marks the connection disconnected when the refresh token is rejected", async () => {
    conn.value = {
      status: "active", realmId: "R1",
      accessToken: "plain:AT_OLD", refreshToken: "plain:RT_DEAD",
      tokenExpiresAt: Date.now() + 1000,
    };
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue({
      ok: false, status: 400, text: async () => "invalid_grant", json: async () => ({}),
    } as any);

    await expect(getValidAccessToken()).rejects.toThrow(/reconnect/);
    expect(conn.value.status).toBe("disconnected");
  });
});
