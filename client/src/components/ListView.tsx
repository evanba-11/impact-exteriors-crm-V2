import { ReactNode, useMemo, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { Download, Search, ArrowUp, ArrowDown, User as UserIcon } from "lucide-react";
import { safeStorage } from "@/lib/safe-storage";

/* ───────────────────────── Reusable list-view hook (Update 7) ─────────────────────────
   Fast client-side search + sort + filter + "Mine" toggle, persisted to localStorage
   per list key. CSV export of the currently-filtered rows. Used by Estimates,
   Opportunities, Tasks, Issues, Material Returns, Jobs. */

export type SortDir = "asc" | "desc";
export interface ListState {
  q: string;
  sortKey: string | null;
  sortDir: SortDir;
  mine: boolean;
  filters: Record<string, string>;
}

const DEFAULT_STATE: ListState = { q: "", sortKey: null, sortDir: "asc", mine: false, filters: {} };

export function useListView(key: string, initial?: Partial<ListState>) {
  const storageKey = `list:${key}:filters`;
  const [state, setState] = useState<ListState>(() => {
    try {
      const raw = safeStorage.getItem(storageKey);
      if (raw) return { ...DEFAULT_STATE, ...initial, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_STATE, ...initial };
  });
  useEffect(() => {
    try { safeStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [storageKey, state]);

  const setQ = (q: string) => setState((s) => ({ ...s, q }));
  const setMine = (mine: boolean) => setState((s) => ({ ...s, mine }));
  const setFilter = (k: string, v: string) => setState((s) => ({ ...s, filters: { ...s.filters, [k]: v } }));
  const toggleSort = (sortKey: string) =>
    setState((s) =>
      s.sortKey === sortKey
        ? { ...s, sortDir: s.sortDir === "asc" ? "desc" : "asc" }
        : { ...s, sortKey, sortDir: "asc" },
    );

  return { state, setQ, setMine, setFilter, toggleSort, setState };
}

/* Apply search + filters + sort + mine to a row list. */
export function applyList<T>(
  rows: T[],
  state: ListState,
  opts: {
    searchText: (r: T) => string;
    isMine?: (r: T) => boolean;
    filterMatch?: (r: T, filters: Record<string, string>) => boolean;
    sortValue?: (r: T, key: string) => string | number;
  },
): T[] {
  let out = rows.filter((r) => {
    if (state.q) {
      const s = opts.searchText(r).toLowerCase();
      if (!s.includes(state.q.toLowerCase())) return false;
    }
    if (state.mine && opts.isMine && !opts.isMine(r)) return false;
    if (opts.filterMatch && !opts.filterMatch(r, state.filters)) return false;
    return true;
  });
  if (state.sortKey && opts.sortValue) {
    const key = state.sortKey;
    const dir = state.sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const av = opts.sortValue!(a, key);
      const bv = opts.sortValue!(b, key);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }
  return out;
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const all = [headers, ...rows];
  const csv = all.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* Toolbar: search, Mine toggle, CSV export, plus arbitrary extra controls (filters). */
export function ListToolbar({
  q, onQ, mine, onMine, onExport, placeholder, extra, count, total,
}: {
  q: string; onQ: (v: string) => void;
  mine: boolean; onMine: (v: boolean) => void;
  onExport: () => void;
  placeholder?: string;
  extra?: ReactNode;
  count: number; total: number;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[220px] max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={placeholder || "Search…"} value={q} onChange={(e) => onQ(e.target.value)} className="pl-9" data-testid="input-list-search" />
      </div>
      <Button
        size="sm"
        variant={mine ? "default" : "outline"}
        onClick={() => onMine(!mine)}
        data-testid="button-mine-toggle"
      >
        <UserIcon className="h-4 w-4 mr-1.5" /> Mine
      </Button>
      {extra}
      <Button variant="outline" size="sm" onClick={onExport} data-testid="button-list-export">
        <Download className="h-4 w-4 mr-1.5" /> Export CSV
      </Button>
      <Badge variant="secondary" className="ml-auto font-normal">{count} of {total}</Badge>
    </div>
  );
}

/* Sortable column header cell. */
export function SortHead({
  label, sortKey, state, onSort, align = "left", className,
}: {
  label: string; sortKey: string; state: ListState; onSort: (k: string) => void;
  align?: "left" | "right" | "center"; className?: string;
}) {
  const active = state.sortKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 select-none hover:text-foreground",
        align === "right" && "flex-row-reverse",
        className,
      )}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      {active && (state.sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );
}

export { EmptyState };
