import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui-bits";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/lib/format";
import {
  Users, FileText, Receipt, ExternalLink, RefreshCw, Loader2, Send, FilePlus2, CreditCard,
} from "lucide-react";
import {
  getQboSnapshot, resyncOpportunity, pushEstimate, createInvoiceFromEstimate,
  type QboSnapshot,
} from "@/lib/qbo-integration";

/** Roles permitted to push estimates / create invoices, mirroring the server matrix. */
const PUSH_ESTIMATE_ROLES = ["Admin", "Manager", "Billing", "Sales Rep"];
const INVOICE_ROLES = ["Admin", "Manager", "Billing"];

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function invoiceBadge(status: string | null) {
  if (status === "Paid") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Paid</Badge>;
  if (status === "PartiallyPaid") return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Partially paid</Badge>;
  return <Badge variant="outline">Unpaid</Badge>;
}

/**
 * QuickBooks "Accounting" section for an opportunity. Shows the synced customer,
 * estimate, invoice and payments, with role-gated actions to push an estimate or
 * create an invoice. The server enforces RBAC too; the UI hides controls per the
 * spec's permission matrix.
 */
export default function AccountingPanel({ opportunityId }: { opportunityId: number }) {
  const { user } = useApp();
  const { toast } = useToast();
  const role = user?.role || "";
  const canPushEstimate = PUSH_ESTIMATE_ROLES.includes(role);
  const canInvoice = INVOICE_ROLES.includes(role);

  const snapQuery = useQuery({
    queryKey: ["qbo-snapshot", opportunityId],
    queryFn: () => getQboSnapshot(opportunityId, user?.id),
    retry: false,
  });

  const resyncMut = useMutation({
    mutationFn: () => resyncOpportunity(opportunityId, user?.id),
    onSuccess: () => { toast({ title: "Resynced with QuickBooks" }); snapQuery.refetch(); },
    onError: (e: any) => toast({ title: "Resync failed", description: e.message, variant: "destructive" }),
  });

  const pushMut = useMutation({
    mutationFn: (estimateId: number) => pushEstimate(estimateId, user?.id),
    onSuccess: () => { toast({ title: "Estimate pushed to QuickBooks" }); snapQuery.refetch(); },
    onError: (e: any) => toast({ title: "Push failed", description: e.message, variant: "destructive" }),
  });

  const invoiceMut = useMutation({
    mutationFn: (estimateId: number) => createInvoiceFromEstimate(estimateId, user?.id),
    onSuccess: () => { toast({ title: "Invoice created in QuickBooks" }); snapQuery.refetch(); },
    onError: (e: any) => toast({ title: "Invoice creation failed", description: e.message, variant: "destructive" }),
  });

  if (snapQuery.isLoading) {
    return <div className="text-sm text-muted-foreground" data-testid="qbo-acct-loading">Loading accounting…</div>;
  }
  if (snapQuery.isError) {
    return (
      <div className="text-sm text-red-500" data-testid="qbo-acct-error">
        {(snapQuery.error as Error)?.message || "Could not load accounting details."}
      </div>
    );
  }

  const snap = snapQuery.data as QboSnapshot;
  const est = snap.estimate as any;
  const estimatePushed = est && "qboId" in est;
  const crmEstimateId = snap.crmEstimateId;

  return (
    <div className="space-y-4" data-testid="qbo-acct-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">QuickBooks Accounting</div>
        <div className="flex items-center gap-2">
          {snap.lastSyncedAt && (
            <span className="text-xs text-muted-foreground">Synced {fmtDate(typeof snap.lastSyncedAt === "number" ? new Date(snap.lastSyncedAt).toISOString() : snap.lastSyncedAt)}</span>
          )}
          {canInvoice && (
            <Button size="sm" variant="outline" onClick={() => resyncMut.mutate()} disabled={resyncMut.isPending} data-testid="button-qbo-acct-resync">
              {resyncMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              Resync
            </Button>
          )}
        </div>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card text-sm" data-testid="qbo-acct-customer">
        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Customer</div>
          {snap.customer
            ? <div className="font-medium truncate">{snap.customer.name || "QuickBooks customer"}</div>
            : <div className="text-muted-foreground">Not yet synced</div>}
        </div>
        {snap.customer?.url && (
          <a href={snap.customer.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0" title="Open in QuickBooks">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Estimate */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card text-sm" data-testid="qbo-acct-estimate">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Estimate</div>
          {estimatePushed ? (
            <div className="font-medium truncate">{est.docNumber ? `#${est.docNumber}` : "Pushed"}</div>
          ) : crmEstimateId ? (
            <div className="text-muted-foreground">CRM estimate #{crmEstimateId}{est?.total != null ? ` · ${money(est.total)}` : ""} — not pushed</div>
          ) : (
            <div className="text-muted-foreground">No estimate</div>
          )}
        </div>
        {estimatePushed && est.url && (
          <a href={est.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0" title="Open in QuickBooks">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {!estimatePushed && crmEstimateId && canPushEstimate && (
          <Button size="sm" onClick={() => pushMut.mutate(crmEstimateId)} disabled={pushMut.isPending} data-testid="button-qbo-push-estimate">
            {pushMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Push to QBO
          </Button>
        )}
      </div>

      {/* Invoice */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card text-sm" data-testid="qbo-acct-invoice">
        <Receipt className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">Invoice</div>
          {snap.invoice ? (
            <div className="flex items-center gap-2">
              <span className="font-medium">{snap.invoice.docNumber ? `#${snap.invoice.docNumber}` : "Invoice"}</span>
              {invoiceBadge(snap.invoice.status)}
              <span className="text-xs text-muted-foreground tnum">
                {money(snap.invoice.balance)} due / {money(snap.invoice.total)}
              </span>
            </div>
          ) : (
            <div className="text-muted-foreground">No invoice</div>
          )}
        </div>
        {snap.invoice?.url && (
          <a href={snap.invoice.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0" title="Open in QuickBooks">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {!snap.invoice && crmEstimateId && canInvoice && (
          <Button size="sm" onClick={() => invoiceMut.mutate(crmEstimateId)} disabled={invoiceMut.isPending} data-testid="button-qbo-create-invoice">
            {invoiceMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FilePlus2 className="w-3.5 h-3.5 mr-1.5" />}
            Create invoice
          </Button>
        )}
      </div>

      {/* Payments */}
      <div data-testid="qbo-acct-payments">
        <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> Payments
        </div>
        {snap.payments.length === 0 ? (
          <EmptyState title="No payments yet" hint="Payments recorded in QuickBooks appear here automatically." />
        ) : (
          <div className="space-y-1.5">
            {snap.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card text-sm" data-testid={`qbo-payment-${p.id}`}>
                <span className="font-medium tnum">{money(p.amount)}</span>
                <span className="text-xs text-muted-foreground">{p.method || "Payment"}</span>
                {p.reference && <span className="text-xs text-muted-foreground truncate">· {p.reference}</span>}
                <span className="text-xs text-muted-foreground ml-auto shrink-0">{fmtDate(p.paymentDate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
