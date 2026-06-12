# Pricing Engine Update Report

Implemented `PRICING_SPEC.md` exactly as the source of truth, replacing all placeholder estimating logic in the Impact CRM app with the real "Estimator V3" sheet model + ABC Supply Price Agreement (PA-78915-6JHFW8, effective 6/3/2026, expires 8/31/2026).

## Worked-Example Verification — PASS to the cent

Inputs: 30 SQ, 6:12 pitch, 1 layer, 1 story, eaves 120 / rakes 150 / ridges 90 / hips 56 / valleys 35 / step 20 LF, 5 pipe boots, 12 box vents, gutter apron 120 LF, L-metal 150 LF, Tamko StormFight FLEX CL4 ($130/SQ), Greeley 7.01% tax, 10% waste, 40% margin, Retail.

| Metric | Spec target | App result | Status |
|---|---|---|---|
| Material Cost (×1.03 surcharge) | $7,006.75 | $7,006.75 | ✅ |
| Labor Cost | $2,870.00 | $2,870.00 | ✅ |
| Specialty (price / cost) | $660.00 / $304.80 | $660.00 / $304.80 | ✅ |
| **Roofing System TOTAL** | **$17,939.87** | **$17,939.87** | ✅ |
| Retail margin | ~40.5% | 40.5% (40.53%) | ✅ |

Verified three ways: (1) `verifyWorkedExample()` in `shared/pricing.ts` returns `pass: true`; (2) the seeded demo estimate #1 (Devon Carter) returns `totalPrice: 17939.87` via `/api/estimates`; (3) Playwright opened the live builder and read `text-roof-total = $17,939.87`, `text-contract-total = $17,939.87`, `text-margin = 40.5%`.

### Key formula nuances that made it match exactly
- Material unit costs use EXACT division of package ÷ coverage (e.g. starter $69.41/105 = $0.6610476/LF, H&R $85.20/33 = $2.5818182/LF), not the rounded display values.
- Ice & water SQ = (eaves + valleys) × stripFt / 100, then **rounded UP to nearest 0.1 SQ** (4.65 → 4.70).
- Coil nails, cap nails, and sealant are billed at the WHOLE PACKAGE price (qty × $55/box, $30.99/bucket, $9.99/tube), not a derived per-unit cost.
- Labor includes step/counter-flashing labor at $1/LF (the 20 LF of step → $20, which lands labor at exactly $2,870).
- MatCost = material subtotal × 1.03 (3% supplier surcharge).
- BasePrice = (MatCost + LaborCost) × 1/(1 − 0.40) = ×1.6667.
- MaterialTax = MatCost × marginMultiplier × taxRate (material-only tax on the PRICED material).
- TOTAL = BasePrice + SpecialtyPrice + MaterialTax (+ optional 3% CC surcharge).

## Changes by spec item (all 10)

1. **Quick mode → job-input sheet model.** Replaced the old template/measurements approach with the full sheet inputs: shingle dropdown, squares, pitch, layers, stories, eaves/rakes/ridges/hips/valleys/step/counter-flash LF, pipe boots, split boots, box vents, ridge vent / gutter apron / L-metal LF, mod bit SQ, OSB, crickets, Broan counts, trash-walk and no-access toggles, waste %, I&W strip ft, granulated-I&W alt toggle, tax jurisdiction, margin.
2. **Real catalog, labor, specialty, tax table.** All sourced in `shared/pricing.ts` from the ABC Price Agreement: 16 materials (derived cost/unit), 5 shingle options, 7 specialty items, full labor rate card, 13 tax jurisdictions with CONFIRMED/APPROX/CUSTOM status.
3. **Retail vs Insurance funding with exact math.** price = cost ÷ (1 − margin); 40% default/floor margin; 3% CC surcharge on materials (optional toggle); material-only tax; waste-factor input. Insurance mode: carrier contract input, Profit = Contract − jobCost − MatCost×taxRate, insurance margin %.
4. **Advanced mode picker → new catalog.** The per-section "+ from catalog" dropdown now pulls live from `/api/price-items` (MAT-*, SH-*, SPEC-* codes from the agreement) with cost/unit math and margin-floor enforcement for reps.
5. **Proposal extras.** Gutters/siding/permits/upgrades dollars, O&P (insurance only), deposit % (retail, 50% default) or ACV/initial payment (insurance). Panel shows Initial Payment + Balance Due at Completion.
6. **Seeded demo estimates updated.** Demo #1 (Devon Carter) is the verified worked example (Retail, "sent"). Demo #2 (Frank Mooney) is a smaller Retail accepted job with gutters + permit extras. Estimate→budget cost-code mapping preserved. Price List page shows the ABC attribution ("ABC Price Agreement 6/3/2026") and "Expires 8/31/2026".
7. **Worked example reproduces exactly** — see verification table above.
8. **Playwright QA (desktop 1280 + mobile 375).** Created/opened the worked-example estimate, confirmed totals, tested Insurance toggle, Advanced catalog picker, accept→budget flow, and the Price List page. No layout/overflow issues at either viewport (scrollWidth = clientWidth = 375 on mobile).
9. **Build + prod server + deploy.** `npm run build` (clean, no type errors via `npm run check`), prod server restarted on port 5000, deployed via `deploy_website`.
10. **This report.**

## Files changed
- **NEW** `shared/pricing.ts` — the verified pricing engine (catalog, labor, specialty, tax table, `calcEstimateV3`, `budgetByCostCode`, `verifyWorkedExample`). Shared by client + server.
- **NEW** `client/src/pages/PriceList.tsx` — Price List page (catalog, ABC attribution + expiration, tax jurisdiction table with status badges, labor card, specialty, version history). Registered in `App.tsx` route `/price-list` and the sidebar nav in `Layout.tsx`.
- `shared/schema.ts` — added estimate fields (funding, margin, taxJurisdiction, taxRate, jobInputJson, extrasJson, contractValue, totalPrice); settings fields (margin floor 40, defaultWastePct, surchargePct, priceAgreement, priceAgreementExpires).
- `server/storage.ts` — DDL updated for the new estimate/settings columns.
- `server/seed.ts` — settings, cost codes (100/200/310/340/410/500/550/700), price items seeded from catalog with an ABC Price Agreement import logged to price history, and the two demo estimates rebuilt on the V3 model.
- `server/routes.ts` — `/api/estimates/:id/accept` budget bridge now uses `budgetByCostCode()` for V3 (Quick) estimates and falls back to legacy section logic for Advanced.
- `client/src/pages/Estimates.tsx` — Quick mode rebuilt to the job-input model, funding selector (Retail/Insurance + CC surcharge), proposal extras, live V3 profit panel; Advanced mode picker updated to the new catalog.

## Cost-code mapping (verified via accept flow)
Materials → **200**, Labor → **500**, Specialty → its code (**340** vents / **550** decking), Permits → **100**, Gutters+Siding → **340**, Disposal → **410**. Live accept of the worked example produced budget rows: `200 = $6,802.67  340 = $304.80  500 = $2,870.00`.

## Design system & navigation
No unrelated pages were redesigned. Existing design tokens, sidebar, sticky action bar, data-testids, send/accept mutations, and `apiRequest`/TanStack Query patterns were preserved. Did not publish to pplx.app.

## QA artifacts (in project root)
`qa-builder-desktop.jpg`, `qa-pricelist-desktop.jpg`, `qa-builder-mobile.jpg`, `qa-profit-mobile.jpg`.
