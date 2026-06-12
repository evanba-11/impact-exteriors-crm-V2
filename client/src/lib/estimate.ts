export type Line = {
  itemCode?: string; name: string; qty: number; unit: string;
  unitCost: number; margin: number; costCode: string;
};
export type Section = { name: string; lines: Line[] };

// price = cost / (1 - margin/100)
export const linePrice = (l: Line) => {
  const cost = l.qty * l.unitCost;
  const m = Math.min(99, l.margin) / 100;
  return m >= 1 ? cost : cost / (1 - m);
};
export const lineCost = (l: Line) => l.qty * l.unitCost;

export function calcEstimate(sections: Section[], opts: {
  taxPct?: number; opEnabled?: boolean; contingencyPct?: number;
} = {}) {
  let cost = 0, price = 0;
  for (const s of sections) for (const l of s.lines) { cost += lineCost(l); price += linePrice(l); }
  let subtotal = price;
  const op = opts.opEnabled ? subtotal * 0.2 : 0; // O&P 10/10 = 20%
  const contingency = subtotal * ((opts.contingencyPct || 0) / 100);
  const taxable = subtotal + op + contingency;
  const tax = taxable * ((opts.taxPct || 0) / 100);
  const total = taxable + tax;
  const gp = total - cost;
  const margin = total > 0 ? (gp / total) * 100 : 0;
  return { cost, price: subtotal, op, contingency, tax, total, gp, margin };
}

// Quick mode: generate line items from template + measurements
export function generateQuickLines(template: string, m: {
  squares: number; pitch: string; layers: number; stories: number; wastePct: number;
}, priceItems: any[], floor: number): Section[] {
  const find = (code: string) => priceItems.find((p) => p.code === code);
  const sqWithWaste = m.squares * (1 + m.wastePct / 100);
  const pitchFactor = (m.pitch || "").startsWith("8") || (m.pitch || "").startsWith("9") || (m.pitch || "").startsWith("1") ? 1.15 : 1;
  const storyFactor = m.stories >= 2 ? 1.12 : 1;
  const mk = (code: string, qty: number): Line | null => {
    const p = find(code); if (!p) return null;
    return { itemCode: p.code, name: p.name, qty: Math.round(qty * 10) / 10, unit: p.unit, unitCost: p.unitCost, margin: Math.max(floor, p.defaultMargin), costCode: p.costCode };
  };
  const lines = (arr: (Line | null)[]) => arr.filter(Boolean) as Line[];

  if (template === "Roof Repair") {
    return [{ name: "Repair", lines: lines([
      mk("LB-INSTALL", m.squares * pitchFactor * storyFactor),
      mk("RF-ARCH", sqWithWaste),
      mk("SM-PIPE", 2),
    ]) }];
  }
  if (template === "Gutters & Downspouts") {
    const lf = m.squares * 10; // approximate perimeter
    return [{ name: "Gutters", lines: lines([
      mk("GUT-5K", lf), mk("GUT-DS", lf * 0.4), mk("GUT-GUARD", lf),
    ]) }];
  }
  if (template === "Siding Section") {
    return [{ name: "Siding", lines: lines([
      mk("SD-LP", sqWithWaste), mk("LB-INSTALL", m.squares * storyFactor),
    ]) }];
  }
  // Asphalt Reroof (default)
  return [
    { name: "Tear-Off", lines: lines([
      mk("LB-TEAROFF", m.squares * m.layers),
      mk("DISP-DUMP", Math.ceil(m.squares / 25)),
    ]) },
    { name: "Install", lines: lines([
      mk("RF-ARCH", sqWithWaste),
      mk("RF-SYNUL", sqWithWaste),
      mk("LB-INSTALL", m.squares * pitchFactor * storyFactor),
    ]) },
    { name: "Sheet Metal", lines: lines([
      mk("SM-DRIP", m.squares * 6),
      mk("SM-PIPE", 3),
      mk("PERMIT", 1),
    ]) },
  ];
}

export const QUICK_TEMPLATES = ["Asphalt Reroof", "Roof Repair", "Gutters & Downspouts", "Siding Section"];
