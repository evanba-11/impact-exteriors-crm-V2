/**
 * Builds an authenticated Google JWT client from the service-account JSON using
 * domain-wide delegation. The client impersonates a real Workspace user
 * (`google_workspace_impersonation_email`) so Drive folders live in that user's
 * Drive and are visible to the team — not in the service account's invisible Drive.
 *
 * Server-only. Never expose the returned client or its credentials to the browser.
 */
import { google } from "googleapis";
import type { JWT } from "google-auth-library";
import { getServiceAccount, requireSecret } from "../secrets";

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

let cached: { client: JWT; expiresAt: number } | null = null;

/** Returns a JWT auth client authorized for Drive, impersonating the Workspace user. */
export async function getDriveAuth(): Promise<JWT> {
  // Reuse for 30 minutes to avoid re-signing on every request.
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  const sa = await getServiceAccount();
  const subject = await requireSecret("impersonationEmail");

  const client = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: DRIVE_SCOPES,
    subject,
  });
  await client.authorize();

  cached = { client, expiresAt: Date.now() + 30 * 60 * 1000 };
  return client;
}

/** Test-only: clear the cached auth client. */
export function __resetAuthCacheForTests() {
  cached = null;
}
