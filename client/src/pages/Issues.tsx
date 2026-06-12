import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useMemo } from "react";
import { useApp } from "@/lib/app-context";
import { useToast } from "@/hooks/use-toast";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { useListView, applyList, exportCsv, ListToolbar, SortHead } from "@/components/ListView";
import { ISSUE_STATUSES, SEG_PRIORITY } from "@shared/schema";
import type { Issue, Job, User } from "@shared/schema";

const statusColor = (s: string) =>
  s === "Resolved" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : s === "In Progress" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
    : "bg-amber-500/15 text-amber-700 dark:text-amber-400";

const priorityColor = (p: string) =>
  p === "Urgent" ? "bg-red-500/15 text-red-600 dark:text-red-400"
    : p === "High" ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
    : p === "Low" ? "bg-slate-500/15 text-slate-600 dark:text-slate-300"
    : "bg-secondary text-secondary-foreground";

export default function Issues() {
  const { user, users = [] } = useApp();
  const { toast } = useToast();
  const { data: issues = [], isLoading } = useQuery<Issue[]>({ queryKey: ["/api/issues"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const [editing, setEditing] = useState<Issue | "new" | null>(null);

  const jobName = (id: number | null) => jobs.find((j) => j.id === id)?.customer || (id ? `Job #${id}` : "—");
  const userName = (id: number | null) => (users as User[]).find((u) => u.id === id)?.name || "Unassigned";

  const { state, setQ, setMine, setFilter, toggleSort } = useListView("issues");

  const filtered = useMemo(() => applyList(issues, state, {
    searchText: (r) => `${r.title} ${r.description || ""} ${jobName(r.jobId)} ${userName(r.assigneeId)}`,
    isMine: (r) => userName(r.assigneeId) === user?.name || r.createdBy === user?.name,
    filterMatch: (r, f) =>
      (!f.status || f.status === "all" || r.status === f.status) &&
      (!f.priority || f.priority === "all" || r.priority === f.priority),
    sortValue: (r, k) =>
      k === "priority" ? SEG_PRIORITY.indexOf(r.priority as any)
        : k === "status" ? r.status
        : k === "created" ? r.createdAt
        : k === "job" ? jobName(r.jobId)
        : r.title,
  }), [issues, state, jobs, users, user]);

  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/issues/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/issues"] }); toast({ title: "Issue deleted" }); },
  });
  const patch = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiRequest("PATCH", `/api/issues/${id}`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/issues"] }); },
  });

  const doExport = () => exportCsv("issues.csv",
    ["Title", "Job", "Status", "Priority", "Assignee", "Created By", "Created"],
    filtered.map((r) => [r.title, jobName(r.jobId), r.status, r.priority, userName(r.assigneeId), r.createdBy || "", new Date(r.createdAt).toLocaleDateString()]));

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Issues"
        subtitle="Track punch-list items, defects, and open questions across jobs"
        actions={<Button size="sm" onClick={() => setEditing("new")} data-testid="button-new-issue"><Plus className="h-4 w-4 mr-1" /> New Issue</Button>}
      />

      <ListToolbar
        q={state.q} onQ={setQ}
        mine={state.mine} onMine={setMine}
        onExport={doExport}
        placeholder="Search issues…"
        count={filtered.length} total={issues.length}
        extra={
          <>
            <Select value={state.filters.status || "all"} onValueChange={(v) => setFilter("status", v)}>
              <SelectTrigger className="w-[140px] h-9" data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ISSUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={state.filters.priority || "all"} onValueChange={(v) => setFilter("priority", v)}>
              <SelectTrigger className="w-[140px] h-9" data-testid="filter-priority"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {SEG_PRIORITY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading issues…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">No issues match your filters.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHead label="Title" sortKey="title" state={state} onSort={toggleSort} /></TableHead>
                <TableHead><SortHead label="Job" sortKey="job" state={state} onSort={toggleSort} /></TableHead>
                <TableHead><SortHead label="Status" sortKey="status" state={state} onSort={toggleSort} /></TableHead>
                <TableHead><SortHead label="Priority" sortKey="priority" state={state} onSort={toggleSort} /></TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead><SortHead label="Created" sortKey="created" state={state} onSort={toggleSort} /></TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setEditing(r)} data-testid={`issue-row-${r.id}`}>
                  <TableCell className="font-medium">
                    {r.title}
                    {r.description && <div className="text-xs text-muted-foreground font-normal truncate max-w-xs">{r.description}</div>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{jobName(r.jobId)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select value={r.status} onValueChange={(v) => patch.mutate({ id: r.id, status: v })}>
                      <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ISSUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={cn("font-normal", priorityColor(r.priority))}>{r.priority}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{userName(r.assigneeId)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{timeAgo(r.createdAt)}{r.createdBy && <div>by {r.createdBy}</div>}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del.mutate(r.id)} data-testid={`button-delete-issue-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {editing && (
        <IssueEditor
          issue={editing === "new" ? null : editing}
          jobs={jobs}
          users={users as User[]}
          currentUser={user?.name}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function IssueEditor({ issue, jobs, users, currentUser, onClose }: {
  issue: Issue | null; jobs: Job[]; users: User[]; currentUser?: string; onClose: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(issue?.title || "");
  const [description, setDescription] = useState(issue?.description || "");
  const [status, setStatus] = useState(issue?.status || "Open");
  const [priority, setPriority] = useState(issue?.priority || "Normal");
  const [jobId, setJobId] = useState<string>(issue?.jobId ? String(issue.jobId) : "none");
  const [assigneeId, setAssigneeId] = useState<string>(issue?.assigneeId ? String(issue.assigneeId) : "none");

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title, description: description || null, status, priority,
        jobId: jobId === "none" ? null : Number(jobId),
        assigneeId: assigneeId === "none" ? null : Number(assigneeId),
        ...(issue ? {} : { createdBy: currentUser, createdAt: Date.now() }),
      };
      return issue
        ? apiRequest("PATCH", `/api/issues/${issue.id}`, body)
        : apiRequest("POST", "/api/issues", body);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/issues"] }); toast({ title: issue ? "Issue updated" : "Issue created" }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{issue ? "Edit Issue" : "New Issue"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" data-testid="input-issue-title" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Details…" data-testid="input-issue-description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ISSUE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SEG_PRIORITY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Job</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {jobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.customer}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unassigned —</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending} data-testid="button-save-issue">{issue ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
