export const money = (n: number | null | undefined) =>
  "$" + Math.round(n || 0).toLocaleString("en-US");
export const money2 = (n: number | null | undefined) =>
  "$" + (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n: number | null | undefined, d = 0) =>
  (n || 0).toFixed(d) + "%";

export const DAY = 86400000;
export const daysSince = (ts?: number | null) => ts ? (Date.now() - ts) / DAY : 0;

// margin color vs target (default 35)
export function marginColor(margin: number, target = 35) {
  if (margin >= target) return "text-emerald-600 dark:text-emerald-400";
  if (margin >= target - 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
export function marginBg(margin: number, target = 35) {
  if (margin >= target) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (margin >= target - 5) return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-red-500/15 text-red-700 dark:text-red-300";
}

export function scoreColor(s: number) {
  if (s >= 70) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (s >= 45) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30";
}

export function timeAgo(ts?: number | null) {
  if (!ts) return "—";
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}
