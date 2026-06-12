import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import { money, money2, timeAgo } from "@/lib/format";
import { Plus, Trash2, Printer, Check, X, ImagePlus, Warehouse, Truck } from "lucide-react";
import { useListView, applyList, exportCsv, ListToolbar, SortHead } from "@/components/ListView";
import type { Job, PriceItem, Vendor } from "@shared/schema";

type Line = {
  itemId: number | null; itemName: string; vendorId: number | null;
  qty: number | string; unit: string; unitRate: number | string; category: string | null;
};
type Return = {
  id: number; jobId: number | null; status: string; submittedBy: string | null;
  submittedAt: number | null; approvedBy: string | null; approvedAt: number | null;
  vendorId: number | null; totalReturnValue: number; photosJson: string; notes: string | null;
  createdAt: number; lines: any[];
};

const statusColor = (s: string) =>
  s === "Approved" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : s === "Rejected" ? "bg-red-500/15 text-red-600 dark:text-red-400"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-400";

export default function MaterialReturns() {
  const { user } = useApp();
  const { toast } = useToast();
  const { data: returns = [], isLoading } = useQuery<Return[]>({ queryKey: ["/api/material-returns"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });
  const { data: items = [] } = useQuery<PriceItem[]>({ queryKey: ["/api/price-items"] });
  const [editing, setEditing] = useState<Return | "new" | null>(null);
  const [printing, setPrinting] = useState<Return | null>(null);

  const isAdmin = user?.role === "Admin";
  const jobName = (id: number | null) => jobs.find((j) => j.id === id)?.customer || (id ? `Job #${id}` : "—");
  const vendorName = (id: number | null) => vendors.find((v) => v.id === id)?.name || "Warehouse";

  const { state, setQ, setMine, setFilter, toggleSort } = useListView("material-returns");

  const filtered = useMemo(() => applyList(returns, state, {
    searchText: (r) => `${jobName(r.jobId)} ${r.submittedBy || ""} ${r.notes || ""} ${vendorName(r.vendorId)}`,
    isMine: (r) => r.submittedBy === user?.name,
    filterMatch: (r, f) => (!f.status || f.status === "all" || r.status === f.status),
    sortValue: (r, k) => k === "value" ? r.totalReturnValue : k === "status" ? r.status : k === "submitted" ? (r.submittedAt || 0) : jobName(r.jobId),
  }), [returns, state, jobs, vendors, user]);

  const approve = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) =>
      apiRequest("POST", `/api/material-returns/${id}/${action}`, { by: user?.name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/material-returns"] }); toast({ title: "Return updated" }); },
  });
  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/material-returns/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/material-returns"] }); toast({ title: "Return deleted" }); },
  });

  const doExport = () => exportCsv("material-returns.csv",
    ["Job", "Status", "Submitted By", "Vendor", "Lines", "Return Value"],
    filtered.map((r) => [jobName(r.jobId), r.status, r.submittedBy || "", vendorName(r.vendorId), (r.lines || []).length, r.totalReturnValue]));

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Material Returns"
        subtitle={`${returns.length} returns · ${returns.filter((r) => r.status === "Pending").length} pending approval`}
        actions={<Button size="sm" onClick={() => setEditing("new")} data-testid="button-new-return"><Plus className="h-4 w-4 mr-1.5" /> New Return</Button>}
      />

      <ListToolbar
        q={state.q} onQ={setQ} mine={state.mine} onMine={setMine} onExport={doExport}
        placeholder="Search returns by job, submitter, notes…"
        count={filtered.length} total={returns.length}
        extra={
          <Select value={state.filters.status || "all"} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger className="w-[150px]" data-testid="select-return-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading returns…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No returns match this view.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHead label="Job" sortKey="job" state={state} onSort={toggleSort} /></TableHead>
                <TableHead><SortHead label="Status" sortKey="status" state={state} onSort={toggleSort} /></TableHead>
                <TableHead className="hidden md:table-cell">Submitted</TableHead>
                <TableHead className="hidden lg:table-cell">Destination</TableHead>
                <TableHead className="text-right"><SortHead label="Return Value" sortKey="value" state={state} onSort={toggleSort} align="right" /></TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)} data-testid={`row-return-${r.id}`}>
                  <TableCell>
                    <div className="font-medium">{jobName(r.jobId)}</div>
                    <div className="text-xs text-muted-foreground">{(r.lines || []).length} line{(r.lines || []).length === 1 ? "" : "s"}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={statusColor(r.status)}>{r.status}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    <div>{r.submittedBy || "—"}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(r.submittedAt)}</div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {r.vendorId ? <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" />{vendorName(r.vendorId)}</span>
                      : <span className="inline-flex items-center gap-1 text-muted-foreground"><Warehouse className="h-3.5 w-3.5" />Mixed / Warehouse</span>}
                  </TableCell>
                  <TableCell className="text-right tnum font-medium">{money(r.totalReturnValue)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPrinting(r)} data-testid={`button-print-${r.id}`}><Printer className="h-3.5 w-3.5" /></Button>
                      {isAdmin && r.status === "Pending" && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => approve.mutate({ id: r.id, action: "approve" })} data-testid={`button-approve-${r.id}`}><Check className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => approve.mutate({ id: r.id, action: "reject" })} data-testid={`button-reject-${r.id}`}><X className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => del.mutate(r.id)} data-testid={`button-delete-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {editing && (
        <ReturnEditor
          ret={editing === "new" ? null : editing}
          jobs={jobs} vendors={vendors} items={items}
          onClose={() => setEditing(null)}
        />
      )}
      {printing && <PrintSlips ret={printing} vendors={vendors} jobs={jobs} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function ReturnEditor({ ret, jobs, vendors, items, onClose }: {
  ret: Return | null; jobs: Job[]; vendors: Vendor[]; items: PriceItem[]; onClose: () => void;
}) {
  const { user } = useApp();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<number | null>(ret?.jobId ?? null);
  const [notes, setNotes] = useState(ret?.notes || "");
  const [photos, setPhotos] = useState<{ name: string; dataUrl: string }[]>(() => {
    try { return ret ? JSON.parse(ret.photosJson || "[]") : []; } catch { return []; }
  });
  const [lines, setLines] = useState<Line[]>(() =>
    ret?.lines?.length
      ? ret.lines.map((l: any) => ({ itemId: l.itemId, itemName: l.itemName, vendorId: l.vendorId, qty: l.qty, unit: l.unit, unitRate: l.unitRate, category: l.category }))
      : [{ itemId: null, itemName: "", vendorId: null, qty: "", unit: "EA", unitRate: "", category: null }],
  );

  const num = (v: number | string) => Number(v) || 0;
  const warehouseTotal = lines.filter((l) => l.vendorId == null).reduce((s, l) => s + num(l.qty) * num(l.unitRate), 0);
  const vendorTotal = lines.filter((l) => l.vendorId != null).reduce((s, l) => s + num(l.qty) * num(l.unitRate), 0);
  const grandTotal = warehouseTotal + vendorTotal;
  const allToVendor = lines.length > 0 && lines.every((l) => l.vendorId != null && l.itemName);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const pickItem = (i: number, itemId: number) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    setLine(i, { itemId, itemName: it.name, unit: it.unit, category: it.costCode, unitRate: it.unitCost });
  };

  const onPhotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((p) => [...p, { name: f.name, dataUrl: String(reader.result) }]);
      reader.readAsDataURL(f);
    });
  };

  const save = useMutation({
    mutationFn: (body: any) => ret
      ? apiRequest("PATCH", `/api/material-returns/${ret.id}`, body)
      : apiRequest("POST", "/api/material-returns", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/material-returns"] });
      toast({ title: ret ? "Return updated" : (allToVendor ? "Return submitted & auto-approved" : "Return submitted") });
      onClose();
    },
  });

  const submit = () => {
    const clean = lines.filter((l) => l.itemName.trim()).map((l) => ({
      itemId: l.itemId, itemName: l.itemName, vendorId: l.vendorId,
      qty: num(l.qty), unit: l.unit, unitRate: num(l.unitRate), category: l.category,
    }));
    if (!clean.length) { toast({ title: "Add at least one line", variant: "destructive" }); return; }
    save.mutate({ jobId, notes, photosJson: JSON.stringify(photos), submittedBy: user?.name, lines: clean });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ret ? `Return #${ret.id}` : "New Material Return"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Link to job (optional)</Label>
              <Select value={jobId ? String(jobId) : "none"} onValueChange={(v) => setJobId(v === "none" ? null : Number(v))}>
                <SelectTrigger data-testid="select-return-job"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {jobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.customer}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-return-notes" />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Return lines</Label>
              <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { itemId: null, itemName: "", vendorId: null, qty: "", unit: "EA", unitRate: "", category: null }])} data-testid="button-add-line">
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_90px_90px_1fr_auto] gap-2 items-end p-2" data-testid={`return-line-${i}`}>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Item</Label>
                    <Select value={l.itemId ? String(l.itemId) : ""} onValueChange={(v) => pickItem(i, Number(v))}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select item…" /></SelectTrigger>
                      <SelectContent>
                        {items.map((it) => <SelectItem key={it.id} value={String(it.id)}>{it.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Qty</Label>
                    <Input className="h-8 no-spin" inputMode="decimal" value={String(l.qty)} placeholder="0" onChange={(e) => setLine(i, { qty: e.target.value })} data-testid={`input-line-qty-${i}`} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Rate</Label>
                    <Input className="h-8 no-spin" inputMode="decimal" value={String(l.unitRate)} placeholder="0" onChange={(e) => setLine(i, { unitRate: e.target.value })} data-testid={`input-line-rate-${i}`} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Vendor (blank = warehouse)</Label>
                    <Select value={l.vendorId ? String(l.vendorId) : "warehouse"} onValueChange={(v) => setLine(i, { vendorId: v === "warehouse" ? null : Number(v) })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="warehouse">Warehouse (inventory)</SelectItem>
                        {vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Photos</Label>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-add-photo"><ImagePlus className="h-4 w-4 mr-1" /> Add photo</Button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPhotos(e.target.files)} />
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded border border-border bg-muted overflow-hidden">
                    {p.dataUrl ? <img src={p.dataUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-[9px] text-muted-foreground p-1 text-center">{p.name}</div>}
                    <button onClick={() => setPhotos((ps) => ps.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live totals */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" /> To Warehouse</div>
              <div className="text-lg font-bold tnum mt-1">{money2(warehouseTotal)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> To Vendors</div>
              <div className="text-lg font-bold tnum mt-1">{money2(vendorTotal)}</div>
            </div>
            <div className="rounded-lg border border-primary/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Return Value</div>
              <div className="text-lg font-bold tnum mt-1 text-primary">{money2(grandTotal)}</div>
            </div>
          </div>
          {allToVendor && !ret && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400">All lines assigned to a vendor — this return will auto-approve on submit.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-return">{save.isPending ? "Saving…" : ret ? "Save" : "Submit Return"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Per-vendor printable slips (window.print). Warehouse lines grouped under "Warehouse". */
function PrintSlips({ ret, vendors, jobs, onClose }: { ret: Return; vendors: Vendor[]; jobs: Job[]; onClose: () => void }) {
  const vendorName = (id: number | null) => id == null ? "Warehouse (Inventory)" : vendors.find((v) => v.id === id)?.name || `Vendor #${id}`;
  const job = jobs.find((j) => j.id === ret.jobId);
  const groups = useMemo(() => {
    const m = new Map<number | null, any[]>();
    for (const l of (ret.lines || [])) {
      const k = l.vendorId ?? null;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return Array.from(m.entries());
  }, [ret]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="no-print"><DialogTitle>Return Slips — {groups.length} {groups.length === 1 ? "destination" : "destinations"}</DialogTitle></DialogHeader>
        <div className="no-print flex justify-end">
          <Button size="sm" onClick={() => window.print()} data-testid="button-do-print"><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
        </div>
        <div className="proposal-pages space-y-6">
          {groups.map(([vendorId, lines], gi) => {
            const total = lines.reduce((s: number, l: any) => s + (l.qty || 0) * (l.unitRate || 0), 0);
            return (
              <div key={gi} className="proposal-page border border-border rounded-lg p-6 bg-white text-black">
                <div className="flex items-center justify-between border-b border-black/20 pb-3 mb-3">
                  <div>
                    <div className="text-lg font-bold">Material Return Slip</div>
                    <div className="text-sm">Impact Exteriors LLC</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>Return #{ret.id}</div>
                    <div>{new Date(ret.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div><span className="font-semibold">Destination:</span> {vendorName(vendorId)}</div>
                  <div><span className="font-semibold">Job:</span> {job?.customer || "—"}</div>
                  <div><span className="font-semibold">Submitted by:</span> {ret.submittedBy || "—"}</div>
                  <div><span className="font-semibold">Status:</span> {ret.status}</div>
                </div>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-black/30 text-left">
                      <th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l: any, i: number) => (
                      <tr key={i} className="border-b border-black/10">
                        <td className="py-1">{l.itemName}</td>
                        <td className="py-1 text-right tnum">{l.qty}</td>
                        <td className="py-1 text-right">{l.unit}</td>
                        <td className="py-1 text-right tnum">{money2(l.unitRate)}</td>
                        <td className="py-1 text-right tnum">{money2((l.qty || 0) * (l.unitRate || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t border-black/30"><td className="py-1" colSpan={4}>Total</td><td className="py-1 text-right tnum">{money2(total)}</td></tr>
                  </tfoot>
                </table>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
