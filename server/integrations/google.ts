/**
 * Google Workspace integration routes (Phase 1). Server-only.
 *
 * All routes:
 *  - Resolve the acting user (x-user-id header, falling back to a body/_actor id) and
 *    enforce RBAC against the `users.role` column. NOTE: this app has no Supabase JWT
 *    (it is self-hosted Express with client-selected users), so the spec's
 *    "verify Supabase JWT" is adapted to identifying the user via x-user-id + DB role.
 *  - Write an `integration_audit_log` row on every external Google API call.
 *  - Wrap every Google call in try/catch and return user-friendly errors.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import {
  createOpportunityFolder, listFiles, uploadFile, deleteFile, shareFolder, folderName,
} from "../lib/google/drive";
import { validateAddress } from "../lib/google/addressValidation";

const VALIDATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h cache per spec

/** Roles allowed to delete Drive files. */
const DELETE_ROLES = ["Admin"];
/** Roles allowed to view/upload (everyone with a known role). */
const WRITE_ROLES = ["Admin", "Manager", "Sales Rep", "Production", "Billing"];

function actingUser(req: Request) {
  const headerId = req.header("x-user-id");
  const id = headerId ? Number(headerId) : (req.body?._actorUserId ? Number(req.body._actorUserId) : NaN);
  if (!Number.isFinite(id)) return null;
  return storage.getUser(id) || null;
}

function requireRole(req: Request, res: Response, allowed: string[]) {
  const user = actingUser(req);
  if (!user) {
    res.status(401).json({ message: "Unauthorized: missing or unknown user (set x-user-id)" });
    return null;
  }
  if (!allowed.includes(user.role)) {
    res.status(403).json({ message: `Forbidden: role ${user.role} not permitted` });
    return null;
  }
  return user;
}

function street(job: any): string {
  return job.addressLine1 || job.address || "";
}

/**
 * Idempotent folder provisioning. If the job already has a drive_folder_id it is
 * returned unchanged; otherwise a folder is created, persisted, and audited.
 * Used by the route, the create-opportunity trigger, and the backfill script.
 */
export async function ensureOpportunityFolder(
  opportunityId: number,
  actorUserId: number | null,
): Promise<{ driveFolderId: string; driveFolderUrl: string; created: boolean }> {
  const job = storage.getJob(opportunityId);
  if (!job) throw new Error(`Opportunity ${opportunityId} not found`);
  if (job.driveFolderId) {
    return { driveFolderId: job.driveFolderId, driveFolderUrl: job.driveFolderUrl || "", created: false };
  }
  try {
    const { id, url } = await createOpportunityFolder({
      opportunityId,
      customer: job.customer,
      street: street(job),
    });
    storage.updateJob(opportunityId, {
      driveFolderId: id,
      driveFolderUrl: url,
      driveFolderCreatedAt: Date.now(),
    } as any);

    // Best-effort share with the company domain if configured.
    const domain = process.env.GOOGLE_WORKSPACE_DOMAIN;
    if (domain) {
      try { await shareFolder(id, { domain, role: "writer" }); } catch { /* non-fatal */ }
    }

    storage.addAuditLog({
      actorUserId, integration: "google_drive", action: "ensure_folder",
      opportunityId, request: { name: folderName(opportunityId, job.customer, street(job)) },
      response: { driveFolderId: id }, status: "ok",
    });
    return { driveFolderId: id, driveFolderUrl: url, created: true };
  } catch (e: any) {
    storage.addAuditLog({
      actorUserId, integration: "google_drive", action: "ensure_folder",
      opportunityId, status: "error", error: e?.message || String(e),
    });
    throw e;
  }
}

export function registerGoogleRoutes(app: Express) {
  /* ───── Address validation ───── */
  app.post("/api/integrations/google/validate-address", async (req, res) => {
    const user = requireRole(req, res, WRITE_ROLES);
    if (!user) return;
    const address = String(req.body?.address || "").trim();
    if (!address) return res.status(400).json({ message: "address is required" });

    // 24h cache by raw input
    const cached = storage.getCachedValidation(address);
    if (cached) {
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_maps", action: "validate_address",
        request: { address, cached: true }, status: "ok",
      });
      return res.json({ ...JSON.parse(cached.response), cached: true });
    }

    try {
      const result = await validateAddress(address);
      storage.putCachedValidation(address, result, VALIDATION_TTL_MS);
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_maps", action: "validate_address",
        opportunityId: req.body?.opportunity_id ?? null,
        request: { address }, response: { confidence: result.confidence, placeId: result.placeId }, status: "ok",
      });
      res.json({ ...result, cached: false });
    } catch (e: any) {
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_maps", action: "validate_address",
        request: { address }, status: "error", error: e?.message || String(e),
      });
      res.status(502).json({ message: `Address validation failed: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Drive: ensure folder (idempotent) ───── */
  app.post("/api/integrations/google/drive/ensure-folder", async (req, res) => {
    const user = requireRole(req, res, WRITE_ROLES);
    if (!user) return;
    const opportunityId = Number(req.body?.opportunity_id);
    if (!Number.isFinite(opportunityId)) return res.status(400).json({ message: "opportunity_id is required" });
    try {
      const out = await ensureOpportunityFolder(opportunityId, user.id);
      res.json(out);
    } catch (e: any) {
      res.status(502).json({ message: `Could not create Drive folder: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Drive: list files ───── */
  app.get("/api/integrations/google/drive/files", async (req, res) => {
    const user = requireRole(req, res, WRITE_ROLES);
    if (!user) return;
    const opportunityId = Number(req.query.opportunity_id);
    if (!Number.isFinite(opportunityId)) return res.status(400).json({ message: "opportunity_id is required" });
    const job = storage.getJob(opportunityId);
    if (!job) return res.status(404).json({ message: "Opportunity not found" });
    if (!job.driveFolderId) return res.json({ files: [], driveFolderId: null });
    try {
      const files = await listFiles(job.driveFolderId);
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_drive", action: "list_files",
        opportunityId, response: { count: files.length }, status: "ok",
      });
      res.json({ files, driveFolderId: job.driveFolderId, driveFolderUrl: job.driveFolderUrl });
    } catch (e: any) {
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_drive", action: "list_files",
        opportunityId, status: "error", error: e?.message || String(e),
      });
      res.status(502).json({ message: `Could not list files: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Drive: upload file ─────
     Accepts JSON { name, mimeType, dataBase64 } to keep creds server-side without
     adding a multipart dependency (matches the app's existing base64 upload pattern). */
  app.post("/api/integrations/google/drive/upload", async (req, res) => {
    const user = requireRole(req, res, WRITE_ROLES);
    if (!user) return;
    const opportunityId = Number(req.query.opportunity_id ?? req.body?.opportunity_id);
    if (!Number.isFinite(opportunityId)) return res.status(400).json({ message: "opportunity_id is required" });
    const { name, mimeType, dataBase64 } = req.body || {};
    if (!name || !dataBase64) return res.status(400).json({ message: "name and dataBase64 are required" });
    const job = storage.getJob(opportunityId);
    if (!job) return res.status(404).json({ message: "Opportunity not found" });
    try {
      // Ensure a folder exists first (idempotent).
      const { driveFolderId } = await ensureOpportunityFolder(opportunityId, user.id);
      const buf = Buffer.from(String(dataBase64).replace(/^data:[^;]+;base64,/, ""), "base64");
      const file = await uploadFile({
        folderId: driveFolderId,
        name: String(name),
        mimeType: String(mimeType || "application/octet-stream"),
        body: buf,
      });
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_drive", action: "upload_file",
        opportunityId, request: { name, bytes: buf.length }, response: { fileId: file.id }, status: "ok",
      });
      res.json({ file });
    } catch (e: any) {
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_drive", action: "upload_file",
        opportunityId, request: { name }, status: "error", error: e?.message || String(e),
      });
      res.status(502).json({ message: `Upload failed: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Drive: delete file (Admin only) ───── */
  app.delete("/api/integrations/google/drive/files/:fileId", async (req, res) => {
    const user = requireRole(req, res, DELETE_ROLES);
    if (!user) return;
    const fileId = req.params.fileId;
    const opportunityId = Number(req.query.opportunity_id);
    try {
      await deleteFile(fileId);
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_drive", action: "delete_file",
        opportunityId: Number.isFinite(opportunityId) ? opportunityId : null,
        request: { fileId }, status: "ok",
      });
      res.json({ ok: true });
    } catch (e: any) {
      storage.addAuditLog({
        actorUserId: user.id, integration: "google_drive", action: "delete_file",
        opportunityId: Number.isFinite(opportunityId) ? opportunityId : null,
        request: { fileId }, status: "error", error: e?.message || String(e),
      });
      res.status(502).json({ message: `Delete failed: ${e?.message || "unknown error"}` });
    }
  });

  /* ───── Audit log (Admin/Manager visibility) ───── */
  app.get("/api/integrations/audit-log", (req, res) => {
    const user = requireRole(req, res, ["Admin", "Manager"]);
    if (!user) return;
    res.json(storage.getAuditLog(Number(req.query.limit) || 200));
  });
}
