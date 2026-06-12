import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PageHeader, KpiCard, EmptyState } from "@/components/ui-bits";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";
import { exportCsv } from "@/components/ListView";
import type { Invoice, Job } from "@shared/schema";

const BUCKETS = ["Current", "1-30", "31-60", "61-90", "91-120", "120+"] as const;
type Bucket = (typeof BUCKETS)[number];

function bucketFor(days: number): Bucket {
  if (days < 1) return "Current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 120) return "91-120";
  return "120+";
}

export default function ARaging() {
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const jobName = (id: number) => jobs.find((j) => j.id === id)?.customer || `Job #${id}`;

  const rows = useMemo(() => {
    return invoices
      .map((inv) => {
        const balance = (inv.amount || 0) - (inv.collected || 0);
        const days = Math.floor((Date.now() - inv.issuedAt) / 86400000);
        const bucket = bucketFor(days);
        return { inv, balance, days, bucket };
      })
      .filter((r) => r.balance > 0.5)
      .sort((a, b) => b.days - a.days);
  }, [invoices]);

  const totals = useMemo(() => {
    const t: Record<string, number> = { Current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "91-120": 0, "120+": 0, total: 0 };
    for (const r of rows) { t[r.bucket] += r.balance; t.total += r.balance; }
    return t;
  }, [rows]);

  const doExport = () => exportCsv("ar-aging.csv",
    ["Invoice", "Customer", "Type", "Amount", "Collected", "Balance", "Days Out", "Bucket"],
    rows.map((r) => [r.inv.number, jobName(r.inv.jobId), r.inv.type, r.inv.amount, r.inv.collected, r.balance, r.days, r.bucket]));

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="AR Aging"
        subtitle="Outstanding receivables grouped by invoice and aging bucket"
        actions={<Button size="sm" variant="outline" onClick={doExport} data-testid="button-export-aging">Export CSV</Button>}
      />

      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2 lg:grid-cols-7">
        <KpiCard label="Total Outstanding" value={money(totals.total)} accent />
        {BUCKETS.map((b) => <KpiCard key={b} label={b} value={money(totals[b])} danger={b === "120+" && totals[b] > 0} />)}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading invoices…</div>
        ) : rows.length === 0 ? (
          <EmptyState title="No outstanding receivables" hint="All invoices are collected." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="p-2 text-left">Invoice / Customer</th>
                <th className="p-2 text-right">Days</th>
                {BUCKETS.map((b) => <th key={b} className="p-2 text-right">{b}</th>)}
                <th className="p-2 text-right">Balance</th>
                <th className="p-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expanded[r.inv.id];
                return (
                  <>
                    <tr key={r.inv.id} className="border-t border-border hover:bg-accent/40 cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [r.inv.id]: !e[r.inv.id] }))} data-testid={`ar-row-${r.inv.id}`}>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {r.inv.number}
                          <Badge variant="secondary" className="font-normal ml-1">{r.inv.type}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground ml-5">{jobName(r.inv.jobId)}</div>
                      </td>
                      <td className={cn("p-2 text-right tnum", r.days > 90 ? "text-red-600 dark:text-red-400" : r.days > 30 ? "text-amber-600 dark:text-amber-400" : "")}>{r.days}d</td>
                      {BUCKETS.map((b) => <td key={b} className="p-2 text-right tnum">{r.bucket === b ? money(r.balance) : ""}</td>)}
                      <td className="p-2 text-right tnum font-medium">{money(r.balance)}</td>
                      <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}><PaymentLinkDialog invoiceId={r.inv.id} /></td>
                    </tr>
                    {open && (
                      <tr key={`${r.inv.id}-detail`} className="bg-muted/30 border-t border-border/50">
                        <td colSpan={BUCKETS.length + 4} className="p-2 pl-9">
                          <table className="w-full text-xs">
                            <thead className="text-muted-foreground">
                              <tr><th className="text-left py-1">Line</th><th className="text-right py-1">Amount</th><th className="text-right py-1">Collected</th><th className="text-right py-1">Balance</th></tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-border/40">
                                <td className="py-1">{r.inv.number} — {r.inv.type} (issued {new Date(r.inv.issuedAt).toLocaleDateString()})</td>
                                <td className="py-1 text-right tnum">{money(r.inv.amount)}</td>
                                <td className="py-1 text-right tnum">{money(r.inv.collected)}</td>
                                <td className="py-1 text-right tnum">{money(r.balance)}</td>
                              </tr>
                              {r.inv.retainage > 0 && (
                                <tr className="border-t border-border/40 text-muted-foreground">
                                  <td className="py-1">Retainage held</td><td className="py-1 text-right tnum">{money(r.inv.retainage)}</td><td></td><td></td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold bg-muted/40">
                <td className="p-2">Totals</td>
                <td className="p-2"></td>
                {BUCKETS.map((b) => <td key={b} className="p-2 text-right tnum">{money(totals[b])}</td>)}
                <td className="p-2 text-right tnum text-primary">{money(totals.total)}</td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
