import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { money, pct, marginColor, timeAgo, daysSince } from "@/lib/format";
import { ScoreBadge, EmptyState } from "@/components/ui-bits";
import { useApp } from "@/lib/app-context";
import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import {
  MapPin, Phone, Mail, MessageSquare, FileText as FileIcon, PauseCircle, PlayCircle,
  CornerDownLeft, Send, Users as UsersIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JobTypeBadge } from "@/pages/Estimates";
import DriveFilesPanel from "@/components/DriveFilesPanel";

export default function JobDrawer({ jobId, onClose }: { jobId: number | null; onClose: () => void }) {
  const open = jobId != null;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [reply, setReply] = useState("");

  const { data: job } = useQuery<any>({ queryKey: ["/api/jobs", jobId], enabled: open });
  const { data: acts = [] } = useQuery<any[]>({ queryKey: ["/api/jobs", jobId, "activities"], enabled: open });
  const { data: outbox = [] } = useQuery<any[]>({ queryKey: ["/api/jobs", jobId, "outbox"], enabled: open });
  const { data: est } = useQuery<any>({ queryKey: ["/api/jobs", jobId, "estimate"], enabled: open });
  const { data: fin } = useQuery<any>({ queryKey: ["/api/jobs", jobId, "financials"], enabled: open && !!job?.isActiveJob });
  const { data: tasks = [] } = useQuery<any[]>({ queryKey: ["/api/jobs", jobId, "tasks"], enabled: open });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    queryClient.invalidateQueries({ queryKey: ["/api/outbox"] });
  };

  const pauseMut = useMutation({
    mutationFn: (p: boolean) => apiRequest("POST", `/api/jobs/${jobId}/pause`, { pause: p }),
    onSuccess: invalidate,
  });
  const replyMut = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/reply`, { message: reply, channel: "sms" }),
    onSuccess: () => { setReply(""); invalidate(); toast({ title: "Reply logged", description: "Cadence auto-paused for this stage." }); },
  });

  const rep = users.find((u) => u.id === job?.repId);
  const target = 35;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0" data-testid="drawer-job">
        {job && (
          <div>
            <div className="p-5 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold" data-testid="text-job-customer">{job.customer}</h2>
                    {job.score && <ScoreBadge score={job.score} />}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {(job.googleMapsUrl || job.address) ? (
                      <a
                        href={job.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address || "")}`}
                        target="_blank" rel="noreferrer"
                        className="hover:text-primary hover:underline"
                        data-testid="link-job-maps"
                      >
                        {job.address || "Open in Google Maps"}
                      </a>
                    ) : <span>{job.address}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{job.phone}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{job.email}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold tnum">{money(job.value)}</div>
                  <Badge variant="outline" className="mt-1">{job.flow}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">{job.stage}</Badge>
                {rep && <Badge variant="secondary">{rep.name}</Badge>}
                <JobTypeBadge jobType={job.jobType} />
                <span className="text-xs text-muted-foreground">{daysSince(job.stageEnteredAt).toFixed(1)}d in stage</span>
                <div className="ml-auto flex items-center gap-1.5 text-xs">
                  {job.pauseFollowups ? <PauseCircle className="w-4 h-4 text-amber-500" /> : <PlayCircle className="w-4 h-4 text-emerald-500" />}
                  <span>Follow-ups</span>
                  <Switch checked={!job.pauseFollowups} onCheckedChange={(c) => pauseMut.mutate(!c)} data-testid="switch-followups" />
                </div>
              </div>
            </div>

            <Tabs defaultValue="overview" className="p-5">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="comms" data-testid="tab-comms">Comms Log</TabsTrigger>
                <TabsTrigger value="feed" data-testid="tab-feed">Team Feed</TabsTrigger>
                <TabsTrigger value="estimate">Estimate</TabsTrigger>
                <TabsTrigger value="financials">Financials</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="Source" value={job.source} />
                  <Field label="Job Type" value={job.jobType} />
                  <Field label="Lead Score" value={`${job.score?.total ?? job.leadScore}/100`} />
                  <Field label="Insurance" value={job.insuranceApproved ? "Approved" : "—"} />
                  <Field label="Created" value={timeAgo(job.createdAt)} />
                  <Field label="Last activity" value={timeAgo(job.lastActivityAt)} />
                </div>
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground font-medium">Work Description</div>
                  <p className="text-sm mt-1">{job.description || "—"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { onClose(); navigate(`/estimates?job=${job.id}`); }} data-testid="button-build-estimate">
                  <FileIcon className="w-4 h-4 mr-1.5" /> Build / open estimate
                </Button>
              </TabsContent>

              <TabsContent value="comms" className="mt-4">
                <div className="flex gap-2 mb-3">
                  <Input placeholder="Simulate customer reply…" value={reply} onChange={(e) => setReply(e.target.value)} data-testid="input-reply" />
                  <Button size="sm" onClick={() => replyMut.mutate()} disabled={!reply || replyMut.isPending} data-testid="button-reply">
                    <CornerDownLeft className="w-4 h-4 mr-1" /> Log reply
                  </Button>
                </div>
                <div className="space-y-2">
                  {outbox.length === 0 && acts.filter((a) => a.type === "comms").length === 0 && <EmptyState title="No messages yet" hint="Automations will write here." />}
                  {acts.filter((a) => a.type === "comms").map((a) => (
                    <div key={a.id} className={`flex gap-2 text-sm p-2.5 rounded-md border ${a.direction === "in" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card border-card-border"}`}>
                      <MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-medium text-xs uppercase">{a.channel} · {a.direction === "in" ? "Inbound" : "Outbound"}</span>
                          <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                        </div>
                        <p className="text-sm mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="feed" className="mt-4">
                <TeamFeed jobId={job.id} users={users} />
              </TabsContent>

              <TabsContent value="estimate" className="mt-4">
                {est ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{est.mode} mode · {est.template}</Badge>
                      <Badge className={est.status === "accepted" ? "bg-emerald-500/15 text-emerald-600" : ""} variant="outline">{est.status}</Badge>
                    </div>
                    {JSON.parse(est.sectionsJson || "[]").map((s: any, i: number) => (
                      <div key={i} className="border border-card-border rounded-md p-2">
                        <div className="font-medium text-xs mb-1">{s.name}</div>
                        {s.lines.map((l: any, j: number) => (
                          <div key={j} className="flex justify-between text-xs text-muted-foreground">
                            <span>{l.name} · {l.qty} {l.unit}</span>
                            <span className="tnum">{money(l.qty * l.unitCost)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => { onClose(); navigate(`/estimates?job=${job.id}`); }}>Open in builder</Button>
                  </div>
                ) : <EmptyState title="No estimate yet" hint="Build one from the Estimates page." />}
              </TabsContent>

              <TabsContent value="financials" className="mt-4">
                {fin ? (
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Contract" value={money(fin.contractValue)} />
                      <Field label="Cost to date" value={money(fin.costToDate)} />
                      <Field label="% Complete" value={pct(fin.pctComplete * 100, 0)} />
                      <Field label="Earned rev" value={money(fin.earnedRevenue)} />
                      <Field label="Billed" value={money(fin.billed)} />
                      <Field label="Over/(Under)" value={money(fin.overUnderBilled)} />
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2">
                      <span className="text-muted-foreground">Projected profit</span>
                      <span className={`font-bold tnum ${marginColor(fin.projMargin, target)}`}>{money(fin.projectedProfit)} · {pct(fin.projMargin, 1)}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { onClose(); navigate(`/financials?job=${job.id}`); }} data-testid="button-open-financials">Full financials</Button>
                  </div>
                ) : <EmptyState title="No job financials" hint="Financials appear once a job is active (in production/billing)." />}
              </TabsContent>

              <TabsContent value="tasks" className="mt-4 space-y-2">
                {tasks.length === 0 && <EmptyState title="No tasks" />}
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm p-2 rounded border border-card-border">
                    <input type="checkbox" checked={!!t.done} readOnly className="accent-primary" />
                    <span className={t.done ? "line-through text-muted-foreground" : ""}>{t.title}</span>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="documents" className="mt-4">
                <DriveFilesPanel opportunityId={job.id} driveFolderUrl={job.driveFolderUrl} />
              </TabsContent>

              <TabsContent value="activity" className="mt-4 space-y-1.5">
                {acts.map((a) => (
                  <div key={a.id} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground w-16 shrink-0">{timeAgo(a.createdAt)}</span>
                    <span className="text-muted-foreground/60">{a.type}</span>
                    <span>{a.message}</span>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ───── Team Feed (internal messaging w/ @mentions) ───── */
export function renderMessageBody(body: string) {
  // highlight @Name tokens (multi-word names supported via greedy first+last)
  const parts = body.split(/(@[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g);
  return parts.map((p, i) =>
    p.startsWith("@")
      ? <span key={i} className="text-primary font-semibold bg-primary/10 rounded px-0.5">{p}</span>
      : <span key={i}>{p}</span>
  );
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export function TeamFeed({ jobId, users }: { jobId: number; users: any[] }) {
  const { user } = useApp();
  const [text, setText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs", jobId, "messages"],
    refetchInterval: 5000,
  });

  const postMut = useMutation({
    mutationFn: (payload: { body: string; mentions: number[] }) =>
      apiRequest("POST", `/api/jobs/${jobId}/messages`, { authorUserId: user?.id, ...payload }),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mentions"] });
    },
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    // detect an active @mention being typed at the caret
    const upto = v.slice(0, e.target.selectionStart);
    const m = upto.match(/@([A-Za-z]*)$/);
    setMentionQuery(m ? m[1] : null);
  };

  const pickMention = (name: string) => {
    // replace the trailing @partial with @Full Name
    setText((prev) => prev.replace(/@([A-Za-z]*)$/, `@${name} `));
    setMentionQuery(null);
    taRef.current?.focus();
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    // resolve mentions by matching @Name tokens against user names
    const mentioned: number[] = [];
    for (const u of users) {
      if (body.includes("@" + u.name)) mentioned.push(u.id);
    }
    postMut.mutate({ body, mentions: mentioned });
  };

  const filtered = mentionQuery != null
    ? users.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const userName = (id: number) => users.find((u) => u.id === id)?.name || "Unknown";

  return (
    <div className="flex flex-col" data-testid="team-feed">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
        <UsersIcon className="w-3.5 h-3.5" /> Internal only — never customer-facing
      </div>
      <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
        {msgs.length === 0 && <EmptyState title="No messages yet" hint="Start the internal thread for this account. Use @ to tag a teammate." />}
        {msgs.map((m) => {
          const name = userName(m.authorUserId);
          const mine = m.authorUserId === user?.id;
          return (
            <div key={m.id} className="flex gap-2.5" data-testid={`feed-msg-${m.id}`}>
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-semibold shrink-0">
                {initials(name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{name}{mine && <span className="text-muted-foreground font-normal"> (you)</span>}</span>
                  <span className="text-[11px] text-muted-foreground">{timeAgo(m.createdAt)}</span>
                </div>
                <p className="text-sm mt-0.5 break-words whitespace-pre-wrap">{renderMessageBody(m.body)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="relative mt-3 border-t border-border pt-3">
        {mentionQuery != null && filtered.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 w-64 bg-popover border border-border rounded-md shadow-lg z-20 overflow-hidden" data-testid="mention-popover">
            {filtered.map((u) => (
              <button
                key={u.id}
                onClick={() => pickMention(u.name)}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                data-testid={`mention-option-${u.id}`}
              >
                <span className="w-6 h-6 rounded-full bg-primary/15 text-primary grid place-items-center text-[10px] font-semibold">{initials(u.name)}</span>
                <span className="flex-1">{u.name}</span>
                <span className="text-[11px] text-muted-foreground">{u.role}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            ref={taRef}
            value={text}
            onChange={onChange}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            placeholder="Message your team… use @ to tag someone"
            rows={2}
            className="resize-none text-sm"
            data-testid="input-feed-message"
          />
          <Button size="sm" onClick={submit} disabled={!text.trim() || postMut.isPending} data-testid="button-feed-post">
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">⌘/Ctrl + Enter to post</div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground font-medium">{label}</div>
      <div className="font-medium tnum">{value ?? "—"}</div>
    </div>
  );
}
