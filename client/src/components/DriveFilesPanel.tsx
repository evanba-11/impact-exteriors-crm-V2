import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui-bits";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import {
  FolderPlus, Upload, ExternalLink, Trash2, RefreshCw, FileBox, Loader2,
} from "lucide-react";
import {
  listDriveFiles, ensureDriveFolder, uploadDriveFile, deleteDriveFile,
  fileToBase64, type DriveFile,
} from "@/lib/google-integration";

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

/**
 * Google Drive file panel for an opportunity/job. Lists files, supports drag-and-drop
 * upload, open-in-Drive, and Admin-only delete. Shows a "Create Drive folder" fallback
 * for legacy records that don't yet have one.
 */
export default function DriveFilesPanel({ opportunityId, driveFolderUrl }: {
  opportunityId: number; driveFolderUrl?: string | null;
}) {
  const { user } = useApp();
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "Admin";

  const filesQuery = useQuery({
    queryKey: ["drive-files", opportunityId],
    queryFn: () => listDriveFiles(opportunityId, user?.id),
    retry: false,
  });

  const ensureMut = useMutation({
    mutationFn: () => ensureDriveFolder(opportunityId, user?.id),
    onSuccess: () => {
      toast({ title: "Drive folder created" });
      filesQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Could not create folder", description: e.message, variant: "destructive" }),
  });

  const uploadMut = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) {
        const dataBase64 = await fileToBase64(f);
        await uploadDriveFile(opportunityId, user?.id, {
          name: f.name, mimeType: f.type || "application/octet-stream", dataBase64,
        });
      }
    },
    onSuccess: () => { toast({ title: "Upload complete" }); filesQuery.refetch(); },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (fileId: string) => deleteDriveFile(opportunityId, fileId, user?.id),
    onSuccess: () => { toast({ title: "File deleted" }); filesQuery.refetch(); },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadMut.mutate(files);
  }, [uploadMut]);

  const data = filesQuery.data;
  const hasFolder = !!data?.driveFolderId || !!driveFolderUrl;
  const folderUrl = data?.driveFolderUrl || driveFolderUrl;

  // Legacy record without a Drive folder yet.
  if (filesQuery.isSuccess && !hasFolder) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3" data-testid="drive-no-folder">
        <FileBox className="w-8 h-8 mx-auto text-muted-foreground" />
        <div className="text-sm text-muted-foreground">No Drive folder for this opportunity yet.</div>
        <Button size="sm" onClick={() => ensureMut.mutate()} disabled={ensureMut.isPending} data-testid="button-create-drive-folder">
          {ensureMut.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FolderPlus className="w-4 h-4 mr-1.5" />}
          Create Drive folder
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="drive-files-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Drive Files</div>
        <div className="flex items-center gap-1.5">
          {folderUrl && (
            <a href={folderUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" data-testid="button-open-drive-folder">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in Drive
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" onClick={() => filesQuery.refetch()} data-testid="button-refresh-drive">
            <RefreshCw className={`w-3.5 h-3.5 ${filesQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Drag-and-drop upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
        data-testid="drive-upload-zone"
      >
        <input
          ref={fileInput} type="file" multiple className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) uploadMut.mutate(fs); e.target.value = ""; }}
          data-testid="input-drive-file"
        />
        {uploadMut.isPending ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Upload className="w-4 h-4" /> Drag files here or click to upload
          </div>
        )}
      </div>

      {filesQuery.isError && (
        <div className="text-sm text-red-500" data-testid="drive-error">
          {(filesQuery.error as Error)?.message || "Could not load Drive files."}
        </div>
      )}

      {filesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading files…</div>
      ) : (data?.files.length ?? 0) === 0 ? (
        <EmptyState title="No files yet" hint="Upload documents, reports, and photos for this job." />
      ) : (
        <div className="space-y-1.5">
          {data!.files.map((f: DriveFile) => (
            <div key={f.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card text-sm" data-testid={`drive-file-${f.id}`}>
              {f.iconLink
                ? <img src={f.iconLink} alt="" className="w-4 h-4 shrink-0" />
                : <FileBox className="w-4 h-4 shrink-0 text-muted-foreground" />}
              <a href={f.webViewLink || "#"} target="_blank" rel="noreferrer" className="flex-1 truncate hover:text-primary hover:underline" title={f.name}>
                {f.name}
              </a>
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{fmtSize(f.size)}</span>
              <span className="text-xs text-muted-foreground shrink-0 hidden md:block">{fmtDate(f.modifiedTime)}</span>
              <span className="text-xs text-muted-foreground shrink-0 hidden lg:block truncate max-w-[120px]">{f.owner || "—"}</span>
              {f.webViewLink && (
                <a href={f.webViewLink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {isAdmin && (
                <button
                  onClick={() => { if (confirm(`Delete "${f.name}"? This cannot be undone.`)) deleteMut.mutate(f.id); }}
                  className="text-muted-foreground hover:text-red-500 shrink-0"
                  data-testid={`button-delete-drive-${f.id}`}
                  title="Delete (Admin only)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
