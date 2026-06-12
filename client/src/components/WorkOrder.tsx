// Update 6: Work Order — generated from an estimate, fillable, and printable
// (reuses the proposal print CSS: `.proposal-pages` / `.proposal-page` +
// `.no-print`). Quantities-only line items pulled from the build model.
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui-bits";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Printer, ArrowLeft, RefreshCw, Trash2, Phone } from "lucide-react";
import { woGroupsFor, summaryFor, type WOGroup } from "@/lib/record-derive";
import { WORK_ORDER_STATUSES } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const CHECKLIST_LEFT = [
  { key: "timeFrame", label: "Time Frame (Normal / Rush)" },
  { key: "doByDate", label: "Do By Date (if applicable)" },
  { key: "allBuildings", label: "Roofing all buildings on the property?" },
  { key: "roofLoad", label: "Able to Roof Load? (if no explain)" },
  { key: "dumpster", label: "Desired dumpster location" },
  { key: "dishes", label: "Dishes? (explain in notes)" },
];
const CHECKLIST_RIGHT = [
  { key: "solar", label: "Solar Panels? (explain plan in notes)" },
  { key: "gutters", label: "Replacing ALL Gutters & Downspouts?" },
  { key: "otherWork", label: "Other Work to be completed?" },
  { key: "warranty", label: "Extended Warranty Sold?" },
  { key: "colorsApproved", label: "All Colors Approved? (Shingles, Drip Edge, Gutter Apron, Valley Metal, Plumbing Boots)" },
];
const SUMMARY_BOXES: { key: string; label: string }[] = [
  { key: "squares", label: "SQUARES" },
  { key: "layers", label: "LAYERS" },
  { key: "days", label: "DAYS" },
  { key: "shingle", label: "SHINGLE" },
  { key: "hipRidge", label: "HIP AND RIDGE" },
  { key: "starter", label: "STARTER" },
];

/* ── List of work orders for a job + create button ── */
export function WorkOrdersTab({ job, est }: { job: any; est: any }) {
  const { toast } = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const { data: list = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/jobs", job.id, "work-orders"],
    queryFn: () => apiRequest("GET", `/api/jobs/${job.id}/work-orders`).then((r) => r.json()),
  });

  const jobType: string = est?.jobType || job?.jobType || "Residential Re-Roof";

  const create = useMutation({
    mutationFn: () => {
      const summary = est ? summaryFor(est, jobType) : {};
      const groups = est ? woGroupsFor(est, jobType) : [];
      return apiRequest("POST", `/api/jobs/${job.id}/work-orders`, {
        estimateId: est?.id || null,
        status: "Draft",
        subtitle: job.workType || "Shingles / Composite Roofing",
        preparedBy: "",
        preparedByPhone: "",
        showMaterials: true,
        showLabor: true,
        summaryJson: JSON.stringify(summary),
        directions: "",
        checklistJson: JSON.stringify({}),
        linesJson: JSON.stringify(groups),
      }).then((r) => r.json());
    },
    onSuccess: (wo: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "work-orders"] });
      setOpenId(wo.id);
      toast({ title: "Work order created", description: est ? "Items pulled from the estimate." : "Add items manually — no estimate found." });
    },
  });

  if (openId != null) {
    return <WorkOrderEditor woId={openId} job={job} est={est} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Work Orders</h3>
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending} data-testid="button-create-work-order">
          <Plus className="w-4 h-4 mr-1.5" /> Create Work Order
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : list.length === 0 ? (
        <EmptyState title="No work orders yet" hint="Generate one from the estimate to dispatch the crew." />
      ) : (
        <div className="space-y-2">
          {list.map((wo) => (
            <button
              key={wo.id}
              onClick={() => setOpenId(wo.id)}
              className="flex items-center justify-between w-full p-3 rounded-lg border border-border bg-card hover:bg-accent text-left"
              data-testid={`row-work-order-${wo.id}`}
            >
              <div>
                <div className="font-medium text-sm">Work Order #{wo.id}</div>
                <div className="text-xs text-muted-foreground">{wo.subtitle || "—"}</div>
              </div>
              <Badge variant="outline">{wo.status}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── The fillable + printable work order ── */
export function WorkOrderEditor({ woId, job, est, onBack }: { woId: number; job: any; est: any; onBack: () => void }) {
  const { toast } = useToast();
  const { data: wo } = useQuery<any>({
    queryKey: ["/api/work-orders", woId],
    queryFn: () => apiRequest("GET", `/api/work-orders/${woId}`).then((r) => r.json()),
  });

  const [form, setForm] = useState<any>(null);
  const jobType: string = est?.jobType || job?.jobType || "Residential Re-Roof";

  useEffect(() => {
    if (wo && !form) {
      setForm({
        status: wo.status || "Draft",
        subtitle: wo.subtitle || "",
        preparedBy: wo.preparedBy || "",
        preparedByPhone: wo.preparedByPhone || "",
        showMaterials: wo.showMaterials !== false,
        showLabor: wo.showLabor !== false,
        summary: safe(wo.summaryJson, {}),
        directions: wo.directions || "",
        checklist: safe(wo.checklistJson, {}),
        groups: safe(wo.linesJson, []) as WOGroup[],
      });
    }
  }, [wo]);

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/work-orders/${woId}`, {
      status: form.status,
      subtitle: form.subtitle,
      preparedBy: form.preparedBy,
      preparedByPhone: form.preparedByPhone,
      showMaterials: form.showMaterials,
      showLabor: form.showLabor,
      summaryJson: JSON.stringify(form.summary),
      directions: form.directions,
      checklistJson: JSON.stringify(form.checklist),
      linesJson: JSON.stringify(form.groups),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", woId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id, "work-orders"] });
      toast({ title: "Work order saved" });
    },
  });

  if (!form) return <div className="text-sm text-muted-foreground">Loading work order…</div>;

  const setSummary = (k: string, v: string) => setForm({ ...form, summary: { ...form.summary, [k]: v } });
  const setCheck = (k: string, field: "value" | "note", v: string) =>
    setForm({ ...form, checklist: { ...form.checklist, [k]: { ...(form.checklist[k] || {}), [field]: v } } });

  const refresh = () => {
    if (!est) { toast({ title: "No estimate to pull from" }); return; }
    setForm({ ...form, groups: woGroupsFor(est, jobType), summary: { ...summaryFor(est, jobType), days: form.summary.days || "" } });
    toast({ title: "Refreshed from estimate" });
  };
  const removeLine = (lineId: string) => {
    const groups = form.groups.map((g: WOGroup) =>
      ({ ...g, lines: g.lines.filter((l: any) => l.id !== lineId) })
    ).filter((g: WOGroup) => g.lines.length);
    setForm({ ...form, groups });
  };
  const editQty = (lineId: string, v: string) => {
    const groups = form.groups.map((g: WOGroup) =>
      ({ ...g, lines: g.lines.map((l: any) => l.id === lineId ? { ...l, qty: v === "" ? "" : Number(v) } : l) })
    );
    setForm({ ...form, groups });
  };

  const proj = job.id ? `P${job.id} : ${job.address || ""} : ${form.subtitle || jobType}` : "";

  // Child items inherit parent category; zero-qty lines excluded; Materials/Labor
  // checkboxes hide whole kinds. Spec/custom lines follow the Materials toggle.
  const visibleGroups: WOGroup[] = form.groups
    .map((g: WOGroup) => ({
      ...g,
      lines: g.lines.filter((l: any) => {
        if ((Number(l.qty) || 0) <= 0) return false;
        const isLabor = l.kind === "labor";
        if (isLabor && !form.showLabor) return false;
        if (!isLabor && !form.showMaterials) return false;
        return true;
      }),
    }))
    .filter((g: WOGroup) => g.lines.length > 0);

  return (
    <div className="proposal-root">
      {/* Action bar — hidden on print */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="button-back-work-order">
          <ArrowLeft className="w-4 h-4" /> Back to work orders
        </button>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer" data-testid="toggle-wo-materials">
            <input type="checkbox" checked={form.showMaterials} onChange={(e) => setForm({ ...form, showMaterials: e.target.checked })} className="accent-primary" /> Materials
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer" data-testid="toggle-wo-labor">
            <input type="checkbox" checked={form.showLabor} onChange={(e) => setForm({ ...form, showLabor: e.target.checked })} className="accent-primary" /> Labor
          </label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="w-[130px] h-9" data-testid="select-wo-status"><SelectValue /></SelectTrigger>
            <SelectContent>{WORK_ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={refresh} data-testid="button-refresh-wo">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh from estimate
          </Button>
          <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-wo">
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" onClick={() => { save.mutate(); setTimeout(() => window.print(), 300); }} data-testid="button-print-wo">
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {/* Printable letter page */}
      <div className="proposal-pages">
        <div className="proposal-page bg-white text-black mx-auto shadow-xl p-[0.55in] flex flex-col text-[12px]" data-testid="work-order-page">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-black pb-3">
            <div>
              <div className="text-2xl font-extrabold tracking-tight">WORK ORDER</div>
              <input
                className="mt-1 text-sm font-semibold bg-transparent border-b border-neutral-300 focus:outline-none w-[280px] no-print-border"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="Shingles / Composite Roofing"
                data-testid="input-wo-subtitle"
              />
              <div className="text-sm mt-1">{job.address}</div>
            </div>
            <div className="text-right text-[11px] space-y-1">
              <div>
                <div className="uppercase tracking-wide text-neutral-500 text-[9px]">Prepared By</div>
                <input className="text-right bg-transparent border-b border-neutral-300 focus:outline-none w-[150px]" value={form.preparedBy} onChange={(e) => setForm({ ...form, preparedBy: e.target.value })} placeholder="Name" data-testid="input-wo-prepared" />
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <input className="text-right bg-transparent border-b border-neutral-300 focus:outline-none w-[120px]" value={form.preparedByPhone} onChange={(e) => setForm({ ...form, preparedByPhone: e.target.value })} placeholder="Phone" />
                  {form.preparedByPhone && <a href={`tel:${String(form.preparedByPhone).replace(/[^0-9+]/g, "")}`} className="no-print text-primary" title="Call" data-testid="link-call-employee"><Phone className="w-3.5 h-3.5" /></a>}
                </div>
              </div>
              <div>
                <div className="uppercase tracking-wide text-neutral-500 text-[9px]">Customer</div>
                <div className="font-semibold">{job.customer}</div>
                {job.phone && <a href={`tel:${String(job.phone).replace(/[^0-9+]/g, "")}`} className="underline" data-testid="link-call-customer">{job.phone}</a>}
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono mt-2 text-neutral-700">{proj}</div>

          {/* Summary boxes */}
          <div className="grid grid-cols-6 gap-2 mt-3">
            {SUMMARY_BOXES.map((b) => (
              <div key={b.key} className="border border-black rounded">
                <div className="text-[8px] font-bold uppercase text-center bg-neutral-100 border-b border-black py-0.5">{b.label}</div>
                <input
                  className="w-full text-center text-[11px] py-1 bg-transparent focus:outline-none"
                  value={form.summary[b.key] || ""}
                  onChange={(e) => setSummary(b.key, e.target.value)}
                  data-testid={`input-wo-summary-${b.key}`}
                />
              </div>
            ))}
          </div>

          {/* Directions */}
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-wide">Directions & Job Details</div>
            <Textarea
              value={form.directions}
              onChange={(e) => setForm({ ...form, directions: e.target.value })}
              rows={5}
              className="mt-1 text-[12px] text-black bg-white border-neutral-300 resize-none"
              placeholder="Scheduling notes, building breakdown, special instructions (dogs, nail cleanup, skylight handling)…"
              data-testid="input-wo-directions"
            />
          </div>

          {/* Two checklist tables */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[CHECKLIST_LEFT, CHECKLIST_RIGHT].map((col, ci) => (
              <table key={ci} className="w-full border border-black text-[10px]">
                <tbody>
                  {col.map((row) => {
                    const cur = form.checklist[row.key] || {};
                    return (
                      <tr key={row.key} className="border-b border-neutral-300 align-top">
                        <td className="p-1 border-r border-neutral-300 w-[58%]">{row.label}</td>
                        <td className="p-1 border-r border-neutral-300 w-[42px]">
                          <select
                            className="w-full bg-transparent focus:outline-none text-[10px]"
                            value={cur.value || "—"}
                            onChange={(e) => setCheck(row.key, "value", e.target.value)}
                            data-testid={`select-wo-check-${row.key}`}
                          >
                            <option value="—">—</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td className="p-1">
                          <input
                            className="w-full bg-transparent focus:outline-none text-[10px]"
                            value={cur.note || ""}
                            onChange={(e) => setCheck(row.key, "note", e.target.value)}
                            placeholder="notes…"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>

          {/* Estimate items (quantities only) */}
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1">Scope — Materials & Labor (quantities)</div>
            {visibleGroups.length === 0 ? (
              <div className="text-[11px] text-neutral-500 italic">No items to show. Check the Materials / Labor toggles or use “Refresh from estimate”.</div>
            ) : (
              <div className="border border-black">
                {visibleGroups.map((g: WOGroup, gi: number) => (
                  <div key={g.title + gi}>
                    <div className="bg-neutral-100 border-b border-black px-2 py-0.5 text-[10px] font-bold uppercase">{g.title}</div>
                    {g.lines.map((l: any) => (
                      <div key={l.id}>
                        <div className="flex items-center gap-2 px-2 py-1 border-b border-neutral-200 text-[11px]">
                          <input
                            className="w-12 text-right bg-transparent border-b border-neutral-300 focus:outline-none no-spin"
                            inputMode="decimal"
                            placeholder="0"
                            value={l.qty}
                            onChange={(e) => editQty(l.id, e.target.value)}
                          />
                          <span className="w-10 text-neutral-500">{l.unit}</span>
                          <span className="flex-1">{l.name}</span>
                          <button onClick={() => removeLine(l.id)} className="no-print text-neutral-400 hover:text-red-500" data-testid={`button-remove-wo-line-${l.id}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {l.product && <div className="px-2 pb-1 text-[10px]" style={{ color: "#E05A26" }}>→ {l.product}</div>}
                        {l.kind === "labor" && <div className="px-2 pb-1 text-[10px] text-neutral-500">→ (Labor){l.laborNote ? ` ${l.laborNote}` : ""}</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-[8px] text-neutral-400 mt-auto pt-4">Impact Exteriors LLC · Work Order · Internal field document</div>
        </div>
      </div>
    </div>
  );
}

function safe(json: string, fallback: any) {
  try { return JSON.parse(json || ""); } catch { return fallback; }
}
