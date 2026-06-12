/* ============================================================================
 * Data-driven Quick Template definitions (Update 5).
 *
 * Each job type maps to a Quick Template that opens with ALL its sections and
 * line items visible. Items render as blank rows (qty 0 = no cost, omitted from
 * the proposal) until a quantity is entered. Every line carries an editable qty,
 * unit (with alternates in a dropdown), unit cost, labor rate, and bid — the
 * same field model as the shingle re-roof template.
 *
 * The shingle re-roof template is NOT defined here — it stays engine-driven in
 * build-model.ts so the verified $17,939.87 worked example reproduces exactly.
 * This module supplies the four NEW roster-only templates plus shared metadata.
 * ==========================================================================*/

/* Full unit dropdown options for any template line / "+ Add Line" row. */
export const ALL_UNIT_OPTIONS = ["SQ", "SF", "LF", "EA", "Flat", "HR", "Day", "Week", "%", "Sheet", "Stick"] as const;
export type Unit = string;

/* A single template line item.
 *   unit       — default unit (the FIRST when source says "X or Y")
 *   altUnits   — alternate units offered in the dropdown
 *   defaultCost— optional pre-filled unit cost (from existing catalog where matched);
 *                otherwise 0 (editable $0 placeholder). Never invented pricing.
 *   isPct      — true when the unit is "%": bid computes as % of estimate subtotal. */
export type TemplateLine = {
  name: string;
  unit: Unit;
  altUnits?: Unit[];
  defaultCost?: number;
  isPct?: boolean;
};

export type TemplateSection = {
  title: string;
  lines: TemplateLine[]; // may be empty (renders as empty section with "+ Add Line")
};

export type QuickTemplate = {
  key: string;
  jobType: string;       // canonical JOB_TYPES value this template auto-binds to
  name: string;          // display name
  sections: TemplateSection[];
};

/* Helper to build a line: split "X or Y" units → default + alternates. */
const L = (name: string, unitSpec: string, defaultCost?: number): TemplateLine => {
  const parts = unitSpec.split(/\s+or\s+/i).map((u) => u.trim());
  const unit = parts[0];
  const altUnits = parts.slice(1);
  return {
    name,
    unit,
    altUnits: altUnits.length ? altUnits : undefined,
    defaultCost: defaultCost,
    isPct: unit === "%",
  };
};

/* Existing-catalog cost matches (material $/unit or labor $/unit) reused where
 * the new templates list a line we already price. Everything else is a $0
 * editable placeholder per spec (no invented pricing). */
const TEAROFF_SQ = 95;          // install/tear-off labor $/SQ (LABOR.installPerSQ)
const OSB_SHEET = 55;           // OSB decking sheet cost (SPECIALTY osb.cost)
const UNDERLAYMENT_SQ = 6.65;   // Rhinoroof UDL $/SQ (66.50/10)
const IW_SQ = 60.75;            // Titanium PSU-30 $/SQ (121.50/2)
const RIDGE_VENT_LF = 3.75;     // Rigid Roll Plus material $/LF (75/20)
const RIDGE_VENT_CUTIN_LF = 2;  // ridge vent cut-in labor $/LF
const BOX_VENT_EA = 25.40;      // box vent cost
const GUTTER_APRON_LF = 1.80;   // CMG 2x4 gutter apron ($18/10')
const DRIP_EDGE_LF = 1.40;      // Galv 28GA 2x4 drip edge ($14/10')
const STEP_FLASH_LF = 1;        // step/counter flashing labor $/LF
const PERMIT_FLAT = 285;        // permit fee

/* ───────────────────────── 1. Residential Service (REPAIR-TEMPLATE.txt) ───────────────────────── */
const RESIDENTIAL_SERVICE: QuickTemplate = {
  key: "residential-service", jobType: "Residential Service", name: "Residential Service",
  sections: [
    { title: "Tear-Off & Disposal", lines: [
      L("Tear-off, single layer shingles", "SQ", TEAROFF_SQ),
      L("Tear-off, double layer shingles", "SQ"),
      L("Tear-off, triple layer shingles", "SQ"),
      L("Tear-off, wood shake", "SQ"),
      L("Dumpster / haul-off fee", "Flat or SQ"),
      L("Dump fee overage", "EA"),
    ]},
    { title: "Decking Repair", lines: [
      L("OSB decking replacement (7/16\")", "SF or Sheet", OSB_SHEET),
      L("Plywood decking replacement (5/8\")", "SF or Sheet"),
    ]},
    { title: "Underlayment", lines: [
      L("Synthetic underlayment", "SQ", UNDERLAYMENT_SQ),
      L("High-temp underlayment (metal/tile applications)", "SQ"),
    ]},
    { title: "Ice & Water Shield", lines: [
      L("Ice & water shield — standard", "SQ", IW_SQ),
      L("Ice & water shield — high-temp", "SQ"),
      L("Ice & water shield — valleys only", "LF"),
      L("Ice & water shield — eaves only", "LF"),
      L("Ice & water shield — full roof", "SQ"),
    ]},
    { title: "Shingles", lines: [
      L("3-tab shingles", "SQ"),
      L("Architectural shingles", "SQ"),
      L("Impact-resistant shingles (Class 4)", "SQ"),
      L("Designer / premium shingles", "SQ"),
      L("Partial shingle replacement (repair section)", "SQ or EA"),
    ]},
    { title: "Ridge System", lines: [
      L("Standard ridge cap shingles", "LF or SQ"),
      L("High-profile ridge cap", "LF"),
      L("Ridge vent (shingle-over)", "LF"),
    ]},
    { title: "Starter Strip", lines: [
      L("Starter strip — eaves", "LF"),
      L("Starter strip (wind warranty) — rakes", "LF"),
      L("Starter strip — full perimeter", "LF"),
    ]},
    { title: "Drip Edge", lines: [
      L("Gutter Apron — eaves", "LF", GUTTER_APRON_LF),
      L("Drip edge — rakes", "LF", DRIP_EDGE_LF),
    ]},
    { title: "Flashing", lines: [
      L("Step flashing", "LF", STEP_FLASH_LF),
      L("Counter flashing", "LF"),
      L("Headwall / apron flashing", "LF"),
      L("Valley flashing — open metal", "LF"),
      L("Valley flashing — closed cut (material only)", "LF"),
      L("Chimney flashing — base", "LF"),
      L("Chimney flashing — counter / cap", "LF"),
      L("Chimney cricket", "EA"),
      L("Skylight flashing", "EA"),
      L("Dormer flashing", "LF"),
      L("Wall flashing", "LF"),
    ]},
    { title: "Penetrations", lines: [
      L("Pipe boot / plumbing flashing (standard)", "EA"),
      L("Pipe boot — high-temp", "EA"),
      L("HVAC/Swamp Cooler curb flashing", "EA"),
      L("Exhaust cap / hood", "EA"),
    ]},
    { title: "Ventilation", lines: [
      L("Ridge vent", "LF", RIDGE_VENT_LF),
      L("Box vent", "EA", BOX_VENT_EA),
      L("Soffit vent", "EA"),
      L("Gable vent", "EA"),
      L("Power attic vent", "EA"),
      L("Intake vent (under-eave strip)", "LF"),
      L("Broan Vent", "EA"),
    ]},
    { title: "Gutters & Accessories", lines: [
      L("Gutter — 5\" K-style", "LF"),
      L("Gutter — 6\" K-style", "LF"),
      L("Gutter — half-round", "LF"),
      L("Downspout", "EA or LF"),
      L("Gutter guard / leaf protection", "LF"),
      L("End caps", "EA"),
      L("Rain Diverter", "EA"),
    ]},
    { title: "Fascia & Soffit", lines: [
      L("Fascia board replacement", "LF"),
      L("Fascia wrap (aluminum coil)", "LF"),
      L("Soffit panel replacement", "SF"),
      L("Soffit vent", "EA"),
    ]},
    { title: "Miscellaneous / Additional Work", lines: [
      L("Caulking / sealant", "LF or Flat"),
      L("Roofing cement / flashing sealant", "EA"),
      L("Satellite dish removal & reset", "EA"),
      L("Solar panel removal & reset", "EA"),
      L("Permit fee", "Flat", PERMIT_FLAT),
      L("Additional labor", "HR"),
    ]},
    { title: "Emergency Services", lines: [
      L("Emergency tarp", "SQ or Flat"),
      L("Tarp removal", "Flat"),
      L("Emergency service call fee", "Flat"),
      L("After-hours surcharge", "%"),
    ]},
  ],
};

/* ───────────────────────── 2. Soffit/Fascia/Gutters (GUTTER-ESTIMATE.txt) ───────────────────────── */
const GUTTERS: QuickTemplate = {
  key: "gutters", jobType: "Soffit/Fascia/Gutters", name: "Soffit / Fascia / Gutters",
  sections: [
    { title: "Gutter Removal & Disposal", lines: [
      L("Remove existing gutters", "LF"),
      L("Remove existing downspouts", "EA or LF"),
      L("Remove existing gutter guards / screens", "LF"),
      L("Haul-off / disposal fee", "Flat"),
      L("Dumpster fee", "Flat"),
    ]},
    { title: "Gutters", lines: [
      L("5\" K-style aluminum gutter", "LF"),
      L("6\" K-style aluminum gutter", "LF"),
      L("5\" K-style steel gutter", "LF"),
      L("6\" K-style steel gutter", "LF"),
      L("Box gutter (custom)", "LF"),
      L("Inside corner", "EA"),
      L("Outside corner", "EA"),
      L("End cap", "EA"),
      L("Gutter outlet / drop", "EA"),
      L("Bay Miter", "EA"),
      L("Box Miter", "EA"),
    ]},
    { title: "Downspouts", lines: [
      L("2x3 rectangular downspout", "LF or EA"),
      L("3x4 rectangular downspout", "LF or EA"),
      L("Downspout elbow (A-style)", "EA"),
      L("Downspout elbow (B-style)", "EA"),
      L("Downspout offset", "EA"),
      L("Downspout strap / bracket", "EA"),
      L("Downspout extension", "EA"),
      L("Flexible downspout extension", "EA"),
      L("Downspout buried drain connection", "EA"),
      L("Splash block", "EA"),
      L("Downspout diverter", "EA"),
    ]},
    { title: "Gutter Protection / Guards", lines: [
      L("Gutter Guards Installation", "LF"),
      L("Gutter Guard Removal", "LF"),
    ]},
    { title: "Fascia & Soffit Prep", lines: [
      L("Fascia board replacement", "LF"),
      L("Fascia wrap (aluminum coil stock)", "LF"),
      L("Rotted fascia repair", "LF"),
      L("Soffit panel repair / replacement", "SF"),
      L("Soffit vent addition", "EA"),
    ]},
    { title: "Flashing & Sealing", lines: [
      L("Gutter apron / drip edge flashing", "LF", GUTTER_APRON_LF),
      L("Kick-out flashing", "EA"),
      L("Gutter end sealant / caulk", "EA or LF"),
      L("Gutter seam sealant", "EA"),
      L("Downspout outlet seal", "EA"),
      L("Gutter re-seal (existing, full run)", "LF"),
    ]},
    { title: "Miscellaneous / Additional Work", lines: [
      L("Gutter reattachment / respiking (existing)", "LF"),
      L("Gutter realignment / re-pitch", "LF"),
      L("Gutter cleaning (pre-install or service)", "LF or Flat"),
      L("Downspout unclog / flush", "EA"),
      L("Two-story surcharge", "LF or %"),
      L("Three-story surcharge", "LF or %"),
      L("Steep pitch / difficult access surcharge", "Flat or %"),
    ]},
  ],
};

/* ───────────────────────── 3. Exterior Painting (EXTERIOR-PAINTING.txt) ─────────────────────────
 * NOTE: parent list includes Gutters & Downspouts / Deck-Porch / Foundation & Masonry paint
 * sections that the file gives NO line items for — they render as empty sections (+ Add Line only). */
const PAINTING: QuickTemplate = {
  key: "exterior-painting", jobType: "Exterior Painting", name: "Exterior Painting",
  sections: [
    { title: "Surface Prep — Cleaning", lines: [
      L("Power wash — entire exterior", "SF or Flat"),
      L("Power wash — deck / porch", "SF"),
      L("Soft wash / low-pressure wash", "SF"),
      L("Mold & mildew treatment / biocide application", "SF"),
      L("Hand scrub / brush cleaning", "HR"),
    ]},
    { title: "Surface Prep — Repair & Patching", lines: [
      L("Wood siding board replacement", "LF or EA"),
      L("Lap siding repair (partial board)", "LF"),
      L("T1-11 / panel siding repair", "SF"),
      L("Hardboard siding repair / stabilization", "SF"),
      L("Fiber cement siding repair", "LF or EA"),
      L("Wood filler / epoxy fill (rot repair)", "EA or HR"),
      L("Window trim board replacement", "LF or EA"),
      L("Door trim board replacement", "LF or EA"),
      L("Sand (bare wood / feather edges)", "SF or HR"),
    ]},
    { title: "Surface Prep — Caulking & Sealing", lines: [
      L("Caulk — siding seams / butt joints", "LF"),
      L("Caulk — window perimeter", "EA or LF"),
      L("Caulk — door perimeter", "EA or LF"),
      L("Caulk — trim to siding transitions", "LF"),
      L("Caulk — corner boards", "LF"),
      L("Caulk — penetrations (vents, pipes, fixtures)", "EA"),
      L("Caulk — masonry / foundation cracks", "LF"),
      L("Caulk — deck ledger / flashing joints", "LF"),
      L("Backer rod installation (wide gaps)", "LF"),
      L("Remove & replace failed caulk", "LF"),
    ]},
    { title: "Surface Prep — Priming", lines: [
      L("Primer — bare wood (brush / roll)", "SF"),
      L("Primer — bare wood (spray)", "SF"),
      L("Primer — spot prime (repairs only)", "SF or Flat"),
      L("Primer — full exterior (brush / roll)", "SF"),
      L("Primer — full exterior (spray)", "SF"),
    ]},
    { title: "Surface Prep — Masking & Protection", lines: [
      L("Mask windows", "EA"),
      L("Mask doors", "EA"),
      L("Mask light fixtures / outlets", "EA"),
      L("Mask HVAC / mechanical", "EA"),
      L("Plastic sheeting — landscaping / ground cover", "SF or Flat"),
      L("Drop cloth setup", "Flat"),
      L("Remove & reset shutters", "EA"),
      L("Remove & reset light fixtures", "EA"),
      L("Remove & reset house numbers / mailbox", "EA"),
      L("Tarp / protect vehicles / hardscape", "Flat"),
    ]},
    { title: "Siding — Paint Application", lines: [
      L("Paint — lap siding (brush / roll)", "SF"),
      L("Paint — lap siding (spray + back-roll)", "SF"),
      L("Paint — vertical siding / board & batten (brush / roll)", "SF"),
      L("Paint — vertical siding (spray + back-roll)", "SF"),
      L("Paint — fiber cement siding", "SF"),
      L("Paint — cedar / wood shingle siding", "SF"),
      L("Second coat — siding", "SF"),
      L("Third coat — siding", "SF"),
    ]},
    { title: "Trim — Paint Application", lines: [
      L("Paint — window trim (brush)", "EA or LF"),
      L("Paint — door trim (brush)", "EA or LF"),
      L("Paint — corner boards", "LF"),
      L("Paint — rake board", "LF"),
      L("Paint — band board / belly band", "LF"),
      L("Paint — shutters (on structure)", "EA"),
      L("Second coat — trim", "LF or EA"),
    ]},
    { title: "Doors & Windows — Paint Application", lines: [
      L("Paint — entry door (exterior face)", "EA"),
      L("Paint — entry door (both faces + jamb)", "EA"),
      L("Paint — storm door", "EA"),
      L("Paint — window sashes (exterior)", "EA"),
      L("Second coat — doors", "EA"),
    ]},
    { title: "Garage Doors — Paint Application", lines: [
      L("Paint — single garage door", "EA"),
      L("Paint — double garage door", "EA"),
      L("Paint — garage door trim / frame", "EA"),
      L("Second coat — garage door", "EA"),
    ]},
    { title: "Soffits & Fascia — Paint Application", lines: [
      L("Paint — fascia board (brush)", "LF"),
      L("Paint — soffit (brush / roll)", "SF"),
      L("Paint — soffit (spray)", "SF"),
      L("Paint — beaded soffit / tongue & groove", "SF"),
      L("Second coat — soffit & fascia", "SF or LF"),
    ]},
    // Three parent sections with NO line items per the source file — empty sections.
    { title: "Gutters & Downspouts — Paint Application", lines: [] },
    { title: "Deck / Porch — Paint Application", lines: [] },
    { title: "Foundation & Masonry — Paint Application", lines: [] },
    { title: "Miscellaneous / Additional Work", lines: [
      L("Two-story surcharge", "SF or %"),
      L("Three-story surcharge", "SF or %"),
      L("Difficult access / scaffolding", "Flat or HR"),
      L("Scaffold rental", "Day or Week"),
      L("Ladder assist", "HR"),
      L("Color change surcharge (dark to light)", "Flat or %"),
      L("Custom color / specialty finish", "Flat"),
      L("Paint disposal fee", "Flat"),
      L("Additional labor", "HR"),
      L("Touch-up visit (post-project)", "Flat"),
    ]},
  ],
};

/* ───────────────────────── 4. Commercial Service (COMMERCIAL-SERVICEROOFING.txt) ───────────────────────── */
const COMMERCIAL_SERVICE: QuickTemplate = {
  key: "commercial-service", jobType: "Commercial Service", name: "Commercial Service / Roofing",
  sections: [
    { title: "Mobilization & Access", lines: [
      L("Mobilization fee", "Flat"),
      L("Demobilization fee", "Flat"),
      L("Rooftop equipment staging", "Flat"),
      L("Lift / scissor lift rental", "Day or Week"),
      L("Crane rental", "HR or Day"),
      L("Boom lift rental", "Day"),
      L("Roof hatch access", "EA"),
      L("Interior access coordination", "HR"),
      L("Safety / fall protection setup", "Flat"),
      L("Traffic control / cone setup", "Flat"),
      L("Permitting coordination fee", "Flat"),
    ]},
    { title: "Tear-Off & Disposal", lines: [
      L("Tear-off — single-ply membrane (TPO/EPDM/PVC)", "SQ"),
      L("Tear-off — modified bitumen (1 layer)", "SQ"),
      L("Tear-off — modified bitumen (2 layer)", "SQ"),
      L("Tear-off — built-up roofing (BUR)", "SQ"),
      L("Tear-off — gravel ballast", "SQ"),
      L("Tear-off — insulation", "SQ"),
      L("Tear-off — cover board", "SQ"),
      L("Tear-off — metal panel roofing", "SQ"),
      L("Partial tear-off / cut-out (repair area)", "SF"),
      L("Dumpster fee", "Flat"),
      L("Haul-off / dump fee", "Flat"),
      L("Hazardous material (asbestos) testing", "Flat"),
      L("Asbestos abatement (sub note)", "SQ"),
    ]},
    { title: "Decking & Substrate Repair", lines: [
      L("Steel deck repair / replacement", "SF"),
      L("Steel deck rescrewing / refastening", "SF"),
      L("Concrete deck repair", "SF"),
      L("Wood decking replacement (OSB/plywood)", "SF or Sheet", OSB_SHEET),
      L("Lightweight concrete repair", "SF"),
      L("Gypsum deck repair", "SF"),
      L("Structural repair (sub note / engineer required)", "EA"),
      L("Wet insulation removal & replacement", "SF"),
      L("Core cut / moisture scan", "EA or Flat"),
      L("Infrared scan (moisture survey)", "SQ or Flat"),
    ]},
    { title: "Insulation", lines: [
      L("Polyisocyanurate (polyiso) insulation — 2\"", "SQ"),
      L("Polyisocyanurate (polyiso) insulation — 3\"", "SQ"),
      L("Polyisocyanurate (polyiso) insulation — 4\"", "SQ"),
      L("EPS insulation", "SQ"),
      L("XPS insulation", "SQ"),
      L("Tapered insulation system", "SQ"),
      L("Tapered insulation — crickets / saddles", "EA"),
      L("Insulation fasteners & plates", "SQ"),
      L("Insulation adhesive (low-rise foam)", "SQ"),
      L("Recover board over existing insulation", "SQ"),
    ]},
    { title: "Cover Board", lines: [
      L("1/2\" gypsum cover board", "SQ"),
      L("5/8\" gypsum cover board", "SQ"),
      L("1/4\" DensDeck / glass mat", "SQ"),
      L("1/2\" DensDeck", "SQ"),
      L("Wood fiber cover board", "SQ"),
      L("Perlite cover board", "SQ"),
      L("Cover board fasteners & plates", "SQ"),
      L("Cover board adhesive", "SQ"),
    ]},
    { title: "Membrane — TPO", lines: [
      L("TPO membrane — 45 mil", "SQ"),
      L("TPO membrane — 60 mil", "SQ"),
      L("TPO membrane — 80 mil", "SQ"),
      L("TPO — mechanically attached", "SQ"),
      L("TPO — fully adhered", "SQ"),
      L("TPO — ballasted", "SQ"),
      L("TPO seam weld (repair)", "LF"),
      L("TPO seam weld (new)", "LF"),
      L("TPO patch", "EA or SF"),
      L("TPO walkpad", "EA or LF"),
      L("TPO membrane warranty registration", "Flat"),
    ]},
    { title: "Membrane — EPDM", lines: [
      L("EPDM membrane — 45 mil", "SQ"),
      L("EPDM membrane — 60 mil", "SQ"),
      L("EPDM membrane — 90 mil", "SQ"),
      L("EPDM — mechanically attached", "SQ"),
      L("EPDM — fully adhered", "SQ"),
      L("EPDM — ballasted", "SQ"),
      L("EPDM splice tape repair", "LF"),
      L("EPDM lap sealant", "LF"),
      L("EPDM patch", "EA or SF"),
      L("EPDM walkpad", "EA or LF"),
      L("EPDM seam primer", "LF"),
    ]},
    { title: "Membrane — PVC", lines: [
      L("PVC membrane — 50 mil", "SQ"),
      L("PVC membrane — 60 mil", "SQ"),
      L("PVC membrane — 80 mil", "SQ"),
      L("PVC — mechanically attached", "SQ"),
      L("PVC — fully adhered", "SQ"),
      L("PVC seam weld (repair)", "LF"),
      L("PVC seam weld (new)", "LF"),
      L("PVC patch", "EA or SF"),
      L("PVC walkpad", "EA or LF"),
      L("PVC membrane warranty registration", "Flat"),
    ]},
    { title: "Membrane — Modified Bitumen", lines: [
      L("Mod bit — APP torch-down (base sheet)", "SQ"),
      L("Mod bit — APP torch-down (cap sheet)", "SQ"),
      L("Mod bit — SBS cold-applied (base sheet)", "SQ"),
      L("Mod bit — SBS cold-applied (cap sheet)", "SQ"),
      L("Mod bit — self-adhered base sheet", "SQ"),
      L("Mod bit — self-adhered cap sheet", "SQ"),
      L("Mod bit — granule surface cap", "SQ"),
      L("Mod bit — smooth surface cap", "SQ"),
      L("Mod bit patch (torch)", "EA or SF"),
      L("Mod bit patch (cold-applied)", "EA or SF"),
      L("Mod bit blister repair", "EA"),
      L("Mod bit seam re-seal", "LF"),
    ]},
    { title: "Membrane — Built-Up Roofing (BUR)", lines: [
      L("BUR — 3-ply", "SQ"),
      L("BUR — 4-ply", "SQ"),
      L("BUR — gravel surface", "SQ"),
      L("BUR — smooth surface", "SQ"),
      L("BUR — base sheet", "SQ"),
      L("Flood coat & gravel", "SQ"),
      L("BUR blister repair", "EA"),
      L("BUR patch", "SF"),
      L("BUR re-coat / rejuvenation", "SQ"),
    ]},
    { title: "Flashings & Terminations", lines: [
      L("Base flashing — TPO/PVC/EPDM", "LF"),
      L("Base flashing — mod bit", "LF"),
      L("Counter flashing", "LF"),
      L("Termination bar", "LF"),
      L("Termination bar sealant", "LF"),
      L("Wall flashing", "LF"),
      L("Coping cap flashing", "LF"),
      L("Reglet flashing", "LF"),
      L("Pitch pocket", "EA"),
      L("Pitch pocket fill", "EA"),
      L("Expansion joint cover", "LF"),
      L("Expansion joint replacement", "LF"),
      L("Parapet wall flashing", "LF"),
      L("Through-wall flashing", "LF"),
      L("Edge metal / fascia", "LF"),
      L("Gravel stop", "LF"),
    ]},
    { title: "Penetrations", lines: [
      L("Pipe boot — standard", "EA"),
      L("Pipe boot — high-temp", "EA"),
      L("Pipe boot — fabricated metal", "EA"),
      L("Pipe boot — oversized", "EA"),
      L("HVAC curb flashing", "EA"),
      L("HVAC curb replacement", "EA"),
      L("Exhaust cap / hood", "EA"),
      L("Gas line penetration flashing", "EA"),
      L("Conduit / electrical penetration", "EA"),
      L("Support pad / equipment pad", "EA"),
      L("Roof drain flashing", "EA"),
      L("Overflow drain flashing", "EA"),
      L("Vent stack flashing", "EA"),
      L("Guy wire anchor flashing", "EA"),
    ]},
    { title: "Drains & Drainage", lines: [
      L("Roof drain strainer / dome replacement", "EA"),
      L("Roof drain body replacement", "EA"),
      L("Roof drain collar / flashing", "EA"),
      L("Overflow drain installation", "EA"),
      L("Overflow drain replacement", "EA"),
      L("Scupper installation", "EA"),
      L("Scupper flashing", "EA"),
      L("Scupper screen", "EA"),
      L("Interior drain line flush / clear", "EA"),
      L("Tapered insulation to drain (cricket)", "EA"),
      L("Drain extension / sump", "EA"),
      L("Standing water remediation", "Flat or HR"),
    ]},
    { title: "Skylights & Roof Hatches", lines: [
      L("Skylight reseal / reflash", "EA"),
      L("Skylight curb reflash", "EA"),
      L("Skylight replacement — fixed", "EA"),
      L("Skylight replacement — venting", "EA"),
      L("Skylight curb rebuild", "EA"),
      L("Roof hatch reseal / reflash", "EA"),
      L("Roof hatch replacement", "EA"),
      L("Roof hatch closer / hardware", "EA"),
      L("Smoke vent reseal", "EA"),
      L("Smoke vent replacement", "EA"),
    ]},
    { title: "Sheet Metal & Copings", lines: [
      L("Coping cap — aluminum", "LF"),
      L("Coping cap — galvanized steel", "LF"),
      L("Coping cap — stainless steel", "LF"),
      L("Coping cap — copper", "LF"),
      L("Coping cap joint / splice", "EA"),
      L("Coping cap end piece", "EA"),
      L("Coping cleat", "LF"),
      L("Edge metal", "LF"),
      L("Gravel stop", "LF"),
      L("Fascia metal", "LF"),
      L("Counter flashing", "LF"),
      L("Custom sheet metal fabrication", "LF or HR"),
      L("Sheet metal sealant / joint", "LF"),
    ]},
    { title: "Coatings & Restoration", lines: [
      L("Roof coating — silicone", "SQ"),
      L("Roof coating — acrylic", "SQ"),
      L("Roof coating — polyurethane", "SQ"),
      L("Roof coating — aluminum / asphalt", "SQ"),
      L("Primer coat", "SQ"),
      L("Second coat", "SQ"),
      L("Seam reinforcement fabric", "LF or SQ"),
      L("Flashing reinforcement fabric", "LF"),
      L("Surface cleaning / prep prior to coating", "SQ"),
      L("Coating warranty registration", "Flat"),
      L("Ponding water assessment / remediation", "Flat"),
    ]},
    { title: "Miscellaneous / Additional Work", lines: [
      L("Permit fee", "Flat", PERMIT_FLAT),
      L("Re-inspection fee", "Flat"),
      L("After-hours / weekend surcharge", "% or Flat"),
      L("Emergency service call fee", "Flat"),
      L("Roof survey / condition report", "Flat"),
      L("Core cut analysis", "EA"),
      L("Infrared moisture scan", "SQ or Flat"),
      L("Engineer / consultant coordination", "HR"),
      L("Temporary roof repair / tarp", "SF or Flat"),
      L("Interior damage assessment (sub note)", "Flat"),
      L("Warranty extension / maintenance agreement", "Flat"),
      L("Travel surcharge", "Flat or HR"),
      L("Additional labor", "HR"),
    ]},
  ],
};

/* Registry: job type → roster-only Quick Template. */
export const QUICK_TEMPLATES: QuickTemplate[] = [
  RESIDENTIAL_SERVICE, GUTTERS, PAINTING, COMMERCIAL_SERVICE,
];

export function templateForJobType(jobType: string | undefined): QuickTemplate | undefined {
  return QUICK_TEMPLATES.find((t) => t.jobType === jobType);
}

/* Job types that use the engine-driven shingle re-roof Quick Template. */
export const SHINGLE_REROOF_JOB_TYPES = ["Residential Re-Roof", "Residential Insurance Re-Roof"];

/* Job types that have no Quick Template yet → fall back to Custom mode. */
export const CUSTOM_ONLY_JOB_TYPES = ["Commercial", "Siding"];

/* UI hint describing which template a job type binds to. */
export function templateHint(jobType: string): string {
  if (SHINGLE_REROOF_JOB_TYPES.includes(jobType)) return "Quick Template: Shingle Re-Roof (engine-driven).";
  const t = templateForJobType(jobType);
  if (t) return `Quick Template: ${t.name}. Enter quantities; blank lines stay off the proposal.`;
  return "No Quick Template for this job type yet — Custom mode only for now.";
}
