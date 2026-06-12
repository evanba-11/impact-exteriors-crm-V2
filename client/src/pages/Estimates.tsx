import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useMemo, useEffect } from "react";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money, money2, pct, marginColor } from "@/lib/format";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import {
  SHINGLE_OPTIONS, TAX_JURISDICTIONS, DEFAULT_MARGIN,
  defaultJobInput, defaultExtras, calcEstimateV3,
  PRODUCT_CATALOG, PRODUCT_USE_LABEL, type ProductUse,
  type JobInput, type ProposalExtras,
} from "@shared/pricing";
import { JOB_TYPES, fundingForJobType } from "@shared/schema";
import {
  computeBuild, computeTemplateBuild, defaultBuildOverrides, selectedProduct, newCustomLine,
  applySubstitutions,
  UNIT_OPTIONS, OSB_THICKNESS,
  type BuildOverrides, type BuildResult, type BuildLine, type BuildSection, type CustomLine, type Substitution,
} from "@/lib/build-model";
import {
  ALL_UNIT_OPTIONS, templateForJobType, templateHint,
  SHINGLE_REROOF_JOB_TYPES, CUSTOM_ONLY_JOB_TYPES,
} from "@/lib/templates";
import {
  Lock, Send, FileSignature, Search, ChevronRight, ChevronDown, FileText, Check, Plus, X, Settings as SettingsIcon,
  GripVertical, Repeat, CopyPlus, MoreVertical, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  type DragEndEvent, type DragMoveEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Estimates() {
  const { data: jobs = [] } = useQuery<any[]>({ queryKey: ["/api/jobs"] });
  const { data: priceItems = [] } = useQuery<any[]>({ queryKey: ["/api/price-items"] });
  const { data: estimates = [] } = useQuery<any[]>({ queryKey: ["/api/estimates"] });
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const { user } = useApp();
  const [, navigate] = useLocation();

  const params = new URLSearchParams(window.location.search || ("?" + (window.location.hash.split("?")[1] || "")));
  const [jobId, setJobId] = useState<number | null>(params.get("job") ? Number(params.get("job")) : null);

  if (jobId) return <Builder jobId={jobId} jobs={jobs} priceItems={priceItems} settings={settings} user={user} onBack={() => setJobId(null)} />;

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="Estimates" subtitle="Full estimate workspace · Build · Financials · Proposal · ABC Price Agreement pricing" />
      <div className="rounded-lg border border-card-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr><th className="text-left p-3">Customer</th><th className="text-left p-3">Mode</th><th className="text-left p-3">Job Type</th><th className="text-left p-3">Status</th><th className="text-right p-3">Contract Total</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {estimates.map((e) => {
              const j = jobs.find((x) => x.id === e.jobId);
              const total = e.totalPrice || j?.value || 0;
              return (
                <tr key={e.id} className="border-t border-border hover-elevate cursor-pointer" onClick={() => setJobId(e.jobId)} data-testid={`row-estimate-${e.id}`}>
                  <td className="p-3 font-medium">{j?.customer || "—"}</td>
                  <td className="p-3"><Badge variant="outline">{e.mode === "advanced" || e.mode === "custom" ? "Custom" : "Quick"}</Badge></td>
                  <td className="p-3"><JobTypeBadge jobType={e.jobType || j?.jobType || "Residential Re-Roof"} /></td>
                  <td className="p-3"><Badge variant="outline" className={e.status === "accepted" ? "bg-emerald-500/15 text-emerald-600" : e.status === "sent" ? "bg-blue-500/15 text-blue-500" : ""}>{e.status}</Badge></td>
                  <td className="p-3 text-right tnum font-semibold">{money(total)}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" className="h-7" data-testid={`button-generate-proposal-${e.id}`}
                      onClick={(ev) => { ev.stopPropagation(); navigate(`/proposals/${e.id}`); }}>
                      <FileText className="w-3.5 h-3.5 mr-1" />Proposal
                    </Button>
                  </td>
                  <td className="p-3 text-right"><ChevronRight className="w-4 h-4 text-muted-foreground inline" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Start a new estimate</h3>
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
          {jobs.filter((j) => ["SALES", "INSURANCE"].includes(j.flow) && !["Lost", "No Damage"].includes(j.stage)).slice(0, 9).map((j) => (
            <button key={j.id} onClick={() => setJobId(j.id)} className="text-left rounded-md border border-card-border bg-card p-3 hover-elevate" data-testid={`start-estimate-${j.id}`}>
              <div className="font-medium text-sm">{j.customer}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><JobTypeBadge jobType={j.jobType} /> · {j.stage}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Canonical job-type badge — Insurance re-roof accented, others neutral */
export function JobTypeBadge({ jobType }: { jobType?: string | null }) {
  const jt = jobType || "Residential Re-Roof";
  const isIns = jt === "Residential Insurance Re-Roof";
  return (
    <Badge variant="outline" className={cn("text-[10px] whitespace-nowrap", isIns ? "bg-violet-500/15 text-violet-600 border-violet-500/30" : "")} data-testid={`badge-jobtype-${jt}`}>{jt}</Badge>
  );
}

type TabKey = "build" | "settings" | "material" | "financials" | "proposal";

// Blank fillable boxes: render "" for a zero value (so the field shows its
// placeholder) and treat an empty input as 0 on the way back in.
const numVal = (n: number | undefined | null): number | "" => (n ? n : "");
const numOrZero = (v: string): number => (v === "" ? 0 : Number(v));

/* ───────────────────────── BUILDER (full-page workspace) ───────────────────────── */
function Builder({ jobId, jobs, settings, user, onBack }: any) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const job = jobs.find((j: any) => j.id === jobId);
  const floor = settings?.marginFloor ?? DEFAULT_MARGIN;
  const isNewRep = user?.isNewRep;
  const { data: existing } = useQuery<any>({ queryKey: ["/api/jobs", jobId, "estimate"] });

  const [tab, setTab] = useState<TabKey>("settings");
  const [ji, setJi] = useState<JobInput>(() => defaultJobInput());
  const [extras, setExtras] = useState<ProposalExtras>(() => defaultExtras());
  const [overrides, setOverrides] = useState<BuildOverrides>(() => defaultBuildOverrides());
  const [tier, setTier] = useState("better");
  // Update 4: canonical job type drives funding math; mode quick (template) | custom (manual)
  const [jobType, setJobType] = useState<string>(() => {
    const seed = job?.jobType;
    return JOB_TYPES.includes(seed) ? seed : "Residential Re-Roof";
  });
  const [mode, setMode] = useState<"quick" | "custom">("quick");

  useEffect(() => {
    if (!existing) return;
    setTier(existing.selectedTier || "better");
    if (existing.jobType && JOB_TYPES.includes(existing.jobType)) setJobType(existing.jobType);
    if (existing.mode === "advanced" || existing.mode === "custom") setMode("custom");
    if (existing.jobInputJson && existing.jobInputJson !== "{}") {
      try { setJi({ ...defaultJobInput(), ...JSON.parse(existing.jobInputJson) }); } catch { /* keep default */ }
    }
    if (existing.extrasJson && existing.extrasJson !== "{}") {
      try { setExtras({ ...defaultExtras(), ...JSON.parse(existing.extrasJson) }); } catch { /* keep default */ }
    }
    if (existing.buildJson && existing.buildJson !== "{}") {
      try { setOverrides({ ...defaultBuildOverrides(), ...JSON.parse(existing.buildJson) }); } catch { /* keep default */ }
    }
  }, [existing]);

  const set = (patch: Partial<JobInput>) => setJi((p) => ({ ...p, ...patch }));
  const setEx = (patch: Partial<ProposalExtras>) => setExtras((p) => ({ ...p, ...patch }));

  // Job type selection drives the funding math driver (Insurance -> insurance math, else retail)
  // AND auto-picks the matching Quick Template. Commercial / Siding have no template yet → Custom.
  const chooseJobType = (jt: string) => {
    setJobType(jt);
    set({ funding: fundingForJobType(jt) });
    if (CUSTOM_ONLY_JOB_TYPES.includes(jt)) {
      setMode("custom");
    } else {
      setMode("quick");
    }
  };
  // keep funding in sync if jobType changes via other paths
  useEffect(() => { set({ funding: fundingForJobType(jobType) }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobType]);

  useEffect(() => {
    if (ji.margin < floor) set({ margin: floor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  const res = useMemo(() => calcEstimateV3(ji, extras), [ji, extras]);
  // Quick Template routing:
  //  - Residential Re-Roof / Residential Insurance Re-Roof  → engine-driven shingle template
  //  - the four data-driven job types                       → computeTemplateBuild()
  //  - Commercial / Siding (no template)                    → empty Quick (Custom mode used instead)
  const quickTemplate = useMemo(() => templateForJobType(jobType), [jobType]);
  const isShingleReroof = SHINGLE_REROOF_JOB_TYPES.includes(jobType);
  const build = useMemo(() => {
    let b: BuildResult;
    if (isShingleReroof) b = computeBuild(ji, extras, overrides);
    else if (quickTemplate) b = computeTemplateBuild(quickTemplate, ji, overrides);
    // Commercial / Siding: no Quick Template — show the engine shingle build only as a
    // fallback scaffold; the UI nudges the user to Custom mode (see JobTypeCard note).
    else b = computeBuild(ji, extras, overrides);
    // Update 7: apply per-estimate substitutions + manual line ordering as a post-pass.
    return applySubstitutions(b, overrides);
  }, [isShingleReroof, quickTemplate, ji, extras, overrides]);

  // For shingle re-roof the engine result (with proposal extras) is authoritative; for the
  // data-driven templates the editable build roll-up drives the contract total.
  const contractTotal = isShingleReroof ? res.totalWithExtras : build.totalEstimateValue;
  const commissionPreview =
    user?.commissionType === "gross_profit"
      ? res.profit * (user.commissionRate / 100)
      : user?.commissionType === "contract"
      ? contractTotal * (user.commissionRate / 100)
      : 0;

  const buildPayload = () => ({
    jobId, mode: mode === "custom" ? "custom" : "quick", template: mode === "custom" ? "Custom" : "Asphalt Reroof", status: existing?.status || "draft",
    squares: ji.squares, pitch: `${ji.pitch}/12`, layers: ji.layers, stories: ji.stories, wastePct: ji.wastePct,
    taxPct: ji.taxRate, opEnabled: extras.opAmount > 0, contingencyPct: 0, selectedTier: tier,
    sectionsJson: "[]", addonsJson: "[]",
    jobType, funding: fundingForJobType(jobType), margin: ji.margin, taxJurisdiction: ji.taxJurisdiction, taxRate: ji.taxRate,
    jobInputJson: JSON.stringify(ji), extrasJson: JSON.stringify(extras), buildJson: JSON.stringify(overrides),
    contractValue: ji.contractValue || 0, totalPrice: Math.round(contractTotal * 100) / 100,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      return existing ? apiRequest("PATCH", `/api/estimates/${existing.id}`, payload) : apiRequest("POST", "/api/estimates", payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "estimate"] }); queryClient.invalidateQueries({ queryKey: ["/api/estimates"] }); toast({ title: "Estimate saved" }); },
  });
  const sendMut = useMutation({
    mutationFn: async () => { await saveMut.mutateAsync(); const e = await (await apiRequest("GET", `/api/jobs/${jobId}/estimate`)).json(); return apiRequest("POST", `/api/estimates/${e.id}/send`, { total: contractTotal }); },
    onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Estimate sent", description: "Cadence armed · pipeline advanced to Estimate Sent." }); },
  });
  const acceptMut = useMutation({
    mutationFn: async () => { await saveMut.mutateAsync(); const e = await (await apiRequest("GET", `/api/jobs/${jobId}/estimate`)).json(); return apiRequest("POST", `/api/estimates/${e.id}/accept`, { total: contractTotal, signature: job.customer }); },
    onSuccess: () => { queryClient.invalidateQueries(); toast({ title: "Accepted — job budget created", description: "Pipeline advanced to Ready for Production." }); },
  });

  const setLine = (id: string, patch: { qty?: number; rate?: number; unit?: string }) =>
    setOverrides((o) => ({ ...o, lines: { ...o.lines, [id]: { ...o.lines[id], ...patch } } }));
  const setThickness = (id: string, thickness: string) =>
    setOverrides((o) => ({ ...o, thickness: { ...(o.thickness || {}), [id]: thickness } }));
  const setExtraOv = (id: string, patch: { cost?: number; price?: number }) =>
    setOverrides((o) => ({ ...o, extras: { ...o.extras, [id]: { ...o.extras[id], ...patch } } }));
  const selectProduct = (use: ProductUse, key: string) =>
    setOverrides((o) => ({ ...o, products: { ...o.products, [use]: key } }));
  // Update 4: custom / add-line + per-estimate remove handlers
  const addCustomLine = (section: string) =>
    setOverrides((o) => ({ ...o, custom: [...(o.custom || []), newCustomLine(section)] }));
  const updateCustomLine = (id: string, patch: Partial<CustomLine>) =>
    setOverrides((o) => ({ ...o, custom: (o.custom || []).map((c) => c.id === id ? { ...c, ...patch } : c) }));
  const removeLine = (id: string) =>
    setOverrides((o) => ({
      ...o,
      custom: (o.custom || []).filter((c) => c.id !== id),
      removed: o.removed?.includes(id) ? o.removed : [...(o.removed || []), id],
      substitutions: id.startsWith("sub:")
        ? Object.fromEntries(Object.entries(o.substitutions || {}).filter(([k]) => `sub:${k}` !== id))
        : o.substitutions,
    }));
  // Update 7: substitute a line (records the green replacement; original stays struck).
  const setSubstitution = (id: string, sub: Substitution | null) =>
    setOverrides((o) => {
      const next = { ...(o.substitutions || {}) };
      if (sub) next[id] = sub; else delete next[id];
      return { ...o, substitutions: next };
    });
  // Update 7: persist a manual line order for a section after a drag-reorder.
  const setSectionOrder = (sectionId: string, ids: string[]) =>
    setOverrides((o) => ({ ...o, order: { ...(o.order || {}), [sectionId]: ids } }));
  // Update 7: duplicate any line into a target section as an editable custom line.
  const duplicateLineTo = (l: BuildLine, sectionTitle: string) =>
    setOverrides((o) => {
      const c = newCustomLine(sectionTitle);
      return {
        ...o,
        custom: [...(o.custom || []), {
          ...c,
          name: l.name,
          qty: l.qty || 0,
          unit: l.unit || "EA",
          unitMaterialCost: l.unitMaterialCost ?? l.rate ?? 0,
          laborRate: l.laborRate ?? 0,
          bid: l.bid || 0,
        }],
      };
    });
  // Update 7: bulk-import base-section lines into an add-on section as custom lines.
  const copyLinesTo = (lines: BuildLine[], sectionTitle: string) =>
    setOverrides((o) => {
      const adds = lines.map((l) => {
        const c = newCustomLine(sectionTitle);
        return {
          ...c, name: l.name, qty: l.qty || 0, unit: l.unit || "EA",
          unitMaterialCost: l.unitMaterialCost ?? l.rate ?? 0,
          laborRate: l.laborRate ?? 0, bid: l.bid || 0,
        };
      });
      return { ...o, custom: [...(o.custom || []), ...adds] };
    });

  const addr = job?.address || job?.customer || "Estimate";
  const title = `${addr} — ${job?.customer || ""} — ${job?.jobType || "Shingles"}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
          <button onClick={onBack} className="text-primary hover:underline" data-testid="button-back-estimates">Estimates</button>
          <ChevronRight className="w-3 h-3" />
          <span>{job?.customer}</span>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-estimate-title">{title}</h1>
            <JobTypeBadge jobType={jobType} />
            <Badge variant="outline" className="text-[10px]">{mode === "custom" ? "Custom" : "Quick Template"}</Badge>
            {existing && <Badge variant="outline" className={existing.status === "accepted" ? "bg-emerald-500/15 text-emerald-600" : existing.status === "sent" ? "bg-blue-500/15 text-blue-500" : ""}>{existing.status}</Badge>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-save-estimate">Save</Button>
            <Button size="sm" variant="outline" onClick={() => sendMut.mutate()} disabled={sendMut.isPending} data-testid="button-send-estimate"><Send className="w-3.5 h-3.5 mr-1" />Send</Button>
            <Button size="sm" onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending} data-testid="button-accept-estimate"><FileSignature className="w-3.5 h-3.5 mr-1" />Accept</Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {([
            ["settings", "Settings"], ["build", "Build"], ["material", "Material Summary"],
            ["financials", "Financials"], ["proposal", "Proposal"],
          ] as [TabKey, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => k === "proposal" && existing?.id ? navigate(`/proposals/${existing.id}`) : setTab(k)}
              className={cn("px-3 py-1.5 rounded-md text-sm border", tab === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-card-border hover-elevate text-muted-foreground")}
              data-testid={`tab-${k}`}>{lbl}{k === "proposal" && <FileText className="w-3.5 h-3.5 ml-1 inline" />}</button>
          ))}
        </div>

        {/* Live metrics strip — NO labor hours, NO loaded labor */}
        <MetricsStrip build={build} ji={ji} floor={floor} />
      </div>

      {/* Body */}
      <div data-estimate-scroll className="flex-1 min-h-0 overflow-auto">
        {tab === "build" && (
          <BuildTab build={build} ji={ji} overrides={overrides} mode={mode}
            setLine={setLine} setExtraOv={setExtraOv} selectProduct={selectProduct} setThickness={setThickness}
            addCustomLine={addCustomLine} updateCustomLine={updateCustomLine} removeLine={removeLine}
            setSubstitution={setSubstitution} setSectionOrder={setSectionOrder}
            duplicateLineTo={duplicateLineTo} copyLinesTo={copyLinesTo}
            jobId={jobId} currentEstimateId={existing?.id}
            isShingleReroof={isShingleReroof} hasTemplate={!!quickTemplate} />
        )}
        {tab === "settings" && (
          <SettingsTab ji={ji} set={set} extras={extras} setEx={setEx} floor={floor} isNewRep={isNewRep}
            jobType={jobType} chooseJobType={chooseJobType} mode={mode} setMode={setMode} />
        )}
        {tab === "material" && <MaterialSummaryTab build={build} />}
        {tab === "financials" && (
          <FinancialsTab build={build} ji={ji} set={set} floor={floor} commission={commissionPreview} />
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── METRICS STRIP ───────────────────────── */
function MetricsStrip({ build, ji, floor }: { build: BuildResult; ji: JobInput; floor: number }) {
  const m = ji.funding === "Insurance" ? build.marginPct : build.marginPct;
  const items: { label: string; value: string; cls?: string; testid?: string }[] = [
    { label: "Direct Labor", value: money2(build.directLabor), testid: "metric-direct-labor" },
    { label: "Material Tax", value: money2(build.materialTax), testid: "metric-material-tax" },
    { label: "Material Total", value: money2(build.materialTotal), testid: "metric-material-total" },
    { label: "Total Cost", value: money2(build.totalCost), testid: "metric-total-cost" },
    { label: "Margin", value: `${pct(m, 1)} · ${money(build.grossProfit)}`, cls: marginColor(m, floor), testid: "metric-margin" },
  ];
  return (
    <div className="grid grid-cols-5 gap-3 mt-3 max-md:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-md border border-card-border bg-card px-3 py-2" data-testid={it.testid}>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{it.label}</div>
          <div className={cn("text-sm font-bold tnum mt-0.5", it.cls)}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── BUILD TAB ───────────────────────── */
/* A section is treated as an "add-on group" (eligible for Copy-from-Base and as a
 * Duplicate-To / Copy target) when it is NOT one of the base structural sections. */
const BASE_SECTION_TITLES = new Set([
  "Tear-Off", "Shingle Install", "Edge Flashings", "Boots, Vents, etc.", "Misc.",
]);
const isAddOnSection = (title: string) => !BASE_SECTION_TITLES.has(title);

function BuildTab({ build, ji, overrides, mode, setLine, setExtraOv, selectProduct, setThickness, addCustomLine, updateCustomLine, removeLine, setSubstitution, setSectionOrder, duplicateLineTo, copyLinesTo, jobId, currentEstimateId, isShingleReroof, hasTemplate }: any) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(build.sections.map((s: BuildSection) => [s.id, true])));
  // keep newly-appearing sections (e.g. after a template switch) expanded by default
  useEffect(() => {
    setOpen((o) => {
      const next = { ...o };
      for (const s of build.sections as BuildSection[]) if (!(s.id in next)) next[s.id] = true;
      return next;
    });
  }, [build.sections]);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const showProductPanel = isShingleReroof; // catalog product cards apply to the shingle re-roof template only

  // All section titles available as Duplicate-To / Copy targets (add-on groups).
  const sectionTitles: string[] = (build.sections as BuildSection[]).map((s) => s.title);
  const addOnTitles = sectionTitles.filter(isAddOnSection);
  // Base-section lines available for "Copy from Base" bulk import.
  const baseLines: BuildLine[] = (build.sections as BuildSection[])
    .filter((s) => !isAddOnSection(s.title))
    .flatMap((s) => s.lines)
    .filter((l) => !l.substitutedOriginal);

  // Edge auto-scroll: pan the scroll container when a dragged row nears top/bottom.
  const scrollRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const velRef = useRef(0);
  useEffect(() => {
    // the scrollable body is the nearest ancestor with overflow-auto
    scrollRef.current = document.querySelector<HTMLElement>("[data-estimate-scroll]");
  }, []);
  const stepScroll = () => {
    const el = scrollRef.current;
    if (el && velRef.current !== 0) { el.scrollTop += velRef.current; rafRef.current = requestAnimationFrame(stepScroll); }
    else rafRef.current = null;
  };
  const onDragMove = (e: DragMoveEvent) => {
    const el = scrollRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const y = (e.activatorEvent as PointerEvent)?.clientY != null
      ? ((e.activatorEvent as PointerEvent).clientY + (e.delta?.y || 0))
      : 0;
    const EDGE = 90, MAX = 16;
    if (y < rect.top + EDGE) velRef.current = -Math.ceil(MAX * (1 - Math.max(0, y - rect.top) / EDGE));
    else if (y > rect.bottom - EDGE) velRef.current = Math.ceil(MAX * (1 - Math.max(0, rect.bottom - y) / EDGE));
    else velRef.current = 0;
    if (velRef.current !== 0 && rafRef.current == null) rafRef.current = requestAnimationFrame(stepScroll);
  };
  const stopScroll = () => { velRef.current = 0; if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (sec: BuildSection) => (e: DragEndEvent) => {
    stopScroll();
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sec.lines.map((l) => l.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setSectionOrder(sec.id, arrayMove(ids, from, to));
  };

  return (
    <div className={cn("grid gap-4 p-6 max-lg:grid-cols-1", showProductPanel ? "grid-cols-[1fr_360px]" : "grid-cols-1")}>
      {/* Build line-item workspace */}
      <div className="space-y-3 min-w-0">
        <div className="text-xs text-muted-foreground">
          {mode === "custom"
            ? "Custom mode — fully manual. Add blank rows in any section: item name, qty, unit, unit material cost, labor rate and bid."
            : hasTemplate || isShingleReroof
            ? "Quick Template — all sections show. Enter quantities; blank/zero lines won't appear on the proposal. Drag the handle to reorder; use the ⋮ menu to substitute or duplicate a line."
            : "No Quick Template for this job type yet — switch to Custom mode to build it line by line."}
        </div>
        {build.sections.map((sec: BuildSection) => {
          const secLabor = sec.lines.reduce((s: number, l: BuildLine) => s + l.directLabor, 0);
          const secMat = sec.lines.reduce((s: number, l: BuildLine) => s + l.material, 0);
          const secBid = sec.lines.reduce((s: number, l: BuildLine) => s + l.bid, 0);
          const isOpen = open[sec.id] ?? true;
          const addOn = isAddOnSection(sec.title);
          return (
            <div key={sec.id} className="rounded-lg border border-card-border bg-card overflow-hidden" data-testid={`build-section-${sec.id}`}>
              <div className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 border-b border-border">
                <button onClick={() => toggle(sec.id)} className="flex items-center gap-2 hover-elevate rounded px-1 -mx-1" data-testid={`toggle-section-${sec.id}`}>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <span className="text-sm font-semibold">{sec.title}</span>
                  <Badge variant="outline" className="text-[10px]">{sec.lines.length}</Badge>
                  {addOn && <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30">add-on</Badge>}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tnum text-muted-foreground">DL {money(secLabor)} · Mat {money(secMat)} · Bid {money(secBid)}</span>
                  <SectionActions sec={sec} addOn={addOn} baseLines={baseLines}
                    jobId={jobId} currentEstimateId={currentEstimateId} copyLinesTo={copyLinesTo} />
                </div>
              </div>
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead className="text-muted-foreground bg-muted/20">
                      <tr>
                        <th className="w-6"></th>
                        <th className="text-left p-2 pl-1">Item</th>
                        <th className="p-2 w-28">Qty</th>
                        <th className="p-2 w-28">Rate</th>
                        <th className="p-2 w-24 text-right">Direct Labor</th>
                        <th className="p-2 w-24 text-right">Material</th>
                        <th className="p-2 w-24 text-right">Bid</th>
                        <th className="p-2 w-8"></th>
                      </tr>
                    </thead>
                    <DndContext sensors={sensors} collisionDetection={closestCenter}
                      onDragMove={onDragMove} onDragCancel={stopScroll} onDragEnd={onDragEnd(sec)}>
                      <SortableContext items={sec.lines.map((l: BuildLine) => l.id)} strategy={verticalListSortingStrategy}>
                        <tbody>
                          {sec.lines.map((l: BuildLine) => (
                            <BuildRow key={l.id} l={l} setLine={setLine} setExtraOv={setExtraOv}
                              updateCustomLine={updateCustomLine} removeLine={removeLine}
                              overrides={overrides} selectProduct={selectProduct} setThickness={setThickness}
                              setSubstitution={setSubstitution} duplicateLineTo={duplicateLineTo}
                              addOnTitles={addOnTitles} allSections={build.sections} />
                          ))}
                        </tbody>
                      </SortableContext>
                    </DndContext>
                    <tfoot>
                      <tr className="border-t border-border/60">
                        <td colSpan={8} className="p-1.5 pl-3">
                          <button onClick={() => addCustomLine(sec.title)}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            data-testid={`add-line-${sec.id}`}>
                            <Plus className="w-3 h-3" /> Add Line
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Make Product Selections panel */}
      <ProductSelectionsPanel overrides={overrides} selectProduct={selectProduct} />
    </div>
  );
}

/* Per-section actions: Copy-from-Base drawer (add-on groups) + Copy-group-from-
 * another-estimate on the same opportunity (job). */
function SectionActions({ sec, addOn, baseLines, jobId, currentEstimateId, copyLinesTo }: any) {
  const [drawer, setDrawer] = useState<null | "base" | "estimate">(null);
  const { data: estimates = [] } = useQuery<any[]>({ queryKey: ["/api/estimates"] });
  const otherEstimates = (estimates as any[]).filter((e) => e.jobId === jobId && e.id !== currentEstimateId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground p-0.5" data-testid={`section-menu-${sec.id}`} title="Group actions"><MoreVertical className="w-3.5 h-3.5" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px]">{sec.title}</DropdownMenuLabel>
          {addOn && (
            <DropdownMenuItem onClick={() => setDrawer("base")} data-testid={`copy-from-base-${sec.id}`}>
              <CopyPlus className="w-3.5 h-3.5 mr-2" />Copy from Base…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDrawer("estimate")} disabled={otherEstimates.length === 0} data-testid={`copy-group-${sec.id}`}>
            <Copy className="w-3.5 h-3.5 mr-2" />Copy group from another estimate…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Copy-from-Base checklist drawer */}
      <CopyChecklistDrawer
        open={drawer === "base"} onClose={() => setDrawer(null)}
        title={`Copy base items → ${sec.title}`}
        lines={baseLines}
        onImport={(picked) => { copyLinesTo(picked, sec.title); setDrawer(null); }} />

      {/* Copy-group-from-another-estimate drawer */}
      <CopyGroupDrawer
        open={drawer === "estimate"} onClose={() => setDrawer(null)}
        targetTitle={sec.title} estimates={otherEstimates}
        onImport={(picked) => { copyLinesTo(picked, sec.title); setDrawer(null); }} />
    </>
  );
}

/* Drawer with a checklist of candidate lines for bulk import. */
function CopyChecklistDrawer({ open, onClose, title, lines, onImport }: { open: boolean; onClose: () => void; title: string; lines: BuildLine[]; onImport: (l: BuildLine[]) => void }) {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  useEffect(() => { if (open) setPicked({}); }, [open]);
  const toggle = (id: string) => setPicked((p) => ({ ...p, [id]: !p[id] }));
  const chosen = lines.filter((l) => picked[l.id]);
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
        <div className="px-4 max-h-[50vh] overflow-y-auto space-y-1">
          {lines.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No base items to copy.</div>}
          {lines.map((l) => (
            <label key={l.id} className="flex items-center gap-2 rounded-md border border-card-border p-2 hover-elevate cursor-pointer" data-testid={`copy-pick-${l.id}`}>
              <Checkbox checked={!!picked[l.id]} onCheckedChange={() => toggle(l.id)} />
              <span className={cn("w-1.5 h-4 rounded-sm shrink-0", l.kind === "labor" ? "bg-emerald-500" : "bg-blue-500")} />
              <span className="text-sm flex-1 min-w-0 truncate">{l.name}</span>
              <span className="text-[11px] text-muted-foreground tnum">{l.qty} {l.unit} · {money(l.bid)}</span>
            </label>
          ))}
        </div>
        <DrawerFooter className="flex-row justify-end gap-2">
          <DrawerClose asChild><Button variant="outline" size="sm">Cancel</Button></DrawerClose>
          <Button size="sm" disabled={chosen.length === 0} onClick={() => onImport(chosen)} data-testid="copy-import-confirm">
            Import {chosen.length || ""}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/* Drawer that lists groups (sections) from OTHER estimates on the same job and
 * imports a whole group's lines into the current section. */
function CopyGroupDrawer({ open, onClose, targetTitle, estimates, onImport }: { open: boolean; onClose: () => void; targetTitle: string; estimates: any[]; onImport: (l: BuildLine[]) => void }) {
  const groups = useMemo(() => {
    const out: { key: string; estimateLabel: string; title: string; lines: BuildLine[] }[] = [];
    for (const e of estimates) {
      let ov: BuildOverrides;
      try { ov = { ...defaultBuildOverrides(), ...(e.buildJson && e.buildJson !== "{}" ? JSON.parse(e.buildJson) : {}) }; }
      catch { ov = defaultBuildOverrides(); }
      // Reconstruct that estimate's sections from its persisted custom lines only
      // (engine/template roster needs the full job input; custom lines are the
      // portable, self-contained content worth copying between estimates).
      const byTitle: Record<string, BuildLine[]> = {};
      for (const c of ov.custom || []) {
        const ln: BuildLine = {
          id: c.id, kind: "custom", key: c.id, name: c.name || "Custom line",
          descriptor: c.section, qty: c.qty || 0, unit: c.unit || "EA", rate: c.unitMaterialCost || 0,
          directLabor: (c.qty || 0) * (c.laborRate || 0), material: (c.qty || 0) * (c.unitMaterialCost || 0),
          bid: c.bid || 0, isCustom: true, customSection: c.section,
          unitMaterialCost: c.unitMaterialCost || 0, laborRate: c.laborRate || 0,
        };
        (byTitle[c.section] ||= []).push(ln);
      }
      for (const [title, lines] of Object.entries(byTitle)) {
        out.push({ key: `${e.id}:${title}`, estimateLabel: `Estimate #${e.id} (${e.status || "draft"})`, title, lines });
      }
    }
    return out;
  }, [estimates]);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader><DrawerTitle>Copy a group into “{targetTitle}”</DrawerTitle></DrawerHeader>
        <div className="px-4 max-h-[55vh] overflow-y-auto space-y-2">
          {groups.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No copyable groups on other estimates for this opportunity.</div>}
          {groups.map((g) => (
            <div key={g.key} className="rounded-md border border-card-border p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">{g.title} <span className="text-[11px] text-muted-foreground">· {g.estimateLabel}</span></div>
                <Button size="sm" variant="outline" className="h-7" onClick={() => onImport(g.lines)} data-testid={`copy-group-import-${g.key}`}>Import group</Button>
              </div>
              <div className="text-[11px] text-muted-foreground">{g.lines.map((l) => l.name).join(", ")}</div>
            </div>
          ))}
        </div>
        <DrawerFooter className="flex-row justify-end">
          <DrawerClose asChild><Button variant="outline" size="sm">Close</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function BuildRow({ l, setLine, setExtraOv, updateCustomLine, removeLine, overrides, selectProduct, setThickness, setSubstitution, duplicateLineTo, addOnTitles, allSections }: { l: BuildLine; setLine: any; setExtraOv: any; updateCustomLine: any; removeLine: any; overrides?: BuildOverrides; selectProduct?: any; setThickness?: any; setSubstitution?: any; duplicateLineTo?: any; addOnTitles?: string[]; allSections?: BuildSection[] }) {
  const isExtra = !!l.isExtra;
  const isCustom = !!l.isCustom;
  // Inline product dropdown options for a product-selectable line.
  const useProducts = l.productUse ? PRODUCT_CATALOG.filter((p) => p.use === l.productUse) : [];
  const selectedKey = l.productUse && overrides ? (selectedProduct(l.productUse, overrides)?.key || "") : "";
  const thicknessVal = setThickness && l.hasThickness ? ((overrides?.thickness || {})[l.id] || OSB_THICKNESS[0]) : "";
  // Item 6: a product-selectable line with NO resolved selection is unresolved → yellow.
  const unresolvedProduct = !!l.productUse && useProducts.length > 0 && !selectedKey;
  // Item 5: child rows under a bid item show a colored LEFT border by kind.
  const borderClass = l.substitutedOriginal ? "border-l-2 border-l-red-500/60"
    : l.isSubstitute ? "border-l-2 border-l-emerald-500"
    : l.kind === "labor" ? "border-l-2 border-l-emerald-500/70"
    : l.kind === "material" ? "border-l-2 border-l-blue-500/70"
    : "border-l-2 border-l-transparent";

  const sortable = useSortable({ id: l.id });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.6 : undefined };
  const dragHandle = (
    <td className="w-6 text-center align-top pt-2.5">
      <button ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners}
        className="text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        data-testid={`drag-${l.id}`} title="Drag to reorder"><GripVertical className="w-3.5 h-3.5" /></button>
    </td>
  );

  const rowMenu = (setSubstitution || duplicateLineTo) && !l.substitutedOriginal ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground" data-testid={`row-menu-${l.id}`} title="Line actions"><MoreVertical className="w-3.5 h-3.5" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {duplicateLineTo && (addOnTitles?.length ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><CopyPlus className="w-3.5 h-3.5 mr-2" />Duplicate to</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {addOnTitles.map((t) => (
                  <DropdownMenuItem key={t} onClick={() => duplicateLineTo(l, t)} data-testid={`dup-to-${l.id}-${t}`}>{t}</DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem disabled><CopyPlus className="w-3.5 h-3.5 mr-2" />Duplicate to (no add-on groups)</DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  // Fully-manual custom row: name, qty, unit, unit material cost, labor rate, bid
  if (isCustom) {
    return (
      <tr ref={sortable.setNodeRef} style={style} className={cn("border-t border-border/50 bg-primary/[0.03]", borderClass)} data-testid={`build-row-${l.id}`}>
        {dragHandle}
        <td className="p-1.5 pl-1">
          <Input className={cn("h-7 text-xs w-full", l.isSubstitute && "text-emerald-600 border-emerald-500/40")} placeholder="Item name" value={l.name}
            data-testid={`custom-name-${l.id}`}
            onChange={(e) => updateCustomLine(l.id, { name: e.target.value })} />
        </td>
        <td className="p-1.5">
          <div className="flex items-center gap-1">
            <Input className="h-7 text-xs tnum w-14 px-2 text-right no-spin" type="number" inputMode="decimal" placeholder="0" value={numVal(l.qty)}
              data-testid={`qty-${l.id}`}
              onChange={(e) => updateCustomLine(l.id, { qty: numOrZero(e.target.value) })} />
            <select className="h-7 text-[10px] rounded border border-card-border bg-card px-1"
              value={l.unit} data-testid={`custom-unit-${l.id}`}
              onChange={(e) => updateCustomLine(l.id, { unit: e.target.value })}>
              {ALL_UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </td>
        <td className="p-1.5">
          <div className="flex items-center gap-1">
            <Input className="h-7 text-xs tnum w-16 px-1.5 text-right no-spin" type="number" inputMode="decimal" placeholder="mat $"
              value={numVal(l.unitMaterialCost)} data-testid={`custom-mat-${l.id}`}
              onChange={(e) => updateCustomLine(l.id, { unitMaterialCost: numOrZero(e.target.value) })} />
            <Input className="h-7 text-xs tnum w-16 px-1.5 text-right no-spin" type="number" inputMode="decimal" placeholder="lab $"
              value={numVal(l.laborRate)} data-testid={`custom-lab-${l.id}`}
              onChange={(e) => updateCustomLine(l.id, { laborRate: numOrZero(e.target.value) })} />
          </div>
        </td>
        <td className="p-1.5 text-right tnum text-muted-foreground">{l.directLabor > 0 ? money2(l.directLabor) : "—"}</td>
        <td className="p-1.5 text-right tnum text-muted-foreground">{l.material > 0 ? money2(l.material) : "—"}</td>
        <td className="p-1.5 text-right">
          <Input className="h-7 text-xs tnum w-24 px-2 text-right font-medium no-spin" type="number" inputMode="decimal" placeholder="bid"
            value={numVal(l.bid ? Math.round(l.bid * 100) / 100 : 0)} data-testid={`price-${l.id}`}
            onChange={(e) => updateCustomLine(l.id, { bid: numOrZero(e.target.value) })} />
        </td>
        <td className="p-1.5 text-center">
          <div className="flex items-center gap-1 justify-center">
            {rowMenu}
            <button onClick={() => removeLine(l.id)} className="text-muted-foreground hover:text-red-500" data-testid={`remove-line-${l.id}`}><X className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr ref={sortable.setNodeRef} style={style}
      className={cn("border-t border-border/50", borderClass,
        l.placeholder && "opacity-70",
        l.substitutedOriginal && "line-through text-red-500/80 bg-red-500/[0.04]",
        unresolvedProduct && "bg-amber-400/15")}
      data-testid={`build-row-${l.id}`}>
      {dragHandle}
      <td className="p-1.5 pl-1">
        <div className={cn("font-medium leading-tight", l.isSubstitute && "text-emerald-600")}>{l.name}</div>
        <div className="text-[10px] text-muted-foreground">{l.descriptor}{unresolvedProduct && <span className="text-amber-600 font-medium"> · choose a product</span>}</div>
        {/* Inline product-selection dropdown (every selectable line, even single-option) */}
        {l.productUse && useProducts.length > 0 && selectProduct && (
          <select className={cn("mt-1 h-6 text-[10px] rounded border bg-card px-1 max-w-[240px]", unresolvedProduct ? "border-amber-500" : "border-card-border")}
            value={selectedKey} data-testid={`product-select-${l.id}`}
            onChange={(e) => selectProduct(l.productUse, e.target.value)}>
            {!selectedKey && <option value="">— select —</option>}
            {useProducts.map((p) => <option key={p.key} value={p.key}>{p.name} — {p.mfr}</option>)}
          </select>
        )}
        {/* OSB thickness dropdown */}
        {l.hasThickness && setThickness && (
          <select className="mt-1 h-6 text-[10px] rounded border border-card-border bg-card px-1"
            value={thicknessVal} data-testid={`thickness-select-${l.id}`}
            onChange={(e) => setThickness(l.id, e.target.value)}>
            {OSB_THICKNESS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </td>
      <td className="p-1.5">
        <div className="flex items-center gap-1">
          <Input className="h-7 text-xs tnum w-14 px-2 text-right no-spin" type="number" inputMode="decimal" placeholder="0"
            value={numVal(l.qty)} data-testid={`qty-${l.id}`} disabled={l.substitutedOriginal}
            onChange={(e) => setLine(l.id, { qty: numOrZero(e.target.value) })} />
          {l.altUnits && l.altUnits.length > 0 ? (
            <select className="h-7 text-[10px] rounded border border-card-border bg-card px-1"
              value={l.unit} data-testid={`unit-select-${l.id}`}
              onChange={(e) => setLine(l.id, { unit: e.target.value })}>
              {[l.unit, ...l.altUnits.filter((u) => u !== l.unit)].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : (
            <span className="text-[10px] text-muted-foreground w-6">{l.unit}</span>
          )}
        </div>
      </td>
      <td className="p-1.5">
        {isExtra ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">cost</span>
            <Input className="h-7 text-xs tnum w-20 px-2 text-right no-spin" type="number" inputMode="decimal" placeholder="0"
              value={numVal(l.cost)} data-testid={`cost-${l.id}`}
              onChange={(e) => setExtraOv(l.id, { cost: numOrZero(e.target.value) })} />
          </div>
        ) : (
          <Input className="h-7 text-xs tnum w-20 px-2 text-right no-spin" type="number" inputMode="decimal" step={0.01} placeholder="0"
            value={numVal(l.rate)} data-testid={`rate-${l.id}`} disabled={l.substitutedOriginal}
            onChange={(e) => setLine(l.id, { rate: numOrZero(e.target.value) })} />
        )}
      </td>
      <td className="p-1.5 text-right tnum text-muted-foreground">{l.directLabor > 0 ? money2(l.directLabor) : "—"}</td>
      <td className="p-1.5 text-right tnum text-muted-foreground">{l.material > 0 ? money2(l.material) : "—"}</td>
      <td className="p-1.5 text-right">
        {isExtra ? (
          <Input className="h-7 text-xs tnum w-24 px-2 text-right font-medium no-spin" type="number" inputMode="decimal" placeholder="0"
            value={numVal(l.price)} data-testid={`price-${l.id}`}
            onChange={(e) => setExtraOv(l.id, { price: numOrZero(e.target.value) })} />
        ) : (
          <span className="tnum font-medium">{money2(l.bid)}</span>
        )}
      </td>
      <td className="p-1.5 text-center">
        <div className="flex items-center gap-1 justify-center">
          {setSubstitution && !l.substitutedOriginal && (
            <SubstitutePopover l={l} allSections={allSections} setSubstitution={setSubstitution} />
          )}
          {l.substitutedOriginal && setSubstitution && (
            <button onClick={() => setSubstitution(l.id, null)} className="text-emerald-600 hover:text-emerald-700" title="Undo substitution" data-testid={`undo-sub-${l.id}`}><Repeat className="w-3.5 h-3.5" /></button>
          )}
          {rowMenu}
          {l.removable && !l.substitutedOriginal && (
            <button onClick={() => removeLine(l.id)} className="text-muted-foreground hover:text-red-500" data-testid={`remove-line-${l.id}`}><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* Category dot color per base section (used in the substitution selector). */
const SECTION_DOT: Record<string, string> = {
  "Tear-Off": "bg-orange-500",
  "Shingle Install": "bg-blue-500",
  "Edge Flashings": "bg-violet-500",
  "Boots, Vents, etc.": "bg-cyan-500",
  "Labor Add-Ons": "bg-emerald-500",
  "Misc.": "bg-slate-500",
};
const dotFor = (title: string) => SECTION_DOT[title] || "bg-primary";

/* Substitution popover: pick a replacement line (grouped by base estimate group,
 * each option carrying a colored category dot), choose the bid/material/labor
 * facet, and (for bid items) carry over child-item selections to the replacement. */
function SubstitutePopover({ l, allSections, setSubstitution }: { l: BuildLine; allSections?: BuildSection[]; setSubstitution: any }) {
  const [open, setOpen] = useState(false);
  const [itemType, setItemType] = useState<"bid" | "material" | "labor">(
    l.kind === "labor" ? "labor" : l.kind === "material" ? "material" : "bid");
  const sections = allSections || [];

  const choose = (cand: BuildLine, secTitle: string) => {
    const childKeys = (sections.find((s) => s.title === secTitle)?.lines || [])
      .filter((c) => c.id !== cand.id && c.kind !== "spec")
      .map((c) => c.id);
    const sub: Substitution = {
      name: cand.name,
      qty: cand.qty || l.qty || 1,
      unit: cand.unit || l.unit,
      unitMaterialCost: cand.unitMaterialCost ?? cand.rate ?? 0,
      laborRate: cand.laborRate ?? 0,
      bid: cand.bid || l.bid || 0,
      itemType,
      // Carry the replacement section's child selections when swapping a bid item.
      childKeys: itemType === "bid" ? childKeys : undefined,
    };
    setSubstitution(l.id, sub);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-muted-foreground hover:text-primary" title="Substitute this item" data-testid={`substitute-${l.id}`}><Repeat className="w-3.5 h-3.5" /></button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="text-xs font-semibold mb-2">Substitute “{l.name}”</div>
        <ToggleGroup type="single" value={itemType} onValueChange={(v) => v && setItemType(v as any)} className="mb-2 justify-start gap-1">
          <ToggleGroupItem value="bid" className="h-6 px-2 text-[10px]" data-testid={`sub-type-bid-${l.id}`}>Bid</ToggleGroupItem>
          <ToggleGroupItem value="material" className="h-6 px-2 text-[10px]" data-testid={`sub-type-material-${l.id}`}>Material</ToggleGroupItem>
          <ToggleGroupItem value="labor" className="h-6 px-2 text-[10px]" data-testid={`sub-type-labor-${l.id}`}>Labor</ToggleGroupItem>
        </ToggleGroup>
        <div className="max-h-60 overflow-y-auto space-y-2">
          {sections.map((sec) => {
            const cands = sec.lines.filter((c) => c.id !== l.id && !c.substitutedOriginal && !c.isSubstitute);
            if (!cands.length) return null;
            return (
              <div key={sec.id}>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  <span className={cn("w-2 h-2 rounded-full", dotFor(sec.title))} />{sec.title}
                </div>
                <div className="space-y-0.5">
                  {cands.map((c) => (
                    <button key={c.id} onClick={() => choose(c, sec.title)}
                      className="w-full flex items-center gap-1.5 text-left rounded px-1.5 py-1 hover-elevate text-xs"
                      data-testid={`sub-option-${l.id}-${c.id}`}>
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotFor(sec.title))} />
                      <span className="flex-1 min-w-0 truncate">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground tnum">{money(c.bid)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────── MAKE PRODUCT SELECTIONS PANEL ───────────────────────── */
function ProductSelectionsPanel({ overrides, selectProduct }: { overrides: BuildOverrides; selectProduct: any }) {
  const [q, setQ] = useState("");
  const cards = useMemo(() => {
    const term = q.trim().toLowerCase();
    return PRODUCT_CATALOG.filter((p) =>
      !term || p.name.toLowerCase().includes(term) || p.mfr.toLowerCase().includes(term) ||
      p.descriptor.toLowerCase().includes(term) || PRODUCT_USE_LABEL[p.use].toLowerCase().includes(term));
  }, [q]);

  const isSelected = (use: ProductUse, key: string) => {
    const sel = selectedProduct(use, overrides);
    return sel?.key === key;
  };

  return (
    <div className="rounded-lg border border-card-border bg-card flex flex-col max-lg:order-first lg:sticky lg:top-0 self-start max-h-[calc(100vh-220px)]">
      <div className="px-3 py-2.5 border-b border-border">
        <div className="text-sm font-semibold mb-2">Make Product Selections</div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input className="h-8 text-xs pl-8" placeholder="Search products…" value={q}
            onChange={(e) => setQ(e.target.value)} data-testid="input-product-search" />
        </div>
      </div>
      <div className="overflow-y-auto p-2 space-y-1.5">
        {cards.length === 0 && <div className="text-xs text-muted-foreground p-3 text-center">No products match.</div>}
        {cards.map((p) => {
          const selected = isSelected(p.use, p.key);
          return (
            <button key={p.key} onClick={() => selectProduct(p.use, p.key)}
              className={cn("w-full text-left rounded-md border p-2.5 transition-colors", selected ? "border-primary bg-primary/5" : "border-card-border hover-elevate")}
              data-testid={`product-card-${p.key}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold leading-tight">{p.name}{p.mfr && !p.name.includes(p.mfr) ? ` — ${p.mfr}` : ""}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.descriptor}</div>
                </div>
                {selected && <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── FINANCIALS TAB ───────────────────────── */
const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
function FinancialsTab({ build, ji, set, floor, commission }: any) {
  const b: BuildResult = build;
  const gpm = b.marginPct;
  const pieData = [
    { name: "Direct Labor", value: b.directLabor },
    { name: "Material", value: b.materialTaxable },
    { name: "Material Tax", value: b.materialTax },
    { name: "Specialty Cost", value: b.specCost },
    { name: "Gross Profit", value: Math.max(0, b.grossProfit) },
  ].filter((d) => d.value > 0);

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4 p-6 max-lg:grid-cols-1">
      {/* Settings rail */}
      <div className="rounded-lg border border-card-border bg-card p-4 space-y-4 self-start" data-testid="financials-settings-rail">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><SettingsIcon className="w-3.5 h-3.5" />Pricing Settings</div>
        <div>
          <Label className="text-xs">Pricing method</Label>
          <Select value={"target_gpm"} onValueChange={() => {}}>
            <SelectTrigger className="h-8 mt-1" data-testid="select-pricing-method"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="target_gpm">Target GPM (margin)</SelectItem></SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Target GPM %</Label>
          <Input type="number" className="h-8 mt-1 tnum" value={ji.margin}
            data-testid="input-target-gpm"
            onChange={(e) => { let m = Number(e.target.value); if (m < floor) m = floor; set({ margin: m }); }} />
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><Lock className="w-3 h-3" />floor {floor}%</div>
        </div>
        <div>
          <Label className="text-xs">Direct labor rate ($/SQ)</Label>
          <Input type="number" className="h-8 mt-1 tnum" defaultValue={95} disabled data-testid="input-labor-rate" />
          <div className="text-[10px] text-muted-foreground mt-1">Default $95/SQ · edit per-line on Build tab</div>
        </div>
        <div>
          <Label className="text-xs">Material waste %</Label>
          <Input type="number" className="h-8 mt-1 tnum" value={ji.wastePct} data-testid="input-waste"
            onChange={(e) => set({ wastePct: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs">Material tax</Label>
          <Select value={ji.taxJurisdiction} onValueChange={(v) => { const t = TAX_JURISDICTIONS.find((x) => x.name === v); set({ taxJurisdiction: v, taxRate: t ? t.rate : ji.taxRate }); }}>
            <SelectTrigger className="h-8 mt-1" data-testid="select-tax-fin"><SelectValue /></SelectTrigger>
            <SelectContent>{TAX_JURISDICTIONS.map((t) => <SelectItem key={t.name} value={t.name}>{t.name} — {t.rate}%</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Charts + KPIs */}
      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <FinKpi label="GPM %" value={pct(gpm, 1)} cls={marginColor(gpm, floor)} testid="kpi-gpm" />
          <FinKpi label="Gross Profit" value={money2(b.grossProfit)} cls={marginColor(gpm, floor)} testid="kpi-gross-profit" />
          <FinKpi label="Total Estimate Value" value={money2(b.totalEstimateValue)} accent testid="kpi-total-value" />
          <FinKpi label="Total Cost" value={money2(b.totalCost)} testid="kpi-total-cost-fin" />
        </div>
        <div className="grid grid-cols-[320px_1fr] gap-4 max-md:grid-cols-1">
          <div className="rounded-lg border border-card-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cost & Profit Breakdown</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => money2(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-4">
            <AnalysisBlock title="Labor Analysis" rows={[
              ["Base tear-off + install", money2(b.baseLaborCost)],
              ["Labor add-ons", money2(b.laborAddOns)],
              ["Total direct labor", money2(b.directLabor)],
              ["Cost / square", `${money2(b.costPerSquare)} / SQ`],
              ["Squares", `${b.squares} SQ`],
            ]} />
            <AnalysisBlock title="Material Analysis" rows={[
              ["Material subtotal", money2(b.materialSubtotal)],
              ["Supplier surcharge (3%)", money2(b.materialSurcharge)],
              ["Material cost (×1.03)", money2(b.materialTaxable)],
              ["Material tax", money2(b.materialTax)],
              ["Material total", money2(b.materialTotal)],
            ]} />
          </div>
        </div>
        <div className="rounded-lg border border-card-border bg-card p-4 grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <FinKpi label="Commission Preview" value={money2(commission)} testid="kpi-commission" />
          <FinKpi label="Specialty Price" value={money2(b.specPrice)} testid="kpi-spec-price" />
          <FinKpi label="Specialty Cost" value={money2(b.specCost)} testid="kpi-spec-cost" />
        </div>
      </div>
    </div>
  );
}
function FinKpi({ label, value, cls, accent, testid }: any) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-4" data-testid={testid}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn("text-xl font-bold mt-1 tnum", accent && "text-primary", cls)}>{value}</div>
    </div>
  );
}
function AnalysisBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-xs border-b border-border/40 last:border-0 py-1">
            <span className="text-muted-foreground">{k}</span>
            <span className="tnum font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── MATERIAL SUMMARY TAB ───────────────────────── */
function MaterialSummaryTab({ build }: { build: BuildResult }) {
  const matLines: BuildLine[] = build.sections.flatMap((s) => s.lines).filter((l) => l.kind === "material");
  const total = matLines.reduce((s, l) => s + l.material, 0);
  return (
    <div className="p-6">
      <div className="rounded-lg border border-card-border bg-card overflow-hidden max-w-3xl">
        <div className="px-3 py-2.5 bg-muted/40 border-b border-border text-sm font-semibold">Material Summary</div>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground bg-muted/20">
            <tr><th className="text-left p-2 pl-3">Material</th><th className="p-2 w-20 text-right">Qty</th><th className="p-2 w-12">Unit</th><th className="p-2 w-24 text-right">Unit Cost</th><th className="p-2 w-28 text-right pr-3">Ext Cost</th></tr>
          </thead>
          <tbody>
            {matLines.map((l) => (
              <tr key={l.id} className="border-t border-border/50" data-testid={`mat-row-${l.id}`}>
                <td className="p-2 pl-3 font-medium">{l.name}</td>
                <td className="p-2 text-right tnum">{l.qty}</td>
                <td className="p-2 text-center text-muted-foreground">{l.unit}</td>
                <td className="p-2 text-right tnum">{money2(l.rate)}</td>
                <td className="p-2 text-right tnum pr-3">{money2(l.material)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30"><td className="p-2 pl-3 font-semibold" colSpan={4}>Material subtotal (pre-surcharge)</td><td className="p-2 text-right tnum font-semibold pr-3">{money2(total)}</td></tr>
            <tr className="border-t border-border/50"><td className="p-2 pl-3 text-muted-foreground" colSpan={4}>+ 3% supplier surcharge → material cost</td><td className="p-2 text-right tnum pr-3">{money2(build.materialTaxable)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── SETTINGS TAB (job inputs) ───────────────────────── */
function SettingsTab({ ji, set, extras, setEx, floor, isNewRep, jobType, chooseJobType, mode, setMode }: any) {
  return (
    <div className="p-6 grid grid-cols-2 gap-4 max-md:grid-cols-1 max-w-5xl">
      <div className="space-y-4">
        <JobTypeCard ji={ji} set={set} jobType={jobType} chooseJobType={chooseJobType} mode={mode} setMode={setMode} />
        <JobInputForm ji={ji} set={set} floor={floor} isNewRep={isNewRep} />
      </div>
      <div className="space-y-4">
        <ProposalExtrasForm extras={extras} setEx={setEx} ji={ji} />
      </div>
    </div>
  );
}

function JobTypeCard({ ji, set, jobType, chooseJobType, mode, setMode }: any) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-4 space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Job Type</div>
        <div className="flex flex-wrap gap-1.5">
          {(JOB_TYPES as readonly string[]).map((jt) => (
            <button key={jt} onClick={() => chooseJobType(jt)} data-testid={`jobtype-${jt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className={cn("px-2.5 py-1.5 rounded-md text-xs border", jobType === jt ? "bg-primary text-primary-foreground border-primary" : "bg-card border-card-border hover-elevate")}>{jt}</button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5">
          {jobType === "Residential Insurance Re-Roof" ? "Insurance math — O&P allowed." : "Retail math."}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1" data-testid="text-template-hint">{templateHint(jobType)}</div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Build Mode</div>
        <div className="flex gap-1">
          {([["quick", "Quick Template"], ["custom", "Custom"]] as const).map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)} data-testid={`mode-${m}`}
              className={cn("px-3 py-1.5 rounded-md text-sm border", mode === m ? "bg-primary text-primary-foreground border-primary" : "bg-card border-card-border hover-elevate")}>{lbl}</button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5">
          {mode === "custom" ? "Fully manual — blank rows, catalog picks per line." : "Pre-built shingle template — fill in quantities."}
        </div>
      </div>
      {jobType === "Residential Insurance Re-Roof" && (
        <Row><Label className="text-sm text-muted-foreground">Carrier contract $</Label>
          <Input type="number" className="h-8 w-36 tnum text-right" value={ji.contractValue || 0} data-testid="input-contract-value" onChange={(e) => set({ contractValue: Number(e.target.value) })} /></Row>
      )}
      <Row><Label className="text-sm text-muted-foreground">CC surcharge (3% materials)</Label>
        <Switch checked={ji.ccSurcharge} onCheckedChange={(v: boolean) => set({ ccSurcharge: v })} data-testid="switch-cc" /></Row>
    </div>
  );
}

/* ───────────────────────── JOB INPUT FORM (single-column) ───────────────────────── */
function Row({ children }: any) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      {children}
    </div>
  );
}
function NumField({ k, lbl, ji, set, step }: any) {
  return (
    <Row>
      <Label className="text-sm text-muted-foreground">{lbl}</Label>
      <Input type="number" step={step || 1} value={(ji as any)[k]} data-testid={`input-${k}`}
        className="tnum w-36 shrink-0 text-right"
        onChange={(e) => set({ [k]: Number(e.target.value) })} />
    </Row>
  );
}
function SwitchRow({ lbl, checked, onChange, testid }: any) {
  return (
    <Row>
      <Label className="text-sm text-muted-foreground">{lbl}</Label>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testid} />
    </Row>
  );
}
function FieldSection({ title, children }: any) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function JobInputForm({ ji, set, floor, isNewRep }: any) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-4 space-y-5">
      <div className="text-sm font-semibold">Quick / Templates — Job Input</div>
      <FieldSection title="Roof System">
        <Row>
          <Label className="text-sm text-muted-foreground">Shingle</Label>
          <div className="w-56 shrink-0">
            <Select value={ji.shingle} onValueChange={(v) => set({ shingle: v })}>
              <SelectTrigger data-testid="select-shingle" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{SHINGLE_OPTIONS.map((s) => <SelectItem key={s.name} value={s.name}>{s.name} — ${s.perSQ}/SQ</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Row>
        <NumField k="squares" lbl="Squares" ji={ji} set={set} step={0.1} />
        <NumField k="pitch" lbl="Pitch (x:12)" ji={ji} set={set} />
        <NumField k="layers" lbl="Layers" ji={ji} set={set} />
        <NumField k="stories" lbl="Stories" ji={ji} set={set} />
        <NumField k="wastePct" lbl="Waste %" ji={ji} set={set} />
        <NumField k="stripFt" lbl="I&W strip ft" ji={ji} set={set} />
      </FieldSection>
      <FieldSection title="Roof Measurements — Linear (LF)">
        <NumField k="eaves" lbl="Eaves" ji={ji} set={set} />
        <NumField k="rakes" lbl="Rakes" ji={ji} set={set} />
        <NumField k="ridges" lbl="Ridges" ji={ji} set={set} />
        <NumField k="hips" lbl="Hips" ji={ji} set={set} />
        <NumField k="valleys" lbl="Valleys" ji={ji} set={set} />
        <NumField k="step" lbl="Step/headwall" ji={ji} set={set} />
        <NumField k="counterFlash" lbl="Counter flash" ji={ji} set={set} />
        <NumField k="ridgeVentLF" lbl="Ridge vent" ji={ji} set={set} />
        <NumField k="gutterApronLF" lbl="Gutter apron" ji={ji} set={set} />
        <NumField k="dripEdgeXlLF" lbl="Drip edge (4x5)" ji={ji} set={set} />
      </FieldSection>
      <FieldSection title="Penetrations & Vents">
        <NumField k="pipeBoots" lbl="Pipe boots" ji={ji} set={set} />
        <NumField k="splitBoots" lbl="Split boots" ji={ji} set={set} />
        <NumField k="boxVents" lbl="Box vents" ji={ji} set={set} />
        <NumField k="modBitSQ" lbl="Mod bit SQ" ji={ji} set={set} />
        <NumField k="osbSheets" lbl="OSB sheets" ji={ji} set={set} />
        <NumField k="crickets" lbl="Crickets" ji={ji} set={set} />
        <NumField k="broanSmallKit" lbl="Broan sm kit" ji={ji} set={set} />
        <NumField k="broanLargeKit" lbl="Broan lg kit" ji={ji} set={set} />
      </FieldSection>
      <FieldSection title="Job Factors">
        <SwitchRow lbl="Trash walk" checked={ji.trashWalk} onChange={(v: boolean) => set({ trashWalk: v })} testid="switch-trashwalk" />
        <SwitchRow lbl="No-access loading" checked={ji.noAccess} onChange={(v: boolean) => set({ noAccess: v })} testid="switch-noaccess" />
        <SwitchRow lbl="Granulated I&W (alt)" checked={ji.iceWaterAlt} onChange={(v: boolean) => set({ iceWaterAlt: v })} testid="switch-iwalt" />
      </FieldSection>
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        <SettingsIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Pricing controls — target GPM, labor rate, material tax — live on the <span className="font-medium text-foreground">Financials</span> tab. Waste % set here syncs with Financials.
      </div>
    </div>
  );
}

/* ───────────────────────── PROPOSAL EXTRAS ───────────────────────── */
function ProposalExtrasForm({ extras, setEx, ji }: any) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-4 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposal Extras (added to contract, tax-inclusive)</div>
      <div className="flex flex-col">
        <Row><Label className="text-sm text-muted-foreground">Gutters & Downspouts $</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.gutters} data-testid="input-gutters" onChange={(e) => setEx({ gutters: Number(e.target.value) })} /></Row>
        <Row><Label className="text-sm text-muted-foreground">Siding $</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.siding} data-testid="input-siding" onChange={(e) => setEx({ siding: Number(e.target.value) })} /></Row>
        <Row><Label className="text-sm text-muted-foreground">Permit fees $</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.permits} data-testid="input-permits" onChange={(e) => setEx({ permits: Number(e.target.value) })} /></Row>
        <Row><Label className="text-sm text-muted-foreground">Customer upgrades $</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.upgrades} data-testid="input-upgrades" onChange={(e) => setEx({ upgrades: Number(e.target.value) })} /></Row>
        {ji.funding === "Insurance" && (
          <Row><Label className="text-sm text-muted-foreground">O&P $ (insurance)</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.opAmount} data-testid="input-op" onChange={(e) => setEx({ opAmount: Number(e.target.value) })} /></Row>
        )}
        {ji.funding === "Retail" ? (
          <Row><Label className="text-sm text-muted-foreground">Deposit %</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.depositPct} data-testid="input-deposit" onChange={(e) => setEx({ depositPct: Number(e.target.value) })} /></Row>
        ) : (
          <Row><Label className="text-sm text-muted-foreground">ACV / initial payment $</Label><Input type="number" className="tnum w-36 shrink-0 text-right" value={extras.acvInitial} data-testid="input-acv" onChange={(e) => setEx({ acvInitial: Number(e.target.value) })} /></Row>
        )}
      </div>
    </div>
  );
}
