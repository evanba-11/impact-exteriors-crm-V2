/**
 * Client helpers for the Google Workspace integration endpoints.
 * All calls send the acting user's id via x-user-id so the server can enforce RBAC
 * (this app has no JWT; the current user is selected client-side in app-context).
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

export interface ValidatedAddress {
  formattedAddress: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  confidence: "high" | "medium" | "low";
  verdict: string;
  source: "address_validation" | "geocoding";
  cached?: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  owner: string | null;
  webViewLink: string | null;
  iconLink: string | null;
}

export function validateAddress(address: string, userId: number | null | undefined, opportunityId?: number) {
  return call<ValidatedAddress>("POST", "/api/integrations/google/validate-address", userId, {
    address, opportunity_id: opportunityId,
  });
}

export function ensureDriveFolder(opportunityId: number, userId: number | null | undefined) {
  return call<{ driveFolderId: string; driveFolderUrl: string; created: boolean }>(
    "POST", "/api/integrations/google/drive/ensure-folder", userId, { opportunity_id: opportunityId },
  );
}

export function listDriveFiles(opportunityId: number, userId: number | null | undefined) {
  return call<{ files: DriveFile[]; driveFolderId: string | null; driveFolderUrl?: string }>(
    "GET", `/api/integrations/google/drive/files?opportunity_id=${opportunityId}`, userId,
  );
}

export function uploadDriveFile(
  opportunityId: number,
  userId: number | null | undefined,
  file: { name: string; mimeType: string; dataBase64: string },
) {
  return call<{ file: DriveFile }>(
    "POST", `/api/integrations/google/drive/upload?opportunity_id=${opportunityId}`, userId, file,
  );
}

export function deleteDriveFile(opportunityId: number, fileId: string, userId: number | null | undefined) {
  return call<{ ok: true }>(
    "DELETE", `/api/integrations/google/drive/files/${encodeURIComponent(fileId)}?opportunity_id=${opportunityId}`, userId,
  );
}

/** Read a File as base64 (strips the data: prefix server-side too, but keep it consistent). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
