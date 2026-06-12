import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { money2 } from "@/lib/format";
import { calcEstimateV3, defaultExtras, defaultJobInput, type JobInput, type ProposalExtras, type EstimateResult } from "@shared/pricing";
import { computeBuild, computeTemplateBuild, defaultBuildOverrides, type BuildOverrides } from "@/lib/build-model";
import { templateForJobType, SHINGLE_REROOF_JOB_TYPES } from "@/lib/templates";
import { Printer, ArrowLeft } from "lucide-react";
import bannerPath from "@assets/banner.jpg";

/* ───────── Document chrome helpers ───────── */
const HEADER_STRIP = "Residential & Commercial Exteriors — Full Restoration and Maintenance";
const FOOTER = "Impact Exteriors LLC | 110 16th St, Ste 1460, Denver, CO 80202 | Colorado Licensed & Insured";

function Page({ n, children, cover }: { n: number; children: React.ReactNode; cover?: boolean }) {
  return (
    <div className="proposal-page bg-white text-black mx-auto shadow-xl mb-8 relative flex flex-col" data-testid={`proposal-page-${n}`}>
      {!cover && (
        <div className="text-[10px] text-neutral-500 px-[0.85in] pt-[0.55in] pb-2 italic">{HEADER_STRIP}</div>
      )}
      <div className={cover ? "flex-1 flex flex-col" : "flex-1 px-[0.85in] pt-2"}>{children}</div>
      <div className="flex items-end justify-between px-[0.85in] pb-[0.5in] pt-3 text-[9px] text-neutral-500">
        <span>{FOOTER}</span>
        <span className="shrink-0 pl-3">Page {n}</span>
      </div>
    </div>
  );
}

/* Orange angled section header bar (matches PDF) */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="inline-block bg-[#E05A26] text-white font-bold uppercase tracking-wide text-[15px] px-4 py-1.5 mb-3"
      style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)", paddingRight: "1.6rem" }}
    >
      {children}
    </div>
  );
}

function Blank({ value }: { value?: string }) {
  return value
    ? <span className="font-semibold">{value}</span>
    : <span className="inline-block border-b border-black min-w-[120px]">&nbsp;</span>;
}

/* ───────── Page 6 dynamic scope (quantities-only, IMG ref) ───────── */
// Unit codes → full label shown in the proposal scope ("1922 Square Feet").
const UNIT_LABEL: Record<string, string> = {
  SQ: "Square Feet", LF: "Feet", FT: "Feet", EA: "Each", PC: "Each",
  BD: "Bundle", RL: "Roll", LS: "Lump Sum", "—": "",
};
function qtyLabel(qty: number, unit: string): string {
  const n = Math.round(qty * 100) / 100;
  const num = Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const u = UNIT_LABEL[unit] ?? unit;
  return u ? `${num} ${u}` : num.toString();
}

type ScopeRow = { name: string; qty: number; unit: string; price: number; product?: string };
type ScopeGroup = { title: string; rows: ScopeRow[]; subtotal: number };

/* Build quantities-only scope groups from the editable build model so that
   selected products surface as blue sub-lines (matching the reference PDF).
   Pricing per row is carried for the internal "Show line pricing" toggle. */
function buildScopeGroups(est: any, res: EstimateResult, ji: JobInput, jobType: string): { groups: ScopeGroup[]; grandTotal: number } {
  // Parse saved build overrides (line qty/rate, product selections, extras).
  let overrides: BuildOverrides = defaultBuildOverrides();
  try {
    const parsed = JSON.parse(est.buildJson || "{}");
    overrides = { ...overrides, ...parsed, lines: parsed.lines || {}, products: parsed.products || {}, extras: parsed.extras || {}, thickness: parsed.thickness || {} };
  } catch { /* keep defaults */ }

  // Route the proposal scope through the same builder the estimate uses:
  //  - shingle re-roof job types          → engine-driven computeBuild()
  //  - the four data-driven Quick Templates → computeTemplateBuild()
  //  - anything else (Commercial/Siding → Custom) → computeBuild() fallback
  const quickTemplate = templateForJobType(jobType);
  const isShingleReroof = SHINGLE_REROOF_JOB_TYPES.includes(jobType);
  const build = isShingleReroof
    ? computeBuild(ji, defaultExtras(), overrides)
    : quickTemplate
      ? computeTemplateBuild(quickTemplate, ji, overrides)
      : computeBuild(ji, defaultExtras(), overrides);
  const groups: ScopeGroup[] = [];
  for (const sec of build.sections) {
    const rows: ScopeRow[] = sec.lines.filter((l) => (Number(l.qty) || 0) > 0).map((l) => {
      // A product sub-line only renders when the display name carries a chosen
      // product ("<Product> — <Mfr>"). Default catalog items show no sub-line.
      const product = l.name.includes(" — ") ? l.name : undefined;
      const name = product ? product.split(" — ")[0].replace(/\s+\(.*?\)$/, "") : l.name;
      return { name: product ? l.descriptor.split(" → ")[0] || name : l.name, qty: l.qty, unit: l.unit, price: l.bid, product };
    });
    if (rows.length) groups.push({ title: sec.title, rows, subtotal: rows.reduce((s, r) => s + r.price, 0) });
  }
  return { groups, grandTotal: build.totalEstimateValue };
}

/* ───────── Main page ───────── */
export default function Proposals() {
  const [, params] = useRoute("/proposals/:estimateId");
  const [, navigate] = useLocation();
  const estimateId = params?.estimateId ? Number(params.estimateId) : null;
  // Internal-only toggle. Default OFF → customer-facing scope shows quantities only.
  const [showPricing, setShowPricing] = useState(false);

  const { data: est, isLoading } = useQuery<any>({
    queryKey: ["/api/estimates", estimateId],
    queryFn: () => apiRequest("GET", `/api/estimates/${estimateId}`).then((r) => r.json()),
    enabled: !!estimateId,
  });
  const { data: job } = useQuery<any>({
    queryKey: ["/api/jobs", est?.jobId],
    queryFn: () => apiRequest("GET", `/api/jobs/${est?.jobId}`).then((r) => r.json()),
    enabled: !!est?.jobId,
  });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });

  if (isLoading || !est) {
    return <div className="p-8 text-sm text-muted-foreground">Loading proposal…</div>;
  }

  // Parse + recompute dynamic values
  let ji: JobInput = defaultJobInput();
  try { ji = { ...ji, ...JSON.parse(est.jobInputJson || "{}") }; } catch { /* keep default */ }
  let extras: ProposalExtras = defaultExtras();
  try { extras = { ...extras, ...JSON.parse(est.extrasJson || "{}") }; } catch { /* keep default */ }
  const res = calcEstimateV3(ji, extras);
  const isIns = ji.funding === "Insurance";

  const rep = users.find((u) => u.id === job?.repId);
  const repName = rep?.name || "Impact Exteriors LLC";
  const customer = job?.customer || "Property Owner";
  const address = job?.address || "Property Address";

  const jobType: string = est.jobType || job?.jobType || "Residential Re-Roof";
  const { groups, grandTotal } = buildScopeGroups(est, res, ji, jobType);

  return (
    <div className="proposal-root bg-neutral-200 dark:bg-neutral-800 min-h-full py-8">
      {/* Action bar (hidden on print) */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between max-w-[8.5in] mx-auto mb-6 bg-white dark:bg-neutral-900 border border-border rounded-lg px-4 py-2.5 shadow-sm">
        <button onClick={() => navigate(`/estimates?job=${est.jobId}`)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="button-back-proposal">
          <ArrowLeft className="w-4 h-4" /> Back to estimate
        </button>
        <div className="text-sm font-medium">Proposal — {customer}</div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none" title="Internal only — reveals per-line pricing on the Scope of Work page">
            <input type="checkbox" checked={showPricing} onChange={(e) => setShowPricing(e.target.checked)} className="accent-primary" data-testid="checkbox-show-pricing" />
            Show line pricing <span className="text-[10px] opacity-60">(internal)</span>
          </label>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3.5 py-1.5 rounded-md hover:opacity-90" data-testid="button-print-proposal">
            <Printer className="w-4 h-4" /> Print / Download PDF
          </button>
        </div>
      </div>

      <div className="proposal-pages">
      {/* PAGE 1 — Cover */}
      <Page n={1} cover>
        <img src={bannerPath} alt="Impact Exteriors" className="w-full block" data-testid="proposal-banner" />
        <div className="flex-1 flex flex-col items-center text-center px-[0.85in] pt-12">
          <div className="text-[13px] tracking-[0.4em] text-neutral-500 font-medium">DRIVEN BY IMPACT</div>
          <div className="text-5xl font-extrabold tracking-tight mt-3">PROPOSAL</div>
          <div className="mt-10 w-full max-w-md">
            <div className="border-b-2 border-black pb-1 text-lg font-semibold" data-testid="proposal-address">{address}</div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-1">Property Address</div>
          </div>
          <div className="mt-16 grid grid-cols-2 gap-12 w-full max-w-lg text-left">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Prepared by</div>
              <div className="border-b border-black pb-1 font-semibold" data-testid="proposal-rep">{repName}</div>
              <div className="text-xs text-neutral-600 mt-1">Impact Exteriors LLC</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">Prepared for</div>
              <div className="border-b border-black pb-1 font-semibold" data-testid="proposal-customer">{customer}</div>
              <div className="text-xs text-neutral-600 mt-1">Property Owner</div>
            </div>
          </div>
        </div>
        <div className="text-center pb-10">
          <div className="font-bold tracking-wide">IMPACT EXTERIORS LLC</div>
          <div className="text-[11px] text-neutral-500">{HEADER_STRIP}</div>
        </div>
      </Page>

      {/* PAGE 2 — About Us */}
      <Page n={2}>
        <div className="grid grid-cols-3 gap-4 text-center mb-6 mt-2">
          {[["LICENSED", "Colorado-Insured Contractor"], ["10-YEAR", "Workmanship Warranty"], ["CO-BUILT", "Code-Compliant Installs"]].map(([h, s]) => (
            <div key={h} className="border border-neutral-300 rounded-md py-3 px-2">
              <div className="text-[#E05A26] font-extrabold text-lg">{h}</div>
              <div className="text-[11px] text-neutral-600 mt-1">{s}</div>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] leading-relaxed mb-5">
          Impact Exteriors LLC is a Colorado-based exterior contractor delivering full restoration and maintenance for
          residential and commercial properties. Our work is grounded in technical accuracy, code compliance, and
          accountability from the first inspection through final payment.
        </p>
        <SectionHeader>About Us</SectionHeader>
        <div className="text-[12.5px] leading-relaxed space-y-3">
          <p>We were built by operators who came up in the field — scoping projects, managing crews, and running claims across Colorado. That background shapes how we operate. Every project is measured, documented, and scoped against current code and manufacturer specifications before a price is presented.</p>
          <p>Our services cover the full exterior of the building: roof installations and replacements, targeted repairs, gutters and downspouts, siding, and ongoing maintenance. We work on residential homes, multifamily properties, and commercial buildings across the Front Range and Western Slope.</p>
          <p>Every Impact customer is assigned a single point of contact who owns the project from inspection through final walk-through. No call centers, no handoffs, no surprises. We do not subcontract our quality control.</p>
          <p>Our installations are backed by a written ten-year workmanship warranty in addition to the manufacturer warranty on the materials installed. That commitment is the reason most of our customers come from referrals and repeat work, not from chasing leads.</p>
        </div>
      </Page>

      {/* PAGE 3 — Safety + Insurance */}
      <Page n={3}>
        <SectionHeader>Safety</SectionHeader>
        <p className="text-[12.5px] leading-relaxed mb-3">Safety is a non-negotiable on every Impact project. Our standards exist to protect our crews, your property, and anyone on or near the worksite during the project. The practices below apply to every job, regardless of size or scope.</p>
        <div className="text-[12.5px] leading-relaxed space-y-2 mb-6">
          <p><span className="font-semibold">Training.</span> Crew leaders and field employees receive ongoing instruction on current OSHA standards, fall protection, ladder use, and material handling.</p>
          <p><span className="font-semibold">Equipment.</span> Hard hats, eye protection, harnesses, lanyards, and task-specific fall-arrest equipment are issued to every crew member and required on every job.</p>
          <p><span className="font-semibold">Daily site checks.</span> Site supervisors complete a hazard walk at the start of each work day to confirm fall protection is in place and identify any new risks before work begins.</p>
          <p><span className="font-semibold">Code compliance.</span> Our crews follow all applicable federal and local laws and regulations, including OSHA 29 CFR 1926 (Construction) and Colorado workplace safety requirements.</p>
        </div>
        <SectionHeader>Insurance</SectionHeader>
        <p className="text-[12.5px] leading-relaxed mb-3">Impact Exteriors LLC carries the coverage required of a licensed Colorado contractor. Certificates of insurance are available on request and can be sent directly to the property owner, association, or insurance carrier.</p>
        <div className="text-[12.5px] leading-relaxed space-y-2">
          <p><span className="font-semibold">Commercial general liability.</span> Covers property damage or injury to third parties that may occur during the course of our work, so the property owner is not exposed to liability for incidents on the worksite.</p>
          <p><span className="font-semibold">Workers' compensation.</span> Protects the property owner from liability in the event of an on-site injury to an Impact Exteriors employee and ensures our team is properly cared for under Colorado law.</p>
          <p>Working with a fully insured Colorado contractor means the project is performed by a company with the coverage in place to protect you, our team, and your property from start to finish.</p>
        </div>
      </Page>

      {/* PAGE 4 — Our Process */}
      <Page n={4}>
        <SectionHeader>Our Process</SectionHeader>
        <p className="text-[12.5px] leading-relaxed mb-5">Every Impact project moves through a consistent five-step process. The point of the process is simple: technical accuracy up front, clean execution on the job, and a documented hand-off at the end so nothing slips between steps.</p>
        <div className="space-y-4">
          {[
            ["Inspection & Documentation", "A trained estimator performs a full on-site assessment of the roof, ventilation, flashing, fascia, and gutters. Findings are documented with photos, measurements, and drone imagery where useful. The report is what every later step is built on."],
            ["Scope & Insurance Approval (if applicable)", "For insurance-funded projects, we prepare an Xactimate-aligned scope, submit it to the carrier, and work the file to written approval of the final Replacement Cost Value before any work starts. For retail projects, the scope is priced against materials, labor, and complexity with a clear line-item breakdown."],
            ["Materials & Permits", "Material selections are confirmed in writing with the customer. Permits are pulled with the appropriate Colorado municipality before any material is delivered. Staging is coordinated with the property owner to minimize disruption."],
            ["Installation & Site Protection", "Work is performed by Impact crews, not subcontracted out. The property is tarped and covered, fragile items are noted, and code requirements are met or exceeded on every component. Most residential roofs are installed in one to three days. Commercial and large multi-family projects run on a schedule provided up front."],
            ["Final Walk-Through & Warranty", "After cleanup, magnetic sweep, and debris haul-off, the project manager walks the property with the customer. Photo close-out is completed, manufacturer warranties are registered, the ten-year Impact workmanship warranty is issued in writing, and any required municipal inspection is coordinated."],
          ].map(([t, d], i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E05A26] text-white font-bold grid place-items-center shrink-0">{i + 1}</div>
              <div>
                <div className="font-semibold text-[13px]">{t}</div>
                <p className="text-[12px] leading-relaxed text-neutral-700 mt-0.5">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </Page>

      {/* PAGE 5 — Insurance Supplements */}
      <Page n={5}>
        <SectionHeader>Understanding Insurance Supplements</SectionHeader>
        <div className="text-[12.5px] leading-relaxed space-y-3">
          <p>When your home is damaged by a storm, the insurance company will send an adjuster to inspect the property and create an initial repair estimate. While this estimate is an important first step, it is very common for additional damage or required repairs to be discovered once the project begins.</p>
          <p>This is where an insurance supplement comes in.</p>
          <p>An insurance supplement is simply a request for the insurance company to review additional items related to the covered damage that may have been missed during the original inspection. This is a normal and expected part of the restoration process in roofing and exterior construction.</p>
          <p>In many cases, certain problems cannot be seen until roofing, siding, or other materials are removed. Hidden water damage, damaged decking, improper ventilation, flashing issues, or code-required upgrades are often only discovered during the repair process. Contractors may also identify manufacturer installation requirements that were not included in the original scope of work.</p>
          <p>The purpose of a supplement is not to inflate the claim or take advantage of the insurance company. Its purpose is to ensure your home is restored properly, safely, and in compliance with current building codes and manufacturer requirements. Insurance policies are intended to cover legitimate storm-related damage and the necessary repairs associated with returning the property to its pre-storm condition.</p>
          <p>All supplement requests must be reviewed and approved by the insurance company. Contractors are required to provide supporting documentation such as photos, measurements, invoices, code requirements, and manufacturer specifications to justify any additional items being requested.</p>
          <p>Supplements are extremely common throughout the roofing and restoration industry and are part of ensuring that no necessary repairs are overlooked. Our goal throughout this process is simple: to advocate for a complete and proper repair while working professionally and transparently with your insurance company every step of the way.</p>
        </div>
      </Page>

      {/* PAGE 6 — Scope of Work (DYNAMIC, quantities-only) */}
      <Page n={6}>
        <SectionHeader>Proposed Services</SectionHeader>
        <p className="text-[12.5px] leading-relaxed mb-4">The scope of work below lists every service and the quantity included in this project, generated from the Impact Exteriors CRM. Selected products are shown beneath each applicable line. Total project pricing is detailed in Project Pricing on Page 8.</p>
        <table className="w-full text-[12px] border-collapse" data-testid="proposal-scope-table">
          <thead>
            <tr className="bg-neutral-100 text-left border-b-2 border-neutral-300">
              <th className="py-1.5 px-2 font-semibold">Description</th>
              {showPricing && <th className="py-1.5 px-2 w-24 text-right font-semibold">Line Price</th>}
              <th className="py-1.5 px-2 w-40 text-right font-semibold">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <Fragment key={`g${gi}`}>
                <tr className="border-b border-neutral-200">
                  <td className="pt-3 pb-1 px-2 font-bold text-[12.5px]" colSpan={showPricing ? 3 : 2} data-testid={`proposal-scope-section-${gi}`}>{g.title}</td>
                </tr>
                {g.rows.map((r, ri) => (
                  <Fragment key={`g${gi}r${ri}`}>
                    <tr className="border-b border-neutral-100">
                      <td className="py-1 px-2">{r.name}</td>
                      {showPricing && <td className="py-1 px-2 text-right tnum text-neutral-600">{money2(r.price)}</td>}
                      <td className="py-1 px-2 text-right font-semibold tnum">{qtyLabel(r.qty, r.unit)}</td>
                    </tr>
                    {r.product && (
                      <tr>
                        <td className="pb-1.5 px-2 text-[11px] text-[#2563EB] font-medium" colSpan={showPricing ? 3 : 2} data-testid={`proposal-scope-product-${gi}-${ri}`}>
                          <span className="mr-1">↳</span>{r.product}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="flex items-baseline justify-end gap-3 mt-4 pt-2 border-t-2 border-neutral-300">
          <span className="font-bold uppercase text-[12.5px]">Total Before Selections</span>
          <span className="tnum font-extrabold text-lg" data-testid="proposal-scope-total">{money2(grandTotal)}</span>
        </div>
        <p className="text-[10px] text-neutral-500 mt-3">Quantities reflect the measured scope for this property. Optional product upgrades and customer-selected add-ons, where applicable, are itemized in Project Pricing on Page 8. All applicable sales tax is included in the pricing.</p>
      </Page>

      {/* PAGE 7 — Inclusions / Exclusions / Install Day */}
      <Page n={7}>
        <SectionHeader>Standard Scope of Work — Inclusions</SectionHeader>
        <ul className="text-[12px] leading-relaxed space-y-1.5 mb-5">
          {[
            "All labor, materials, fasteners, and accessories required to complete the work as specified.",
            "Permit acquisition with the applicable Colorado municipality.",
            "Tear-off and lawful disposal of all construction debris generated by the work.",
            "Magnetic sweep of the yard, driveway, and walkways at completion.",
            "Cleaning of gutters of roof-related debris generated during the work.",
            "Reasonable protection of landscaping, AC condensers, windows, and exterior fixtures.",
            "Coordination of municipal inspection where required.",
            "Manufacturer warranty registration and ten-year Impact workmanship warranty in writing.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2"><span className="text-[#E05A26] font-bold">☑</span><span>{t}</span></li>
          ))}
        </ul>
        <SectionHeader>Standard Scope of Work — Exclusions</SectionHeader>
        <ul className="text-[12px] leading-relaxed space-y-1.5 mb-5">
          {[
            "Concealed or pre-existing damage to decking, framing, or substrate not visible prior to tear-off.",
            "Repair or replacement of deteriorated decking beyond any allowance specified in Project Pricing (charged per sheet).",
            "Painting, staining, or finish work on fascia, soffit, siding, or interior surfaces unless expressly listed.",
            "Interior repairs of any kind, including drywall, paint, or insulation damage from prior leaks.",
            "Code-required upgrades not approved by the insurance carrier and not separately authorized by Customer in writing.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2"><span className="text-neutral-500">•</span><span>{t}</span></li>
          ))}
        </ul>
        <SectionHeader>What to Expect on Install Day</SectionHeader>
        <table className="w-full text-[12px] border-collapse">
          <tbody>
            {[
              ["BEFORE INSTALL", "Move vehicles out of the driveway. Remove wall hangings and fragile items from interior walls. Secure pets indoors."],
              ["DAY OF INSTALL", "Crew typically arrives between 6:30 and 7:30 a.m. Expect noise, vibration, and limited driveway access for the duration of the work."],
              ["AFTER INSTALL", "Magnetic sweep, debris haul-off, and a final walk-through are completed with the Customer or designated representative before sign-off."],
            ].map(([h, d]) => (
              <tr key={h}>
                <td className="border border-neutral-300 p-2 font-semibold w-32 align-top">{h}</td>
                <td className="border border-neutral-300 p-2 align-top">{d}</td>
                <td className="border border-neutral-300 p-2 w-28 align-top whitespace-nowrap">Initial: _______</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>

      {/* PAGE 8 — Project Pricing (DYNAMIC) + Payment Schedule */}
      <Page n={8}>
        <SectionHeader>Project Pricing</SectionHeader>
        <div className="text-[12.5px]">
          {[
            ["Roofing system (tear-off, install, accessories)", res.total],
            ["Gutters & Downspouts", extras.gutters],
            ["Siding (if applicable)", extras.siding],
            ["Permit fees", extras.permits],
          ].map(([label, val]) => (
            <PriceRow key={label as string} label={label as string} value={val as number} />
          ))}
          {/* Overhead & Profit — insurance only */}
          <div className="flex items-baseline justify-between border-b border-dotted border-neutral-300 py-2">
            <span>Overhead &amp; Profit</span>
            <span className="tnum font-semibold">{isIns && extras.opAmount > 0 ? money2(extras.opAmount) : "$ ____________________"}</span>
          </div>
          <PriceRow label="Customer-selected upgrades" value={extras.upgrades} />
          <div className="flex items-baseline justify-between border-b border-dotted border-neutral-300 py-2">
            <span>Approved insurance supplements (if applicable)</span>
            <span className="tnum text-neutral-500 italic">+ supplements as approved</span>
          </div>
          <div className="flex items-baseline justify-between border-t-2 border-black mt-2 pt-2.5">
            <span className="font-bold uppercase">Total Contract Price (tax included)</span>
            <span className="tnum font-extrabold text-lg" data-testid="proposal-total-contract">{money2(res.totalWithExtras)}</span>
          </div>
        </div>

        <div className="mt-7">
          <SectionHeader>Payment Schedule</SectionHeader>
          <div className="text-[11.5px] leading-relaxed space-y-2.5">
            <p>Final Contract price is the total amount set forth in Project Pricing above, including any insurance-approved supplements and Customer-authorized upgrades. Payment is made in two stages: an initial payment at the start of work and the remaining balance upon substantial completion.</p>
            <p>If this Contract is funded through an insurance claim, the initial payment equals the Actual Cash Value (ACV) proceeds released by the carrier and is due upon delivery of materials or commencement of work, whichever is earlier. The remaining balance, including any recoverable depreciation, approved supplements, deductible, and Customer-selected upgrades, is due upon substantial completion of the corresponding trade.</p>
            <p>If this Contract is not funded through insurance, the initial payment is due at signing or upon delivery of materials, whichever is later, and the remaining balance is due upon substantial completion. All payments are made payable to Impact Exteriors LLC. Customer's out-of-pocket expense on an insurance claim shall not exceed the insurance deductible plus any Customer-selected non-claim upgrades, consistent with Colorado law.</p>
          </div>
          <table className="w-full text-[12px] border-collapse mt-4">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className="border border-neutral-300 p-2 w-28">Customer Initial</th>
                <th className="border border-neutral-300 p-2">Initial Payment / Deposit</th>
                <th className="border border-neutral-300 p-2">Balance Due at Completion</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-neutral-300 p-2">_______</td>
                <td className="border border-neutral-300 p-2 tnum font-semibold" data-testid="proposal-initial-payment">{money2(res.initialPayment)}</td>
                <td className="border border-neutral-300 p-2 tnum font-semibold" data-testid="proposal-balance-due">{money2(res.balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Page>

      {/* PAGE 9 — Acknowledgments + Signatures */}
      <Page n={9}>
        <SectionHeader>Customer Acknowledgments</SectionHeader>
        <ul className="text-[12px] leading-relaxed space-y-2.5 mb-6">
          {[
            "I have reviewed and accept the Scope of Work on the preceding pages, including all selected materials, colors, and inclusions.",
            "I confirm the color selections identified above and acknowledge that color variation between manufacturer batches and on-screen samples is normal and not a defect.",
            "I have read and understand the Terms & Conditions on the following pages and agree they form part of this Contract.",
            "I understand my right to rescind this Contract within seventy-two (72) hours of execution under Colorado law.",
            "If this is an insurance claim, I authorize Impact Exteriors LLC to communicate directly with my carrier and adjuster regarding scope, pricing, and supplements.",
            "I acknowledge that Impact Exteriors LLC will not pay or waive any portion of my insurance deductible, consistent with Colorado law.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2"><span className="inline-block w-3.5 h-3.5 border border-black mt-0.5 shrink-0" /><span>{t}</span></li>
          ))}
        </ul>
        <SectionHeader>Signatures</SectionHeader>
        <div className="space-y-8 mt-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Customer Signature &nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp; Date</div>
            <div className="grid grid-cols-[1fr_160px] gap-6 mt-6">
              <div className="border-b border-black pb-1 text-[11px] text-neutral-500">Sign above</div>
              <div className="border-b border-black pb-1 text-[11px] text-neutral-500">MM / DD / YYYY</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">Impact Exteriors LLC — Authorized Representative &nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp; Date</div>
            <div className="grid grid-cols-[1fr_160px] gap-6 mt-6">
              <div className="border-b border-black pb-1 text-[11px] text-neutral-500">Sign above</div>
              <div className="border-b border-black pb-1 text-[11px] text-neutral-500">MM / DD / YYYY</div>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-neutral-600 mt-8">By signing above, Customer agrees to all terms on this page and the Terms &amp; Conditions on the following pages, which together constitute the entire Contract between the parties.</p>
      </Page>

      {/* PAGE 10 — Terms & Conditions (1–11) */}
      <Page n={10}>
        <SectionHeader>Terms &amp; Conditions</SectionHeader>
        <p className="text-[10.5px] leading-relaxed mb-3">This Contract is between Impact Exteriors LLC, a Colorado limited liability company ("Company" or "Impact Exteriors"), and the customer identified on the preceding pages ("Customer"). Performance of this Contract and the rights and obligations of the parties are governed by the laws, regulations, and ordinances of the State of Colorado, including without limitation Colorado Revised Statutes §§ 6-22-101 et seq. (Residential Roofing Contracts), § 18-13-119.5 (Insurance Deductible), and §§ 38-22-101 et seq. (Mechanic's Liens).</p>
        <ol className="text-[10.5px] leading-relaxed space-y-2 list-none">
          {TERMS.slice(0, 11).map((t, i) => (
            <li key={i}><span className="font-semibold">{i + 1}. {t.h}</span> {t.b}</li>
          ))}
        </ol>
      </Page>

      {/* PAGE 11 — Terms & Conditions (12–22) + acknowledgment */}
      <Page n={11}>
        <ol className="text-[10.5px] leading-relaxed space-y-2 list-none" start={12}>
          {TERMS.slice(11).map((t, i) => (
            <li key={i}><span className="font-semibold">{i + 12}. {t.h}</span> {t.b}</li>
          ))}
        </ol>
        <p className="text-[10.5px] leading-relaxed mt-5 font-medium">CUSTOMER ACKNOWLEDGMENT OF TERMS &amp; CONDITIONS: By initialing here _______ and signing the Signatures page, Customer acknowledges that Customer has read, understands, and agrees to all of the Terms &amp; Conditions set forth above and that they form an integral part of this Contract.</p>
      </Page>
      </div>
    </div>
  );
}

function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dotted border-neutral-300 py-2">
      <span>{label}</span>
      <span className="tnum font-semibold">{value > 0 ? money2(value) : "$ ____________________"}</span>
    </div>
  );
}

const TERMS: { h: string; b: string }[] = [
  { h: "Right of Rescission (C.R.S. § 6-22-104).", b: "Customer has the right to rescind this Contract and obtain a full refund of any deposit within seventy-two (72) hours after entering this Contract. If Customer plans to use the proceeds of a property or casualty insurance policy to pay for the work, Customer may rescind this Contract within seventy-two (72) hours after receiving written notice from the insurer that the claim has been denied, in whole or in part. The Company is entitled to retain payments or deposits to compensate the Company for work actually performed in a workmanlike manner consistent with standard industry practice prior to such rescission." },
  { h: "Insurance Deductible (C.R.S. § 6-22-105 / § 18-13-119.5).", b: "Impact Exteriors LLC shall not pay, waive, rebate, or promise to pay any portion of the insurance deductible applicable to Customer's insurance claim. Doing so is a Class 2 misdemeanor under Colorado law. Customer remains solely responsible for payment of the deductible. Customer's out-of-pocket expense on an insurance claim shall not exceed the deductible plus any Customer-selected non-claim upgrades." },
  { h: "Insurance-Approval Contingency.", b: "If Customer intends to fund this Contract through an insurance claim, this Contract is contingent upon insurance company price and approval and does not obligate either party unless and until the Customer's insurance carrier approves the loss and the Company accepts the approved scope. Once the carrier approves the loss, this Contract becomes binding at the carrier-approved Replacement Cost Value, including all approved supplements, less non-recoverable depreciation, plus Customer-selected upgrades." },
  { h: "Supplements & Code Upgrades.", b: "The work performed may require supplements for additional labor, materials, or costs not included in the original estimate, including without limitation upgrades required to comply with applicable building codes, material price increases, and unknown site conditions. Customer and the insurance carrier agree to pay for all supplements reasonably required to complete the work in a code-compliant manner. The Company will seek approval from Customer's insurance carrier for supplements when applicable. Replacement of deteriorated roof decking, fascia, roof jacks, vents, flashings, or similar materials is not included unless expressly stated in the Scope of Work and, if unforeseen, shall be charged on a time-and-materials basis." },
  { h: "Payment & Late Charges.", b: "Customer shall make payments in accordance with the Payment Schedule. All payments shall be made payable to Impact Exteriors LLC. Payment is due regardless of whether municipal or third-party inspection has occurred. Any amount not paid when due shall accrue interest at the rate of one and one-half percent (1.5%) per month (eighteen percent (18%) per annum), or the maximum rate allowed by Colorado law, whichever is less, with a minimum monthly charge of $2.00." },
  { h: "Mortgage Company Funds.", b: "If Customer's mortgage company is holding insurance proceeds or otherwise withholding funds, it remains Customer's responsibility to take all reasonable steps to ensure that Impact Exteriors LLC is paid in full upon completion of the work in accordance with this Contract." },
  { h: "Mechanic's Lien Notice (C.R.S. §§ 38-22-101 et seq.).", b: "Persons or companies furnishing labor or materials for the improvement of real property may have a right under Colorado law to enforce their claim for payment against Customer's property. Upon final payment in full, Impact Exteriors LLC will provide Customer with a lien waiver covering the work performed under this Contract." },
  { h: "Authority to Communicate with Insurer.", b: "Customer grants Impact Exteriors LLC legal authority to communicate directly with Customer's insurance carrier, adjuster, and any third-party administrator regarding the scope of work, pricing, supplements, depreciation, and any other matter related to this Contract. Customer agrees to take reasonable steps to facilitate that communication." },
  { h: "Cancellation & Restocking.", b: "If Customer cancels this Contract after the seventy-two (72) hour rescission period but before commencement of work, Customer shall pay the Company fifteen percent (15%) of the total Contract price as liquidated damages, which both parties agree is a reasonable estimate of the Company's damages from cancellation. If materials have already been ordered, restocked, or custom-fabricated, an additional restocking and freight fee may apply. This Contract cannot be cancelled once work has commenced except by mutual written agreement of the parties." },
  { h: "Workmanship Warranty (10 Years).", b: "Impact Exteriors LLC warrants the workmanship of the roofing system installed under this Contract for a period of ten (10) years from the date of substantial completion. This workmanship warranty covers leaks and defects caused by faulty installation by Company personnel. This warranty is non-transferable and does not cover: (i) damage from wind gusts of fifty (50) miles per hour or greater; (ii) damage from hail, ice damming, falling objects, fire, lightning, vandalism, or other acts of God or third parties; (iii) damage caused by the Customer or by trades performed by others on the roof after installation; or (iv) any condition expressly excluded by the manufacturer's product warranty. Manufacturer warranties on shingles and accessories are passed through to Customer per the applicable manufacturer's terms." },
  { h: "Limitation of Liability.", b: "In the event of a breach by the Company, the parties acknowledge that Customer's actual damages may be difficult to ascertain and agree that the maximum liability of the Company for any claim arising out of or related to this Contract shall not exceed the original cost of labor and materials stated herein. During performance of the work, Customer's homeowner's or property insurance shall be primarily responsible for interior damage, provided that Company has taken commercially reasonable steps to protect the roof during the project." },
  { h: "Force Majeure.", b: "Company shall not be liable for failure or delay in performance due to labor disputes, strikes, weather, fires, supply-chain disruptions, inability to obtain materials from usual sources, governmental orders, or any other circumstance beyond the Company's reasonable control. Any such delay shall extend the time for performance for a period equal to the delay and shall not relieve Customer of any payment obligation." },
  { h: "Inspections & Permits.", b: "Company is not responsible for delays caused by city, county, or other governmental inspection processes. Any such delay shall not relieve Customer from any payment obligation or other term of this Contract." },
  { h: "Site Conditions, Solar & Pre-Existing Items.", b: "Company is not responsible for unseen or pre-existing site conditions, including without limitation deteriorated decking, hidden rot, or improper prior installations, except as specifically agreed in writing. If solar panels, satellite dishes, antennas, or similar items are present on the roof, Customer is responsible for arranging for their removal and reinstallation by the applicable vendor, and Company is not responsible for damage to such items during the work." },
  { h: "Property Damage During Construction.", b: "Company will take commercially reasonable steps to protect Customer's landscaping, driveway, AC units, windows, and other property. Customer acknowledges that minor incidental impacts (e.g., shingle granule wash, footprints in landscaping, fasteners requiring magnet sweep) are inherent to roofing work and are not considered damage. Any Company-caused damage claimed by Customer must be reported in writing within seventy-two (72) hours of substantial completion." },
  { h: "Insurance Carried by Company.", b: "Impact Exteriors LLC maintains commercial general liability insurance and workers' compensation insurance as required by Colorado law. Certificates of insurance are available to Customer upon written request." },
  { h: "Assignment.", b: "This Contract shall not be assigned by Customer without the prior written consent of the Company. The Company may assign this Contract to an affiliate or successor entity without Customer's consent." },
  { h: "Marketing & Likeness.", b: "Customer grants Impact Exteriors LLC and its affiliates the non-exclusive right to photograph the completed exterior of the property and to use the photographs and the property address in advertising, social media, and marketing materials, without compensation. To opt out, Customer initials here: _______." },
  { h: "Entire Agreement; Modifications.", b: "This Contract, including the preceding pages and these Terms & Conditions, constitutes the entire agreement between the parties and supersedes all prior oral or written communications. Any representation, statement, or communication not written into this Contract is deemed immaterial and is not relied upon by either party. Modifications must be in writing and signed by both parties." },
  { h: "Severability.", b: "If any provision of this Contract is held to be invalid or unenforceable, the validity and enforceability of the remaining provisions shall not be affected." },
  { h: "Attorneys' Fees.", b: "In any legal action arising out of or related to this Contract, the prevailing party shall be awarded its reasonable attorneys' fees and costs of court against the non-prevailing party." },
  { h: "Governing Law & Venue.", b: "This Contract is governed by the laws of the State of Colorado, without regard to its conflict-of-laws principles. The parties agree that exclusive venue for any dispute shall lie in the state district courts of the county in which the property is located." },
];
