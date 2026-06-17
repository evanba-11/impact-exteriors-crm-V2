/**
 * Token encryption at rest for QuickBooks OAuth tokens. Server-only.
 *
 * Intuit refresh tokens are long-lived and grant full accounting access, so they
 * are encrypted with AES-256-GCM before being written to `integration_connections`.
 * The 32-byte key comes from the secrets module (`qbo_token_encryption_key`),
 * accepted as base64, hex, or a raw passphrase (hashed to 32 bytes via SHA-256).
 *
 * Ciphertext format (single string): `v1:<iv-b64>:<authTag-b64>:<cipher-b64>`.
 */
import crypto from "node:crypto";
import { getSecret } from "../secrets";

const PREFIX = "v1";

/** Resolve the encryption key bytes from the configured secret. */
async function keyBytes(): Promise<Buffer | null> {
  const raw = await getSecret("qboTokenEncryptionKey");
  if (!raw) return null;
  // Accept base64 (44 chars for 32 bytes) or hex (64 chars); otherwise hash it.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw) && Buffer.from(raw, "base64").length === 32) {
    return Buffer.from(raw, "base64");
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt plaintext. If no encryption key is configured, returns the plaintext
 * unchanged with a `plain:` marker so we never silently lose data — the docs call
 * out that an encryption key SHOULD be set in production.
 */
export async function encryptToken(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  const key = await keyBytes();
  if (!key) return `plain:${plaintext}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a value produced by encryptToken. Handles the `plain:` fallback. */
export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("plain:")) return stored.slice("plain:".length);
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Legacy/plaintext value written before encryption was enabled.
    return stored;
  }
  const key = await keyBytes();
  if (!key) throw new Error("qbo_token_encryption_key is required to decrypt stored tokens");
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}

/** Stable hash of a payload, used for change detection in qbo_entity_map.checksum. */
export function checksum(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}
