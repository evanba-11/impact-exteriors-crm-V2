/* ============================================================================
 * Build-model helper for the redesigned estimate workspace (Update 4).
 *
 * Derives an editable, section-grouped view of an estimate from the V3 job-input
 * model, then applies per-estimate overrides (line qty + rate, product selections,
 * extras cost+price, custom/added lines). With NO overrides and DEFAULT products
 * selected, the totals reproduce calcEstimateV3 exactly (so the verified
 * $17,939.87 worked example holds).
 *
 * Update 4 changes:
 *   - Quick Template shows a fixed ROSTER of named line items grouped under the
 *     spec sections (Tear-Off / Shingle Install / Edge Flashings / Boots, Vents,
 *     etc. / Misc.). Roster lines with no engine quantity render blank (qty 0)
 *     and add NO cost — they only contribute when a qty is entered.
 *   - "+ Add Line" custom rows (free item name, qty, unit, unit material cost,
 *     labor rate, bid) flow into totals/financials/proposal when qty > 0.
 *   - Every line carries a removable flag for the per-estimate "x" control.
 * ==========================================================================*/
import {
  materialLines, laborLines, specialtyLines,
  SURCHARGE, PRODUCT_CATALOG, type JobInput, type ProposalExtras,
  type CatalogProduct, type ProductUse,
} from "@shared/pricing";

/* A user-added / custom line (Quick "+ Add Line" or full Custom-mode row). */
export type CustomLine = {
  id: string;            // "custom:<uid>"
  section: string;       // section title it belongs to
  name: string;          // free-text item name
  qty: number;
  unit: string;          // SQ | LF | EA | SF
  unitMaterialCost: number; // material $/unit
  laborRate: number;        // labor $/unit
  bid: number;              // optional explicit price/bid (0 = derive from margin)
};

/* A per-estimate line substitution. The original line is shown struck-through in
 * red; the chosen replacement is shown in green and contributes to totals in the
 * original's place. The replacement is stored as a self-contained custom-like
 * line so it survives a template/engine recompute. childKeys carries the bid
 * item's child-line selections so they ride along to the replacement. */
export type Substitution = {
  name: string;
  qty: number;
  unit: string;
  unitMaterialCost: number;
  laborRate: number;
  bid: number;
  itemType: "bid" | "material" | "labor"; // which facet this sub represents
  childKeys?: string[];                    // carried-over child line ids (bid items)
};

export type BuildOverrides = {
  lines: Record<string, { qty?: number; rate?: number; unit?: string }>;   // keyed by line id
  products: Partial<Record<ProductUse, string>>;            // use -> product key
  extras: Record<string, { cost?: number; price?: number }>; // keyed by extra key
  custom: CustomLine[];          // user-added / custom-mode lines
  removed: string[];             // ids of roster/engine lines removed this estimate
  thickness?: Record<string, string>; // line id -> OSB thickness selection
  substitutions?: Record<string, Substitution>; // line id -> replacement
  order?: Record<string, string[]>;             // section id -> ordered line ids
};

export function defaultBuildOverrides(): BuildOverrides {
  return { lines: {}, products: {}, extras: {}, custom: [], removed: [], thickness: {}, substitutions: {}, order: {} };
}

export type BuildLineKind = "material" | "labor" | "spec" | "custom";
export type BuildLine = {
  id: string;            // stable id (kind:key)
  kind: BuildLineKind;
  key: string;           // engine line key (field, starter, hr, ...) or labor name
  name: string;          // display name (may include selected product)
  descriptor: string;    // breadcrumb-style descriptor
  qty: number;
  unit: string;
  rate: number;          // editable unit cost / rate
  directLabor: number;   // labor cost attributable to this row (labor lines)
  material: number;      // material cost attributable to this row (material lines)
  bid: number;           // retail bid for the row
  // extras carry an explicit price + cost
  isExtra?: boolean;
  cost?: number;
  price?: number;
  productUse?: ProductUse; // if this row can swap products
  removable?: boolean;     // show "x" remove control (per-estimate only)
  placeholder?: boolean;   // roster line with no qty yet (blank by default)
  altUnits?: string[];     // alternate units for an inline unit dropdown
  hasThickness?: boolean;  // OSB thickness dropdown
  isPct?: boolean;         // bid computed as % of estimate subtotal (template % lines)
  // custom-line specific (editable in both modes)
  isCustom?: boolean;
  customSection?: string;
  unitMaterialCost?: number;
  laborRate?: number;
  // substitution markers (Update 7)
  substitutedOriginal?: boolean; // this is the replaced original (render red strikethrough)
  isSubstitute?: boolean;        // this is the green replacement
};

export type BuildSection = {
  id: string;
  title: string;
  lines: BuildLine[];
};

export type BuildResult = {
  sections: BuildSection[];
  // live metrics strip
  directLabor: number;
  materialSubtotal: number;   // pre-surcharge
  materialSurcharge: number;  // 3% CC supplier surcharge
  materialTaxable: number;    // material cost (×1.03)
  materialTax: number;
  materialTotal: number;      // material cost + tax (display)
  laborAddOns: number;        // labor add-on cost (non base install)
  baseLaborCost: number;      // tear-off + install
  specCost: number;
  specPrice: number;
  totalCost: number;          // matCost + laborCost + specCost
  marginPct: number;
  marginMult: number;
  grossProfit: number;
  totalEstimateValue: number; // contract total (roofing system)
  costPerSquare: number;
  squares: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/* product selected for a use (falls back to the catalog default) */
export function selectedProduct(use: ProductUse, overrides: BuildOverrides): CatalogProduct | undefined {
  const key = overrides.products[use];
  if (key) { const p = PRODUCT_CATALOG.find((x) => x.key === key); if (p) return p; }
  return PRODUCT_CATALOG.find((x) => x.use === use && x.isDefault);
}

/* which use a material/field line key belongs to (for product swapping) */
const LINE_USE: Record<string, ProductUse> = {
  field: "shingle", hr: "hipRidge", starter: "starter", pipeBoot: "pipeBoot",
  gutterApron: "gutterApron", dripEdge: "dripEdge", dripEdgeXL: "dripEdge",
  underlayment: "underlayment", ridgeVent: "ridgeVent",
};

/* ── Update 4 canonical section names ── */
export const SECTION_TEAROFF = "Tear-Off";
export const SECTION_INSTALL = "Shingle Install";
export const SECTION_EDGE = "Edge Flashings";
export const SECTION_BOOTS = "Boots, Vents, etc.";
export const SECTION_ADDONS = "Labor Add-Ons";
export const SECTION_MISC = "Misc.";

/* unit dropdown options for custom / add-line rows */
export const UNIT_OPTIONS = ["SQ", "LF", "EA", "SF"] as const;
export const OSB_THICKNESS = ["3/4in", "1/2in", "7/16in"] as const;

/* section grouping for material/field/labor keys (Update 4 sections) */
const SECTION_OF: Record<string, string> = {
  field: SECTION_INSTALL,
  starter: SECTION_INSTALL,
  hr: SECTION_INSTALL,
  underlayment: SECTION_INSTALL,
  iceWater: SECTION_INSTALL,
  dripEdge: SECTION_EDGE,
  dripEdgeXL: SECTION_EDGE,
  gutterApron: SECTION_EDGE,
  valleyMetal: SECTION_EDGE,
  stepFlash: SECTION_EDGE,
  pipeBoot: SECTION_BOOTS,
  splitBoot: SECTION_BOOTS,
  ridgeVent: SECTION_BOOTS,
  boxVent: SECTION_BOOTS,
  coilNails: SECTION_MISC,
  capNails: SECTION_MISC,
  sealant: SECTION_MISC,
};

/* specialty/extra line product use + section + descriptor */
const SPEC_USE: Record<string, ProductUse> = { boxVent: "boxVent" };
const SPEC_SECTION: Record<string, string> = { boxVent: SECTION_BOOTS };
const SPEC_DESCRIPTOR: Record<string, string> = {
  boxVent: "Box Vent Installation → ea",
  osb: "Decking Replacement → sheet",
  cricket: "Cricket Fabrication → ea",
  broanSmallKit: "Bath Exhaust → ea", broanSmallVent: "Bath Exhaust → ea",
  broanLargeKit: "Bath Exhaust → ea", broanLargeVent: "Bath Exhaust → ea",
};

const ADDON_NAMES = new Set([
  "Extra layer", "Steep pitch adder", "Story adder", "Trash walk",
  "Roof loading (no access)", "Mod bit", "Ridge vent cut-in", "Step/counter flashing labor",
]);

/* ── Quick Template ROSTER: every line visible on open, blank by default ──
 * Each roster entry pins a named item to a section. Where an entry maps to an
 * engine line key (engineKey), the live engine quantity drives it; otherwise it
 * renders as a blank placeholder row (qty 0 = no cost) until a qty is entered.
 * Roster ordering defines display order within each section. */
type RosterItem = {
  rid: string;          // roster id ("roster:<slug>")
  section: string;
  name: string;
  unit: string;
  altUnits?: string[];  // alternate units offered in the inline unit dropdown
  engineKey?: string;   // material/labor/spec engine line key if it maps to one
  engineKind?: BuildLineKind;
  defaultCost?: number; // default unit cost for editable blank items
  editableCost?: boolean;
  hasThickness?: boolean; // OSB thickness dropdown
};

export const SHINGLE_ROSTER: RosterItem[] = [
  // Tear-Off
  { rid: "roster:tearoff", section: SECTION_TEAROFF, name: "Asphalt Shingle Tear Off", unit: "SQ", engineKey: "install", engineKind: "labor" },
  // Shingle Install
  { rid: "roster:install", section: SECTION_INSTALL, name: "Shingle Install", unit: "SQ", engineKey: "field", engineKind: "material" },
  { rid: "roster:hr", section: SECTION_INSTALL, name: "Hip and Ridge", unit: "LF", engineKey: "hr", engineKind: "material" },
  { rid: "roster:starter", section: SECTION_INSTALL, name: "Shingle Starter Install", unit: "LF", engineKey: "starter", engineKind: "material" },
  { rid: "roster:underlayment", section: SECTION_INSTALL, name: "Synthetic Roofing Felt Installation", unit: "SQ", engineKey: "underlayment", engineKind: "material" },
  { rid: "roster:iceWater", section: SECTION_INSTALL, name: "Ice and Water Barrier", unit: "SQ", engineKey: "iceWater", engineKind: "material" },
  // Edge Flashings
  { rid: "roster:gutterApron", section: SECTION_EDGE, name: "Gutter Apron", unit: "LF", engineKey: "gutterApron", engineKind: "material" },
  { rid: "roster:dripEdge", section: SECTION_EDGE, name: "Drip Edge", unit: "LF", engineKey: "dripEdge", engineKind: "material" },
  { rid: "roster:stepFlash", section: SECTION_EDGE, name: "Step Flashing", unit: "LF", engineKey: "stepFlash", engineKind: "material" },
  { rid: "roster:closedValley", section: SECTION_EDGE, name: "Closed Valley", unit: "LF", engineKey: "valleyMetal", engineKind: "material" },
  { rid: "roster:openValley", section: SECTION_EDGE, name: "W-Pan Open Valley", unit: "LF", defaultCost: 12, editableCost: true },
  { rid: "roster:swampWork", section: SECTION_EDGE, name: "Swamp Cooler Work Around", unit: "EA", defaultCost: 150, editableCost: true },
  { rid: "roster:swampBoot", section: SECTION_EDGE, name: "Swamp Cooler Boot Replacement", unit: "EA", defaultCost: 185, editableCost: true },
  // Edge Flashings — Update 5 add-ons (per Residential-Reroof-Template-add-ons.txt)
  { rid: "roster:counterFlash", section: SECTION_EDGE, name: "Counter Flashing", unit: "LF", defaultCost: 0, editableCost: true },
  { rid: "roster:headwallFlash", section: SECTION_EDGE, name: "Headwall / Apron Flashing", unit: "LF", defaultCost: 0, editableCost: true },
  { rid: "roster:chimneyBase", section: SECTION_EDGE, name: "Chimney Flashing — Base", unit: "LF", defaultCost: 0, editableCost: true },
  { rid: "roster:chimneyCap", section: SECTION_EDGE, name: "Chimney Flashing — Counter / Cap", unit: "LF", defaultCost: 0, editableCost: true },
  { rid: "roster:dormerFlash", section: SECTION_EDGE, name: "Dormer Flashing", unit: "LF", defaultCost: 0, editableCost: true },
  { rid: "roster:wallFlash", section: SECTION_EDGE, name: "Wall Flashing", unit: "LF", defaultCost: 0, editableCost: true },
  { rid: "roster:kickOut", section: SECTION_EDGE, name: "Kick-Out Flashing", unit: "EA", defaultCost: 0, editableCost: true },
  // Boots, Vents, etc.
  { rid: "roster:pipeBoot", section: SECTION_BOOTS, name: "Plumbing Boot", unit: "EA", engineKey: "pipeBoot", engineKind: "material" },
  { rid: "roster:splitBoot", section: SECTION_BOOTS, name: "Split Boot", unit: "EA", engineKey: "splitBoot", engineKind: "material" },
  { rid: "roster:boxVent", section: SECTION_BOOTS, name: "Box Vent", unit: "EA", engineKey: "boxVent", engineKind: "spec" },
  { rid: "roster:broanVent", section: SECTION_BOOTS, name: "Broan Vent", unit: "EA", engineKey: "broanSmallKit", engineKind: "spec" },
  { rid: "roster:turbineVent", section: SECTION_BOOTS, name: "Turbine Vent", unit: "EA", defaultCost: 65, editableCost: true },
  { rid: "roster:atticFan", section: SECTION_BOOTS, name: "Powered Attic Fan", unit: "EA", defaultCost: 285, editableCost: true },
  // Boots, Vents, etc. — Update 5 add-ons
  // Ridge Vent: existing $3.75/LF material + $2/LF cut-in labor → combined editable $5.75/LF default.
  { rid: "roster:ridgeVentAdd", section: SECTION_BOOTS, name: "Ridge Vent", unit: "LF", defaultCost: 5.75, editableCost: true },
  { rid: "roster:gableVent", section: SECTION_BOOTS, name: "Gable Vent", unit: "EA", defaultCost: 0, editableCost: true },
  { rid: "roster:deckIntake", section: SECTION_BOOTS, name: "Deck Air Intake", unit: "EA", defaultCost: 0, editableCost: true },
  // Misc.
  { rid: "roster:permit", section: SECTION_MISC, name: "Permit Fee", unit: "EA", defaultCost: 285, editableCost: true },
  { rid: "roster:solarDR", section: SECTION_MISC, name: "Solar Panel D&R", unit: "EA", defaultCost: 500, editableCost: true },
  { rid: "roster:skylights", section: SECTION_MISC, name: "Skylights", unit: "EA", defaultCost: 650, editableCost: true },
  { rid: "roster:skylightKit", section: SECTION_MISC, name: "Skylight Flashing Kit", unit: "EA", defaultCost: 95, editableCost: true },
  { rid: "roster:osb", section: SECTION_MISC, name: "OSB 4x8 Sheet", unit: "EA", engineKey: "osb", engineKind: "spec", hasThickness: true },
  // Misc. — Update 5 add-ons
  { rid: "roster:dumpsterFee", section: SECTION_MISC, name: "Dumpster Fee", unit: "Flat", defaultCost: 0, editableCost: true },
  { rid: "roster:haulOff", section: SECTION_MISC, name: "Haul-Off / Dump Fee", unit: "Flat", defaultCost: 0, editableCost: true },
  { rid: "roster:dumpOverage", section: SECTION_MISC, name: "Dump Fee Overage", unit: "EA", defaultCost: 0, editableCost: true },
  { rid: "roster:antennaRemoval", section: SECTION_MISC, name: "Antenna Removal", unit: "EA", defaultCost: 0, editableCost: true },
  { rid: "roster:scaffoldRental", section: SECTION_MISC, name: "Scaffold Rental", unit: "Day", altUnits: ["Week"], defaultCost: 0, editableCost: true },
  { rid: "roster:caulkSealant", section: SECTION_MISC, name: "Caulking / Sealant", unit: "LF", altUnits: ["Flat"], defaultCost: 0, editableCost: true },
  { rid: "roster:satDishRemoval", section: SECTION_MISC, name: "Satellite Dish Removal Only (no reset)", unit: "EA", defaultCost: 0, editableCost: true },
  { rid: "roster:addlLabor", section: SECTION_MISC, name: "Additional Labor", unit: "HR", defaultCost: 0, editableCost: true },
];

const ROSTER_SECTION_ORDER = [
  SECTION_TEAROFF, SECTION_INSTALL, SECTION_EDGE, SECTION_BOOTS, SECTION_ADDONS, SECTION_MISC,
];

export function computeBuild(jiIn: JobInput, extras: ProposalExtras, overrides: BuildOverrides): BuildResult {
  const ji = jiIn;
  const margin = Math.max(0, Math.min(99, ji.margin)) / 100;
  const marginMult = 1 / (1 - margin);
  const taxRate = (ji.taxRate || 0) / 100;

  const removed = new Set(overrides.removed || []);
  const ovLine = (id: string) => overrides.lines[id] || {};

  // ---- Material lines (apply product label/cost + qty/rate overrides) ----
  const baseMat = materialLines(ji);
  const matBuild: BuildLine[] = baseMat.map((l) => {
    const id = `material:${l.key}`;
    const use = LINE_USE[l.key];
    const prod = use ? selectedProduct(use, overrides) : undefined;
    // default rate = engine cost; product may override cost when non-default
    let rate = l.costPerUnit;
    if (prod && prod.costPerUnit != null && !prod.isDefault) rate = prod.costPerUnit;
    const ov = ovLine(id);
    const qty = ov.qty != null ? ov.qty : l.qty;
    if (ov.rate != null) rate = ov.rate;
    const ext = qty * rate;
    const name = prod ? `${prod.name} — ${prod.mfr}` : l.name;
    const descriptor = prod ? prod.descriptor : l.name;
    return {
      id, kind: "material", key: l.key, name, descriptor,
      qty: round2(qty), unit: l.unit, rate: round2(rate),
      directLabor: 0, material: ext, bid: ext * (1 + SURCHARGE) * marginMult,
      productUse: use, removable: true,
    };
  }).filter((l) => !removed.has(l.id));

  // ---- Labor lines (every line qty + rate editable) ----
  const baseLab = laborLines(ji);
  const labBuild: BuildLine[] = baseLab.map((l) => {
    const id = `labor:${l.key}`;
    const { qty: dq, rate: dr, unit } = laborQtyRate(l.key, l.name, l.cost, ji);
    const ov = ovLine(id);
    const qty = ov.qty != null ? ov.qty : dq;
    const rate = ov.rate != null ? ov.rate : dr;
    const cost = qty * rate;
    return {
      id, kind: "labor", key: l.key, name: l.name, descriptor: l.detail,
      qty: round2(qty), unit, rate: round2(rate),
      directLabor: cost, material: 0, bid: cost * marginMult, removable: true,
    };
  }).filter((l) => !removed.has(l.id));

  // ---- Specialty / extras lines (editable cost AND price) ----
  const baseSpec = specialtyLines(ji);
  const specBuild: BuildLine[] = baseSpec.map((l) => {
    const id = `spec:${l.key}`;
    const ov = overrides.extras[id] || {};
    const cost = ov.cost != null ? ov.cost : l.cost;
    const price = ov.price != null ? ov.price : l.price;
    const use = SPEC_USE[l.key];
    const prod = use ? selectedProduct(use, overrides) : undefined;
    const name = prod && !prod.isDefault ? `${prod.name} — ${prod.mfr}` : l.name;
    const descriptor = prod ? prod.descriptor : (SPEC_DESCRIPTOR[l.key] || "Specialty / accessory → ea");
    return {
      id, kind: "spec", key: l.key, name, descriptor,
      qty: l.qty, unit: "EA", rate: round2(cost / Math.max(1, l.qty)),
      directLabor: 0, material: 0, bid: price,
      isExtra: true, cost, price, productUse: use, removable: true,
    };
  }).filter((l) => !removed.has(l.id));

  // ---- Custom / "+ Add Line" rows ----
  const customBuild: BuildLine[] = (overrides.custom || [])
    .filter((c) => !removed.has(c.id))
    .map((c) => {
      const qty = c.qty || 0;
      const material = qty * (c.unitMaterialCost || 0);
      const directLabor = qty * (c.laborRate || 0);
      const derivedBid = (material * (1 + SURCHARGE) + directLabor) * marginMult;
      const bid = c.bid && c.bid > 0 ? c.bid : derivedBid;
      return {
        id: c.id, kind: "custom", key: c.id, name: c.name || "Custom line",
        descriptor: `${c.section} → custom → ${c.unit?.toLowerCase() || "ea"}`,
        qty: round2(qty), unit: c.unit || "EA", rate: round2(c.unitMaterialCost || 0),
        directLabor, material, bid,
        removable: true, isCustom: true, customSection: c.section,
        unitMaterialCost: c.unitMaterialCost || 0, laborRate: c.laborRate || 0,
      };
    });

  // ---- Build the visible roster (Quick Template) ----
  // Index engine-built lines by their natural id for lookup.
  const byId: Record<string, BuildLine> = {};
  for (const l of [...matBuild, ...labBuild, ...specBuild]) byId[l.id] = l;
  const usedIds = new Set<string>();
  const buckets: Record<string, BuildLine[]> = {};
  for (const s of ROSTER_SECTION_ORDER) buckets[s] = [];

  for (const r of SHINGLE_ROSTER) {
    if (removed.has(r.rid)) continue;
    let line: BuildLine | undefined;
    if (r.engineKey && r.engineKind) {
      const eid = `${r.engineKind}:${r.engineKey}`;
      if (byId[eid]) { line = { ...byId[eid] }; usedIds.add(eid); }
    }
    if (line) {
      // present engine line under its roster name/unit/section
      line.name = r.name;
      line.unit = r.unit;
      line.id = r.engineKind === "labor" && r.engineKey === "install"
        ? "labor:tearoff-view" : line.id;
      buckets[r.section].push(line);
    } else {
      // blank placeholder roster row (qty 0 -> no cost)
      const ov = ovLine(r.rid);
      const qty = ov.qty != null ? ov.qty : 0;
      const rate = ov.rate != null ? ov.rate : (r.defaultCost || 0);
      const unit = ov.unit || r.unit;
      const matCost = qty * rate;
      const bid = matCost * (1 + SURCHARGE) * marginMult;
      buckets[r.section].push({
        id: r.rid, kind: "material", key: r.rid, name: r.name,
        descriptor: `${r.section} → ${unit.toLowerCase()}`,
        qty: round2(qty), unit, rate: round2(rate),
        directLabor: 0, material: matCost, bid,
        removable: true, placeholder: qty <= 0,
        unitMaterialCost: rate, altUnits: r.altUnits, hasThickness: r.hasThickness,
      });
    }
  }

  // Engine lines NOT in the roster (e.g. dripEdgeXL, coilNails, labor add-ons, extra specialty)
  for (const l of [...matBuild]) {
    if (usedIds.has(l.id)) continue;
    const sec = SECTION_OF[l.key] || SECTION_MISC;
    buckets[sec].push(l);
  }
  for (const l of labBuild) {
    if (usedIds.has(l.id)) continue;
    if (l.key === "install") {
      // install already surfaced as Tear-Off roster line; also show install row
      buckets[SECTION_INSTALL].unshift({ ...l, name: "Shingle Installation (tear-off + install)", descriptor: "Shingle Install → labor" });
    } else if (ADDON_NAMES.has(l.name)) {
      buckets[SECTION_ADDONS].push(l);
    } else {
      buckets[SECTION_INSTALL].push(l);
    }
  }
  for (const l of specBuild) {
    if (usedIds.has(l.id)) continue;
    buckets[SPEC_SECTION[l.key] || SECTION_MISC].push(l);
  }
  // Custom lines into their chosen sections
  for (const l of customBuild) {
    const sec = ROSTER_SECTION_ORDER.includes(l.customSection || "") ? l.customSection! : SECTION_MISC;
    buckets[sec].push(l);
  }

  const sections: BuildSection[] = ROSTER_SECTION_ORDER
    .map((title) => ({ id: title, title, lines: buckets[title] }))
    .filter((s) => s.lines.length > 0);

  // ---- Totals (recomputed from the (possibly overridden) lines) ----
  // Roster placeholder material lines + engine material lines + custom material.
  const allMaterialRows = [
    ...matBuild,
    ...customBuild,
    // roster placeholder rows that carry material (not engine-backed)
    ...Object.values(buckets).flat().filter((l) => l.key.startsWith("roster:") && l.material),
  ];
  const materialSubtotal = allMaterialRows.reduce((s, l) => s + (l.material || 0), 0);
  const materialSurcharge = materialSubtotal * SURCHARGE;
  const materialTaxable = materialSubtotal * (1 + SURCHARGE); // matCost
  const materialTax = materialTaxable * marginMult * taxRate;

  const baseLaborCost = labBuild.filter((l) => l.key === "install").reduce((s, l) => s + l.directLabor, 0);
  const laborAddOns = labBuild.filter((l) => l.key !== "install").reduce((s, l) => s + l.directLabor, 0)
    + customBuild.reduce((s, l) => s + (l.directLabor || 0), 0);
  const directLabor = baseLaborCost + laborAddOns;

  const specCost = specBuild.reduce((s, l) => s + (l.cost || 0), 0);
  const specPrice = specBuild.reduce((s, l) => s + (l.price || 0), 0);

  const matCost = materialTaxable;
  const totalCost = matCost + directLabor + specCost;
  const basePrice = (matCost + directLabor) * marginMult;
  const ccSurchargeAmt = ji.ccSurcharge ? matCost * marginMult * SURCHARGE : 0;
  const total = basePrice + specPrice + materialTax + ccSurchargeAmt;
  const passthrough = materialTax + ccSurchargeAmt;
  const grossProfit = (total - passthrough) - totalCost;
  const marginPct = (total - passthrough) > 0 ? (grossProfit / (total - passthrough)) * 100 : 0;

  const squares = ji.squares || 0;
  const costPerSquare = squares > 0 ? directLabor / squares : 0;

  return {
    sections,
    directLabor: round2(directLabor),
    materialSubtotal: round2(materialSubtotal),
    materialSurcharge: round2(materialSurcharge),
    materialTaxable: round2(materialTaxable),
    materialTax: round2(materialTax),
    materialTotal: round2(materialTaxable + materialTax),
    laborAddOns: round2(laborAddOns),
    baseLaborCost: round2(baseLaborCost),
    specCost: round2(specCost),
    specPrice: round2(specPrice),
    totalCost: round2(totalCost),
    marginPct,
    marginMult,
    grossProfit: round2(grossProfit),
    totalEstimateValue: round2(total),
    costPerSquare: round2(costPerSquare),
    squares,
  };
}

/* derive editable qty + rate for a labor line from the engine output */
function laborQtyRate(key: string, name: string, cost: number, ji: JobInput): { qty: number; rate: number; unit: string } {
  const sq = ji.squares || 0;
  switch (key) {
    case "install": return { qty: sq, rate: sq > 0 ? cost / sq : 95, unit: "SQ" };
    case "extraLayer": return { qty: sq, rate: sq > 0 ? cost / sq : 10, unit: "SQ" };
    case "steep": return { qty: sq, rate: sq > 0 ? cost / sq : 10, unit: "SQ" };
    case "story": return { qty: sq, rate: sq > 0 ? cost / sq : 10, unit: "SQ" };
    case "trash": return { qty: sq, rate: sq > 0 ? cost / sq : 10, unit: "SQ" };
    case "loading": return { qty: sq, rate: sq > 0 ? cost / sq : 9, unit: "SQ" };
    case "modbit": return { qty: ji.modBitSQ || 0, rate: 120, unit: "SQ" };
    case "ridgeVentCut": return { qty: ji.ridgeVentLF || 0, rate: 2, unit: "LF" };
    case "flashing": return { qty: (ji.step || 0) + (ji.counterFlash || 0), rate: 1, unit: "LF" };
    default: return { qty: 1, rate: cost, unit: "LS" };
  }
}

/* ============================================================================
 * computeTemplateBuild — roster-only build for the four NEW data-driven Quick
 * Templates (Residential Service / Soffit-Fascia-Gutters / Exterior Painting /
 * Commercial Service). No engine shingle math runs here: every line is a
 * placeholder row (qty 0 = no cost, omitted from the proposal) until a quantity
 * is entered. Sections with no source line items still render (empty + Add Line).
 * "%"-unit lines compute their bid as a percent of the non-% bid subtotal.
 * ==========================================================================*/
import type { QuickTemplate } from "./templates";

export function computeTemplateBuild(
  template: QuickTemplate,
  ji: JobInput,
  overrides: BuildOverrides,
): BuildResult {
  const margin = Math.max(0, Math.min(99, ji.margin)) / 100;
  const marginMult = 1 / (1 - margin);
  const taxRate = (ji.taxRate || 0) / 100;
  const removed = new Set(overrides.removed || []);
  const ovLine = (id: string) => overrides.lines[id] || {};

  // First pass: build non-% lines and accumulate a bid subtotal for % lines.
  const sections: BuildSection[] = [];
  let nonPctBidSubtotal = 0;
  const pctRefs: { line: BuildLine; rate: number }[] = [];

  for (let si = 0; si < template.sections.length; si++) {
    const sec = template.sections[si];
    const secId = `tpl:${template.key}:${si}`;
    const lines: BuildLine[] = [];
    for (let li = 0; li < sec.lines.length; li++) {
      const tl = sec.lines[li];
      const id = `tpl:${template.key}:${si}:${li}`;
      if (removed.has(id)) continue;
      const ov = ovLine(id);
      const qty = ov.qty != null ? ov.qty : 0;
      const rate = ov.rate != null ? ov.rate : (tl.defaultCost || 0);
      const unit = ov.unit || tl.unit;
      const isPct = unit === "%";
      // material/cost for non-% lines = qty * rate; bid = cost * (1+surcharge) * marginMult.
      const material = isPct ? 0 : qty * rate;
      const bid = isPct ? 0 : material * (1 + SURCHARGE) * marginMult;
      const line: BuildLine = {
        id, kind: "material", key: id, name: tl.name,
        descriptor: `${sec.title} → ${unit.toLowerCase()}`,
        qty: round2(qty), unit, rate: round2(rate),
        directLabor: 0, material, bid,
        removable: true, placeholder: qty <= 0,
        unitMaterialCost: rate, altUnits: tl.altUnits, isPct,
      };
      if (!isPct) nonPctBidSubtotal += bid;
      else pctRefs.push({ line, rate });
      lines.push(line);
    }
    sections.push({ id: secId, title: sec.title, lines });
  }

  // Second pass: resolve % lines against the non-% bid subtotal.
  for (const { line, rate } of pctRefs) {
    // qty holds the percent value the user enters; rate is a fallback percent.
    const pct = line.qty > 0 ? line.qty : rate;
    line.bid = round2(nonPctBidSubtotal * (pct / 100));
    line.material = 0;
    line.placeholder = line.qty <= 0;
  }

  // Custom "+ Add Line" rows flow into their chosen sections (matched by title).
  const customBuild: BuildLine[] = (overrides.custom || [])
    .filter((c) => !removed.has(c.id))
    .map((c) => {
      const qty = c.qty || 0;
      const material = qty * (c.unitMaterialCost || 0);
      const directLabor = qty * (c.laborRate || 0);
      const derivedBid = (material * (1 + SURCHARGE) + directLabor) * marginMult;
      const bid = c.bid && c.bid > 0 ? c.bid : derivedBid;
      return {
        id: c.id, kind: "custom" as BuildLineKind, key: c.id, name: c.name || "Custom line",
        descriptor: `${c.section} → custom → ${c.unit?.toLowerCase() || "ea"}`,
        qty: round2(qty), unit: c.unit || "EA", rate: round2(c.unitMaterialCost || 0),
        directLabor, material, bid,
        removable: true, isCustom: true, customSection: c.section,
        unitMaterialCost: c.unitMaterialCost || 0, laborRate: c.laborRate || 0,
      } as BuildLine;
    });
  for (const cl of customBuild) {
    const sec = sections.find((s) => s.title === cl.customSection) || sections[sections.length - 1];
    if (sec) sec.lines.push(cl);
  }

  // ---- Totals (recompute over all rows) ----
  const allLines = sections.flatMap((s) => s.lines);
  const materialSubtotal = allLines.reduce((s, l) => s + (l.material || 0), 0);
  const materialSurcharge = materialSubtotal * SURCHARGE;
  const materialTaxable = materialSubtotal * (1 + SURCHARGE);
  const materialTax = materialTaxable * marginMult * taxRate;
  const directLabor = allLines.reduce((s, l) => s + (l.directLabor || 0), 0);
  const totalCost = materialTaxable + directLabor;
  const totalEstimateValue = allLines.reduce((s, l) => s + (l.bid || 0), 0) + materialTax;
  const grossProfit = totalEstimateValue - materialTax - totalCost;
  const marginPct = (totalEstimateValue - materialTax) > 0
    ? (grossProfit / (totalEstimateValue - materialTax)) * 100 : 0;

  return {
    sections,
    directLabor: round2(directLabor),
    materialSubtotal: round2(materialSubtotal),
    materialSurcharge: round2(materialSurcharge),
    materialTaxable: round2(materialTaxable),
    materialTax: round2(materialTax),
    materialTotal: round2(materialTaxable + materialTax),
    laborAddOns: 0,
    baseLaborCost: 0,
    specCost: 0,
    specPrice: 0,
    totalCost: round2(totalCost),
    marginPct,
    marginMult,
    grossProfit: round2(grossProfit),
    totalEstimateValue: round2(totalEstimateValue),
    costPerSquare: 0,
    squares: ji.squares || 0,
  };
}

/* ============================================================================
 * applySubstitutions / applyOrder — post-process a computed BuildResult with the
 * per-estimate substitution + manual-order overrides. Kept separate from the two
 * compute paths so both Quick (engine + template) builds share identical logic.
 *
 * A substitution keeps the ORIGINAL line in place (flagged so the UI strikes it
 * through in red, zeroes its dollar contribution) and inserts the GREEN
 * replacement immediately after it. Totals are recomputed off the post-sub rows.
 * ==========================================================================*/
export function applySubstitutions(build: BuildResult, overrides: BuildOverrides): BuildResult {
  const subs = overrides.substitutions || {};
  const order = overrides.order || {};
  if (Object.keys(subs).length === 0 && Object.keys(order).length === 0) return build;

  let bidDelta = 0, laborDelta = 0, matDelta = 0;

  const sections: BuildSection[] = build.sections.map((sec) => {
    let lines: BuildLine[] = [];
    for (const l of sec.lines) {
      const sub = subs[l.id];
      if (sub) {
        // original loses its dollar contribution; replacement gains its own
        bidDelta += (sub.bid || 0) - (l.bid || 0);
        laborDelta += round2((sub.qty || 0) * (sub.laborRate || 0)) - (l.directLabor || 0);
        matDelta += round2((sub.qty || 0) * (sub.unitMaterialCost || 0)) - (l.material || 0);
        // original: struck through in red, no dollar contribution
        lines.push({ ...l, substitutedOriginal: true, directLabor: 0, material: 0, bid: 0 });
        // replacement: green, carries the substitution's economics
        lines.push({
          id: `sub:${l.id}`,
          kind: sub.itemType === "labor" ? "labor" : sub.itemType === "material" ? "material" : "custom",
          key: `sub:${l.id}`,
          name: sub.name || l.name,
          descriptor: `Substitute for ${l.name}`,
          qty: round2(sub.qty || 0),
          unit: sub.unit || l.unit,
          rate: round2(sub.unitMaterialCost || 0),
          directLabor: round2((sub.qty || 0) * (sub.laborRate || 0)),
          material: round2((sub.qty || 0) * (sub.unitMaterialCost || 0)),
          bid: round2(sub.bid || 0),
          removable: true,
          isSubstitute: true,
          unitMaterialCost: sub.unitMaterialCost || 0,
          laborRate: sub.laborRate || 0,
        });
      } else {
        lines.push(l);
      }
    }
    // manual reorder, if a saved order exists for this section
    const ord = order[sec.id];
    if (ord && ord.length) {
      const idx = new Map(ord.map((id, i) => [id, i] as const));
      lines = [...lines].sort((a, b) => (idx.get(a.id) ?? 1e9) - (idx.get(b.id) ?? 1e9));
    }
    return { ...sec, lines };
  });

  const directLabor = build.directLabor + laborDelta;
  const materialSubtotal = build.materialSubtotal + matDelta;
  const totalCost = build.totalCost + laborDelta + matDelta;
  const totalEstimateValue = build.totalEstimateValue + bidDelta;
  const grossProfit = totalEstimateValue - build.materialTax - totalCost;
  const denom = totalEstimateValue - build.materialTax;
  const marginPct = denom > 0 ? (grossProfit / denom) * 100 : 0;

  return {
    ...build,
    sections,
    directLabor: round2(directLabor),
    materialSubtotal: round2(materialSubtotal),
    totalCost: round2(totalCost),
    totalEstimateValue: round2(totalEstimateValue),
    grossProfit: round2(grossProfit),
    marginPct,
  };
}

/* create a fresh custom line for "+ Add Line" */
let _cuid = 0;
export function newCustomLine(section: string): CustomLine {
  _cuid++;
  return {
    id: `custom:${Date.now()}-${_cuid}`,
    section, name: "", qty: 0, unit: "EA",
    unitMaterialCost: 0, laborRate: 0, bid: 0,
  };
}
