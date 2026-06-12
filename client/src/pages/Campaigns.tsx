import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_SECTIONS } from "@shared/schema";
import type { Campaign } from "@shared/schema";
import { Workflow, Trash2, Copy, Pencil, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function shortDate(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tnum">{value}</div>
    </div>
  );
}

function CampaignTile({ c }: { c: Campaign }) {
  const { toast } = useToast();
  const toggle = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/campaigns/${c.id}`, { active: !c.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }),
  });
  const dup = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaigns", {
      name: `${c.name} (Copy)`, section: c.section, color: c.color, active: false,
      steps: c.steps, activeNow: 0, runsThisWeek: 0, totalRuns: 0,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }); toast({ title: "Campaign duplicated" }); },
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/campaigns/${c.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }); toast({ title: "Campaign deleted" }); },
  });

  return (
    <div className="rounded-lg border border-card-border bg-card p-3 flex flex-col gap-3" data-testid={`campaign-tile-${c.id}`}>
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-md grid place-items-center shrink-0" style={{ backgroundColor: c.color }}>
          <Workflow className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[13px] uppercase leading-tight">{c.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Last updated: {shortDate(c.lastUpdatedAt)}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`flex items-center gap-1 text-[11px] ${c.active ? "text-emerald-600" : "text-muted-foreground"}`}>
            <span className={`w-2 h-2 rounded-full ${c.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
            {c.active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 -mt-1">
        <button onClick={() => del.mutate()} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Delete" data-testid={`campaign-delete-${c.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
        <button onClick={() => dup.mutate()} className="p-1 rounded hover:bg-accent text-muted-foreground" title="Duplicate" data-testid={`campaign-duplicate-${c.id}`}><Copy className="w-3.5 h-3.5" /></button>
        <button onClick={() => toggle.mutate()} className="p-1 rounded hover:bg-accent text-muted-foreground" title={c.active ? "Deactivate" : "Activate"} data-testid={`campaign-edit-${c.id}`}><Pencil className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-y-2 gap-x-4 pt-1 border-t border-border">
        <Stat label="Steps" value={c.steps} />
        <Stat label="Active now" value={c.activeNow} />
        <Stat label="Runs this week" value={c.runsThisWeek} />
        <Stat label="Total runs" value={c.totalRuns} />
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { toast } = useToast();
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({ queryKey: ["/api/campaigns"] });

  const addCampaign = useMutation({
    mutationFn: () => apiRequest("POST", "/api/campaigns", {
      name: "New Campaign", section: "SALES FOLLOW-UP", color: "#16a34a", active: false,
      steps: 0, activeNow: 0, runsThisWeek: 0, totalRuns: 0,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }); toast({ title: "Campaign created" }); },
  });

  const sections: { name: string; items: Campaign[] }[] =
    CAMPAIGN_SECTIONS.map((s) => ({ name: s as string, items: campaigns.filter((c) => c.section === s) }))
      .filter((s) => s.items.length > 0);
  // any campaigns whose section is not in the canonical list
  const known = new Set(CAMPAIGN_SECTIONS as readonly string[]);
  const otherItems = campaigns.filter((c) => !known.has(c.section));
  if (otherItems.length) sections.push({ name: "OTHER", items: otherItems });

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Automation Campaigns" subtitle="Workflow campaigns grouped by stage of the customer journey" actions={
        <Button size="sm" onClick={() => addCampaign.mutate()} data-testid="button-new-campaign"><Plus className="w-4 h-4 mr-1" />New Campaign</Button>
      } />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" hint="Create your first automation campaign." />
      ) : (
        sections.map((sec) => (
          <div key={sec.name} className="space-y-3">
            <div className="flex items-center gap-2 border-b border-border pb-1.5">
              <h2 className="text-sm font-bold tracking-wide">{sec.name}</h2>
              <span className="text-xs text-muted-foreground">{sec.items.length} {sec.items.length === 1 ? "Workflow" : "Workflows"}</span>
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sec.items.map((c) => <CampaignTile key={c.id} c={c} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
