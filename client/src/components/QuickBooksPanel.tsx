import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import { SiQuickbooks } from "react-icons/si";
import { ExternalLink, RefreshCw, Loader2, Plug, Unplug, AlertTriangle } from "lucide-react";
import {
  getQboStatus, startQboOAuth, disconnectQbo, resyncAll,
  getQboSyncIssues, retryQboSyncIssue, type QboSyncIssue,
} from "@/lib/qbo-integration";

function fmtWhen(v: string | number | null): string {
  if (v == null) return "—";
  const d = new Date(typeof v === "number" ? v : v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * QuickBooks Online connection panel for Settings → Integrations. Connect/disconnect,
 * global resync, and a "Sync issues" list are Admin-only (server enforces this too;
 * the UI hides the controls to match the spec's permission matrix).
 */
export default function QuickBooksPanel() {
  const { user } = useApp();
  const { toast } = useToast();
  const isAdmin = user?.role === "Admin";

  const statusQuery = useQuery({
    queryKey: ["qbo-status"],
    queryFn: () => getQboStatus(user?.id),
    retry: false,
    enabled: isAdmin,
  });

  const issuesQuery = useQuery({
    queryKey: ["qbo-sync-issues"],
    queryFn: () => getQboSyncIssues(user?.id),
    retry: false,
    enabled: isAdmin,
  });

  const connectMut = useMutation({
    mutationFn: () => startQboOAuth(user?.id),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e: any) => toast({ title: "Could not start connection", description: e.message, variant: "destructive" }),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectQbo(user?.id),
    onSuccess: () => { toast({ title: "QuickBooks disconnected" }); statusQuery.refetch(); },
    onError: (e: any) => toast({ title: "Disconnect failed", description: e.message, variant: "destructive" }),
  });

  const resyncMut = useMutation({
    mutationFn: () => resyncAll(user?.id),
    onSuccess: ({ enqueued }) => { toast({ title: `Resync queued`, description: `${enqueued} opportunities enqueued.` }); },
    onError: (e: any) => toast({ title: "Resync failed", description: e.message, variant: "destructive" }),
  });

  const retryMut = useMutation({
    mutationFn: (id: number) => retryQboSyncIssue(id, user?.id),
    onSuccess: () => { toast({ title: "Retry started" }); issuesQuery.refetch(); },
    onError: (e: any) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground" data-testid="qbo-admin-only">
        QuickBooks connection settings are managed by an Admin.
      </div>
    );
  }

  const status = statusQuery.data;
  const connected = status?.connected;
  const issues = issuesQuery.data ?? [];

  return (
    <div className="space-y-4" data-testid="qbo-panel">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#2CA01C1a" }}>
            <SiQuickbooks className="h-5 w-5" style={{ color: "#2CA01C" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-semibold">QuickBooks Online</div>
              {statusQuery.isLoading ? (
                <Badge variant="outline" className="text-muted-foreground">Checking…</Badge>
              ) : connected ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white" data-testid="qbo-badge-connected">Connected</Badge>
              ) : status?.status === "error" ? (
                <Badge variant="destructive" data-testid="qbo-badge-error">Error</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground" data-testid="qbo-badge-disconnected">Not connected</Badge>
              )}
              {status?.environment === "sandbox" && (
                <Badge variant="secondary" className="text-[10px]">Sandbox</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Sync customers, estimates, invoices &amp; payments with QuickBooks.
            </div>

            {connected && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs">
                <dt className="text-muted-foreground">Company (Realm) ID</dt>
                <dd className="tnum" data-testid="qbo-realm">{status?.realmId || "—"}</dd>
                <dt className="text-muted-foreground">Connected</dt>
                <dd>{fmtWhen(status?.connectedAt ?? null)}</dd>
                <dt className="text-muted-foreground">Token refreshed</dt>
                <dd>{fmtWhen(status?.lastRefreshedAt ?? null)}</dd>
              </dl>
            )}

            {status?.lastError && !connected && (
              <div className="text-xs text-red-500 mt-2" data-testid="qbo-last-error">{status.lastError}</div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {connected ? (
                <>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => resyncMut.mutate()} disabled={resyncMut.isPending}
                    data-testid="button-qbo-resync-all"
                  >
                    {resyncMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Resync all
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { if (confirm("Disconnect QuickBooks? Sync will stop until reconnected.")) disconnectMut.mutate(); }}
                    disabled={disconnectMut.isPending}
                    data-testid="button-qbo-disconnect"
                  >
                    <Unplug className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => connectMut.mutate()} disabled={connectMut.isPending}
                  data-testid="button-qbo-connect"
                >
                  {connectMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1.5" />}
                  Connect to QuickBooks
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sync issues */}
      {connected && (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="qbo-sync-issues">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Sync issues
              {issues.length > 0 && <Badge variant="destructive">{issues.length}</Badge>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => issuesQuery.refetch()} data-testid="button-qbo-refresh-issues">
              <RefreshCw className={`w-3.5 h-3.5 ${issuesQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {issues.length === 0 ? (
            <div className="text-sm text-muted-foreground">No sync issues. Everything is up to date.</div>
          ) : (
            <div className="space-y-1.5">
              {issues.map((it: QboSyncIssue) => (
                <div key={it.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border text-sm" data-testid={`qbo-issue-${it.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{it.entityType} #{it.entityId} <span className="text-xs text-muted-foreground">({it.direction})</span></div>
                    <div className="text-xs text-red-500 truncate" title={it.lastError || ""}>{it.lastError || "Unknown error"}</div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{it.attempts} attempts</span>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => retryMut.mutate(it.id)} disabled={retryMut.isPending}
                    data-testid={`button-qbo-retry-${it.id}`}
                  >
                    Retry
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <a href="https://quickbooks.intuit.com" target="_blank" rel="noreferrer" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        Open QuickBooks <ExternalLink className="w-3 h-3 ml-1" />
      </a>
    </div>
  );
}
