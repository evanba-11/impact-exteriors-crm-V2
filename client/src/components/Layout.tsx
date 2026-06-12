import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useApp } from "@/lib/app-context";
import {
  LayoutDashboard, KanbanSquare, Users, FileText, HardHat, DollarSign,
  Zap, CheckSquare, Calendar, Settings as SettingsIcon, Moon, Sun, Truck, Tag, Bell,
  PackageOpen, AlertTriangle, Receipt, MapPin, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { timeAgo } from "@/lib/format";
import { renderMessageBody } from "@/components/JobDrawer";
import { EmptyState } from "@/components/ui-bits";
import { useState } from "react";

type NavItem = { href: string; label: string; icon: any; children?: { href: string; label: string }[] };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/opportunities", label: "Opportunities", icon: Users },
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/price-list", label: "Price List", icon: Tag },
  { href: "/jobs", label: "Jobs", icon: HardHat },
  { href: "/map", label: "Customer Map", icon: MapPin },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
  { href: "/material-returns", label: "Material Returns", icon: PackageOpen },
  { href: "/financials", label: "Financials", icon: DollarSign },
  { href: "/ar-aging", label: "AR Aging", icon: Receipt },
  {
    href: "/automations", label: "Automations", icon: Zap, children: [
      { href: "/automations/triggers", label: "Triggers" },
      { href: "/automations/campaigns", label: "Automation Campaigns" },
      { href: "/automations/active", label: "Active Automations" },
    ],
  },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/vendors", label: "Vendors", icon: Truck },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function MentionsBell() {
  const { user } = useApp();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: mentions = [] } = useQuery<any[]>({
    queryKey: ["/api/mentions", user?.id],
    queryFn: () => apiRequest("GET", `/api/mentions?userId=${user?.id}`).then((r) => r.json()),
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  const unread = mentions.filter((m) => !m.read);

  const readMut = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/mentions/read", { userId: user?.id, messageIds: ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mentions", user?.id] }),
  });

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && unread.length) readMut.mutate(unread.map((m) => m.id));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="relative h-9 w-9 grid place-items-center rounded-md border border-border hover:bg-accent" data-testid="button-mentions">
          <Bell className="w-4 h-4" />
          {unread.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center" data-testid="badge-mentions-count">
              {unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="popover-mentions">
        <div className="px-3 py-2.5 border-b border-border font-semibold text-sm">Mentions</div>
        <div className="max-h-80 overflow-y-auto">
          {mentions.length === 0 && <div className="p-3"><EmptyState title="No mentions yet" hint="You'll see @mentions from your team here." /></div>}
          {mentions.map((m) => (
            <button
              key={m.id}
              onClick={() => { setOpen(false); navigate(`/opportunities/${m.jobId}`); }}
              className={cn("flex flex-col gap-1 w-full px-3 py-2.5 text-left border-b border-border/60 hover:bg-accent", !m.read && "bg-primary/5")}
              data-testid={`mention-item-${m.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{m.authorName}{m.jobCustomer && <span className="text-muted-foreground font-normal"> on {m.jobCustomer}</span>}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(m.createdAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{renderMessageBody(m.body)}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavParent({ item, loc, active }: { item: NavItem; loc: string; active: boolean }) {
  const [open, setOpen] = useState(active);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
          active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
        data-testid={`nav-${item.label.toLowerCase()}`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.label}
        <ChevronDown className={cn("w-3.5 h-3.5 ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-0.5 ml-4 pl-3 border-l border-sidebar-border space-y-0.5">
          {item.children!.map((c) => {
            const cActive = loc === c.href || loc.startsWith(c.href);
            return (
              <Link key={c.href} href={c.href} data-testid={`nav-sub-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <div className={cn(
                  "px-3 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors",
                  cActive ? "bg-sidebar-accent text-sidebar-foreground font-medium" : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}>
                  {c.label}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-label="Impact Exteriors logo" className="shrink-0">
      <path d="M3 18L16 5l13 13" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M7 16v10h18V16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 5l13 13" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="13.5" y="19" width="5" height="7" fill="hsl(var(--primary))" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { user, users, setUserId, dark, toggleDark } = useApp();

  return (
    <div className="grid h-[100dvh] grid-cols-[15rem_1fr] max-md:grid-cols-1 overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-y-auto max-md:hidden" style={{ overscrollBehavior: "contain" }}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border shrink-0">
          <Logo />
          <div className="leading-tight">
            <div className="font-bold text-sidebar-foreground text-[15px]">Impact CRM</div>
            <div className="text-[11px] text-sidebar-foreground/60">Exteriors LLC</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((n) => {
            const active = loc === n.href || (n.href !== "/" && loc.startsWith(n.href));
            if (n.children) return <NavParent key={n.href} item={n} loc={loc} active={active} />;
            return (
              <Link key={n.href} href={n.href} data-testid={`nav-${n.label.toLowerCase()}`}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}>
                  <n.icon className="w-4 h-4 shrink-0" />
                  {n.label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/50">
          Fort Collins, CO · Demo data
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 gap-3 shrink-0 bg-background/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2 md:hidden">
            <Logo />
            <span className="font-bold text-sm">Impact CRM</span>
          </div>
          <div className="hidden md:block text-sm text-muted-foreground">
            {NAV.flatMap((n) => n.children ? [n, ...n.children.map((c) => ({ href: c.href, label: `${n.label} · ${c.label}` }))] : [n]).find((n) => n.href === loc)?.label || "Impact CRM"}
          </div>
          <div className="flex items-center gap-2">
            <MentionsBell />
            <Select value={user ? String(user.id) : ""} onValueChange={(v) => setUserId(Number(v))}>
              <SelectTrigger className="w-[190px] h-9" data-testid="select-user">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)} data-testid={`user-option-${u.id}`}>
                    {u.name} · {u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button onClick={toggleDark} data-testid="button-theme" className="h-9 w-9 grid place-items-center rounded-md border border-border hover:bg-accent">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="md:hidden flex gap-1 overflow-x-auto px-2 py-2 border-b border-border shrink-0 bg-background">
          {NAV.flatMap((n) =>
            n.children
              ? n.children.map((c) => ({ href: c.href, label: c.label, icon: n.icon }))
              : [{ href: n.href, label: n.label, icon: n.icon }]
          ).map((n) => {
            const active = loc === n.href || (n.href !== "/" && loc.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href}>
                <div className={cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-md text-[10px] whitespace-nowrap",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                  <n.icon className="w-4 h-4" />
                  {n.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }} data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
