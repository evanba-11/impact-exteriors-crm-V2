import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarClock, CheckSquare } from "lucide-react";
import type { Task, Job } from "@shared/schema";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Calendar() {
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: jobs = [] } = useQuery<Job[]>({ queryKey: ["/api/jobs"] });
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const jobName = (id: number | null) => jobs.find((j) => j.id === id)?.customer || "";

  const byDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    tasks.forEach((t) => {
      if (!t.dueAt) return;
      const d = new Date(t.dueAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (m[key] ||= []).push(t);
    });
    return m;
  }, [tasks]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr: { date: Date | null }[] = [];
    for (let i = 0; i < startPad; i++) arr.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) arr.push({ date: new Date(year, month, d) });
    while (arr.length % 7 !== 0) arr.push({ date: null });
    return arr;
  }, [cursor]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        subtitle="Appointments & task due dates"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shift(-1)} data-testid="button-prev-month"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="text-sm font-medium w-36 text-center" data-testid="text-month">{monthLabel}</div>
            <Button variant="outline" size="icon" onClick={() => shift(1)} data-testid="button-next-month"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} data-testid="button-today">Today</Button>
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WD.map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            if (!c.date) return <div key={i} className="min-h-[96px] border-b border-r border-border bg-muted/20" />;
            const key = `${c.date.getFullYear()}-${c.date.getMonth()}-${c.date.getDate()}`;
            const items = byDay[key] || [];
            return (
              <div key={i} className={`min-h-[96px] border-b border-r border-border p-1.5 ${isToday(c.date) ? "bg-primary/5" : ""}`} data-testid={`cell-day-${c.date.getDate()}`}>
                <div className={`text-xs mb-1 font-medium ${isToday(c.date) ? "text-primary" : "text-muted-foreground"}`}>{c.date.getDate()}</div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className={`text-[10px] leading-tight rounded px-1.5 py-1 truncate flex items-center gap-1 ${
                        t.type === "appointment"
                          ? "bg-primary/15 text-primary"
                          : t.done ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-secondary text-secondary-foreground"
                      }`}
                      title={`${t.title}${jobName(t.jobId) ? " · " + jobName(t.jobId) : ""}`}
                    >
                      {t.type === "appointment" ? <CalendarClock className="h-2.5 w-2.5 shrink-0" /> : <CheckSquare className="h-2.5 w-2.5 shrink-0" />}
                      <span className="truncate">{t.title}</span>
                    </div>
                  ))}
                  {items.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{items.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/40" /> Appointment</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-secondary" /> Task</span>
      </div>
    </div>
  );
}
