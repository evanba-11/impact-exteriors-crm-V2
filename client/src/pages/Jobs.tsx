import { useQuery } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { money, pct, marginColor, timeAgo } from "@/lib/format";
import { useLocation } from "wouter";
import { useApp } from "@/lib/app-context";
import { STAGES } from "@shared/schema";
import type { Job, User } from "@shared/schema";
import { JobTypeBadge } from "@/pages/Estimates";
import { useListView, applyList, exportCsv, ListToolbar, SortHead } from "@/components/ListView";
import { LayoutGrid, Table as TableIcon, FileText, Package, CalendarClock } from "lucide-react";

function fmtDate(ts?: number | null) {
  if (!ts) return "Not set";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* Per-tile detail dialog for workorder / material order / projected completion */
function JobDetailDialog({ job, kind, wip, onClose }: { job: Job; kind: string; wip: any; onClose: () => void }) {
  const title =
    kind === "workorder" ? "Work Order" :
    kind === "material" ? "Material Order" : "Projected Date of Completion";
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid={`job-detail-${kind}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{job.customer}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="text-right max-w-[60%] truncate">{job.address || "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Stage</span><span>{job.stage}</span></div>
          {kind === "workorder" && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Job Type</span><span>{job.jobType || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Contract Value</span><span className="tnum">{money(job.contractValue || job.value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">% Complete</span><span className="tnum">{wip ? pct(wip.percentComplete ?? wip.pctComplete ?? 0) : "—"}</span></div>
            </>
          )}
          {kind === "material" && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Material Cost To Date</span><span className="tnum">{wip ? money(wip.costToDate ?? wip.cost ?? 0) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{job.stage === "Materials Ordered" || job.stage === "Job Scheduled" || job.stage === "Job In Progress" ? "Ordered" : "Pending"}</span></div>
            </>
          )}
          {kind === "projected" && (
            <div className="flex justify-between"><span className="text-muted-foreground">Projected Completion</span><span className="font-medium">{fmtDate(job.projectedCompletionAt)}</span></div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JobTile({ job, wip, onOpen, onDetail }: { job: Job; wip: any; onOpen: () => void; onDetail: (kind: string) => void }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-3 flex flex-col gap-2" data-testid={`job-tile-${job.id}`}>
      <button onClick={onOpen} className="text-left min-w-0">
        <div className="font-semibold text-[13px] leading-tight truncate">{job.customer}</div>
        <div className="text-xs text-muted-foreground truncate">{job.address}</div>
      </button>
      <div className="flex items-center justify-between text-xs">
        <JobTypeBadge jobType={job.jobType} />
        <span className={`tnum font-medium ${wip ? marginColor(wip.margin ?? wip.projMargin ?? 0) : ""}`}>{wip ? pct(wip.margin ?? wip.projMargin ?? 0, 1) : "—"}</span>
      </div>
      <div className="tnum text-sm font-medium">{money(job.contractValue || job.value)}</div>
      <div className="flex flex-col gap-1 pt-1.5 border-t border-border">
        <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => onDetail("workorder")} data-testid={`job-tile-workorder-${job.id}`}>
          <FileText className="w-3 h-3 mr-1.5" /> View Workorder
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => onDetail("material")} data-testid={`job-tile-material-${job.id}`}>
          <Package className="w-3 h-3 mr-1.5" /> View Material Order
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => onDetail("projected")} data-testid={`job-tile-projected-${job.id}`}>
          <CalendarClock className="w-3 h-3 mr-1.5" /> Projected Date of Completion
        </Button>
      </div>
    </div>
  );
}

export default function Jobs() {
  const { data: jobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: wip = [] } = useQuery<any[]>({ queryKey: ["/api/wip"] });
  const { user } = useApp();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("active");
  const [view, setView] = useState<"tiles" | "table">("tiles");
  const [detail, setDetail] = useState<{ job: Job; kind: string } | null>(null);

  const repName = (id: number | null) => users.find((u) => u.id === id)?.name || "—";
  const wipById = useMemo(() => {
    const m: Record<number, any> = {};
    wip.forEach((w) => (m[w.jobId] = w));
    return m;
  }, [wip]);

  const scoped = useMemo(() => {
    const active = jobs.filter((j) => j.isActiveJob);
    if (tab === "production") return active.filter((j) => j.flow === "PRODUCTION");
    if (tab === "billing") return active.filter((j) => j.flow === "BILLING");
    return active;
  }, [jobs, tab]);

  const { state, setQ, setMine, setFilter, toggleSort } = useListView("jobs", { sortKey: "updated", sortDir: "desc" });

  const list = useMemo(() => applyList(scoped, state, {
    searchText: (j) => `${j.customer} ${j.address || ""} ${repName(j.repId)} ${j.stage}`,
    isMine: (j) => j.repId === user?.id,
    sortValue: (j, k) => {
      const w = wipById[j.id];
      return k === "contract" ? (j.contractValue || j.value || 0)
        : k === "billings" ? (w?.billed ?? 0)
        : k === "cost" ? (w?.costToDate ?? w?.cost ?? 0)
        : k === "complete" ? (w?.percentComplete ?? w?.pctComplete ?? 0)
        : k === "margin" ? (w?.margin ?? -Infinity)
        : k === "stage" ? j.stage
        : k === "updated" ? (j.lastActivityAt || 0)
        : j.customer;
    },
  }), [scoped, state, wipById, users, user]);

  // pipeline-stage columns for the tile board (dedupe production + billing stages, preserve order)
  const stageOrder = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    [...STAGES.PRODUCTION, ...STAGES.BILLING].forEach((s) => { if (!seen.has(s)) { seen.add(s); out.push(s); } });
    return out;
  }, []);
  const columns = useMemo(() => {
    const byStage: Record<string, Job[]> = {};
    list.forEach((j) => { (byStage[j.stage] ||= []).push(j); });
    const ordered = stageOrder.map((s) => ({ stage: s, items: byStage[s] || [] }));
    const extraStages = Object.keys(byStage).filter((s) => !stageOrder.includes(s));
    extraStages.forEach((s) => ordered.push({ stage: s, items: byStage[s] }));
    return ordered.filter((c) => c.items.length > 0);
  }, [list, stageOrder]);

  const doExport = () => exportCsv("jobs.csv",
    ["Customer", "Address", "Type", "Stage", "PM / Rep", "Contract", "Billings", "Cost To Date", "% Complete", "Margin %"],
    list.map((j) => {
      const w = wipById[j.id];
      return [j.customer, j.address || "", j.jobType || "", j.stage, repName(j.repId),
        j.contractValue || j.value || 0, w?.billed ?? "", w?.costToDate ?? w?.cost ?? "", w ? (w.percentComplete ?? w.pctComplete ?? "") : "", w ? (w.margin ?? w.projMargin ?? "") : ""];
    }));

  return (
    <div className="space-y-5">
      <PageHeader title="Jobs" subtitle="Active production & billing jobs with live margin" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="tabs-jobs">
          <TabsTrigger value="active" data-testid="tab-jobs-active">All Active</TabsTrigger>
          <TabsTrigger value="production" data-testid="tab-jobs-production">Production</TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-jobs-billing">Billing</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-border overflow-hidden">
          <button onClick={() => setView("tiles")} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${view === "tiles" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-accent"}`} data-testid="jobs-view-tiles">
            <LayoutGrid className="w-3.5 h-3.5" /> Tiles
          </button>
          <button onClick={() => setView("table")} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${view === "table" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-accent"}`} data-testid="jobs-view-table">
            <TableIcon className="w-3.5 h-3.5" /> Table
          </button>
        </div>
        <div className="flex-1">
          <ListToolbar
            q={state.q} onQ={setQ}
            mine={state.mine} onMine={setMine}
            onExport={doExport}
            placeholder="Search jobs…"
            count={list.length} total={scoped.length}
          />
        </div>
      </div>

      {view === "tiles" ? (
        isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading jobs…</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <EmptyState title="No active jobs" hint="Jobs appear here once an estimate is accepted." />
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2" data-testid="jobs-tile-board">
            {columns.map((col) => (
              <div key={col.stage} className="w-72 shrink-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide">{col.stage}</h3>
                  <span className="text-[11px] text-muted-foreground">{col.items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {col.items.map((j) => (
                    <JobTile
                      key={j.id}
                      job={j}
                      wip={wipById[j.id]}
                      onOpen={() => navigate(j.isActiveJob ? `/jobs/${j.id}` : `/opportunities/${j.id}`)}
                      onDetail={(kind) => setDetail({ job: j, kind })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading jobs…</div>
        ) : list.length === 0 ? (
          <EmptyState title="No active jobs" hint="Jobs appear here once an estimate is accepted." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHead label="Customer" sortKey="customer" state={state} onSort={toggleSort} /></TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell"><SortHead label="Stage" sortKey="stage" state={state} onSort={toggleSort} /></TableHead>
                <TableHead className="hidden sm:table-cell">PM / Rep</TableHead>
                <TableHead className="text-right"><SortHead label="Contract" sortKey="contract" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right hidden lg:table-cell"><SortHead label="Billings" sortKey="billings" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right hidden lg:table-cell"><SortHead label="Cost" sortKey="cost" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right hidden md:table-cell"><SortHead label="% Complete" sortKey="complete" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right"><SortHead label="Margin" sortKey="margin" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="hidden xl:table-cell text-right"><SortHead label="Updated" sortKey="updated" state={state} onSort={toggleSort} align="right" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((j) => {
                const w = wipById[j.id];
                return (
                  <TableRow key={j.id} className="cursor-pointer" onClick={() => navigate(j.isActiveJob ? `/jobs/${j.id}` : `/opportunities/${j.id}`)} data-testid={`row-job-${j.id}`}>
                    <TableCell>
                      <div className="font-medium">{j.customer}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{j.address}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <JobTypeBadge jobType={j.jobType} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="secondary" className="font-normal">{j.stage}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{repName(j.repId)}</TableCell>
                    <TableCell className="text-right tnum font-medium">{money(j.contractValue || j.value)}</TableCell>
                    <TableCell className="text-right tnum hidden lg:table-cell text-muted-foreground">
                      {w ? money(w.billed ?? 0) : "—"}
                    </TableCell>
                    <TableCell className="text-right tnum hidden lg:table-cell text-muted-foreground">
                      {w ? money(w.costToDate ?? w.cost ?? 0) : "—"}
                    </TableCell>
                    <TableCell className="text-right tnum hidden md:table-cell">
                      {w ? pct((w.percentComplete ?? w.pctComplete ?? 0)) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tnum font-medium ${w ? marginColor(w.margin ?? w.projMargin ?? 0) : ""}`}>
                      {w ? pct(w.margin ?? w.projMargin ?? 0, 1) : "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-xs text-muted-foreground">
                      {timeAgo(j.lastActivityAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
      )}

      {detail && (
        <JobDetailDialog job={detail.job} kind={detail.kind} wip={wipById[detail.job.id]} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
