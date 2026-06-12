import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { pct } from "@/lib/format";
import { STAGES, DEFAULT_SLAS } from "@shared/schema";
import { SiTwilio, SiStripe, SiGoogle, SiQuickbooks } from "react-icons/si";
import { PlugZap, Save } from "lucide-react";
import type { Settings as SettingsType, User, CostCode } from "@shared/schema";

const INTEGRATIONS = [
  { name: "Twilio", desc: "SMS sending for follow-ups", Icon: SiTwilio, color: "#F22F46" },
  { name: "SendGrid", desc: "Transactional email delivery", Icon: PlugZap, color: "#1A82E2" },
  { name: "QuickBooks", desc: "Sync invoices & costs to GL", Icon: SiQuickbooks, color: "#2CA01C" },
  { name: "Stripe", desc: "Deposit & invoice payments", Icon: SiStripe, color: "#635BFF" },
  { name: "EagleView", desc: "Aerial roof measurements", Icon: PlugZap, color: "#0B6E4F" },
  { name: "Google Calendar", desc: "Two-way appointment sync", Icon: SiGoogle, color: "#4285F4" },
];

export default function Settings() {
  const { toast } = useToast();
  const { data: settings } = useQuery<SettingsType>({ queryKey: ["/api/settings"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: costCodes = [] } = useQuery<CostCode[]>({ queryKey: ["/api/cost-codes"] });

  const [company, setCompany] = useState("");
  const [accent, setAccent] = useState("#D97B29");
  const [floor, setFloor] = useState("35");
  const [slas, setSlas] = useState<Record<string, number>>({});

  useEffect(() => {
    if (settings) {
      setCompany(settings.companyName);
      setAccent(settings.accentColor);
      setFloor(String(settings.marginFloor));
      let parsed: Record<string, number> = {};
      try { parsed = JSON.parse(settings.slasJson || "{}"); } catch {}
      setSlas({ ...DEFAULT_SLAS, ...parsed });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", "/api/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Settings saved" });
    },
  });

  const saveGeneral = () =>
    save.mutate({ companyName: company, accentColor: accent, marginFloor: Number(floor) || 35 });
  const saveSlas = () =>
    save.mutate({ slasJson: JSON.stringify(slas) });

  const allStages = Array.from(new Set(Object.values(STAGES).flat()));

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Company configuration, SLAs, commissions & integrations" />

      <Tabs defaultValue="general">
        <TabsList data-testid="tabs-settings">
          <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
          <TabsTrigger value="slas" data-testid="tab-slas">Stage SLAs</TabsTrigger>
          <TabsTrigger value="commissions" data-testid="tab-commissions">Commissions</TabsTrigger>
          <TabsTrigger value="costcodes" data-testid="tab-costcodes">Cost Codes</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Branding & defaults</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <div className="space-y-1.5">
                <Label>Company name</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} data-testid="input-company-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Accent color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-12 rounded border border-border bg-transparent" data-testid="input-accent" />
                  <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="w-32" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Margin floor for new reps (%)</Label>
                <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} className="w-32" data-testid="input-margin-floor" />
                <p className="text-xs text-muted-foreground">New reps cannot save Quick estimates below this margin.</p>
              </div>
              <Button onClick={saveGeneral} disabled={save.isPending} data-testid="button-save-general">
                <Save className="h-4 w-4 mr-1.5" /> Save
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slas" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Days-in-stage SLA targets</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl">
                {allStages.map((s) => (
                  <div key={s} className="space-y-1">
                    <Label className="text-xs">{s}</Label>
                    <Input
                      type="number"
                      value={slas[s] ?? DEFAULT_SLAS[s] ?? 5}
                      onChange={(e) => setSlas({ ...slas, [s]: Number(e.target.value) })}
                      data-testid={`input-sla-${s.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={saveSlas} disabled={save.isPending} className="mt-4" data-testid="button-save-slas">
                <Save className="h-4 w-4 mr-1.5" /> Save SLAs
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Commission plans</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Trigger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter((u) => u.commissionRate).map((u) => (
                    <TableRow key={u.id} data-testid={`row-commission-${u.id}`}>
                      <TableCell className="font-medium">{u.name}{u.isNewRep && <Badge variant="secondary" className="ml-2 text-[10px]">New rep</Badge>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.role}</TableCell>
                      <TableCell className="text-sm">{u.commissionType === "gross_profit" ? "Gross profit" : "Contract value"}</TableCell>
                      <TableCell className="text-right tnum">{pct((u.commissionRate || 0) * 100, 0)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.commissionTrigger}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costcodes" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Cost codes</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCodes.map((c: any) => (
                    <TableRow key={c.id} data-testid={`row-costcode-${c.id}`}>
                      <TableCell className="tnum font-medium">{c.code}</TableCell>
                      <TableCell>{c.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {INTEGRATIONS.map((i) => (
              <Card key={i.name} data-testid={`card-integration-${i.name.toLowerCase().replace(/\s/g, "-")}`}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: i.color + "1a" }}>
                    <i.Icon className="h-5 w-5" style={{ color: i.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{i.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{i.desc}</div>
                  </div>
                  <Badge variant="outline" className="text-muted-foreground">Not connected</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
