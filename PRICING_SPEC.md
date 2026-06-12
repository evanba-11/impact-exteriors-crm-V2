# PRICING SPEC — Real estimating engine from "Estimator V3" Google Sheet + ABC Supply Price Agreement (June 2026)
Replace ALL placeholder estimating data/logic in the app with this. Pricing below is ACCURATE and current.

## Source context (show in UI)
- Materials sourced from ABC Supply Customer Price Agreement PA-78915-6JHFW8, effective 6/3/2026, EXPIRES 8/31/2026 (show expiration note on Price List page).
- 3% supplier surcharge applies to materials (ABC credit-card surcharge passed through).

## Global settings (Settings page, editable; these are the seeds)
- Default margin: 40%. Customer price = cost ÷ (1 − margin) → 1.667× multiplier. This is also the margin FLOOR for Quick mode reps (can raise, never lower).
- Default waste %: 10 (guidance: ~10% simple / 12% moderate / 15% cut-up). Per-job override.
- Supplier surcharge: 3% on material subtotal.
- Labor is NOT taxed (CO real-property improvement). Material tax by jurisdiction.

## Tax jurisdictions (seed table; each estimate picks one; show CONFIRMED/APPROX status)
Colorado state base only 2.900% CONFIRMED | Greeley (80632/33/38/39) 7.010% CONFIRMED | Greeley/Evans Fire (80631/80634) 8.400% CONFIRMED | Denver 9.150% CONFIRMED | Lafayette/Boulder Cnty 9.205% CONFIRMED eff 1/1/26 | Fort Collins 7.550% APPROX—VERIFY | Loveland 6.700% APPROX | Windsor 7.400% APPROX | Colorado Springs 8.130% APPROX | Aurora 8.000% APPROX | Longmont 8.150% APPROX | Thornton 8.500% APPROX | CUSTOM (enter rate).

## Materials catalog (Price List page: name, ABC source item, package $, coverage, unit, derived cost/unit)
| Material | ABC source | Pkg $ | Coverage | Unit | Cost/Unit |
| Field shingle | per Shingle Options below | — | 1 | SQ | per option |
| Starter strip | OC Starter Strip Plus | $69.41 | 105 LF/bd | LF | $0.6610 |
| Hip & ridge cap | OC ProEdge | $85.20 | 33 LF/bd | LF | $2.5818 |
| Underlayment (synthetic) | Rhinoroof UDL | $66.50 | 10 SQ/rl | SQ | $6.65 |
| Ice & water | Titanium PSU-30 | $121.50 | 2 SQ/rl | SQ | $60.75 (cheaper alt: Rhinoroof Gran $34.25/SQ — offer as toggle) |
| Drip edge | Galv 28GA 2x4 | $14.00 | 10 LF/pc | PC | $14.00/pc |
| Valley metal | Galv W-Valley 24" | $31.00 | 10 LF/pc | PC | $31.00/pc |
| Step flashing | Galv prebent 4x4x8 | $81.00 | 50 pc/bd | PC | $1.62 |
| Gutter apron | CMG 2x4 28Ga | $18.00 | 10 LF/pc | PC | $18.00/pc |
| L-metal | CMG 4x5 | $18.00 | 10 LF/pc | PC | $18.00/pc |
| Pipe boot | IPS galv pipe flashing | $14.00 | 1 | PC | $14.00 |
| Split boot | Retrofit split collar | $45.00 | 1 | PC | $45.00 |
| Ridge vent | Rigid Roll Plus 20' | $75.00 | 20 LF/rl | LF | $3.75 |
| Coil nails | ABC 1-1/4" EG | $55.00 | 15 SQ/box | BX | $55.00/box |
| Cap nails | Plastic Cap 2.5M | $30.99 | 25 SQ/bkt | PA | $30.99/bkt |
| Sealant | Duralink 50 | $9.99 | 5 SQ/tube | TB | $9.99/tube |
Factor: step flashing = 2 pieces per LF of wall.

## Shingle options (dropdown per estimate, $/SQ, 3 bdl/SQ)
OC TruDef Duration $144 (default) | OC TruDef Duration DC designer $144 | Malarkey Vista AR $144 | Tamko Titan XT $128 | Tamko StormFight FLEX CL4 $130. Admin can add options.

## Labor rates (cost-plus; get margin in retail)
Tear off + install (3:12–7:12) $95/SQ | Extra layer $10/SQ × (layers−1) | Steep adder $10/SQ × (pitch−7) when pitch>7 | Story adder $10/SQ × (stories−1) | Trash walk (Y/N) $10/SQ | Roof loading no access (Y/N) $9/SQ, +$2/SQ when pitch≥10 | Mod bit $120/SQ | Ridge vent cut-in $2/LF | Step/counter flashing labor $1/LF.

## Specialty items (FIXED customer price; cost tracked for margin; NOT marked up, NOT taxed)
OSB decking: price $65 / cost $55 per sheet | Wood cricket $350/$150 ea | Broan small kit $150/$60 | Broan small vent only $75/$40 | Broan large kit $175/$75 | Broan large vent only $75/$50 | Box vents $55/$25.40 ea.

## QUICK MODE = the sheet's job-input model (replaces current template/measurements approach)
Job inputs: shingle (dropdown), squares, pitch (x:12), layers, stories, eaves LF, rakes LF, ridges LF, hips LF, valleys LF, step/headwall LF, counter flashing LF, pipe boots, split boots, box vents, ridge vent LF, gutter apron LF, L-metal LF, mod bit SQ, OSB sheets, crickets, Broan counts, trash walk Y/N, no-access loading Y/N, waste % (default 10), I&W strip ft (default 3), tax jurisdiction, funding type (Retail | Insurance).
Derived quantities (W = 1+waste%):
- Field shingles: squares×W SQ × shingle $/SQ
- Starter: (eaves+rakes)×W LF
- H&R cap: (ridges+hips)×W LF
- Underlayment: squares×W SQ
- Ice & water: (eaves+valleys)×stripFt/100 SQ
- Drip edge: ceil((eaves+rakes)×W/10) pcs
- Valley metal: ceil(valleys×W/10) pcs
- Step flashing: stepLF×2 pcs
- Gutter apron: ceil(apronLF/10) pcs; L-metal: ceil(lmetalLF/10) pcs
- Pipe/split boots & box vents: counts
- Ridge vent: LF (material) + cut-in labor
- Coil nails: ceil(squares/15) boxes; Cap nails: ceil(squares×W/25) buckets; Sealant: ceil(squares/5) tubes
Cost stack: MaterialSubtotal ×1.03 = MatCost; LaborCost = sum of labor lines; SpecialtyCost separate.
RETAIL: BasePrice=(MatCost+LaborCost)÷(1−margin); MaterialTax=MatCost×marginMultiplier×taxRate; TOTAL=BasePrice+SpecialtyPrice+MaterialTax. Show Retail profit $ and margin % (verify example: 30SQ/6:12/1story/1layer, eaves120 rakes150 ridges90 hips56 valleys35 step20, 5 boots, 12 box vents, apron120 Lmetal150, Tamko StormFight, Greeley 7.01%, 10% waste → MatCost $7,006.75, Labor $2,870.00, Specialty $660 price/$304.80 cost, TOTAL $17,939.87, margin 40.5%).
INSURANCE funding: input contract value (what carrier pays); Profit = Contract − TotalJobCost − MatCost×taxRate; show Insurance margin %. Tie into existing insurance scope/supplement flags.
Measurement Import variant: same engine, paste roof area sq ft (squares = sqft/100) + linear measurements from an EagleView-style report.

## ADVANCED MODE: keep sections/custom lines/tiers but line-item picker now pulls from THIS catalog (materials, labor, specialty) with the same cost/unit math; per-line margin override allowed (≥ floor for rep role); same surcharge/tax/funding logic.

## Proposal additions (from Proposal tab)
Extra contract lines: Gutters & Downspouts $, Siding $, Permit fees $, O&P $ (insurance only), Customer upgrades $. Deposit % (retail, default 50%) or ACV/initial payment (insurance) → show Initial Payment and Balance Due at Completion. Proposal shows shingle selection, roofing system price, extras, total contract price (tax included).

## Migration notes
- Estimate→budget bridge: map materials→cost code 200, labor→500/310 as appropriate, subs/specialty→340, permits→100, disposal→410. Keep working.
- Keep price-list version history; log initial import as "ABC Price Agreement 6/3/2026".
- Update seeded demo estimates so numbers are consistent with this engine.
