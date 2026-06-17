/**
 * Server-only secrets access for integrations (Phase 1: Google Workspace).
 *
 * The Phase 1 spec calls for Supabase Vault as the canonical secrets store. This
 * deployment runs on a self-hosted Express server (no Supabase project wired in),
 * so this module adapts that intent:
 *
 *   1. If a Supabase service-role connection is configured (SUPABASE_URL +
 *      SUPABASE_SERVICE_ROLE_KEY), secrets are read from Supabase Vault via the
 *      `vault.decrypted_secrets` view using the service role — server-side only.
 *   2. Otherwise it falls back to process.env (the existing dotenv pattern), using
 *      the SAME logical secret names so the migration path to Vault is a no-op for
 *      callers.
 *
 * This module must NEVER be imported from client code. The service-account JSON and
 * Maps API key are read here and used only inside server-side Google calls.
 */

// Logical secret names — identical whether stored in Supabase Vault or env.
export const SECRET_NAMES = {
  serviceAccountJson: "google_service_account_json",
  impersonationEmail: "google_workspace_impersonation_email",
  driveRootFolderId: "google_drive_root_folder_id",
  mapsApiKey: "google_maps_api_key",
} as const;

// Env-var fallbacks (used when Supabase Vault is not configured). These mirror the
// Vault entry names but in SCREAMING_SNAKE_CASE for env conventions.
const ENV_FALLBACK: Record<string, string> = {
  [SECRET_NAMES.serviceAccountJson]: "GOOGLE_SERVICE_ACCOUNT_JSON",
  [SECRET_NAMES.impersonationEmail]: "GOOGLE_WORKSPACE_IMPERSONATION_EMAIL",
  [SECRET_NAMES.driveRootFolderId]: "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  [SECRET_NAMES.mapsApiKey]: "GOOGLE_MAPS_API_KEY",
};

let cache: Record<string, string | undefined> = {};
let vaultLoaded = false;

function hasSupabaseVault(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Lazily load all vault secrets via the Supabase service role (server-side only).
 * Uses the REST endpoint for the `vault.decrypted_secrets` view so we don't take a
 * hard dependency on @supabase/supabase-js being configured at runtime.
 */
async function loadVault(): Promise<void> {
  if (vaultLoaded || !hasSupabaseVault()) return;
  const url = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/decrypted_secrets?select=name,decrypted_secret`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "vault",
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase Vault read failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{ name: string; decrypted_secret: string }>;
  for (const row of rows) cache[row.name] = row.decrypted_secret;
  vaultLoaded = true;
}

/** Read a single secret by its logical name. Returns undefined if not set. */
export async function getSecret(name: keyof typeof SECRET_NAMES | string): Promise<string | undefined> {
  const logical = (SECRET_NAMES as Record<string, string>)[name as string] || (name as string);
  await loadVault();
  if (cache[logical] !== undefined) return cache[logical];
  const envKey = ENV_FALLBACK[logical];
  return envKey ? process.env[envKey] : undefined;
}

/** Read a required secret; throws a clear error if it is missing. */
export async function requireSecret(name: keyof typeof SECRET_NAMES): Promise<string> {
  const val = await getSecret(name);
  if (!val) {
    const logical = SECRET_NAMES[name];
    const envKey = ENV_FALLBACK[logical];
    throw new Error(
      `Missing secret "${logical}". Populate it in Supabase Vault or set env var ${envKey}.`,
    );
  }
  return val;
}

/** Parsed service-account JSON. */
export async function getServiceAccount(): Promise<{
  client_email: string;
  private_key: string;
  [k: string]: unknown;
}> {
  const raw = await requireSecret("serviceAccountJson");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`google_service_account_json is not valid JSON`);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`google_service_account_json missing client_email/private_key`);
  }
  return parsed;
}

/** Test-only: reset internal caches so unit tests can re-stub env/vault. */
export function __resetSecretsCacheForTests() {
  cache = {};
  vaultLoaded = false;
}
