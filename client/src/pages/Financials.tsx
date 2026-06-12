import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { PageHeader, EmptyState, KpiCard } from "@/components/ui-bits";
import { money, pct, marginColor } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";

export default function Financials() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const [jobId, setJobId] = useState<number | null>(params.get("job") ? Number(params.get("job")) : null);
  if (jobId) return <JobFinancials jobId={jobId} onBack={() => setJobId(null)} />;
  return <CompanyFinancials onJob={setJobId} />;
}

function CompanyFinancials({ onJob }: any) {
  const { data: wip = [] } = useQuery<any[]>({ queryKey: ["/api/wip"] });
  const { data: commissions = [] } = useQuery<any[]>({ queryKey: ["/api/commissions"] });
  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/invoices"] });
  const { data: jobs = [] } = useQuery<any[]>({ queryKey: ["/api/jobs"] });

  const contract = wip.reduce((s, w) => s + w.contractValue, 0);
  const cost = wip.reduce((s, w) => s + w.costToDate, 0);
  const profit = wip.reduce((s, w) => s + w.projectedProfit, 0);
  const retainage = wip.reduce((s, w) => s + w.retainage, 0);

  // company bid vs actual by code
  const codeAgg: Record<string, { budget: number; actual: number }> = {};
  wip.forEach((w) => w.byCode.forEach((c: any) => { codeAgg[c.code] = codeAgg[c.code] || { budget: 0, actual: 0 }; codeAgg[c.code].budget += c.budget; codeAgg[c.code].actual += c.actual; }));

  // profitability by type
  const byType: Record<string, { rev: number; profit: number }> = {};
  wip.forEach((w) => { const t = w.job.jobType || "Other"; byType[t] = byType[t] || { rev: 0, profit: 0 }; byType[t].rev += w.contractValue; byType[t].profit += w.projectedProfit; });

  // 8-week cash flow
  const beginningCash = 85000;
  const weeklyCollect = invoices.reduce((s, i) => s + (i.amount - i.collected), 0) / 8;
  const weeklyPay = wip.reduce((s, w) => s + w.openCommitted, 0) / 8;
  let bal = beginningCash;
  const cashWeeks = Array.from({ length: 8 }, (_, i) => { const collect = weeklyCollect * (1 - i * 0.05); const pay = weeklyPay * (1 - i * 0.04); bal = bal + collect - pay; return { wk: `W${i + 1}`, begin: bal - collect + pay, collect, pay, end: bal }; });

  const exportCsv = () => {
    const rows = [["Customer", "Type", "Contract", "Cost", "Proj Profit", "Margin%"], ...wip.map((w) => [w.job.customer, w.job.jobType, w.contractValue, Math.round(w.costToDate), Math.round(w.projectedProfit), w.projMargin.toFixed(1)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "wip.csv"; a.click();
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Financials" subtitle="Company-wide WIP, profitability, retainage & cash flow" actions={<Button size="sm" variant="outline" onClick={exportCsv} data-testid="button-export-wip">Export CSV</Button>} />
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <KpiCard label="Active Contract" value={money(contract)} />
        <KpiCard label="Cost to Date" value={money(cost)} />
        <KpiCard label="Projected Profit" value={<span className={marginColor(contract ? profit / contract * 100 : 0)}>{money(profit)}</span>} sub={`${pct(contract ? profit / contract * 100 : 0, 1)} blended`} />
        <KpiCard label="Retainage Held" value={money(retainage)} />
      </div>

      <Tabs defaultValue="wip">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="wip" data-testid="tab-wip">WIP</TabsTrigger>
          <TabsTrigger value="bidactual">Bid vs Actual</TabsTrigger>
          <TabsTrigger value="profit">Profitability</TabsTrigger>
          <TabsTrigger value="retainage">Retainage</TabsTrigger>
          <TabsTrigger value="cash">Cash Flow</TabsTrigger>
          <TabsTrigger value="commissions" data-testid="tab-commissions">Commissions</TabsTrigger>
        </TabsList>

        <TabsContent value="wip" className="mt-4">
          <Table head={["Job", "Contract", "Budget Cost", "Cost to Date", "Open Commit", "ECAC", "% Comp", "Earned", "Billed", "Over/(Under)", "Proj Profit", "Margin"]}>
            {wip.map((w) => (
              <tr key={w.job.id} className="border-t border-border hover-elevate cursor-pointer" onClick={() => onJob(w.job.id)} data-testid={`wip-row-${w.job.id}`}>
                <td className="p-2 font-medium">{w.job.customer}</td>
                <Td>{money(w.contractValue)}</Td><Td>{money(w.budgetCost)}</Td><Td>{money(w.costToDate)}</Td>
                <Td>{money(w.openCommitted)}</Td><Td>{money(w.estCostAtCompletion)}</Td><Td>{pct(w.pctComplete * 100)}</Td>
                <Td>{money(w.earnedRevenue)}</Td><Td>{money(w.billed)}</Td>
                <Td cls={w.overUnderBilled >= 0 ? "text-emerald-500" : "text-red-500"}>{money(w.overUnderBilled)}</Td>
                <Td>{money(w.projectedProfit)}</Td><Td cls={marginColor(w.projMargin)}>{pct(w.projMargin, 1)}</Td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="bidactual" className="mt-4">
          <Table head={["Cost Code", "Budget", "Actual", "Variance", "% Used"]}>
            {Object.entries(codeAgg).sort().map(([code, v]) => (
              <tr key={code} className="border-t border-border">
                <td className="p-2 font-medium">{code}</td>
                <Td>{money(v.budget)}</Td><Td>{money(v.actual)}</Td>
                <Td cls={v.budget - v.actual >= 0 ? "text-emerald-500" : "text-red-500"}>{money(v.budget - v.actual)}</Td>
                <Td>{pct(v.budget ? v.actual / v.budget * 100 : 0)}</Td>
              </tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="profit" className="mt-4">
          <Table head={["Job Type", "Revenue", "Proj Profit", "Margin"]}>
            {Object.entries(byType).map(([t, v]) => (
              <tr key={t} className="border-t border-border"><td className="p-2 font-medium">{t}</td>
                <Td>{money(v.rev)}</Td><Td>{money(v.profit)}</Td><Td cls={marginColor(v.rev ? v.profit / v.rev * 100 : 0)}>{pct(v.rev ? v.profit / v.rev * 100 : 0, 1)}</Td></tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="retainage" className="mt-4">
          <Table head={["Job", "We Hold (from subs)", "Held From Us"]}>
            {wip.map((w) => {
              const subRet = w.commitments.reduce((s: number, c: any) => s + c.retentionHeld, 0);
              return <tr key={w.job.id} className="border-t border-border"><td className="p-2 font-medium">{w.job.customer}</td><Td>{money(subRet)}</Td><Td>{money(w.retainage)}</Td></tr>;
            })}
          </Table>
        </TabsContent>

        <TabsContent value="cash" className="mt-4">
          <Table head={["Week", "Beginning", "+ Collections", "− Sub Pay", "Ending"]}>
            {cashWeeks.map((c) => (
              <tr key={c.wk} className="border-t border-border"><td className="p-2 font-medium">{c.wk}</td>
                <Td>{money(c.begin)}</Td><Td cls="text-emerald-500">{money(c.collect)}</Td><Td cls="text-red-500">{money(c.pay)}</Td><Td>{money(c.end)}</Td></tr>
            ))}
          </Table>
        </TabsContent>

        <TabsContent value="commissions" className="mt-4">
          <Table head={["Rep", "Job", "Plan", "Base", "Commission", "Status"]}>
            {commissions.filter((c) => c.commission > 0).map((c, i) => (
              <tr key={i} className="border-t border-border"><td className="p-2">{c.rep}</td><td className="p-2">{c.customer}</td>
                <Td>{c.type === "gross_profit" ? `${c.rate}% GP` : `${c.rate}% contract`}</Td><Td>{money(c.base)}</Td><Td>{money(c.commission)}</Td>
                <td className="p-2 text-right"><Badge variant="outline" className={c.earned ? "bg-emerald-500/15 text-emerald-600" : ""}>{c.earned ? "Earned" : "Pending"}</Badge></td></tr>
            ))}
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JobFinancials({ jobId, onBack }: any) {
  const { toast } = useToast();
  const { data: f } = useQuery<any>({ queryKey: ["/api/jobs", jobId, "financials"] });
  const coMut = useMutation({
    mutationFn: ({ id, status }: any) => apiRequest("PATCH", `/api/change-orders/${id}`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "financials"] }); queryClient.invalidateQueries({ queryKey: ["/api/wip"] }); toast({ title: "Change order updated" }); },
  });
  const payMut = useMutation({
    mutationFn: ({ id, collected }: any) => apiRequest("PATCH", `/api/invoices/${id}`, { collected }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "financials"] }); queryClient.invalidateQueries(); toast({ title: "Payment recorded" }); },
  });
  if (!f) return <div className="p-6"><EmptyState title="Loading…" /></div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-primary hover:underline" data-testid="button-back-financials">← Financials</button>
        <span className="text-muted-foreground">/</span><span className="font-semibold">{f.job.customer}</span>
      </div>
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <KpiCard label="Contract Value" value={money(f.contractValue)} sub={f.coRevenue > 0 ? `incl ${money(f.coRevenue)} COs` : undefined} />
        <KpiCard label="Est Cost @ Completion" value={money(f.estCostAtCompletion)} />
        <KpiCard label="% Complete" value={pct(f.pctComplete * 100)} sub={`Earned ${money(f.earnedRevenue)}`} />
        <KpiCard label="Projected Profit" value={<span className={marginColor(f.projMargin)}>{money(f.projectedProfit)}</span>} sub={`${pct(f.projMargin, 1)} margin`} />
      </div>

      <Section title="Budget vs Actual by Cost Code">
        <Table head={["Code", "Budget", "Actual", "Variance"]}>
          {f.byCode.map((c: any) => (
            <tr key={c.code} className="border-t border-border"><td className="p-2 font-medium">{c.code}</td>
              <Td>{money(c.budget)}</Td><Td>{money(c.actual)}</Td><Td cls={c.variance >= 0 ? "text-emerald-500" : "text-red-500"}>{money(c.variance)}</Td></tr>
          ))}
        </Table>
      </Section>

      <Section title="Committed Sub Costs (POs)">
        <Table head={["Vendor", "Code", "Committed", "Invoiced", "Paid", "Retention", "Remaining"]}>
          {f.commitments.map((c: any) => (
            <tr key={c.id} className={cn("border-t border-border", c.invoiced > c.committed && "bg-red-500/5")}><td className="p-2 font-medium">{c.vendorName}{c.invoiced > c.committed && <Badge variant="outline" className="ml-1 text-[9px] border-red-500/40 text-red-500">over-invoiced</Badge>}</td>
              <Td>{c.costCode}</Td><Td>{money(c.committed)}</Td><Td>{money(c.invoiced)}</Td><Td>{money(c.paid)}</Td><Td>{money(c.retentionHeld)}</Td><Td>{money(c.committed - c.invoiced)}</Td></tr>
          ))}
        </Table>
      </Section>

      <Section title="Cost Ledger">
        <Table head={["Date", "Code", "Vendor", "Description", "Source", "Ref", "Amount"]}>
          {f.costs.map((c: any) => (
            <tr key={c.id} className="border-t border-border"><td className="p-2">{new Date(c.date).toLocaleDateString()}</td>
              <Td>{c.costCode || "—"}</Td><td className="p-2">{c.vendor}</td><td className="p-2">{c.description}</td>
              <td className="p-2"><Badge variant="outline" className="text-[10px]">{c.source}</Badge></td><td className="p-2 text-muted-foreground">{c.ref}</td><Td>{money(c.amount)}</Td></tr>
          ))}
        </Table>
      </Section>

      <Section title="Billing & Invoices">
        <Table head={["Invoice", "Type", "Amount", "Retainage", "Collected", "Balance", "Days Out", ""]}>
          {f.invoices.map((i: any) => {
            const bal = i.amount - i.collected; const daysOut = Math.floor((Date.now() - i.issuedAt) / 86400000);
            return <tr key={i.id} className="border-t border-border"><td className="p-2 font-medium">{i.number}</td><Td>{i.type}</Td><Td>{money(i.amount)}</Td><Td>{money(i.retainage)}</Td><Td>{money(i.collected)}</Td>
              <Td cls={bal > 0 ? "text-amber-500" : ""}>{money(bal)}</Td><Td cls={daysOut > 30 && bal > 0 ? "text-red-500" : ""}>{daysOut}d</Td>
              <td className="p-2 text-right">{bal > 0 && <div className="flex gap-1 justify-end"><PaymentLinkDialog invoiceId={i.id} /><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => payMut.mutate({ id: i.id, collected: i.amount })} data-testid={`button-collect-${i.id}`}>Mark paid</Button></div>}</td></tr>;
          })}
        </Table>
      </Section>

      <Section title="Change Orders">
        <Table head={["Description", "CO Amount", "CO Cost", "Margin", "Status", ""]}>
          {f.changeOrders.map((c: any) => (
            <tr key={c.id} className="border-t border-border"><td className="p-2">{c.description}</td><Td>{money(c.amount)}</Td><Td>{money(c.cost)}</Td>
              <Td cls={marginColor(c.amount ? (c.amount - c.cost) / c.amount * 100 : 0)}>{pct(c.amount ? (c.amount - c.cost) / c.amount * 100 : 0)}</Td>
              <td className="p-2"><Badge variant="outline" className={c.status === "Approved" ? "bg-emerald-500/15 text-emerald-600" : c.status === "Rejected" ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600"}>{c.status}</Badge></td>
              <td className="p-2 text-right">{c.status === "Pending" && <div className="flex gap-1 justify-end"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => coMut.mutate({ id: c.id, status: "Approved" })} data-testid={`co-approve-${c.id}`}>Approve</Button><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => coMut.mutate({ id: c.id, status: "Rejected" })}>Reject</Button></div>}</td></tr>
          ))}
          {f.changeOrders.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground text-xs">No change orders</td></tr>}
        </Table>
      </Section>
    </div>
  );
}

function Table({ head, children }: any) {
  return (
    <div className="rounded-lg border border-card-border bg-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground"><tr>{head.map((h: string, i: number) => <th key={i} className={cn("p-2", i === 0 ? "text-left" : "text-right")}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, cls }: any) { return <td className={cn("p-2 text-right tnum", cls)}>{children}</td>; }
function Section({ title, children }: any) { return <div><h3 className="text-sm font-semibold mb-2">{title}</h3>{children}</div>; }
