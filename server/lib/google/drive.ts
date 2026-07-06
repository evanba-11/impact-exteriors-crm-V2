/**
 * Google Drive helpers for opportunity folders. Server-only.
 *
 * Folders are created under a configurable root folder
 * (`google_drive_root_folder_id`) in the impersonated Workspace user's Drive.
 * Folder name format: `{opportunity_id} — {customer_name} — {street_address}`.
 */
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { getDriveAuth } from "./auth";
import { requireSecret } from "../secrets";

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

async function client(): Promise<drive_v3.Drive> {
  const auth = await getDriveAuth();
  return google.drive({ version: "v3", auth });
}

export function folderName(opportunityId: number, customer: string, street: string): string {
  const parts = [String(opportunityId), customer || "Unknown", street || ""].filter((p) => p !== "");
  return parts.join(" — ");
}

export function folderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Idempotent-friendly folder creation. The caller is responsible for short-circuiting
 * when the opportunity already has a `drive_folder_id`; this function only creates.
 * Returns the new folder id + url.
 */
export async function createOpportunityFolder(args: {
  opportunityId: number;
  customer: string;
  street: string;
}): Promise<{ id: string; url: string }> {
  const rootFolderId = await requireSecret("driveRootFolderId");
  const drive = await client();
  const res = await drive.files.create({
    requestBody: {
      name: folderName(args.opportunityId, args.customer, args.street),
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error("Drive folder creation returned no id");
  return { id, url: folderUrl(id) };
}

/**
 * Optionally share a folder with the company domain or specific emails (configurable).
 * Best-effort: callers may ignore failures.
 */
export async function shareFolder(
  folderId: string,
  opts: { domain?: string; emails?: string[]; role?: "reader" | "writer" } = {},
): Promise<void> {
  const drive = await client();
  const role = opts.role || "writer";
  if (opts.domain) {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { type: "domain", role, domain: opts.domain },
      supportsAllDrives: true,
    });
  }
  for (const email of opts.emails || []) {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { type: "user", role, emailAddress: email },
      sendNotificationEmail: false,
      supportsAllDrives: true,
    });
  }
}

export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const drive = await client();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size,modifiedTime,owners(displayName,emailAddress),webViewLink,iconLink)",
    orderBy: "folder,modifiedTime desc",
    pageSize: 1000,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name || "Untitled",
    mimeType: f.mimeType || "application/octet-stream",
    size: f.size != null ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
    owner: f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || null,
    webViewLink: f.webViewLink || null,
    iconLink: f.iconLink || null,
  }));
}

export async function uploadFile(args: {
  folderId: string;
  name: string;
  mimeType: string;
  body: Buffer | Readable;
}): Promise<DriveFile> {
  const drive = await client();
  const stream = Buffer.isBuffer(args.body) ? Readable.from(args.body) : args.body;
  const res = await drive.files.create({
    requestBody: { name: args.name, parents: [args.folderId] },
    media: { mimeType: args.mimeType, body: stream },
    fields: "id,name,mimeType,size,modifiedTime,owners(displayName,emailAddress),webViewLink,iconLink",
    supportsAllDrives: true,
  });
  const f = res.data;
  return {
    id: f.id!,
    name: f.name || args.name,
    mimeType: f.mimeType || args.mimeType,
    size: f.size != null ? Number(f.size) : null,
    modifiedTime: f.modifiedTime || null,
    owner: f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || null,
    webViewLink: f.webViewLink || null,
    iconLink: f.iconLink || null,
  };
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = await client();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}
