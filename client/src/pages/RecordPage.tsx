// Update 6: full-page record view (replaces the right-side drawer) for both
// Opportunities and Jobs. Routes: /opportunities/:id and /jobs/:id.
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui-bits";
import { money, pct, marginColor, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, ChevronRight, Plus, X, FileText, ChevronDown, MapPin, Camera, ImageIcon, ExternalLink,
} from "lucide-react";
import { TeamFeed } from "@/components/JobDrawer";
import { SegmentationBlock, type SegValues } from "@/components/Segmentation";
import { WorkOrdersTab } from "@/components/WorkOrder";
import { metricsFor } from "@/lib/record-derive";
import { STAGES, STAKEHOLDER_ROLES, READY_FOR_PROD_CHECKLIST } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { JobTypeBadge } from "@/pages/Estimates";
import { PreProductionChecklistDialog } from "@/pages/Leads";

// Labor-budget benchmark: an estimate's labor share of bid at/under this target
// is "meeting or beating" the labor plan (green); above it is "behind" (red).
const LABOR_TARGET_PCT = 35;

function dateLabel(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}
function dateTimeLabel(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });
}
function initials(name: string) {
  return (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}
function safe(json: string, fb: any) { try { return JSON.parse(json || ""); } catch { return fb; } }

export function OpportunityPage() {
  const [, params] = useRoute("/opportunities/:id");
  return <RecordPage id={params?.id ? Number(params.id) : null} kind="opportunity" />;
}
export function JobPage() {
  const [, params] = useRoute("/jobs/:id");
  return <RecordPage id={params?.id ? Number(params.id) : null} kind="job" />;
}

function RecordPage({ id, kind }: { id: number | null; kind: "opportunity" | "job" }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { users } = useApp();

  const { data: job, isLoading } = useQuery<any>({
    queryKey: ["/api/jobs", id],
    queryFn: () => apiRequest("GET", `/api/jobs/${id}`).then((r) => r.json()),
    enabled: id != null,
  });
  const { data: est } = useQuery<any>({
    queryKey: ["/api/jobs", id, "estimate"],
    queryFn: () => apiRequest("GET", `/api/jobs/${id}/estimate`).then((r) => r.json()),
    enabled: id != null,
  });
  const { data: fin } = useQuery<any>({
    queryKey: ["/api/jobs", id, "financials"],
    queryFn: () => apiRequest("GET", `/api/jobs/${id}/financials`).then((r) => r.json()),
    enabled: id != null && !!job?.isActiveJob,
  });
  const { data: estimates = [] } = useQuery<any[]>({ queryKey: ["/api/estimates"] });

  const [draft, setDraft] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  useEffect(() => {
    if (job && !draft) {
      setDraft({
        customer: job.customer || "",
        property: job.property || job.address || "",
        stage: job.stage || "",
        description: job.description || "",
        department: job.department, workType: job.workType, classification: job.classification,
        priority: job.priority, serviceType: job.serviceType, location: job.location,
        leadSource: job.leadSource, bidType: job.bidType,
        stakeholders: safe(job.stakeholdersJson, {}),
        additionalContacts: safe(job.additionalContactsJson, []),
        salesSplit: safe(job.salesSplitJson, []),
        readyForProdChecklist: safe(job.readyForProdChecklistJson, {}),
      });
    }
  }, [job]);

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${id}`, {
      customer: draft.customer, property: draft.property, stage: draft.stage,
      description: draft.description,
      department: draft.department, workType: draft.workType, classification: draft.classification,
      priority: draft.priority, serviceType: draft.serviceType, location: draft.location,
      leadSource: draft.leadSource, bidType: draft.bidType,
      stakeholdersJson: JSON.stringify(draft.stakeholders),
      additionalContactsJson: JSON.stringify(draft.additionalContacts),
      salesSplitJson: JSON.stringify(draft.salesSplit),
      readyForProdChecklistJson: JSON.stringify(draft.readyForProdChecklist),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Saved" });
    },
  });

  if (isLoading || !job || !draft) return <div className="p-8 text-sm text-muted-foreground">Loading record…</div>;

  const jobType: string = est?.jobType || job?.jobType || "Residential Re-Roof";
  const m = est ? metricsFor(est, jobType) : null;
  const jobEstimates = estimates.filter((e) => e.jobId === job.id);
  const backHref = kind === "job" ? "/jobs" : "/opportunities";
  const crumb = kind === "job" ? "Job" : "Opportunity";

  const setSeg = (v: SegValues) => setDraft({ ...draft, ...v });

  // Ready-for-Production gate: all four checks must pass before advancing
  // past "Ready for Production" to a later production stage.
  const flowStages: string[] = STAGES[job.flow] || STAGES.SALES;
  const rfpIndex = flowStages.indexOf("Ready for Production");
  const showRfpGate = draft.stage === "Ready for Production" && rfpIndex >= 0;
  const rfpComplete = READY_FOR_PROD_CHECKLIST.every((c) => !!draft.readyForProdChecklist?.[c.key]);
  const toggleRfp = (key: string, v: boolean) =>
    setDraft({ ...draft, readyForProdChecklist: { ...draft.readyForProdChecklist, [key]: v } });
  const onStageChange = (v: string) => {
    const targetIdx = flowStages.indexOf(v);
    // block forward movement out of Ready for Production until all checks pass
    if (draft.stage === "Ready for Production" && rfpIndex >= 0 && targetIdx > rfpIndex && !rfpComplete) {
      toast({ title: "Complete the Ready for Production checklist", description: "All four items must be checked before advancing.", variant: "destructive" });
      return;
    }
    setDraft({ ...draft, stage: v });
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-10">
      {/* Breadcrumb header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          <button onClick={() => navigate(backHref)} className="text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="button-back-record">
            <ArrowLeft className="w-4 h-4" /> {crumb}
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-semibold truncate">{job.address || job.customer} - {dateLabel(job.createdAt)}</span>
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-record">
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview" data-testid="tab-record-overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="feed" data-testid="tab-record-feed">Team Feed</TabsTrigger>
            <TabsTrigger value="estimates" data-testid="tab-record-estimates">Estimates</TabsTrigger>
            <TabsTrigger value="workorders" data-testid="tab-record-workorders">Work Orders</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
          </TabsList>
          {kind === "opportunity" && (
            <Button size="sm" variant="outline" onClick={() => setConverting(true)} data-testid="button-convert-record">
              Convert
            </Button>
          )}
        </div>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-5">
          {/* Color metric strip */}
          {m && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="metric-strip">
              <Metric label="Labor" value={money(m.labor)} tint="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" />
              <Metric label="Material" value={money(m.material)} tint="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" />
              <Metric label="Bid" value={money(m.bid)} tint="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" />
              <Metric label="Margin" value={money(m.margin)} tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" />
              <Metric label="GPM" value={pct(m.gpm, 1)} tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" />
            </div>
          )}

          {/* Job financials summary (job mode) */}
          {kind === "job" && fin && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Financials Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Field label="Contract" value={money(fin.contractValue)} />
                <Field label="Cost to date" value={money(fin.costToDate)} />
                <Field label="% Complete" value={pct(fin.pctComplete * 100, 0)} />
                <Field label="Billed" value={money(fin.billed)} />
                <Field label="Projected profit" value={money(fin.projectedProfit)} />
                <Field label="Proj. margin" value={<span className={marginColor(fin.projMargin, 35)}>{pct(fin.projMargin, 1)}</span>} />
              </div>
            </div>
          )}

          {/* Opportunity / Record Details */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">{crumb} Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer</Label>
                <Select value={draft.customer} onValueChange={(v) => setDraft({ ...draft, customer: v })}>
                  <SelectTrigger data-testid="select-record-customer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={job.customer}>{job.customer}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Property</Label>
                <Input value={draft.property} onChange={(e) => setDraft({ ...draft, property: e.target.value })} data-testid="input-record-property" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={draft.stage} onValueChange={onStageChange}>
                  <SelectTrigger data-testid="select-record-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {flowStages.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Ready for Production gate */}
            {showRfpGate && (
              <div className={cn("rounded-lg border p-3 space-y-2.5", rfpComplete ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5")} data-testid="rfp-gate">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Ready for Production Checklist</Label>
                  <span className={cn("text-xs font-medium", rfpComplete ? "text-emerald-600" : "text-amber-600")}>
                    {rfpComplete ? "All checks complete" : "Required before advancing"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {READY_FOR_PROD_CHECKLIST.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`rfp-check-${c.key}`}>
                      <Checkbox checked={!!draft.readyForProdChecklist?.[c.key]} onCheckedChange={(v) => toggleRfp(c.key, !!v)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Created by {job.createdBy || "—"} · {dateTimeLabel(job.createdAt)}
            </div>

            {/* Additional contacts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Additional Contacts</Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft({ ...draft, additionalContacts: [...draft.additionalContacts, { name: "", phone: "", email: "" }] })} data-testid="button-add-contact">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Contact
                </Button>
              </div>
              {draft.additionalContacts.map((c: any, i: number) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <Input placeholder="Name" value={c.name} onChange={(e) => updateContact(setDraft, draft, i, "name", e.target.value)} />
                  <Input placeholder="Phone" value={c.phone} onChange={(e) => updateContact(setDraft, draft, i, "phone", e.target.value)} />
                  <Input placeholder="Email" value={c.email} onChange={(e) => updateContact(setDraft, draft, i, "email", e.target.value)} />
                  <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, additionalContacts: draft.additionalContacts.filter((_: any, j: number) => j !== i) })}><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>

            {/* Stakeholders */}
            <div className="space-y-2">
              <Label className="text-xs">Stakeholders</Label>
              <div className="flex flex-wrap gap-2">
                {STAKEHOLDER_ROLES.map((role) => {
                  const uid = draft.stakeholders[role];
                  const u = users.find((x) => x.id === uid);
                  if (u) {
                    return (
                      <span key={role} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20" data-testid={`chip-stakeholder-${role}`}>
                        <span className="w-5 h-5 rounded-full bg-primary/20 grid place-items-center text-[9px] font-bold">{initials(u.name)}</span>
                        <span>{role}: {u.name}</span>
                        <button onClick={() => setStakeholder(setDraft, draft, role, null)}><X className="w-3 h-3" /></button>
                      </span>
                    );
                  }
                  return (
                    <Select key={role} value="" onValueChange={(v) => setStakeholder(setDraft, draft, role, Number(v))}>
                      <SelectTrigger className="h-7 w-auto rounded-full text-xs border-dashed gap-1 px-2.5" data-testid={`add-stakeholder-${role}`}>
                        <Plus className="w-3 h-3" /> {role}
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  );
                })}
              </div>
            </div>

            {/* Sales split */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" data-testid="toggle-sales-split">
                <ChevronDown className="w-3.5 h-3.5" /> Adjust Sales Split
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraft({ ...draft, salesSplit: [...draft.salesSplit, { userId: users[0]?.id, pct: 0 }] })}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add split
                </Button>
                {draft.salesSplit.map((s: any, i: number) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2 items-center">
                    <Select value={String(s.userId)} onValueChange={(v) => updateSplit(setDraft, draft, i, "userId", Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" value={s.pct} onChange={(e) => updateSplit(setDraft, draft, i, "pct", Number(e.target.value))} placeholder="%" />
                    <Button size="icon" variant="ghost" onClick={() => setDraft({ ...draft, salesSplit: draft.salesSplit.filter((_: any, j: number) => j !== i) })}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} data-testid="input-record-description" />
            </div>
          </div>

          {/* Segmentation & Details */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Segmentation & Details</h3>
            <SegmentationBlock values={draft} onChange={setSeg} columns={3} />
          </div>

          {/* Estimates */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Estimates</h3>
              <Button size="sm" variant="outline" onClick={() => navigate(`/estimates?job=${job.id}`)} data-testid="button-new-estimate-record">
                <Plus className="w-4 h-4 mr-1.5" /> New Estimate
              </Button>
            </div>
            {jobEstimates.length === 0 ? (
              <EmptyState title="No estimates yet" hint="Create the first estimate for this record." />
            ) : (
              <div className="space-y-2">
                {jobEstimates.map((e) => (
                  <button key={e.id} onClick={() => navigate(`/proposals/${e.id}`)} className="flex items-center justify-between w-full p-2.5 rounded-lg border border-border hover:bg-accent text-left" data-testid={`row-estimate-${e.id}`}>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>Estimate #{e.id} · {e.jobType}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tnum text-sm font-medium">{money(e.totalPrice)}</span>
                      <Badge variant="outline">{e.status}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4"><JobTasks jobId={job.id} /></TabsContent>
        <TabsContent value="notes" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-xs">Notes</Label>
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={6} className="mt-1.5" />
            <Button size="sm" className="mt-2" onClick={() => save.mutate()}>Save notes</Button>
          </div>
        </TabsContent>
        <TabsContent value="feed" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <TeamFeed jobId={job.id} users={users} />
          </div>
        </TabsContent>
        <TabsContent value="estimates" className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Estimates</h3>
            <Button size="sm" variant="outline" onClick={() => navigate(`/estimates?job=${job.id}`)}>
              <Plus className="w-4 h-4 mr-1.5" /> New Estimate
            </Button>
          </div>
          {jobEstimates.length === 0 ? <EmptyState title="No estimates yet" /> : (
            <div className="rounded-xl border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2.5">Estimate</th>
                    <th className="text-right p-2.5">Bid</th>
                    <th className="text-right p-2.5">Labor</th>
                    <th className="text-right p-2.5">Material</th>
                    <th className="text-right p-2.5">Total Cost</th>
                    <th className="text-right p-2.5">Margin</th>
                    <th className="text-right p-2.5">GPM</th>
                    <th className="text-right p-2.5" title="Labor share of bid vs the 35% labor target — green meets/beats target, red is behind">Labor %</th>
                    <th className="text-right p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobEstimates.map((e) => {
                    const em = metricsFor(e, e.jobType || jobType);
                    const cost = em.labor + em.material;
                    const laborPct = em.bid > 0 ? (em.labor / em.bid) * 100 : 0;
                    const meetsLabor = laborPct <= LABOR_TARGET_PCT;
                    return (
                      <tr key={e.id} className="border-t border-border hover:bg-accent cursor-pointer" onClick={() => navigate(`/proposals/${e.id}`)} data-testid={`estimate-table-row-${e.id}`}>
                        <td className="p-2.5"><div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /><span>#{e.id} · {e.jobType}</span></div></td>
                        <td className="p-2.5 text-right tnum">{money(em.bid)}</td>
                        <td className="p-2.5 text-right tnum">{money(em.labor)}</td>
                        <td className="p-2.5 text-right tnum">{money(em.material)}</td>
                        <td className="p-2.5 text-right tnum">{money(cost)}</td>
                        <td className="p-2.5 text-right tnum">{money(em.margin)}</td>
                        <td className={cn("p-2.5 text-right tnum font-medium", em.gpm >= 35 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{pct(em.gpm, 1)}</td>
                        <td className={cn("p-2.5 text-right tnum font-medium", meetsLabor ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} data-testid={`estimate-labor-pct-${e.id}`}>{pct(laborPct, 1)}</td>
                        <td className="p-2.5 text-right"><Badge variant="outline">{e.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="workorders" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <WorkOrdersTab job={job} est={est} />
          </div>
        </TabsContent>
        <TabsContent value="photos" className="mt-4">
          <CompanyCamPanel job={job} />
        </TabsContent>
      </Tabs>

      {converting && (
        <PreProductionChecklistDialog job={job} onClose={() => setConverting(false)} />
      )}
    </div>
  );
}

function JobTasks({ jobId }: { jobId: number }) {
  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs", jobId, "tasks"],
    queryFn: () => apiRequest("GET", `/api/jobs/${jobId}/tasks`).then((r) => r.json()),
  });
  if (tasks.length === 0) return <EmptyState title="No tasks" />;
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-sm p-2.5 rounded-lg border border-border bg-card">
          <input type="checkbox" checked={!!t.done} readOnly className="accent-primary" />
          <span className={t.done ? "line-through text-muted-foreground" : ""}>{t.title}</span>
        </div>
      ))}
    </div>
  );
}

/* CompanyCam placeholder (Update 6). "Create CompanyCam Project" sets a fake
   companyCamProjectId + timestamp on the job; no real external API call. The
   gallery below is a placeholder grid until the integration is wired up. */
function CompanyCamPanel({ job }: { job: any }) {
  const { toast } = useToast();
  const linked = !!job.companyCamProjectId;
  const create = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/jobs/${job.id}`, {
      companyCamProjectId: `CC-${job.id}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      companyCamCreatedAt: Date.now(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "CompanyCam project created", description: "Integration pending — placeholder project linked." });
    },
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">CompanyCam Photos</h3>
          {linked && <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-normal">Linked · {job.companyCamProjectId}</Badge>}
        </div>
        {linked ? (
          <Button size="sm" variant="outline" onClick={() => toast({ title: "Integration pending", description: "Opening CompanyCam is not yet wired up." })} data-testid="button-open-companycam">
            <ExternalLink className="w-4 h-4 mr-1.5" /> Open in CompanyCam
          </Button>
        ) : (
          <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} data-testid="button-create-companycam">
            <Camera className="w-4 h-4 mr-1.5" /> Create CompanyCam Project
          </Button>
        )}
      </div>

      {linked ? (
        <>
          <div className="text-xs text-muted-foreground">
            Project created {timeAgo(job.companyCamCreatedAt)}. Photos sync from the field once the integration is enabled (placeholder gallery shown).
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg border border-dashed border-border bg-muted/40 grid place-items-center text-muted-foreground" data-testid={`companycam-placeholder-${i}`}>
                <ImageIcon className="w-6 h-6 opacity-40" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title="No CompanyCam project" hint="Create a CompanyCam project to organize field photos for this job. (Integration pending — placeholder.)" />
      )}
    </div>
  );
}

function Metric({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tint}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-70 font-medium">{label}</div>
      <div className="text-lg font-bold tnum mt-0.5">{value}</div>
    </div>
  );
}
function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground font-medium">{label}</div>
      <div className="font-medium tnum">{value ?? "—"}</div>
    </div>
  );
}
function updateContact(setDraft: any, draft: any, i: number, k: string, v: string) {
  setDraft({ ...draft, additionalContacts: draft.additionalContacts.map((c: any, j: number) => j === i ? { ...c, [k]: v } : c) });
}
function updateSplit(setDraft: any, draft: any, i: number, k: string, v: any) {
  setDraft({ ...draft, salesSplit: draft.salesSplit.map((s: any, j: number) => j === i ? { ...s, [k]: v } : s) });
}
function setStakeholder(setDraft: any, draft: any, role: string, uid: number | null) {
  const next = { ...draft.stakeholders };
  if (uid == null) delete next[role]; else next[role] = uid;
  setDraft({ ...draft, stakeholders: next });
}
