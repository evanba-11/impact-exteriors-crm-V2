import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader, ScoreBadge, EmptyState, KpiCard } from "@/components/ui-bits";
import { safeStorage } from "@/lib/safe-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { money, pct, marginColor, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Plus, LayoutGrid, List as ListIcon, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useApp } from "@/lib/app-context";
import type { Job, User, Estimate } from "@shared/schema";
import { JOB_TYPES, STAGES, SEG_BID_TYPE } from "@shared/schema";
import { JobTypeBadge } from "@/pages/Estimates";
import { SegmentationBlock, type SegValues } from "@/components/Segmentation";
import AddressValidationField from "@/components/AddressValidationField";
import { metricsFor } from "@/lib/record-derive";
import { useListView, applyList, exportCsv, ListToolbar, SortHead } from "@/components/ListView";

const SOURCES = ["Referral", "Door Knock", "Google", "Storm", "Insurance", "Website"];
const DATE_RANGES = [
  { key: "all", label: "All time", ms: Infinity },
  { key: "today", label: "Today", ms: 86400000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 86400000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 86400000 },
  { key: "90d", label: "Last 90 days", ms: 90 * 86400000 },
];

// pipeline order index for sorting/sorting by stage
function stageOrder(j: Job) {
  const stages = STAGES[j.flow] || STAGES.SALES;
  const i = stages.indexOf(j.stage);
  return i < 0 ? 999 : i;
}

const SEG_REQUIRED: { key: keyof SegValues; label: string }[] = [
  { key: "department", label: "Department" },
];
const SEG_TRACKED: { key: keyof SegValues; label: string }[] = [
  { key: "department", label: "Department" },
  { key: "workType", label: "Work Type" },
  { key: "classification", label: "Classification" },
  { key: "serviceType", label: "Service Type" },
  { key: "location", label: "Location" },
  { key: "leadSource", label: "Lead Source" },
  { key: "bidType", label: "Bid Type" },
];

export default function Leads() {
  const { toast } = useToast();
  const { user } = useApp();
  const [, navigate] = useLocation();
  const { data: jobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: estimates = [] } = useQuery<Estimate[]>({ queryKey: ["/api/estimates"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"list" | "kanban">(() => (safeStorage.getItem("opps:view") as any) || "list");
  const [dateRange, setDateRange] = useState<string>(() => safeStorage.getItem("opps:dateRange") || "all");

  useEffect(() => { safeStorage.setItem("opps:view", view); }, [view]);
  useEffect(() => { safeStorage.setItem("opps:dateRange", dateRange); }, [dateRange]);

  const repName = (id: number | null) => users.find((u) => u.id === id)?.name || "—";

  // Per-opportunity financial roll-up from its estimates (uses the same build model).
  const finFor = useMemo(() => {
    const map = new Map<number, { labor: number; material: number; bid: number; margin: number; gpm: number }>();
    for (const j of jobs) {
      const jobEsts = estimates.filter((e) => e.jobId === j.id);
      if (!jobEsts.length) continue;
      // prefer accepted/sent estimate, else latest
      const est = jobEsts.find((e) => e.status === "Accepted") || jobEsts[jobEsts.length - 1];
      try {
        const m = metricsFor(est, est.jobType || j.jobType || "Residential Re-Roof");
        map.set(j.id, m);
      } catch { /* ignore bad build */ }
    }
    return map;
  }, [jobs, estimates]);

  const { state, setQ, setMine, setFilter, toggleSort } = useListView("opportunities", { sortKey: "stage", sortDir: "asc" });

  const rangeMs = DATE_RANGES.find((r) => r.key === dateRange)?.ms ?? Infinity;

  const filtered = useMemo(() => applyList(jobs, state, {
    searchText: (j) => `${j.customer} ${j.address || ""} ${j.phone || ""} ${j.createdBy || ""}`,
    isMine: (j) => j.repId === user?.id || j.createdBy === user?.name,
    filterMatch: (j, f) => {
      if (f.source && f.source !== "all" && j.source !== f.source) return false;
      if (rangeMs !== Infinity && (Date.now() - (j.createdAt || 0)) > rangeMs) return false;
      return true;
    },
    sortValue: (j, k) =>
      k === "stage" ? stageOrder(j)
        : k === "value" ? (j.value || 0)
        : k === "score" ? (j.leadScore || 0)
        : k === "bid" ? (finFor.get(j.id)?.bid || 0)
        : k === "margin" ? (finFor.get(j.id)?.margin || 0)
        : k === "created" ? (j.createdAt || 0)
        : j.customer,
  }), [jobs, state, user, rangeMs, finFor]);

  const kpis = useMemo(() => {
    let labor = 0, material = 0, bid = 0, margin = 0;
    for (const j of filtered) {
      const m = finFor.get(j.id);
      if (m) { labor += m.labor; material += m.material; bid += m.bid; margin += m.margin; }
    }
    const gpm = bid ? (margin / bid) * 100 : 0;
    return { labor, material, bid, margin, gpm };
  }, [filtered, finFor]);

  const create = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/jobs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      setDialogOpen(false);
      toast({ title: "Opportunity created", description: "New opportunity added to the Sales pipeline." });
    },
  });

  const doExport = () => exportCsv("impact-opportunities.csv",
    ["Customer", "Phone", "Address", "Source", "Type", "Flow", "Stage", "Created By", "Value", "Bid", "Margin", "GPM%", "Score", "Rep"],
    filtered.map((j) => {
      const m = finFor.get(j.id);
      return [j.customer, j.phone || "", j.address || "", j.source || "", j.jobType || "", j.flow, j.stage,
        j.createdBy || "", j.value || 0, m?.bid || 0, m?.margin || 0, m ? m.gpm.toFixed(1) : "", j.leadScore || 0, repName(j.repId)];
    }));

  const missingSeg = (j: Job) => SEG_TRACKED.filter((f) => !(j as any)[f.key]).map((f) => f.label);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Opportunities"
        subtitle={`${filtered.length} of ${jobs.length} records`}
        actions={
          <div className="flex gap-2 items-center">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setView("list")} className={cn("px-2.5 py-1.5", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-accent")} data-testid="button-view-list"><ListIcon className="h-4 w-4" /></button>
              <button onClick={() => setView("kanban")} className={cn("px-2.5 py-1.5", view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-accent")} data-testid="button-view-kanban"><LayoutGrid className="h-4 w-4" /></button>
            </div>
            <NewLeadDialog
              open={dialogOpen}
              setOpen={setDialogOpen}
              users={users}
              defaultRep={user?.role === "Sales Rep" ? user.id : null}
              onSubmit={(b) => create.mutate(b)}
              pending={create.isPending}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="opp-kpi-bar">
        <KpiCard label="Labor" value={money(kpis.labor)} />
        <KpiCard label="Material" value={money(kpis.material)} />
        <KpiCard label="Bid" value={money(kpis.bid)} accent />
        <KpiCard label="Margin" value={<span className={marginColor(kpis.gpm)}>{money(kpis.margin)}</span>} />
        <KpiCard label="GPM" value={<span className={marginColor(kpis.gpm)}>{pct(kpis.gpm, 1)}</span>} />
      </div>

      <ListToolbar
        q={state.q} onQ={setQ}
        mine={state.mine} onMine={setMine}
        onExport={doExport}
        placeholder="Search opportunities by name, address, phone…"
        count={filtered.length} total={jobs.length}
        extra={
          <>
            <Select value={state.filters.source || "all"} onValueChange={(v) => setFilter("source", v)}>
              <SelectTrigger className="w-[150px] h-9" data-testid="select-source-filter"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px] h-9" data-testid="select-date-range"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading opportunities…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card"><EmptyState title="No opportunities match" hint="Try clearing filters or add a new opportunity." /></div>
      ) : view === "kanban" ? (
        <KanbanView jobs={filtered} finFor={finFor} onOpen={(id) => navigate(`/opportunities/${id}`)} missingSeg={missingSeg} />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHead label="Customer" sortKey="customer" state={state} onSort={toggleSort} /></TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden lg:table-cell"><SortHead label="Stage" sortKey="stage" state={state} onSort={toggleSort} /></TableHead>
                <TableHead className="hidden sm:table-cell">Created By</TableHead>
                <TableHead className="text-right"><SortHead label="Contract" sortKey="value" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right hidden lg:table-cell"><SortHead label="Bid" sortKey="bid" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right hidden lg:table-cell"><SortHead label="Margin" sortKey="margin" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-center"><SortHead label="Score" sortKey="score" state={state} onSort={toggleSort} align="center" /></TableHead>
                <TableHead className="hidden xl:table-cell text-right">Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((j) => {
                const m = finFor.get(j.id);
                const missing = missingSeg(j);
                return (
                  <TableRow key={j.id} className="cursor-pointer" onClick={() => navigate(`/opportunities/${j.id}`)} data-testid={`row-lead-${j.id}`}>
                    <TableCell>
                      <div className="font-medium flex items-center gap-1.5" data-testid={`text-lead-name-${j.id}`}>
                        {j.customer}
                        {missing.length > 0 && (
                          <span title={`Unfilled: ${missing.join(", ")}`} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 bg-amber-400/20 text-amber-700 dark:text-amber-300 text-[10px]" data-testid={`seg-warning-${j.id}`}>
                            <AlertTriangle className="h-3 w-3" /> {missing.length}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{j.address}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell"><JobTypeBadge jobType={j.jobType} /></TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm">{j.stage}</div>
                      <div className="text-xs text-muted-foreground">{j.flow}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      <div>{j.createdBy || "—"}</div>
                      <div className="text-xs text-muted-foreground">{repName(j.repId)}</div>
                    </TableCell>
                    <TableCell className="text-right tnum font-medium">{money(j.value)}</TableCell>
                    <TableCell className="text-right tnum hidden lg:table-cell">{m ? money(m.bid) : "—"}</TableCell>
                    <TableCell className={cn("text-right tnum hidden lg:table-cell", m && marginColor(m.gpm))}>{m ? money(m.margin) : "—"}</TableCell>
                    <TableCell className="text-center"><ScoreBadge score={{ total: j.leadScore || 0, breakdown: [] }} /></TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-xs text-muted-foreground">{timeAgo(j.lastActivityAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function KanbanView({ jobs, finFor, onOpen, missingSeg }: {
  jobs: Job[]; finFor: Map<number, any>; onOpen: (id: number) => void; missingSeg: (j: Job) => string[];
}) {
  // Group by stage, columns ordered by pipeline order within each job's flow.
  // We render one combined board ordered by the SALES pipeline, falling back per flow.
  const byStage = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const j of jobs) {
      const arr = map.get(j.stage) || [];
      arr.push(j); map.set(j.stage, arr);
    }
    return map;
  }, [jobs]);

  // ordered union of stages across present flows, by pipeline order
  const stages = useMemo(() => {
    const present = Array.from(byStage.keys());
    return present.sort((a, b) => {
      const oa = orderOf(a), ob = orderOf(b);
      return oa - ob;
    });
  }, [byStage]);

  function orderOf(stage: string) {
    for (const flow of Object.keys(STAGES)) {
      const i = STAGES[flow].indexOf(stage);
      if (i >= 0) return i;
    }
    return 999;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" data-testid="opp-kanban">
      {stages.map((stage) => {
        const col = byStage.get(stage) || [];
        return (
          <div key={stage} className="min-w-[260px] w-[260px] shrink-0 rounded-xl border border-border bg-card">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">{stage}</span>
              <Badge variant="secondary" className="font-normal">{col.length}</Badge>
            </div>
            <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
              {col.map((j) => {
                const m = finFor.get(j.id);
                const missing = missingSeg(j);
                return (
                  <button key={j.id} onClick={() => onOpen(j.id)} className="w-full text-left rounded-lg border border-border p-2.5 hover:bg-accent" data-testid={`kanban-card-${j.id}`}>
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      {j.customer}
                      {missing.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{j.address}</div>
                    <div className="flex items-center justify-between mt-1.5 text-xs">
                      <span className="tnum font-medium">{money(j.value)}</span>
                      {m && <span className={cn("tnum", marginColor(m.gpm))}>{pct(m.gpm, 0)} GPM</span>}
                    </div>
                  </button>
                );
              })}
              {col.length === 0 && <div className="text-xs text-muted-foreground p-2">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CHECKLIST_ITEMS = [
  { key: "signedContract", label: "Signed contract / agreement on file" },
  { key: "depositCollected", label: "Deposit collected or financing confirmed" },
  { key: "materialsConfirmed", label: "Material selections confirmed with customer" },
  { key: "measurementsVerified", label: "Measurements & scope verified" },
  { key: "permitsScheduled", label: "Permits / HOA approvals initiated" },
];

export function PreProductionChecklistDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useApp();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [bidType, setBidType] = useState<string>(job.bidType || "");
  const allChecked = CHECKLIST_ITEMS.every((c) => checks[c.key]);

  const convert = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${job.id}/convert`, {
      checklist: checks, bidType: bidType || undefined, _actor: user?.name || "system",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id] });
      toast({ title: "Moved to Pre-Production", description: `${job.customer} routed through the Pre-Production stage.` });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Pre-Production Checklist</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Complete all items to convert <span className="font-medium text-foreground">{job.customer}</span> and route it through Pre-Production.</p>
        <div className="space-y-2">
          {CHECKLIST_ITEMS.map((c) => (
            <label key={c.key} className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-accent" data-testid={`checklist-${c.key}`}>
              <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((s) => ({ ...s, [c.key]: e.target.checked }))} className="mt-0.5 accent-primary" />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Bid Type</Label>
          <Select value={bidType || "none"} onValueChange={(v) => setBidType(v === "none" ? "" : v)}>
            <SelectTrigger data-testid="select-convert-bidtype"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {SEG_BID_TYPE.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => convert.mutate()} disabled={!allChecked || convert.isPending} data-testid="button-confirm-convert">
            {convert.isPending ? "Converting…" : "Convert → Pre-Production"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewLeadDialog({
  open, setOpen, users, defaultRep, onSubmit, pending,
}: {
  open: boolean; setOpen: (b: boolean) => void; users: User[];
  defaultRep: number | null; onSubmit: (b: any) => void; pending: boolean;
}) {
  const { user } = useApp();
  const [f, setF] = useState<any>({
    customer: "", phone: "", email: "", address: "",
    source: "Referral", jobType: "Residential Re-Roof", value: 0, repId: defaultRep,
    department: "", workType: "", classification: "", priority: "Normal",
    serviceType: "", location: "", leadSource: "", bidType: "",
  });
  const reps = users.filter((u) => ["Sales Rep", "Manager", "Admin"].includes(u.role));
  const submit = () => {
    if (!f.customer.trim()) return;
    onSubmit({
      ...f, value: Number(f.value) || 0, repId: f.repId ? Number(f.repId) : null,
      property: f.address, createdBy: user?.name || "",
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-new-lead">
          <Plus className="h-4 w-4 mr-1.5" /> New Opportunity
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Opportunity</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Customer name</Label>
            <Input value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} data-testid="input-customer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="input-phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="input-email" />
            </div>
          </div>
          <AddressValidationField
            value={f.address}
            onChange={(v) => setF((prev: any) => ({ ...prev, address: v, addressVerified: false }))}
            onValidated={(fields) => setF((prev: any) => ({ ...prev, ...fields }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={f.source} onValueChange={(v) => setF({ ...f, source: v })}>
                <SelectTrigger data-testid="select-lead-source"><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Job type</Label>
              <Select value={f.jobType} onValueChange={(v) => setF({ ...f, jobType: v })}>
                <SelectTrigger data-testid="select-lead-type"><SelectValue /></SelectTrigger>
                <SelectContent>{(JOB_TYPES as readonly string[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Est. value ($)</Label>
              <Input type="number" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} data-testid="input-value" />
            </div>
            <div className="space-y-1.5">
              <Label>Assign rep</Label>
              <Select value={f.repId ? String(f.repId) : "none"} onValueChange={(v) => setF({ ...f, repId: v === "none" ? null : Number(v) })}>
                <SelectTrigger data-testid="select-lead-rep"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {reps.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-3">
            <div className="text-sm font-semibold">Segmentation &amp; Details</div>
            <SegmentationBlock
              values={f as SegValues}
              onChange={(v) => setF({ ...f, ...v })}
              columns={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !f.customer.trim()} data-testid="button-save-lead">
            {pending ? "Creating…" : "Create Opportunity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
