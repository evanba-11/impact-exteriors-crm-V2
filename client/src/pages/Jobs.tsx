import { useQuery } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { money, pct, marginColor, timeAgo } from "@/lib/format";
import { useLocation } from "wouter";
import { useApp } from "@/lib/app-context";
import type { Job, User } from "@shared/schema";
import { JobTypeBadge } from "@/pages/Estimates";
import { useListView, applyList, exportCsv, ListToolbar, SortHead } from "@/components/ListView";

export default function Jobs() {
  const { data: jobs = [], isLoading } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: wip = [] } = useQuery<any[]>({ queryKey: ["/api/wip"] });
  const { user } = useApp();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("active");

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
        : k === "cost" ? (w?.costToDate ?? w?.cost ?? 0)
        : k === "complete" ? (w?.percentComplete ?? 0)
        : k === "margin" ? (w?.margin ?? -Infinity)
        : k === "stage" ? j.stage
        : k === "updated" ? (j.lastActivityAt || 0)
        : j.customer;
    },
  }), [scoped, state, wipById, users, user]);

  const doExport = () => exportCsv("jobs.csv",
    ["Customer", "Address", "Type", "Stage", "PM / Rep", "Contract", "Cost To Date", "% Complete", "Margin %"],
    list.map((j) => {
      const w = wipById[j.id];
      return [j.customer, j.address || "", j.jobType || "", j.stage, repName(j.repId),
        j.contractValue || j.value || 0, w?.costToDate ?? w?.cost ?? "", w ? w.percentComplete : "", w ? w.margin : ""];
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

      <ListToolbar
        q={state.q} onQ={setQ}
        mine={state.mine} onMine={setMine}
        onExport={doExport}
        placeholder="Search jobs…"
        count={list.length} total={scoped.length}
      />

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
                      {w ? money(w.costToDate ?? w.cost ?? 0) : "—"}
                    </TableCell>
                    <TableCell className="text-right tnum hidden md:table-cell">
                      {w ? pct(w.percentComplete) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tnum font-medium ${w ? marginColor(w.margin) : ""}`}>
                      {w ? pct(w.margin, 1) : "—"}
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

    </div>
  );
}
