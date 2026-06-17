import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the encryption key via the secrets module.
let KEY: string | null = null;
vi.mock("../secrets", () => ({
  getSecret: vi.fn(async (name: string) => (name === "qboTokenEncryptionKey" ? KEY : null)),
  requireSecret: vi.fn(async () => "x"),
}));

import { encryptToken, decryptToken, checksum } from "./crypto";

beforeEach(() => { KEY = null; });

describe("encryptToken / decryptToken", () => {
  it("falls back to a marked plaintext when no key is configured", async () => {
    KEY = null;
    const enc = await encryptToken("refresh-abc");
    expect(enc).toBe("plain:refresh-abc");
    expect(await decryptToken(enc)).toBe("refresh-abc");
  });

  it("round-trips with AES-256-GCM when a 32-byte base64 key is set", async () => {
    KEY = Buffer.alloc(32, 7).toString("base64");
    const enc = await encryptToken("super-secret-refresh-token");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("super-secret-refresh-token");
    expect(await decryptToken(enc)).toBe("super-secret-refresh-token");
  });

  it("accepts a hex key and a passphrase key", async () => {
    KEY = "a".repeat(64); // 64 hex chars = 32 bytes
    const enc1 = await encryptToken("t1");
    expect(await decryptToken(enc1)).toBe("t1");

    KEY = "just-a-passphrase";
    const enc2 = await encryptToken("t2");
    expect(await decryptToken(enc2)).toBe("t2");
  });

  it("produces a different ciphertext each call (random IV) but same plaintext", async () => {
    KEY = Buffer.alloc(32, 1).toString("base64");
    const a = await encryptToken("dup");
    const b = await encryptToken("dup");
    expect(a).not.toBe(b);
    expect(await decryptToken(a)).toBe("dup");
    expect(await decryptToken(b)).toBe("dup");
  });

  it("throws if the stored value is encrypted but the key is missing", async () => {
    KEY = Buffer.alloc(32, 2).toString("base64");
    const enc = await encryptToken("x");
    KEY = null;
    await expect(decryptToken(enc)).rejects.toThrow(/required to decrypt/);
  });

  it("returns null for empty stored values", async () => {
    expect(await decryptToken(null)).toBeNull();
    expect(await decryptToken(undefined)).toBeNull();
  });
});

describe("checksum", () => {
  it("is stable for equal payloads and differs for changed ones", () => {
    const a = checksum({ DisplayName: "Acme", email: "a@x.com" });
    const b = checksum({ DisplayName: "Acme", email: "a@x.com" });
    const c = checksum({ DisplayName: "Acme", email: "b@x.com" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(32);
  });
});
