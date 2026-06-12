import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  STAGES, ALL_STAGES_ORDERED, TRIGGER_CONDITION_FIELDS, TRIGGER_TYPES,
  PROJECT_TRIGGER_TYPES, STOP_ACTIONS,
} from "@shared/schema";
import type { Trigger, Campaign } from "@shared/schema";
import { ArrowRight, Plus, Info, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function safe(json: string, fb: any) { try { return JSON.parse(json || ""); } catch { return fb; } }

/* ───────────────────────── Trigger tile ───────────────────────── */
function TriggerTile({ t, campaigns, onEdit }: { t: Trigger; campaigns: Campaign[]; onEdit: () => void }) {
  const groups = safe(t.conditionGroupsJson, []) as any[];
  const firstCond = groups[0]?.conditions || {};
  const condEntries = Object.entries(firstCond);
  const startCampaign = campaigns.find((c) => c.id === t.startCampaignId);
  const typeLabel = t.projectTriggerType === "Event Type" ? "Event Type" : "Project Stage";
  const extraSets = groups.length;

  return (
    <button
      onClick={onEdit}
      className="text-left rounded-lg border border-card-border bg-card p-3 flex flex-col gap-2 hover:border-primary/50 transition-colors"
      data-testid={`trigger-tile-${t.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{typeLabel}</div>
          <div className="font-semibold text-[13px] uppercase leading-tight truncate">{t.name}</div>
        </div>
        <span className={`flex items-center gap-1 text-[11px] shrink-0 ${t.active ? "text-emerald-600" : "text-muted-foreground"}`}>
          <span className={`w-2 h-2 rounded-full ${t.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          {t.active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="space-y-1 text-[12px]">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">IF</span>
          {condEntries.length ? (
            <span className="text-muted-foreground truncate">{(condEntries[0] as [string, string])[0].replace(/ Is$/, "")}: {(condEntries[0] as [string, string])[1]}{condEntries.length > 1 ? ` +${condEntries.length - 1}` : ""}</span>
          ) : (
            <span className="text-muted-foreground">Add Condition</span>
          )}
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Start:</span>
          <span className="truncate">{startCampaign ? startCampaign.name : "No Workflow Selected"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Stop:</span>
          <span className="truncate">{t.stopAction === "Don't Stop Workflows" ? "Don't Stop Workflows" : "Stop All Workflows"}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border text-[11px] text-muted-foreground">
        <span className="min-w-[18px] h-[18px] px-1 rounded bg-muted grid place-items-center font-semibold text-foreground">{extraSets}</span>
        Extra condition sets
      </div>
    </button>
  );
}

/* ───────────────────────── Edit Workflow Trigger modal ───────────────────────── */
function EditTriggerModal({ trigger, campaigns, onClose }: { trigger: Trigger; campaigns: Campaign[]; onClose: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>({
    triggerType: trigger.triggerType,
    projectTriggerType: trigger.projectTriggerType,
    stage: trigger.stage || "",
    active: trigger.active,
    startCampaignId: trigger.startCampaignId,
    stopAction: trigger.stopAction,
    groups: (() => {
      const g = safe(trigger.conditionGroupsJson, []) as any[];
      return g.length ? g : [{ conditions: {} }];
    })(),
  });

  const setCond = (gi: number, field: string, value: string) => {
    setF((p: any) => {
      const groups = p.groups.map((g: any, i: number) =>
        i === gi ? { ...g, conditions: { ...g.conditions, [field]: value } } : g);
      return { ...p, groups };
    });
  };
  const removeGroup = (gi: number) => setF((p: any) => ({ ...p, groups: p.groups.filter((_: any, i: number) => i !== gi) }));
  const addGroup = () => setF((p: any) => ({ ...p, groups: [...p.groups, { conditions: {} }] }));

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/triggers/${trigger.id}`, {
      triggerType: f.triggerType,
      projectTriggerType: f.projectTriggerType,
      stage: f.stage || null,
      active: f.active,
      startCampaignId: f.startCampaignId ?? null,
      stopAction: f.stopAction,
      conditionGroupsJson: JSON.stringify(f.groups.filter((g: any) => Object.keys(g.conditions || {}).length)),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/triggers"] }); toast({ title: "Trigger saved" }); onClose(); },
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/triggers/${trigger.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/triggers"] }); toast({ title: "Trigger deleted" }); onClose(); },
  });

  const condOptions: Record<string, string[]> = {
    "Project Location Is": [...STAGES.SALES.slice(0, 0), "Fort Collins", "Loveland", "Greeley", "Windsor", "Denver", "Other"],
    "Project Category Is": ["Residential", "Commercial", "Multi-Family", "HOA"],
    "Project Type Is": ["Retail", "Insurance", "Bid/GC", "Warranty"],
    "Lead Source Is": ["Google", "Referral", "Door Knock", "Facebook", "Website", "Insurance Partner", "Other"],
    "Project Services Include": ["Roofing", "Gutters", "Siding", "Painting", "Service"],
    "Project Tags Include": ["Blacklist", "VIP", "Repeat", "Storm"],
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="edit-trigger-modal">
        <DialogHeader>
          <DialogTitle>Edit Workflow Trigger</DialogTitle>
        </DialogHeader>

        {/* status toggle */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-sm text-muted-foreground">Workflow Trigger Status</span>
          <div className="flex items-center gap-2">
            <Switch checked={f.active} onCheckedChange={(c) => setF({ ...f, active: c })} data-testid="trigger-status-toggle" />
            <span className="text-sm">{f.active ? "Active" : "Inactive"}</span>
          </div>
        </div>

        {/* trigger type tabs */}
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Trigger Type</div>
          <div className="flex rounded-md border border-border overflow-hidden">
            {TRIGGER_TYPES.map((tt) => (
              <button
                key={tt}
                onClick={() => setF({ ...f, triggerType: tt })}
                className={`flex-1 text-sm py-1.5 ${f.triggerType === tt ? "bg-muted font-medium" : "text-muted-foreground hover:bg-accent"}`}
                data-testid={`trigger-type-${tt.toLowerCase()}`}
              >
                {tt}
              </button>
            ))}
          </div>
        </div>

        {/* project trigger type */}
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Project Trigger Type</div>
          <Select value={f.projectTriggerType} onValueChange={(v) => setF({ ...f, projectTriggerType: v })}>
            <SelectTrigger data-testid="trigger-project-type"><SelectValue /></SelectTrigger>
            <SelectContent>{PROJECT_TRIGGER_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* project stage */}
        {f.projectTriggerType === "Project Stage" && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Project Stage</div>
            <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v })}>
              <SelectTrigger data-testid="trigger-stage"><SelectValue placeholder="Choose a stage…" /></SelectTrigger>
              <SelectContent>{ALL_STAGES_ORDERED.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {/* condition groups */}
        {f.groups.map((g: any, gi: number) => (
          <div key={gi} className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold"><span className="text-emerald-600">IF</span> these conditions are true</span>
              <div className="flex items-center gap-2">
                <button onClick={() => removeGroup(gi)} className="p-1 rounded hover:bg-accent text-muted-foreground" data-testid={`trigger-group-delete-${gi}`}><Trash2 className="w-3.5 h-3.5" /></button>
                <span className="min-w-[20px] h-5 px-1 rounded border border-border grid place-items-center text-xs">{gi + 1}</span>
              </div>
            </div>
            <div className="space-y-2">
              {TRIGGER_CONDITION_FIELDS.map((field, fi) => (
                <div key={field} className="grid grid-cols-[140px_1fr] gap-2 items-center">
                  <label className="text-[12px]">{fi === 0 ? "" : "& "}{field}</label>
                  <Select value={g.conditions[field] || ""} onValueChange={(v) => setCond(gi, field, v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid={`trigger-cond-${gi}-${fi}`}><SelectValue placeholder="Choose an option…" /></SelectTrigger>
                    <SelectContent>{(condOptions[field] || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addGroup} data-testid="trigger-add-dynamic">
                <Plus className="w-3 h-3 mr-1" /> Add Dynamic Field Condition
              </Button>
            </div>

            {/* actions */}
            {gi === 0 && (
              <div className="pt-2 border-t border-border space-y-3">
                <div className="text-sm font-semibold">Take the following actions</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-[12px] text-muted-foreground"><span>Stop Action</span><Info className="w-3 h-3" /></div>
                  <Select value={f.stopAction} onValueChange={(v) => setF({ ...f, stopAction: v })}>
                    <SelectTrigger className="h-8 text-xs" data-testid="trigger-stop-action"><SelectValue /></SelectTrigger>
                    <SelectContent>{STOP_ACTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="text-[12px] text-muted-foreground">Start Workflow</div>
                  <Select value={f.startCampaignId ? String(f.startCampaignId) : ""} onValueChange={(v) => setF({ ...f, startCampaignId: Number(v) })}>
                    <SelectTrigger className="h-8 text-xs" data-testid="trigger-start-workflow"><SelectValue placeholder="Start a new workflow" /></SelectTrigger>
                    <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        ))}

        <div>
          <Button size="sm" variant="outline" onClick={addGroup} data-testid="trigger-add-group">Add Condition Group</Button>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => del.mutate()} data-testid="trigger-delete">
            Delete
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="trigger-save">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Triggers() {
  const { toast } = useToast();
  const { data: triggers = [], isLoading } = useQuery<Trigger[]>({ queryKey: ["/api/triggers"] });
  const { data: campaigns = [] } = useQuery<Campaign[]>({ queryKey: ["/api/campaigns"] });
  const [editing, setEditing] = useState<Trigger | null>(null);

  const add = useMutation({
    mutationFn: () => apiRequest("POST", "/api/triggers", {
      triggerType: "Project", projectTriggerType: "Project Stage", name: "New Trigger",
      stage: "New Lead", active: false, stopAction: "Stop All Workflows For Project", conditionGroupsJson: "[]",
    }),
    onSuccess: (r: any) => r.json().then((t: Trigger) => {
      queryClient.invalidateQueries({ queryKey: ["/api/triggers"] });
      toast({ title: "Trigger created" });
      setEditing(t);
    }),
  });

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Triggers" subtitle="Workflow triggers — fire automation campaigns on stage changes & events" actions={
        <Button size="sm" onClick={() => add.mutate()} data-testid="button-new-trigger"><Plus className="w-4 h-4 mr-1" />New Trigger</Button>
      } />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading triggers…</div>
      ) : triggers.length === 0 ? (
        <EmptyState title="No triggers yet" hint="Create a trigger to start workflows automatically." />
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {triggers.map((t) => <TriggerTile key={t.id} t={t} campaigns={campaigns} onEdit={() => setEditing(t)} />)}
        </div>
      )}

      {editing && <EditTriggerModal trigger={editing} campaigns={campaigns} onClose={() => setEditing(null)} />}
    </div>
  );
}
