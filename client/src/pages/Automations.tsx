import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { FLOWS, STAGES } from "@shared/schema";
import { timeAgo } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Zap, MessageSquare, Mail } from "lucide-react";

const TRIGGER_LABEL: Record<string, string> = { stage_entered: "Stage entered", inactivity: "Inactivity in stage", estimate_sent: "Estimate sent +N days", invoice_unpaid: "Invoice unpaid +N days" };
const ACTION_LABEL: Record<string, string> = { send_sms: "Send SMS", send_email: "Send Email", create_task: "Create Task", notify: "Notify User", move_rehash: "Move to Lead Rehash" };

export default function Automations() {
  const { toast } = useToast();
  const { data: autos = [] } = useQuery<any[]>({ queryKey: ["/api/automations"] });
  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["/api/templates"] });
  const { data: outbox = [] } = useQuery<any[]>({ queryKey: ["/api/outbox"] });
  const { data: jobs = [] } = useQuery<any[]>({ queryKey: ["/api/jobs"] });

  const toggleMut = useMutation({ mutationFn: ({ id, active }: any) => apiRequest("PATCH", `/api/automations/${id}`, { active }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/automations"] }) });
  const runMut = useMutation({ mutationFn: () => apiRequest("POST", "/api/automations/run", {}), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/outbox"] }); queryClient.invalidateQueries({ queryKey: ["/api/jobs"] }); toast({ title: "Scheduler ran", description: "Evaluated all rules against jobs." }); } });

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="Active Automations" subtitle="Server-side scheduler runs every 30s · simulated SMS/email outbox" actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => runMut.mutate()} data-testid="button-run-scheduler"><Play className="w-4 h-4 mr-1" />Run now</Button>
          <NewAutomation templates={templates} />
        </div>
      } />
      <Tabs defaultValue="cadences">
        <TabsList>
          <TabsTrigger value="cadences" data-testid="tab-cadences">Cadences</TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">Templates</TabsTrigger>
          <TabsTrigger value="outbox" data-testid="tab-outbox">Outbox</TabsTrigger>
        </TabsList>

        <TabsContent value="cadences" className="mt-4 space-y-3">
          {FLOWS.map((flow) => {
            const flowAutos = autos.filter((a) => a.flow === flow);
            if (!flowAutos.length) return null;
            return (
              <div key={flow} className="rounded-lg border border-card-border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b border-border text-sm font-semibold">{flow}</div>
                <table className="w-full text-sm">
                  <tbody>
                    {flowAutos.map((a) => {
                      const tpl = templates.find((t) => t.id === a.templateId);
                      return (
                        <tr key={a.id} className="border-t border-border" data-testid={`automation-${a.id}`}>
                          <td className="p-3"><div className="font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">{TRIGGER_LABEL[a.triggerType]}{a.triggerStage ? ` · ${a.triggerStage}` : ""} → {ACTION_LABEL[a.actionType]}</div></td>
                          <td className="p-3 text-xs text-muted-foreground">{a.triggerType === "stage_entered" ? `${a.delayMinutes}m delay` : `day ${a.delayDays}`}</td>
                          <td className="p-3 text-xs text-muted-foreground">{tpl?.name || "—"}</td>
                          <td className="p-3 text-right"><Switch checked={!!a.active} onCheckedChange={(c) => toggleMut.mutate({ id: a.id, active: c })} data-testid={`toggle-automation-${a.id}`} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="templates" className="mt-4 space-y-2">
          {templates.map((t) => <TemplateEditor key={t.id} tpl={t} />)}
        </TabsContent>

        <TabsContent value="outbox" className="mt-4">
          {outbox.length === 0 ? <EmptyState title="Outbox empty" hint="Run the scheduler or move a card to fire automations." /> : (
            <div className="rounded-lg border border-card-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="text-left p-2"></th><th className="text-left p-2">Customer</th><th className="text-left p-2">To</th><th className="text-left p-2">Message</th><th className="text-right p-2">Status</th><th className="text-right p-2">Sent</th></tr></thead>
                <tbody>
                  {outbox.map((o) => {
                    const j = jobs.find((x) => x.id === o.jobId);
                    return (
                      <tr key={o.id} className="border-t border-border" data-testid={`outbox-${o.id}`}>
                        <td className="p-2">{o.channel === "sms" ? <MessageSquare className="w-4 h-4 text-muted-foreground" /> : <Mail className="w-4 h-4 text-muted-foreground" />}</td>
                        <td className="p-2 font-medium">{j?.customer || "—"}</td>
                        <td className="p-2 text-muted-foreground text-xs">{o.to}</td>
                        <td className="p-2 text-xs max-w-md truncate">{o.subject ? <b>{o.subject}: </b> : null}{o.body}</td>
                        <td className="p-2 text-right"><Badge variant="outline" className="bg-emerald-500/15 text-emerald-600">{o.status}</Badge></td>
                        <td className="p-2 text-right text-xs text-muted-foreground">{timeAgo(o.sentAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateEditor({ tpl }: any) {
  const { toast } = useToast();
  const [body, setBody] = useState(tpl.body);
  const [subject, setSubject] = useState(tpl.subject || "");
  const mut = useMutation({ mutationFn: () => apiRequest("PATCH", `/api/templates/${tpl.id}`, { body, subject }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/templates"] }); toast({ title: "Template saved" }); } });
  return (
    <div className="rounded-lg border border-card-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><Badge variant="outline">{tpl.channel}</Badge><span className="font-medium text-sm">{tpl.name}</span></div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => mut.mutate()} data-testid={`save-template-${tpl.id}`}>Save</Button>
      </div>
      {tpl.channel === "email" && <Input className="mb-2 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="text-sm min-h-[80px]" data-testid={`template-body-${tpl.id}`} />
      <div className="text-[10px] text-muted-foreground mt-1">Merge fields: {"{{first_name}} {{address}} {{estimate_total}} {{rep_name}} {{booking_link}}"}</div>
    </div>
  );
}

function NewAutomation({ templates }: any) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: "", flow: "SALES", triggerType: "stage_entered", triggerStage: "New Lead", delayMinutes: 0, delayDays: 0, actionType: "send_sms", templateId: null, active: true });
  const mut = useMutation({ mutationFn: () => apiRequest("POST", "/api/automations", f), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/automations"] }); setOpen(false); toast({ title: "Automation created" }); } });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" data-testid="button-new-automation"><Plus className="w-4 h-4 mr-1" />New rule</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Automation Rule</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-auto-name" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Flow</Label><Select value={f.flow} onValueChange={(v) => setF({ ...f, flow: v })}><SelectTrigger data-testid="select-auto-flow"><SelectValue /></SelectTrigger><SelectContent>{FLOWS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Trigger</Label><Select value={f.triggerType} onValueChange={(v) => setF({ ...f, triggerType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TRIGGER_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {(f.triggerType === "stage_entered" || f.triggerType === "inactivity") && (
            <div><Label className="text-xs">Stage</Label><Select value={f.triggerStage} onValueChange={(v) => setF({ ...f, triggerStage: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(STAGES[f.flow] || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">{f.triggerType === "stage_entered" ? "Delay (minutes)" : "Delay (days)"}</Label><Input type="number" value={f.triggerType === "stage_entered" ? f.delayMinutes : f.delayDays} onChange={(e) => setF({ ...f, [f.triggerType === "stage_entered" ? "delayMinutes" : "delayDays"]: Number(e.target.value) })} data-testid="input-auto-delay" /></div>
            <div><Label className="text-xs">Action</Label><Select value={f.actionType} onValueChange={(v) => setF({ ...f, actionType: v })}><SelectTrigger data-testid="select-auto-action"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ACTION_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {(f.actionType === "send_sms" || f.actionType === "send_email") && (
            <div><Label className="text-xs">Template</Label><Select value={f.templateId ? String(f.templateId) : ""} onValueChange={(v) => setF({ ...f, templateId: Number(v) })}><SelectTrigger data-testid="select-auto-template"><SelectValue placeholder="Pick template" /></SelectTrigger><SelectContent>{templates.filter((t: any) => t.channel === (f.actionType === "send_sms" ? "sms" : "email")).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          )}
        </div>
        <DialogFooter><Button onClick={() => mut.mutate()} disabled={!f.name} data-testid="button-save-automation"><Zap className="w-4 h-4 mr-1" />Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
