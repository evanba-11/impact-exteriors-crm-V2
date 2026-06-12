import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/ui-bits";
import { ScoreBadge } from "@/components/ui-bits";
import { STAGES, SIDE_EXITS, FLOWS, DEFAULT_SLAS } from "@shared/schema";
import { money, daysSince } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-context";
import { useLocation } from "wouter";
import {
  DndContext, useDraggable, useDroppable, DragOverlay, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { MapPin, Clock, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { JobTypeBadge } from "@/pages/Estimates";

function slaColor(stage: string, days: number, slas: Record<string, number>) {
  const sla = slas[stage] ?? DEFAULT_SLAS[stage] ?? 5;
  if (days > sla) return "text-red-500";
  if (days > sla * 0.7) return "text-amber-500";
  return "text-muted-foreground";
}

function Card({ job, users, slas, onClick }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id });
  const rep = users.find((u: any) => u.id === job.repId);
  const days = daysSince(job.stageEnteredAt);
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={cn("rounded-md border border-card-border bg-card p-2.5 cursor-grab active:cursor-grabbing hover-elevate", isDragging && "opacity-40")} data-testid={`card-job-${job.id}`}>
      <div {...listeners} {...attributes}>
        <div className="flex items-start justify-between gap-1.5">
          <span className="font-semibold text-sm leading-tight" onClick={onClick}>{job.customer}</span>
          {job.score && <ScoreBadge score={job.score} />}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
          <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{job.address}</span>
        </div>
        <div className="mt-1.5"><JobTypeBadge jobType={job.jobType} /></div>
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-sm tnum">{money(job.value)}</span>
          {job.pauseFollowups && <Badge variant="outline" className="text-[9px] py-0">paused</Badge>}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px]">
          <span className="flex items-center gap-1 text-muted-foreground"><UserIcon className="w-3 h-3" />{rep?.name?.split(" ")[0] || "—"}</span>
          <span className={cn("flex items-center gap-1 font-medium tnum", slaColor(job.stage, days, slas))}>
            <Clock className="w-3 h-3" />{days.toFixed(1)}d
          </span>
        </div>
      </div>
      <button onClick={onClick} className="text-[10px] text-primary mt-1.5 hover:underline" data-testid={`open-job-${job.id}`}>open detail →</button>
    </div>
  );
}

function Column({ stage, jobs, users, slas, onCard, isExit }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = jobs.reduce((s: number, j: any) => s + j.value, 0);
  return (
    <div ref={setNodeRef} className={cn("w-64 shrink-0 flex flex-col rounded-lg border bg-muted/30 max-h-full", isOver ? "border-primary ring-1 ring-primary" : "border-border", isExit && "bg-destructive/5")} data-testid={`column-${stage}`}>
      <div className="px-2.5 py-2 border-b border-border sticky top-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">{stage}</span>
          <Badge variant="secondary" className="text-[10px] tnum">{jobs.length}</Badge>
        </div>
        <div className="text-[10px] text-muted-foreground tnum">{money(total)}</div>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto flex-1" style={{ overscrollBehavior: "contain" }}>
        {jobs.map((j: any) => <Card key={j.id} job={j} users={users} slas={slas} onClick={() => onCard(j.id)} />)}
        {jobs.length === 0 && <div className="text-[11px] text-muted-foreground text-center py-4">Drop here</div>}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { user } = useApp();
  const { data: jobs = [] } = useQuery<any[]>({ queryKey: ["/api/jobs"] });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const [, navigate] = useLocation();
  const [flow, setFlow] = useState<string>("SALES");
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Edge auto-scroll: while dragging a card near the left/right edge of the
  // (now wider) board, pan the columns into view so far-off stages are reachable.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollVel = useRef(0);
  const rafId = useRef<number | null>(null);
  useEffect(() => () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); }, []);
  const stepScroll = () => {
    const el = boardRef.current;
    if (el && scrollVel.current !== 0) el.scrollLeft += scrollVel.current;
    rafId.current = scrollVel.current !== 0 ? requestAnimationFrame(stepScroll) : null;
  };
  const onDragMove = (e: any) => {
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.activatorEvent?.clientX ?? 0) + (e.delta?.x ?? 0);
    const EDGE = 80, MAX = 18;
    let v = 0;
    if (x < rect.left + EDGE) v = -Math.ceil(((rect.left + EDGE - x) / EDGE) * MAX);
    else if (x > rect.right - EDGE) v = Math.ceil(((x - (rect.right - EDGE)) / EDGE) * MAX);
    const was = scrollVel.current;
    scrollVel.current = v;
    if (v !== 0 && was === 0 && rafId.current == null) rafId.current = requestAnimationFrame(stepScroll);
  };
  const stopScroll = () => { scrollVel.current = 0; if (rafId.current != null) { cancelAnimationFrame(rafId.current); rafId.current = null; } };

  const slas = settings ? JSON.parse(settings.slasJson || "{}") : DEFAULT_SLAS;
  const openRecord = (id: number) => {
    const job = jobs.find((j) => j.id === id);
    navigate(job?.isActiveJob ? `/jobs/${id}` : `/opportunities/${id}`);
  };

  const moveMut = useMutation({
    mutationFn: ({ id, stage }: any) => apiRequest("PATCH", `/api/jobs/${id}`, { stage, _actor: user?.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outbox"] });
    },
  });

  // role-based filtering
  const visible = jobs.filter((j) => {
    if (!user) return true;
    if (user.role === "Sales Rep") return j.repId === user.id;
    return true;
  });

  const stages = STAGES[flow];
  const exits = SIDE_EXITS[flow];
  const flowJobs = visible.filter((j) => j.flow === flow);
  const jobsByStage = (st: string) => flowJobs.filter((j) => j.stage === st);
  const activeJob = jobs.find((j) => j.id === activeId);

  return (
    <div className="flex flex-col h-full p-6 pb-2">
      <PageHeader title="Pipeline" subtitle={user?.role === "Sales Rep" ? "Showing your jobs only" : "Drag cards between stages · shared stages hand off automatically"} />
      <div className="flex gap-1 mb-4">
        {FLOWS.map((f) => (
          <button key={f} onClick={() => setFlow(f)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium", flow === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")} data-testid={`tab-flow-${f}`}>
            {f}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors}
        onDragStart={(e) => setActiveId(Number(e.active.id))}
        onDragMove={onDragMove}
        onDragCancel={() => { setActiveId(null); stopScroll(); }}
        onDragEnd={(e) => {
          setActiveId(null);
          stopScroll();
          if (e.over && e.active) {
            const id = Number(e.active.id);
            const stage = String(e.over.id);
            const job = jobs.find((j) => j.id === id);
            if (job && job.stage !== stage) moveMut.mutate({ id, stage });
          }
        }}>
        <div ref={boardRef} className="flex gap-3 overflow-x-auto pb-3 flex-1" style={{ overscrollBehavior: "contain" }}>
          {stages.map((st) => (
            <Column key={st} stage={st} jobs={jobsByStage(st)} users={users} slas={slas} onCard={openRecord} />
          ))}
          {exits.length > 0 && <div className="w-px bg-border shrink-0 mx-1" />}
          {exits.map((st) => (
            <Column key={st} stage={st} jobs={jobsByStage(st)} users={users} slas={slas} onCard={openRecord} isExit />
          ))}
        </div>
        <DragOverlay>
          {activeJob && <div className="rounded-md border border-primary bg-card p-2.5 shadow-lg w-60"><span className="font-semibold text-sm">{activeJob.customer}</span><div className="text-sm font-bold tnum">{money(activeJob.value)}</div></div>}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
