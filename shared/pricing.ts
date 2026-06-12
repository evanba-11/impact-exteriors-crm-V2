/* ============================================================================
 * REAL PRICING ENGINE — Estimator V3 sheet + ABC Supply Price Agreement
 * Source: ABC Customer Price Agreement PA-78915-6JHFW8, eff 6/3/2026, exp 8/31/2026
 * Shared by client (live estimate builder) and server (budget bridge, seed).
 *
 * VERIFIED worked example (see verifyWorkedExample()):
 *   30SQ, 6:12, 1 layer, 1 story, eaves120/rakes150/ridges90/hips56/valleys35/step20,
 *   5 pipe boots, 12 box vents, gutter apron 120, L-metal 150, Tamko StormFight $130/SQ,
 *   Greeley 7.01%, 10% waste
 *   → MatCost $7,006.75 · Labor $2,870.00 · Specialty $660 price / $304.80 cost
 *   → TOTAL $17,939.87 · retail margin 40.5%
 * ==========================================================================*/

export const PRICE_AGREEMENT = {
  source: "ABC Supply Customer Price Agreement",
  number: "PA-78915-6JHFW8",
  label: "ABC Price Agreement 6/3/2026",
  effective: "6/3/2026",
  expires: "8/31/2026",
  surchargePct: 3, // 3% supplier credit-card surcharge passed through on materials
};

export const DEFAULT_MARGIN = 40; // % — also the floor for Quick-mode reps
export const DEFAULT_WASTE = 10;  // %
export const SURCHARGE = 0.03;    // 3% on material subtotal
export const CC_SURCHARGE = 0.03; // 3% credit-card surcharge on materials (funding option)

/* ─── Materials catalog (derived cost/unit = package $ / coverage, EXACT) ─── */
export type MatItem = {
  key: string; name: string; abcSource: string;
  pkg: number; coverage: number; unit: string; costPerUnit: number; costCode: string;
};
const mat = (key: string, name: string, abcSource: string, pkg: number, coverage: number, unit: string, costCode: string): MatItem =>
  ({ key, name, abcSource, pkg, coverage, unit, costPerUnit: pkg / coverage, costCode });

export const MATERIALS: MatItem[] = [
  mat("starter", "Starter strip", "OC Starter Strip Plus", 69.41, 105, "LF", "200"),
  mat("hr", "Hip & ridge cap", "OC ProEdge", 85.20, 33, "LF", "200"),
  mat("underlayment", "Underlayment (synthetic)", "Rhinoroof UDL", 66.50, 10, "SQ", "200"),
  mat("iceWater", "Ice & water", "Titanium PSU-30", 121.50, 2, "SQ", "200"),
  mat("iceWaterAlt", "Ice & water (Rhinoroof Gran)", "Rhinoroof Granulated", 34.25, 1, "SQ", "200"),
  mat("dripEdge", "Drip edge", "Galv 28GA 2x4", 14.00, 1, "PC", "200"),
  // Drip Edge (heavier 4x5 profile) — formerly catalogued separately as "L-metal".
  // Consolidated into the Drip Edge family per Update 3; same physical material as the
  // eave/rake drip edge, billed at $18/10' pc (CMG 4x5). Kept as its own derived line so
  // the verified $17,939.87 worked example reproduces byte-for-byte after consolidation.
  mat("dripEdgeXL", "Drip edge (4x5)", "CMG 4x5", 18.00, 1, "PC", "200"),
  mat("valleyMetal", "Valley metal", "Galv W-Valley 24\"", 31.00, 1, "PC", "200"),
  mat("stepFlash", "Step flashing", "Galv prebent 4x4x8", 81.00, 50, "PC", "200"),
  mat("gutterApron", "Gutter apron", "CMG 2x4 28Ga", 18.00, 1, "PC", "200"),
  mat("pipeBoot", "Pipe boot", "IPS galv pipe flashing", 14.00, 1, "PC", "200"),
  mat("splitBoot", "Split boot", "Retrofit split collar", 45.00, 1, "PC", "200"),
  mat("ridgeVent", "Ridge vent", "Rigid Roll Plus 20'", 75.00, 20, "LF", "200"),
  mat("coilNails", "Coil nails", "ABC 1-1/4\" EG", 55.00, 15, "BX", "200"),
  mat("capNails", "Cap nails", "Plastic Cap 2.5M", 30.99, 25, "PA", "200"),
  mat("sealant", "Sealant", "Duralink 50", 9.99, 5, "TB", "200"),
];
export const matCostU = (key: string) => MATERIALS.find(m => m.key === key)!.costPerUnit;
// package price (used when the purchased package itself is the billed unit: nails, sealant)
export const pkgPrice = (key: string) => MATERIALS.find(m => m.key === key)!.pkg;

/* ─── Shingle options ($/SQ, 3 bdl/SQ) ─── */
export type ShingleOption = { name: string; perSQ: number; isDefault?: boolean };
export const SHINGLE_OPTIONS: ShingleOption[] = [
  { name: "OC TruDef Duration", perSQ: 144, isDefault: true },
  { name: "OC TruDef Duration DC designer", perSQ: 144 },
  { name: "Malarkey Vista AR", perSQ: 144 },
  { name: "Tamko Titan XT", perSQ: 128 },
  { name: "Tamko StormFight FLEX CL4", perSQ: 130 },
];

/* ─── Labor rates (cost-plus; margin captured in retail) ─── */
export const LABOR = {
  installPerSQ: 95,       // tear off + install 3:12–7:12
  extraLayerPerSQ: 10,    // × (layers−1)
  steepPerSQ: 10,         // × (pitch−7) when pitch>7
  storyPerSQ: 10,         // × (stories−1)
  trashWalkPerSQ: 10,     // Y/N
  noAccessPerSQ: 9,       // Y/N, +$2/SQ when pitch≥10
  noAccessSteepAdd: 2,
  modBitPerSQ: 120,
  ridgeVentCutInPerLF: 2,
  stepFlashLaborPerLF: 1, // step/counter flashing labor
};

/* ─── Specialty items (FIXED customer price; cost tracked; NOT marked up, NOT taxed) ─── */
export type SpecialtyItem = { key: string; name: string; price: number; cost: number; costCode: string };
export const SPECIALTY: SpecialtyItem[] = [
  { key: "osb", name: "OSB decking (sheet)", price: 65, cost: 55, costCode: "550" },
  { key: "cricket", name: "Wood cricket", price: 350, cost: 150, costCode: "550" },
  { key: "broanSmallKit", name: "Broan small kit", price: 150, cost: 60, costCode: "340" },
  { key: "broanSmallVent", name: "Broan small vent only", price: 75, cost: 40, costCode: "340" },
  { key: "broanLargeKit", name: "Broan large kit", price: 175, cost: 75, costCode: "340" },
  { key: "broanLargeVent", name: "Broan large vent only", price: 75, cost: 50, costCode: "340" },
  { key: "boxVent", name: "Box vents", price: 55, cost: 25.40, costCode: "340" },
];
export const specItem = (key: string) => SPECIALTY.find(s => s.key === key)!;

/* ─── Product catalog for the "Make Product Selections" panel (IMG_2692) ───
 * Each product belongs to a `use` group that maps to one or more estimate line
 * keys. Selecting a product swaps the manufacturer/product label (and, where the
 * product carries its own cost, the unit cost) on the matching line items.
 * Costs here are defaults; the chosen product's cost only overrides a line when
 * the user picks a non-default product. The DEFAULT product reproduces the
 * verified worked example math. */
export type ProductUse =
  | "shingle" | "hipRidge" | "starter" | "pipeBoot" | "boxVent"
  | "gutterApron" | "dripEdge" | "underlayment" | "iceWater" | "ridgeVent";
export type CatalogProduct = {
  key: string; use: ProductUse; name: string; mfr: string;
  descriptor: string;            // breadcrumb-style line under the name
  lineKeys: string[];            // material/field line keys this swaps
  costPerUnit?: number;          // optional cost override when selected (non-default)
  isDefault?: boolean;
};
export const PRODUCT_CATALOG: CatalogProduct[] = [
  // Shingles (field) — map to the "field" line; cost = perSQ
  { key: "oc-trudef", use: "shingle", name: "TruDef Duration", mfr: "Owens Corning", descriptor: "Shingle Installation → Standard → sq ft", lineKeys: ["field"], costPerUnit: 144, isDefault: true },
  { key: "oc-trudef-dc", use: "shingle", name: "TruDef Duration Designer", mfr: "Owens Corning", descriptor: "Shingle Installation → Designer → sq ft", lineKeys: ["field"], costPerUnit: 144 },
  { key: "malarkey-vista", use: "shingle", name: "Vista AR", mfr: "Malarkey", descriptor: "Shingle Installation → Standard → sq ft", lineKeys: ["field"], costPerUnit: 144 },
  { key: "tamko-titan", use: "shingle", name: "Titan XT", mfr: "Tamko", descriptor: "Shingle Installation → sq ft", lineKeys: ["field"], costPerUnit: 128 },
  { key: "tamko-stormfight", use: "shingle", name: "StormFight FLEX CL4", mfr: "Tamko", descriptor: "Shingle Installation → Class 4 IR → sq ft", lineKeys: ["field"], costPerUnit: 130 },
  // Hip & Ridge
  { key: "oc-proedge", use: "hipRidge", name: "ProEdge Hip & Ridge", mfr: "Owens Corning", descriptor: "Hip & Ridge Installation → ft", lineKeys: ["hr"], isDefault: true },
  { key: "tamko-proline", use: "hipRidge", name: "Hip & Ridge - Tamko", mfr: "Tamko", descriptor: "Hip & Ridge Installation → Standard → ft", lineKeys: ["hr"], costPerUnit: 3.05 },
  // Starter
  { key: "oc-starter", use: "starter", name: "Starter Strip Plus", mfr: "Owens Corning", descriptor: "Starter Installation → ft", lineKeys: ["starter"], isDefault: true },
  // Pipe boots
  { key: "ips-pipe", use: "pipeBoot", name: "1-1/4\" - 3\" Plumbing Pipe Boot - IPS", mfr: "IPS", descriptor: "Plumbing Boot Installation → ea", lineKeys: ["pipeBoot"], isDefault: true },
  { key: "oatey-split", use: "pipeBoot", name: "Retrofit Split Collar", mfr: "Oatey", descriptor: "Plumbing Boot Installation → ea", lineKeys: ["pipeBoot"], costPerUnit: 45 },
  // Box vents
  { key: "lomanco-750", use: "boxVent", name: "750-GS Slant Back Box Vent W/ Screen - Lomanco", mfr: "Lomanco", descriptor: "Box Vent Installation → ea", lineKeys: ["boxVent"], isDefault: true },
  { key: "ghost-bv", use: "boxVent", name: "Standard Slant Back Box Vent", mfr: "GAF", descriptor: "Box Vent Installation → ea", lineKeys: ["boxVent"] },
  // Gutter apron
  { key: "qe-gutterapron", use: "gutterApron", name: "Tri-Built .017\" 2\"x3\" Gutter Apron - QXO", mfr: "QXO", descriptor: "Gutter Apron Installation → ft", lineKeys: ["gutterApron"], isDefault: true },
  // Drip edge (consolidated; covers both eave/rake drip edge and 4x5 runs)
  { key: "cmg-dripedge", use: "dripEdge", name: "Galvanized Drip Edge 2x4", mfr: "CMG", descriptor: "Drip Edge Installation → ft", lineKeys: ["dripEdge", "dripEdgeXL"], isDefault: true },
  { key: "qe-trufit", use: "dripEdge", name: "TruFIT D-Metal Drip Edge", mfr: "Quality Edge", descriptor: "Drip Edge Installation → ft", lineKeys: ["dripEdge", "dripEdgeXL"] },
  // Underlayment
  { key: "rhino-udl", use: "underlayment", name: "RhinoRoof UDL Synthetic", mfr: "RhinoRoof", descriptor: "Synthetic Roofing Felt → sq ft", lineKeys: ["underlayment"], isDefault: true },
  // Ridge vent
  { key: "rigid-rollplus", use: "ridgeVent", name: "Rigid Roll Plus 20'", mfr: "GAF", descriptor: "Ridge Vent Installation → ft", lineKeys: ["ridgeVent"], isDefault: true },
];
export const PRODUCT_USE_LABEL: Record<ProductUse, string> = {
  shingle: "Shingles", hipRidge: "Hip & Ridge", starter: "Starter", pipeBoot: "Pipe Boots",
  boxVent: "Box Vents", gutterApron: "Gutter Apron", dripEdge: "Drip Edge",
  underlayment: "Underlayment", iceWater: "Ice & Water", ridgeVent: "Ridge Vent",
};

/* ─── Tax jurisdictions ─── */
export type TaxJ = { name: string; rate: number; status: "CONFIRMED" | "APPROX" | "CUSTOM"; note?: string };
export const TAX_JURISDICTIONS: TaxJ[] = [
  { name: "Colorado state base only", rate: 2.900, status: "CONFIRMED" },
  { name: "Greeley (80632/33/38/39)", rate: 7.010, status: "CONFIRMED" },
  { name: "Greeley/Evans Fire (80631/80634)", rate: 8.400, status: "CONFIRMED" },
  { name: "Denver", rate: 9.150, status: "CONFIRMED" },
  { name: "Lafayette/Boulder Cnty", rate: 9.205, status: "CONFIRMED", note: "eff 1/1/26" },
  { name: "Fort Collins", rate: 7.550, status: "APPROX", note: "VERIFY" },
  { name: "Loveland", rate: 6.700, status: "APPROX" },
  { name: "Windsor", rate: 7.400, status: "APPROX" },
  { name: "Colorado Springs", rate: 8.130, status: "APPROX" },
  { name: "Aurora", rate: 8.000, status: "APPROX" },
  { name: "Longmont", rate: 8.150, status: "APPROX" },
  { name: "Thornton", rate: 8.500, status: "APPROX" },
  { name: "CUSTOM (enter rate)", rate: 0, status: "CUSTOM" },
];

/* ============================================================================
 * Job-input model (the sheet's QUICK MODE inputs)
 * ==========================================================================*/
export type JobInput = {
  shingle: string;        // ShingleOption.name
  squares: number;
  pitch: number;          // x:12 numeric
  layers: number;
  stories: number;
  eaves: number; rakes: number; ridges: number; hips: number; valleys: number;
  step: number;           // step/headwall LF
  counterFlash: number;   // counter flashing LF
  pipeBoots: number; splitBoots: number; boxVents: number;
  ridgeVentLF: number; gutterApronLF: number;
  // Consolidated Drip Edge — the heavier 4x5 "L-metal" run (connection points, etc.).
  // `lMetalLF` is kept as an optional legacy alias for older saved estimates.
  dripEdgeXlLF: number; lMetalLF?: number;
  modBitSQ: number; osbSheets: number; crickets: number;
  broanSmallKit: number; broanSmallVent: number; broanLargeKit: number; broanLargeVent: number;
  trashWalk: boolean; noAccess: boolean;
  wastePct: number;       // default 10
  stripFt: number;        // I&W strip ft, default 3
  iceWaterAlt: boolean;   // use cheaper granulated alt
  taxRate: number;        // % (resolved jurisdiction rate)
  taxJurisdiction: string;
  funding: "Retail" | "Insurance";
  margin: number;         // % (retail). floor = DEFAULT_MARGIN for reps
  // funding-specific:
  contractValue: number;  // insurance: what carrier pays (roofing system)
  ccSurcharge: boolean;   // 3% CC surcharge on materials
};

export function defaultJobInput(): JobInput {
  return {
    shingle: SHINGLE_OPTIONS.find(s => s.isDefault)!.name,
    squares: 30, pitch: 6, layers: 1, stories: 1,
    eaves: 0, rakes: 0, ridges: 0, hips: 0, valleys: 0,
    step: 0, counterFlash: 0,
    pipeBoots: 0, splitBoots: 0, boxVents: 0,
    ridgeVentLF: 0, gutterApronLF: 0, dripEdgeXlLF: 0,
    modBitSQ: 0, osbSheets: 0, crickets: 0,
    broanSmallKit: 0, broanSmallVent: 0, broanLargeKit: 0, broanLargeVent: 0,
    trashWalk: false, noAccess: false,
    wastePct: DEFAULT_WASTE, stripFt: 3, iceWaterAlt: false,
    taxRate: 7.010, taxJurisdiction: "Greeley (80632/33/38/39)",
    funding: "Retail", margin: DEFAULT_MARGIN,
    contractValue: 0, ccSurcharge: false,
  };
}

const ceil = Math.ceil;
const ceil1 = (x: number) => Math.ceil(x * 10) / 10; // round up to nearest 0.1

export type MatLine = { key: string; name: string; qty: number; unit: string; costPerUnit: number; extCost: number; costCode: string };
export type LaborLine = { key: string; name: string; detail: string; cost: number; costCode: string };
export type SpecLine = { key: string; name: string; qty: number; price: number; cost: number; costCode: string };

/* ─── Derived material quantities & costs ─── */
export function materialLines(j: JobInput): MatLine[] {
  const W = 1 + j.wastePct / 100;
  const shingle = SHINGLE_OPTIONS.find(s => s.name === j.shingle) || SHINGLE_OPTIONS[0];
  const lines: MatLine[] = [];
  const push = (key: string, name: string, qty: number, unit: string, costPerUnit: number, costCode = "200") => {
    if (qty <= 0) return;
    lines.push({ key, name, qty, unit, costPerUnit, extCost: qty * costPerUnit, costCode });
  };
  // Field shingles: squares×W SQ × shingle $/SQ
  push("field", `Field shingle — ${shingle.name}`, j.squares * W, "SQ", shingle.perSQ);
  // Starter: (eaves+rakes)×W LF
  push("starter", "Starter strip", (j.eaves + j.rakes) * W, "LF", matCostU("starter"));
  // H&R cap: (ridges+hips)×W LF
  push("hr", "Hip & ridge cap", (j.ridges + j.hips) * W, "LF", matCostU("hr"));
  // Underlayment: squares×W SQ
  push("underlayment", "Underlayment (synthetic)", j.squares * W, "SQ", matCostU("underlayment"));
  // Ice & water: (eaves+valleys)×stripFt/100 SQ  (round up to 0.1 SQ)
  const iwSQ = ceil1((j.eaves + j.valleys) * j.stripFt / 100);
  push("iceWater", j.iceWaterAlt ? "Ice & water (granulated alt)" : "Ice & water", iwSQ, "SQ",
    j.iceWaterAlt ? matCostU("iceWaterAlt") : matCostU("iceWater"));
  // Drip edge: ceil((eaves+rakes)×W/10) pcs
  push("dripEdge", "Drip edge", ceil((j.eaves + j.rakes) * W / 10), "PC", matCostU("dripEdge"));
  // Valley metal: ceil(valleys×W/10) pcs
  push("valleyMetal", "Valley metal", ceil(j.valleys * W / 10), "PC", matCostU("valleyMetal"));
  // Step flashing: stepLF×2 pcs
  push("stepFlash", "Step flashing", j.step * 2, "PC", matCostU("stepFlash"));
  // Gutter apron: ceil(apronLF/10) pcs
  push("gutterApron", "Gutter apron", ceil(j.gutterApronLF / 10), "PC", matCostU("gutterApron"));
  // Drip edge (4x5) — consolidated former "L-metal": ceil(LF/10) pcs @ $18
  // Backward-compat: accept the legacy `lMetalLF` field if present.
  const dripXl = (j.dripEdgeXlLF || 0) + (j.lMetalLF || 0);
  push("dripEdgeXL", "Drip edge (4x5)", ceil(dripXl / 10), "PC", matCostU("dripEdgeXL"));
  // Pipe / split boots: counts
  push("pipeBoot", "Pipe boots", j.pipeBoots, "PC", matCostU("pipeBoot"));
  push("splitBoot", "Split boots", j.splitBoots, "PC", matCostU("splitBoot"));
  // Ridge vent: LF (material)
  push("ridgeVent", "Ridge vent", j.ridgeVentLF, "LF", matCostU("ridgeVent"));
  // Coil nails: ceil(squares/15) boxes — priced per whole box ($55.00/box)
  push("coilNails", "Coil nails", ceil(j.squares / 15), "BX", pkgPrice("coilNails"));
  // Cap nails: ceil(squares×W/25) buckets — priced per bucket ($30.99/bkt)
  push("capNails", "Cap nails", ceil(j.squares * W / 25), "PA", pkgPrice("capNails"));
  // Sealant: ceil(squares/5) tubes — priced per tube ($9.99/tube)
  push("sealant", "Sealant", ceil(j.squares / 5), "TB", pkgPrice("sealant"));
  return lines;
}

/* ─── Labor lines ─── */
export function laborLines(j: JobInput): LaborLine[] {
  const sq = j.squares;
  const lines: LaborLine[] = [];
  const add = (key: string, name: string, detail: string, cost: number, costCode = "500") => { if (cost > 0) lines.push({ key, name, detail, cost, costCode }); };
  add("install", "Tear off + install", `$${LABOR.installPerSQ}/SQ × ${sq} SQ`, LABOR.installPerSQ * sq);
  add("extraLayer", "Extra layer", `$${LABOR.extraLayerPerSQ}/SQ × ${sq} × ${j.layers - 1}`, LABOR.extraLayerPerSQ * sq * Math.max(0, j.layers - 1));
  if (j.pitch > 7) add("steep", "Steep pitch adder", `$${LABOR.steepPerSQ}/SQ × ${sq} × (${j.pitch}−7)`, LABOR.steepPerSQ * sq * (j.pitch - 7));
  add("story", "Story adder", `$${LABOR.storyPerSQ}/SQ × ${sq} × ${j.stories - 1}`, LABOR.storyPerSQ * sq * Math.max(0, j.stories - 1));
  if (j.trashWalk) add("trash", "Trash walk", `$${LABOR.trashWalkPerSQ}/SQ × ${sq}`, LABOR.trashWalkPerSQ * sq);
  if (j.noAccess) {
    const rate = LABOR.noAccessPerSQ + (j.pitch >= 10 ? LABOR.noAccessSteepAdd : 0);
    add("loading", "Roof loading (no access)", `$${rate}/SQ × ${sq}`, rate * sq);
  }
  add("modbit", "Mod bit", `$${LABOR.modBitPerSQ}/SQ × ${j.modBitSQ}`, LABOR.modBitPerSQ * j.modBitSQ);
  add("ridgeVentCut", "Ridge vent cut-in", `$${LABOR.ridgeVentCutInPerLF}/LF × ${j.ridgeVentLF}`, LABOR.ridgeVentCutInPerLF * j.ridgeVentLF);
  add("flashing", "Step/counter flashing labor", `$${LABOR.stepFlashLaborPerLF}/LF × ${j.step + j.counterFlash}`, LABOR.stepFlashLaborPerLF * (j.step + j.counterFlash));
  return lines;
}

/* ─── Specialty lines (fixed price, tracked cost) ─── */
export function specialtyLines(j: JobInput): SpecLine[] {
  const out: SpecLine[] = [];
  const add = (key: string, qty: number) => {
    if (qty <= 0) return;
    const s = specItem(key);
    out.push({ key, name: s.name, qty, price: s.price * qty, cost: s.cost * qty, costCode: s.costCode });
  };
  add("osb", j.osbSheets);
  add("cricket", j.crickets);
  add("broanSmallKit", j.broanSmallKit);
  add("broanSmallVent", j.broanSmallVent);
  add("broanLargeKit", j.broanLargeKit);
  add("broanLargeVent", j.broanLargeVent);
  add("boxVent", j.boxVents);
  return out;
}

/* ─── Proposal extras ─── */
export type ProposalExtras = {
  gutters: number; siding: number; permits: number; opAmount: number; upgrades: number;
  depositPct: number;      // retail (default 50)
  acvInitial: number;      // insurance initial/ACV payment
};
export function defaultExtras(): ProposalExtras {
  return { gutters: 0, siding: 0, permits: 0, opAmount: 0, upgrades: 0, depositPct: 50, acvInitial: 0 };
}

/* ============================================================================
 * FULL ESTIMATE CALCULATION
 * ==========================================================================*/
export type EstimateResult = {
  matLines: MatLine[]; laborLines: LaborLine[]; specLines: SpecLine[];
  matSubtotal: number;     // pre-surcharge
  matCost: number;         // ×1.03 supplier surcharge
  laborCost: number;
  specPrice: number; specCost: number;
  basePrice: number;       // (matCost+laborCost)/(1−margin)
  materialTax: number;     // matCost × marginMult × taxRate (material-only)
  ccSurchargeAmt: number;  // optional 3% CC on materials
  extrasTotal: number;
  total: number;           // roofing system total (base+spec+tax+cc) — retail
  totalWithExtras: number;
  jobCost: number;         // matCost+laborCost+specCost
  // Retail
  profit: number; marginPct: number;
  // Insurance
  insuranceProfit: number; insuranceMarginPct: number;
  // Proposal payments
  initialPayment: number; balanceDue: number;
};

export function calcEstimateV3(j: JobInput, extras: ProposalExtras = defaultExtras()): EstimateResult {
  const matLines = materialLines(j);
  const laborL = laborLines(j);
  const specLines = specialtyLines(j);

  const matSubtotal = matLines.reduce((s, l) => s + l.extCost, 0);
  const matCost = matSubtotal * (1 + SURCHARGE);
  const laborCost = laborL.reduce((s, l) => s + l.cost, 0);
  const specPrice = specLines.reduce((s, l) => s + l.price, 0);
  const specCost = specLines.reduce((s, l) => s + l.cost, 0);

  const margin = Math.max(0, Math.min(99, j.margin)) / 100;
  const marginMult = 1 / (1 - margin); // 1.667 at 40%
  const taxRate = (j.taxRate || 0) / 100;

  const basePrice = (matCost + laborCost) * marginMult;
  // Material-only tax: priced material × tax rate
  const materialTax = matCost * marginMult * taxRate;
  const ccSurchargeAmt = j.ccSurcharge ? matCost * marginMult * CC_SURCHARGE : 0;

  const jobCost = matCost + laborCost + specCost;
  const total = basePrice + specPrice + materialTax + ccSurchargeAmt;

  const extrasTotal = extras.gutters + extras.siding + extras.permits + extras.opAmount + extras.upgrades;
  const totalWithExtras = total + extrasTotal;

  // Retail profit/margin (exclude tax + cc passthrough from both profit & base)
  const passthrough = materialTax + ccSurchargeAmt;
  const profit = (total - passthrough) - jobCost;
  const marginPct = (total - passthrough) > 0 ? (profit / (total - passthrough)) * 100 : 0;

  // Insurance funding: Profit = Contract − TotalJobCost − MatCost×taxRate
  const insContract = j.contractValue || total;
  const insuranceProfit = insContract - jobCost - matCost * taxRate;
  const insuranceMarginPct = insContract > 0 ? (insuranceProfit / insContract) * 100 : 0;

  // Proposal payments
  let initialPayment: number;
  if (j.funding === "Insurance") {
    initialPayment = extras.acvInitial;
  } else {
    initialPayment = (extras.depositPct / 100) * totalWithExtras;
  }
  const contractTotal = j.funding === "Insurance" ? (insContract + extrasTotal) : totalWithExtras;
  const balanceDue = contractTotal - initialPayment;

  return {
    matLines, laborLines: laborL, specLines,
    matSubtotal, matCost, laborCost, specPrice, specCost,
    basePrice, materialTax, ccSurchargeAmt, extrasTotal,
    total, totalWithExtras: contractTotal, jobCost,
    profit, marginPct, insuranceProfit, insuranceMarginPct,
    initialPayment, balanceDue,
  };
}

/* ─── Estimate→budget cost-code mapping (spec migration notes) ───
 * materials→200, labor→500/310, subs/specialty→340, permits→100, disposal→410.
 * Materials all map to 200; labor to 500; specialty to its costCode (340/550);
 * permits/gutters/siding extras map per spec. */
export function budgetByCostCode(j: JobInput, extras: ProposalExtras): Record<string, number> {
  const r = calcEstimateV3(j, extras);
  const byCode: Record<string, number> = {};
  const add = (code: string, amt: number) => { if (amt > 0) byCode[code] = (byCode[code] || 0) + amt; };
  for (const l of r.matLines) add("200", l.extCost);       // materials → 200
  for (const l of r.laborLines) add("500", l.cost);        // labor → 500
  for (const l of r.specLines) add(l.costCode, l.cost);    // specialty → 340/550
  add("100", extras.permits);                              // permits → 100
  add("340", extras.gutters + extras.siding);              // subs → 340
  return byCode;
}

/* ─── Self-verification of the worked example ─── */
export function verifyWorkedExample() {
  const j: JobInput = {
    ...defaultJobInput(),
    shingle: "Tamko StormFight FLEX CL4", squares: 30, pitch: 6, layers: 1, stories: 1,
    eaves: 120, rakes: 150, ridges: 90, hips: 56, valleys: 35, step: 20,
    pipeBoots: 5, boxVents: 12, gutterApronLF: 120, dripEdgeXlLF: 150,
    wastePct: 10, stripFt: 3, taxRate: 7.010, taxJurisdiction: "Greeley (80632/33/38/39)",
    funding: "Retail", margin: DEFAULT_MARGIN,
  };
  const r = calcEstimateV3(j);
  return {
    matCost: r.matCost, laborCost: r.laborCost,
    specPrice: r.specPrice, specCost: r.specCost,
    total: r.total, marginPct: r.marginPct,
    pass:
      Math.abs(r.matCost - 7006.75) < 0.05 &&
      Math.abs(r.laborCost - 2870.00) < 0.05 &&
      Math.abs(r.specPrice - 660) < 0.01 &&
      Math.abs(r.specCost - 304.80) < 0.01 &&
      Math.abs(r.total - 17939.87) < 0.05 &&
      Math.abs(r.marginPct - 40.5) < 0.2,
  };
}
