import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/format";
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from "@/components/ui/hover-card";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({ label, value, sub, accent, danger }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; danger?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", danger ? "border-red-500/40" : "border-card-border")} data-testid={`kpi-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={cn("text-2xl font-bold mt-1 tnum", accent && "text-primary")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 tnum">{sub}</div>}
    </div>
  );
}

export function ScoreBadge({ score }: { score: { total: number; breakdown: { label: string; points: number; detail: string }[] } }) {
  if (!score) return null;
  return (
    <HoverCard openDelay={80}>
      <HoverCardTrigger asChild>
        <span className={cn("inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded border text-[11px] font-bold tnum cursor-help", scoreColor(score.total))} data-testid="badge-score">
          {score.total}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-64" align="start">
        <div className="text-xs font-semibold mb-2">Lead Score — {score.total}/100</div>
        <div className="space-y-1">
          {score.breakdown.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{b.label} <span className="opacity-60">· {b.detail}</span></span>
              <span className="font-semibold tnum">+{b.points}</span>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border">Transparent rule-based — no black box.</div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs mt-1">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}
