import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { useApp } from "@/lib/app-context";
import { DAY } from "@/lib/format";
import { Plus, CalendarClock, CheckCircle2 } from "lucide-react";
import type { Task, Job, User } from "@shared/schema";

export default function Tasks() {
  const { user } = useApp();
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const [tab, setTab] = useState("open");
  const [dialogOpen, setDialogOpen] = useState(false);

  const jobName = (id: number | null) => jobs.find((j) => j.id === id)?.customer;
  const userName = (id: number | null) => users.find((u) => u.id === id)?.name || "Unassigned";

  const toggle = useMutation({
    mutationFn: (t: Task) => apiRequest("PATCH", `/api/tasks/${t.id}`, { done: !t.done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });
  const create = useMutation({
    mutationFn: (b: any) => apiRequest("POST", "/api/tasks", b),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setDialogOpen(false);
    },
  });

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (tab === "open") list = list.filter((t) => !t.done);
    if (tab === "done") list = list.filter((t) => t.done);
    if (tab === "mine") list = list.filter((t) => t.assigneeId === user?.id && !t.done);
    return list.sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity));
  }, [tasks, tab, user]);

  const dueLabel = (ts: number | null) => {
    if (!ts) return { text: "No due date", cls: "text-muted-foreground" };
    const d = new Date(ts);
    const days = (ts - Date.now()) / DAY;
    const text = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (days < 0) return { text: `${text} · overdue`, cls: "text-red-600 dark:text-red-400" };
    if (days < 2) return { text: `${text} · due soon`, cls: "text-amber-600 dark:text-amber-400" };
    return { text, cls: "text-muted-foreground" };
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        subtitle={`${tasks.filter((t) => !t.done).length} open`}
        actions={<NewTaskDialog open={dialogOpen} setOpen={setDialogOpen} jobs={jobs} users={users} defaultAssignee={user?.id ?? null} onSubmit={(b) => create.mutate(b)} pending={create.isPending} />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="tabs-tasks">
          <TabsTrigger value="open" data-testid="tab-open">Open</TabsTrigger>
          <TabsTrigger value="mine" data-testid="tab-mine">Mine</TabsTrigger>
          <TabsTrigger value="done" data-testid="tab-done">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nothing here" hint="No tasks match this view." />
        ) : (
          filtered.map((t) => {
            const due = dueLabel(t.dueAt);
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-task-${t.id}`}>
                <Checkbox checked={t.done} onCheckedChange={() => toggle.mutate(t)} data-testid={`check-task-${t.id}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs mt-0.5">
                    <span className="text-muted-foreground">{userName(t.assigneeId)}</span>
                    {jobName(t.jobId) && <span className="text-muted-foreground">· {jobName(t.jobId)}</span>}
                    {t.type === "appointment" && <Badge variant="secondary" className="text-[10px] py-0 px-1.5"><CalendarClock className="h-3 w-3 mr-1" />Appt</Badge>}
                  </div>
                </div>
                {!t.done && <span className={`text-xs whitespace-nowrap ${due.cls}`}>{due.text}</span>}
                {t.done && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function NewTaskDialog({
  open, setOpen, jobs, users, defaultAssignee, onSubmit, pending,
}: {
  open: boolean; setOpen: (b: boolean) => void; jobs: Job[]; users: User[];
  defaultAssignee: number | null; onSubmit: (b: any) => void; pending: boolean;
}) {
  const [f, setF] = useState<any>({ title: "", assigneeId: defaultAssignee, jobId: null, type: "task", dueDays: "3" });
  const submit = () => {
    if (!f.title.trim()) return;
    onSubmit({
      title: f.title,
      assigneeId: f.assigneeId ? Number(f.assigneeId) : null,
      jobId: f.jobId ? Number(f.jobId) : null,
      type: f.type,
      done: false,
      dueAt: Date.now() + Number(f.dueDays) * DAY,
    });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-new-task"><Plus className="h-4 w-4 mr-1.5" /> New Task</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="input-task-title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={f.assigneeId ? String(f.assigneeId) : "none"} onValueChange={(v) => setF({ ...f, assigneeId: v === "none" ? null : Number(v) })}>
                <SelectTrigger data-testid="select-task-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
                <SelectTrigger data-testid="select-task-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="appointment">Appointment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Link to job</Label>
              <Select value={f.jobId ? String(f.jobId) : "none"} onValueChange={(v) => setF({ ...f, jobId: v === "none" ? null : Number(v) })}>
                <SelectTrigger data-testid="select-task-job"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {jobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.customer}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due in (days)</Label>
              <Input type="number" value={f.dueDays} onChange={(e) => setF({ ...f, dueDays: e.target.value })} data-testid="input-task-due" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !f.title.trim()} data-testid="button-save-task">
            {pending ? "Saving…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
