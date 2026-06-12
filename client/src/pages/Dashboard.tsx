import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, KpiCard, EmptyState, Skeleton } from "@/components/ui-bits";
import { money, pct, marginColor, timeAgo } from "@/lib/format";
import { STAGE_PROBABILITY } from "@shared/schema";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, Trophy } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

const DAY = 86400000;

export default function Dashboard() {
  const { data: jobs = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/jobs"] });
  const { data: wip = [] } = useQuery<any[]>({ queryKey: ["/api/wip"] });
  const { data: flags = [] } = useQuery<any[]>({ queryKey: ["/api/flags"] });
  const { data: invoices = [] } = useQuery<any[]>({ queryKey: ["/api/invoices"] });
  const { data: activities = [] } = useQuery<any[]>({ queryKey: ["/api/activities"] });
  const { data: leaderboard } = useQuery<{ week: Row[]; month: Row[]; qtd: Row[]; year: Row[] }>({ queryKey: ["/api/leaderboard"] });
  const [actFilter, setActFilter] = useState("all");
  const [, navigate] = useLocation();

  if (isLoading) return <div className="p-6 grid grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  const open = jobs.filter((j) => ["SALES", "INSURANCE"].includes(j.flow) && !["Lost", "No Damage", "Lead Rehash"].includes(j.stage));
  const pipelineValue = open.reduce((s, j) => s + j.value, 0);
  const weighted = (days: number) => open.reduce((s, j) => s + j.value * (STAGE_PROBABILITY[j.stage] || 0.1), 0) * (days === 30 ? 0.5 : days === 60 ? 0.8 : 1);
  const active = jobs.filter((j) => j.isActiveJob);
  const contractValue = wip.reduce((s, w) => s + w.contractValue, 0);
  const costToDate = wip.reduce((s, w) => s + w.costToDate, 0);
  const projProfit = wip.reduce((s, w) => s + w.projectedProfit, 0);
  const blendedMargin = contractValue > 0 ? (projProfit / contractValue) * 100 : 0;
  const openAR = invoices.reduce((s, i) => s + (i.amount - i.collected), 0);
  const pastDueAR = invoices.filter((i) => Date.now() - i.issuedAt > 30 * DAY).reduce((s, i) => s + (i.amount - i.collected), 0);
  const overUnder = wip.reduce((s, w) => s + w.overUnderBilled, 0);

  // charts
  const stageCounts: Record<string, number> = {};
  open.forEach((j) => { stageCounts[j.stage] = (stageCounts[j.stage] || 0) + 1; });
  const SHORT_STAGE: Record<string, string> = {
    "Sending Booking Link": "Booking Link",
    "Appointment Scheduled": "Appt Scheduled",
    "Creating Estimate": "Est. Building",
    "Estimate Approved": "Est. Approved",
    "Estimate Accepted": "Est. Accepted",
    "Deposit Invoiced": "Deposit Inv.",
    "Signed/Waiting on Adjuster": "Awaiting Adjuster",
    "Adjuster Scheduled": "Adj. Scheduled",
    "Waiting on Carrier": "Awaiting Carrier",
    "Contingency Sent": "Contingency",
  };
  const funnelData = Object.entries(stageCounts).map(([name, value], i) => ({ name: SHORT_STAGE[name] || name, value, fill: `hsl(var(--chart-${(i % 5) + 1}))` })).sort((a, b) => b.value - a.value);
  const forecastData = [{ name: "30d", v: weighted(30) }, { name: "60d", v: weighted(60) }, { name: "90d", v: weighted(90) }];

  const codeTotals: Record<string, number> = {};
  wip.forEach((w) => w.byCode.forEach((c: any) => { codeTotals[c.code] = (codeTotals[c.code] || 0) + c.actual; }));
  const costByCode = Object.entries(codeTotals).map(([code, v]) => ({ code, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);

  const byType: Record<string, { rev: number; profit: number }> = {};
  wip.forEach((w) => { const t = w.job.jobType || "Other"; byType[t] = byType[t] || { rev: 0, profit: 0 }; byType[t].rev += w.contractValue; byType[t].profit += w.projectedProfit; });
  const typeData = Object.entries(byType).map(([name, v], i) => ({ name, value: Math.round(v.profit), fill: `hsl(var(--chart-${(i % 5) + 1}))` }));

  const filteredActs = activities.filter((a) => actFilter === "all" || a.flow === actFilter).slice(0, 20);

  const sevColor = (s: string) => s === "high" ? "border-red-500/40 bg-red-500/5" : s === "med" ? "border-amber-500/40 bg-amber-500/5" : "border-border";

  const goToFlag = (f: any, ref: any) => {
    if (f.type === "job" || ref.jobId) {
      const id = ref.jobId || ref.id;
      const job = jobs.find((j) => j.id === id);
      navigate(job?.isActiveJob ? `/jobs/${id}` : `/opportunities/${id}`);
    } else if (f.type === "vendor") navigate("/vendors");
    else navigate("/financials");
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Owner Dashboard" subtitle={`Snapshot · ${active.length} active jobs · updated ${timeAgo(activities[0]?.createdAt || Date.now())}`} />

      {/* KPI area (left) + compact leaderboard box (high-right) */}
      <div className="grid grid-cols-[1fr_414px] gap-4 items-start max-xl:grid-cols-1">
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <KpiCard label="Pipeline Value" value={money(pipelineValue)} sub={`${open.length} open sales + insurance`} accent />
          <KpiCard label="Weighted Forecast" value={money(weighted(90))} sub={`30d ${money(weighted(30))} · 60d ${money(weighted(60))}`} />
          <KpiCard label="Active Contract Value" value={money(contractValue)} sub={`${active.length} active jobs`} />
          <KpiCard label="Cost to Date" value={money(costToDate)} sub={`${pct(contractValue ? costToDate / contractValue * 100 : 0)} of contract`} />
          <KpiCard label="Projected Profit" value={<span className={marginColor(blendedMargin)}>{money(projProfit)}</span>} sub={`Blended margin ${pct(blendedMargin, 1)}`} />
          <KpiCard label="Open A/R" value={money(openAR)} sub={`${money(pastDueAR)} past due >30d`} danger={pastDueAR > 0} />
          <KpiCard label="Over/(Under) Billed" value={<span className={overUnder >= 0 ? "text-foreground" : "text-amber-500"}>{money(overUnder)}</span>} sub={overUnder >= 0 ? "net overbilled" : "net underbilled"} />
          <KpiCard label="Flagged Issues" value={flags.reduce((s, f) => s + f.count, 0)} sub={`${flags.filter((f) => f.severity === "high" && f.count > 0).length} high severity`} danger={flags.some((f) => f.severity === "high" && f.count > 0)} />
        </div>

        {/* Compact 2x2 text-only sales leaderboard */}
        <div className="rounded-lg border border-card-border bg-card p-5" data-testid="leaderboard-box">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-[18px] h-[18px] text-primary" />
            <h2 className="font-semibold text-base">Sales Leaderboard</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-5">
            <LeaderboardCell title="Weekly" rows={leaderboard?.week} testid="week" />
            <LeaderboardCell title="Monthly" rows={leaderboard?.month} testid="month" />
            <LeaderboardCell title="Quarterly" rows={leaderboard?.qtd} testid="qtd" />
            <LeaderboardCell title="YTD" rows={leaderboard?.year} testid="year" />
          </div>
        </div>
      </div>

      {/* Controller flags */}
      <div className="rounded-lg border border-card-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h2 className="font-semibold text-sm">Controller Flags</h2>
          <span className="text-xs text-muted-foreground">12 checks ported from the controller workbook</span>
        </div>
        <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {flags.map((f) => (
            <div key={f.key} className={cn("rounded-md border p-2.5", f.count > 0 ? sevColor(f.severity) : "border-border opacity-60")} data-testid={`flag-${f.key}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{f.label}</span>
                <Badge variant="outline" className={cn("tnum", f.count > 0 && f.severity === "high" && "border-red-500/40 text-red-500", f.count > 0 && f.severity === "med" && "border-amber-500/40 text-amber-500")}>{f.count}</Badge>
              </div>
              {f.count > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {f.refs.slice(0, 3).map((r: any, i: number) => (
                    <button key={i} onClick={() => goToFlag(f, r)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground w-full text-left" data-testid={`flag-ref-${f.key}-${i}`}>
                      <ChevronRight className="w-3 h-3 shrink-0" /> <span className="truncate">{r.label}</span>
                    </button>
                  ))}
                  {f.refs.length > 3 && <div className="text-[10px] text-muted-foreground pl-4">+{f.refs.length - 3} more</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        <ChartCard title="Pipeline by Stage">
          <ResponsiveContainer width="100%" height={Math.max(220, funnelData.length * 30)}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={108} fontSize={10} interval={0} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={tt} formatter={(v: any) => [`${v} job${v === 1 ? "" : "s"}`, "Count"]} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {funnelData.map((_, i) => <Cell key={i} fill={`hsl(var(--chart-${(i % 5) + 1}))`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Revenue Forecast (weighted)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={forecastData}>
              <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tt} formatter={(v: any) => money(v)} />
              <Bar dataKey="v" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Cost by Cost Code">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={costByCode} layout="vertical">
              <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="code" fontSize={11} width={36} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={tt} formatter={(v: any) => money(v)} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {costByCode.map((_, i) => <Cell key={i} fill={`hsl(var(--chart-${(i % 5) + 1}))`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Projected Profit by Job Type">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={typeData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {typeData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={tt} formatter={(v: any) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Activity feed */}
      <div className="rounded-lg border border-card-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Activity Feed</h2>
          <div className="flex gap-1">
            {["all", "SALES", "INSURANCE", "PRODUCTION", "BILLING"].map((f) => (
              <button key={f} onClick={() => setActFilter(f)} className={cn("text-[11px] px-2 py-1 rounded", actFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")} data-testid={`actfilter-${f}`}>{f}</button>
            ))}
          </div>
        </div>
        {filteredActs.length === 0 ? <EmptyState title="No activity" /> : (
          <div className="space-y-1.5">
            {filteredActs.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                <Badge variant="outline" className="text-[10px] shrink-0">{a.type}</Badge>
                <span className="flex-1 truncate">{a.message}</span>
                {a.flow && <span className="text-muted-foreground shrink-0">{a.flow}</span>}
                <span className="text-muted-foreground w-16 text-right shrink-0">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

const tt = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--popover-foreground))" };

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

type Row = { rep: string; contract: number };

function LeaderboardCell({ title, rows, testid }: { title: string; rows?: Row[]; testid: string }) {
  const ranked = (rows || []).slice(0, 5);
  return (
    <div data-testid={`leaderboard-${testid}`}>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 pb-1.5 border-b border-border">{title}</div>
      {ranked.length === 0 ? (
        <div className="text-[13px] text-muted-foreground py-1">No sales</div>
      ) : (
        <div className="space-y-1">
          {ranked.map((r, i) => (
            <div key={r.rep} className="flex items-center justify-between gap-2 text-[13px]" data-testid={`leaderboard-${testid}-row-${i}`}>
              <span className="flex items-center gap-1.5 truncate min-w-0">
                <span className="w-3.5 text-right text-muted-foreground tnum shrink-0">{i + 1}</span>
                <span className="truncate" data-testid={`leaderboard-${testid}-rep-${i}`}>{r.rep}</span>
              </span>
              <span className="font-semibold tnum tabular-nums shrink-0" data-testid={`leaderboard-${testid}-amt-${i}`}>{money(r.contract)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
