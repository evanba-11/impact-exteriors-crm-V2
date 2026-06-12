import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui-bits";
import { Badge } from "@/components/ui/badge";
import { money2 } from "@/lib/format";
import {
  PRICE_AGREEMENT, MATERIALS, SHINGLE_OPTIONS, SPECIALTY, LABOR, TAX_JURISDICTIONS,
} from "@shared/pricing";
import { Tag, Clock, ShieldCheck, AlertTriangle } from "lucide-react";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PriceList() {
  const { data: settings } = useQuery<any>({ queryKey: ["/api/settings"] });
  const { data: history = [] } = useQuery<any[]>({ queryKey: ["/api/price-history"] });

  const agreementLabel = settings?.priceAgreement || PRICE_AGREEMENT.label;
  const expires = settings?.priceAgreementExpires || PRICE_AGREEMENT.expires;
  // most recent import event timestamp
  const importEvt = history.find((h) => h.field === "import");

  const laborRows: [string, string][] = [
    ["Tear off + install (3:12–7:12)", `$${LABOR.installPerSQ}/SQ`],
    ["Extra layer", `$${LABOR.extraLayerPerSQ}/SQ × (layers−1)`],
    ["Steep adder (pitch > 7)", `$${LABOR.steepPerSQ}/SQ × (pitch−7)`],
    ["Story adder", `$${LABOR.storyPerSQ}/SQ × (stories−1)`],
    ["Trash walk", `$${LABOR.trashWalkPerSQ}/SQ`],
    ["Roof loading (no access)", `$${LABOR.noAccessPerSQ}/SQ (+$${LABOR.noAccessSteepAdd}/SQ if pitch ≥ 10)`],
    ["Mod bit", `$${LABOR.modBitPerSQ}/SQ`],
    ["Ridge vent cut-in", `$${LABOR.ridgeVentCutInPerLF}/LF`],
    ["Step/counter flashing labor", `$${LABOR.stepFlashLaborPerLF}/LF`],
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Price List" subtitle="Live estimating catalog sourced from the ABC Supply Price Agreement" />

      {/* Attribution banner */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3 flex-wrap" data-testid="price-agreement-banner">
        <Tag className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold text-sm" data-testid="text-price-agreement">{agreementLabel}</div>
          <div className="text-xs text-muted-foreground">
            {PRICE_AGREEMENT.source} · {PRICE_AGREEMENT.number} · effective {PRICE_AGREEMENT.effective}
          </div>
        </div>
        <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300" data-testid="badge-expires">
          <Clock className="w-3.5 h-3.5 mr-1" />Expires {expires}
        </Badge>
        <Badge variant="outline" className="bg-blue-500/15 text-blue-600">
          3% supplier surcharge on materials
        </Badge>
      </div>

      {/* Shingle options */}
      <Section title="Shingle Options ($/SQ · 3 bdl/SQ)">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
            <th className="text-left p-2.5">Option</th><th className="text-right p-2.5">Price / SQ</th><th className="text-center p-2.5">Default</th>
          </tr></thead>
          <tbody>
            {SHINGLE_OPTIONS.map((s) => (
              <tr key={s.name} className="border-t border-border" data-testid={`row-shingle-${s.name.replace(/\W/g, "")}`}>
                <td className="p-2.5 font-medium">{s.name}</td>
                <td className="p-2.5 text-right tnum">{money2(s.perSQ)}</td>
                <td className="p-2.5 text-center">{s.isDefault ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600">default</Badge> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Materials catalog */}
      <Section title="Materials Catalog (derived cost/unit = package ÷ coverage)">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
            <th className="text-left p-2.5">Material</th><th className="text-left p-2.5">ABC Source</th>
            <th className="text-right p-2.5">Package $</th><th className="text-right p-2.5">Coverage</th>
            <th className="text-center p-2.5">Unit</th><th className="text-right p-2.5">Cost / Unit</th>
          </tr></thead>
          <tbody>
            {MATERIALS.map((m) => (
              <tr key={m.key} className="border-t border-border" data-testid={`row-material-${m.key}`}>
                <td className="p-2.5 font-medium">{m.name}</td>
                <td className="p-2.5 text-muted-foreground text-xs">{m.abcSource}</td>
                <td className="p-2.5 text-right tnum">{money2(m.pkg)}</td>
                <td className="p-2.5 text-right tnum">{m.coverage} {m.unit}/pkg</td>
                <td className="p-2.5 text-center text-muted-foreground">{m.unit}</td>
                <td className="p-2.5 text-right tnum font-medium">${m.costPerUnit.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Section>

      {/* Labor rates */}
      <Section title="Labor Rates (cost-plus)">
        <table className="w-full text-sm">
          <tbody>
            {laborRows.map(([name, rate]) => (
              <tr key={name} className="border-t border-border first:border-t-0" data-testid={`row-labor-${name.replace(/\W/g, "").slice(0, 12)}`}>
                <td className="p-2.5 font-medium">{name}</td>
                <td className="p-2.5 text-right tnum text-muted-foreground">{rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Specialty items */}
      <Section title="Specialty Items (fixed customer price · not marked up · not taxed)">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
            <th className="text-left p-2.5">Item</th><th className="text-right p-2.5">Price</th><th className="text-right p-2.5">Cost</th><th className="text-center p-2.5">Cost Code</th>
          </tr></thead>
          <tbody>
            {SPECIALTY.map((s) => (
              <tr key={s.key} className="border-t border-border" data-testid={`row-specialty-${s.key}`}>
                <td className="p-2.5 font-medium">{s.name}</td>
                <td className="p-2.5 text-right tnum">{money2(s.price)}</td>
                <td className="p-2.5 text-right tnum text-muted-foreground">{money2(s.cost)}</td>
                <td className="p-2.5 text-center text-muted-foreground">{s.costCode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Tax jurisdictions */}
      <Section title="Tax Jurisdictions (material tax only · labor not taxed)">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
            <th className="text-left p-2.5">Jurisdiction</th><th className="text-right p-2.5">Rate</th><th className="text-left p-2.5">Status</th>
          </tr></thead>
          <tbody>
            {TAX_JURISDICTIONS.map((t) => (
              <tr key={t.name} className="border-t border-border" data-testid={`row-tax-${t.name.replace(/\W/g, "").slice(0, 12)}`}>
                <td className="p-2.5 font-medium">{t.name}{t.note ? <span className="text-xs text-muted-foreground"> · {t.note}</span> : ""}</td>
                <td className="p-2.5 text-right tnum">{t.rate.toFixed(3)}%</td>
                <td className="p-2.5">
                  {t.status === "CONFIRMED" ? (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600"><ShieldCheck className="w-3 h-3 mr-1" />Confirmed</Badge>
                  ) : t.status === "APPROX" ? (
                    <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300"><AlertTriangle className="w-3 h-3 mr-1" />Approx — verify</Badge>
                  ) : (
                    <Badge variant="outline">Custom</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Version history */}
      <Section title="Version History">
        {history.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No price changes logged yet.</div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground sticky top-0"><tr>
              <th className="text-left p-2.5">When</th><th className="text-left p-2.5">Item</th><th className="text-left p-2.5">Change</th><th className="text-left p-2.5">By</th>
            </tr></thead>
            <tbody>
              {importEvt && (
                <tr className="border-t border-border bg-primary/5" data-testid="row-history-import">
                  <td className="p-2.5 tnum text-muted-foreground">{fmtDate(importEvt.changedAt)}</td>
                  <td className="p-2.5 font-medium" colSpan={2}>Initial catalog import — {agreementLabel} (expires {expires})</td>
                  <td className="p-2.5 text-muted-foreground">ABC Supply Import</td>
                </tr>
              )}
              {history.filter((h) => h.field !== "import").slice(0, 60).map((h, i) => (
                <tr key={i} className="border-t border-border" data-testid={`row-history-${i}`}>
                  <td className="p-2.5 tnum text-muted-foreground">{fmtDate(h.changedAt)}</td>
                  <td className="p-2.5">{h.itemName}</td>
                  <td className="p-2.5 text-muted-foreground">{h.field}: {h.oldValue} → {h.newValue}</td>
                  <td className="p-2.5 text-muted-foreground">{h.changedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="rounded-lg border border-card-border bg-card overflow-hidden">{children}</div>
    </div>
  );
}
