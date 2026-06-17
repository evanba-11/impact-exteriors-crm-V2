import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth so no real JWT/secret is needed.
vi.mock("./auth", () => ({
  getDriveAuth: vi.fn().mockResolvedValue({}),
  DRIVE_SCOPES: ["https://www.googleapis.com/auth/drive"],
}));

// Mock the secrets module (driveRootFolderId is required by createOpportunityFolder).
vi.mock("../secrets", () => ({
  requireSecret: vi.fn(async (name: string) => (name === "driveRootFolderId" ? "ROOT_FOLDER" : "x")),
}));

// Build a controllable drive_v3 client mock.
const filesCreate = vi.fn();
const filesList = vi.fn();
const filesDelete = vi.fn();
const permissionsCreate = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    drive: vi.fn(() => ({
      files: { create: filesCreate, list: filesList, delete: filesDelete },
      permissions: { create: permissionsCreate },
    })),
  },
}));

import {
  createOpportunityFolder, listFiles, uploadFile, deleteFile, folderName, folderUrl,
} from "./drive";

beforeEach(() => {
  filesCreate.mockReset();
  filesList.mockReset();
  filesDelete.mockReset();
  permissionsCreate.mockReset();
});

describe("folderName / folderUrl", () => {
  it("formats name as id — customer — street", () => {
    expect(folderName(42, "Jane Roof", "9 Oak Ave")).toBe("42 — Jane Roof — 9 Oak Ave");
  });
  it("omits empty street", () => {
    expect(folderName(7, "Bob", "")).toBe("7 — Bob");
  });
  it("builds folder url", () => {
    expect(folderUrl("ABC")).toBe("https://drive.google.com/drive/folders/ABC");
  });
});

describe("createOpportunityFolder", () => {
  it("creates a folder under the root and returns id+url", async () => {
    filesCreate.mockResolvedValue({ data: { id: "NEWFOLDER" } });
    const out = await createOpportunityFolder({ opportunityId: 5, customer: "Acme", street: "1 A St" });
    expect(out).toEqual({ id: "NEWFOLDER", url: "https://drive.google.com/drive/folders/NEWFOLDER" });
    const call = filesCreate.mock.calls[0][0];
    expect(call.requestBody.parents).toEqual(["ROOT_FOLDER"]);
    expect(call.requestBody.mimeType).toBe("application/vnd.google-apps.folder");
    expect(call.requestBody.name).toBe("5 — Acme — 1 A St");
  });

  it("throws when Drive returns no id", async () => {
    filesCreate.mockResolvedValue({ data: {} });
    await expect(createOpportunityFolder({ opportunityId: 1, customer: "x", street: "y" }))
      .rejects.toThrow(/no id/);
  });
});

describe("listFiles", () => {
  it("maps Drive file metadata into our shape", async () => {
    filesList.mockResolvedValue({
      data: {
        files: [{
          id: "f1", name: "scope.pdf", mimeType: "application/pdf", size: "2048",
          modifiedTime: "2026-01-01T00:00:00Z",
          owners: [{ displayName: "Ops User", emailAddress: "ops@x.com" }],
          webViewLink: "https://drive/f1", iconLink: "https://icon/pdf",
        }],
      },
    });
    const files = await listFiles("FOLDER");
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ id: "f1", name: "scope.pdf", size: 2048, owner: "Ops User" });
    expect(filesList.mock.calls[0][0].q).toContain("'FOLDER' in parents");
  });

  it("returns empty array when no files", async () => {
    filesList.mockResolvedValue({ data: {} });
    expect(await listFiles("FOLDER")).toEqual([]);
  });
});

describe("uploadFile", () => {
  it("uploads a buffer and returns the created file", async () => {
    filesCreate.mockResolvedValue({ data: { id: "u1", name: "a.txt", mimeType: "text/plain", size: "3" } });
    const f = await uploadFile({ folderId: "FOLDER", name: "a.txt", mimeType: "text/plain", body: Buffer.from("abc") });
    expect(f.id).toBe("u1");
    const call = filesCreate.mock.calls[0][0];
    expect(call.requestBody.parents).toEqual(["FOLDER"]);
    expect(call.media.mimeType).toBe("text/plain");
  });
});

describe("deleteFile", () => {
  it("calls drive.files.delete with the file id", async () => {
    filesDelete.mockResolvedValue({});
    await deleteFile("DEAD");
    expect(filesDelete.mock.calls[0][0]).toMatchObject({ fileId: "DEAD" });
  });
});
