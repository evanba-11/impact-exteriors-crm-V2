// Update 6: shared helpers to derive metric strip, work-order summary boxes,
// and section-grouped quantity-only scope lines from an estimate. Reuses the
// SAME build model the proposal/estimate use — pricing math is untouched.
import {
  calcEstimateV3, defaultExtras, defaultJobInput,
  type JobInput, type ProposalExtras,
} from "@shared/pricing";
import {
  computeBuild, computeTemplateBuild, defaultBuildOverrides,
  selectedProduct, type BuildOverrides, type BuildResult,
} from "@/lib/build-model";
import { templateForJobType, SHINGLE_REROOF_JOB_TYPES } from "@/lib/templates";

export type Metrics = {
  labor: number; material: number; bid: number; margin: number; gpm: number;
};

export type WOLine = {
  id: string;
  kind: "material" | "labor" | "spec" | "custom";
  qty: number;
  unit: string;
  name: string;
  product?: string;   // "→ {product}" sub-line (accent color)
  laborNote?: string; // "→ (Labor) — {pitch}" sub-line
};
export type WOGroup = { title: string; lines: WOLine[] };

export function parseJobInput(est: any): JobInput {
  let ji: JobInput = defaultJobInput();
  try { ji = { ...ji, ...JSON.parse(est?.jobInputJson || "{}") }; } catch { /* keep default */ }
  return ji;
}

export function parseOverrides(est: any): BuildOverrides {
  let overrides: BuildOverrides = defaultBuildOverrides();
  try {
    const parsed = JSON.parse(est?.buildJson || "{}");
    overrides = {
      ...overrides, ...parsed,
      lines: parsed.lines || {}, products: parsed.products || {},
      extras: parsed.extras || {}, thickness: parsed.thickness || {},
    };
  } catch { /* keep defaults */ }
  return overrides;
}

export function buildFor(est: any, jobType: string): BuildResult {
  const ji = parseJobInput(est);
  const overrides = parseOverrides(est);
  const quickTemplate = templateForJobType(jobType);
  const isShingleReroof = SHINGLE_REROOF_JOB_TYPES.includes(jobType);
  return isShingleReroof
    ? computeBuild(ji, defaultExtras(), overrides)
    : quickTemplate
      ? computeTemplateBuild(quickTemplate, ji, overrides)
      : computeBuild(ji, defaultExtras(), overrides);
}

export function metricsFor(est: any, jobType: string): Metrics {
  const build = buildFor(est, jobType);
  return {
    labor: build.directLabor,
    material: build.materialTotal,
    bid: build.totalEstimateValue,
    margin: build.grossProfit,
    gpm: build.marginPct,
  };
}

// Section-grouped, quantities-only lines for the Work Order (no pricing).
export function woGroupsFor(est: any, jobType: string): WOGroup[] {
  const build = buildFor(est, jobType);
  const groups: WOGroup[] = [];
  for (const sec of build.sections) {
    const lines: WOLine[] = sec.lines
      .filter((l) => (l.qty || 0) > 0 || l.placeholder !== true)
      .map((l) => {
        const product = l.name.includes(" — ") ? l.name : undefined;
        const baseName = product ? (l.descriptor.split(" → ")[0] || l.name) : l.name;
        // Quantities-only: strip any pricing fragment ($/rate/× math) from the labor descriptor.
        const rawLaborNote = l.kind === "labor" ? (l.descriptor || "") : "";
        const cleanLaborNote = rawLaborNote.includes("$") ? "" : rawLaborNote.trim();
        const laborNote = l.kind === "labor" ? cleanLaborNote : undefined;
        return {
          id: l.id, kind: l.kind, qty: l.qty, unit: l.unit,
          name: baseName, product, laborNote,
        };
      });
    if (lines.length) groups.push({ title: sec.title, lines });
  }
  return groups;
}

// Auto-fill the work order summary boxes from the estimate where possible.
export function summaryFor(est: any, jobType: string) {
  const ji = parseJobInput(est);
  const overrides = parseOverrides(est);
  const build = buildFor(est, jobType);
  const shingle = selectedProduct("shingle", overrides)?.name || "";
  const hipRidge = selectedProduct("hipRidge", overrides)?.name || "";
  const starter = selectedProduct("starter", overrides)?.name || "";
  const squares = build.squares || ji.squares || 0;
  return {
    squares: squares ? String(Math.round(squares * 10) / 10) : "",
    layers: ji.layers != null ? String(ji.layers) : "",
    days: "",
    shingle,
    hipRidge,
    starter,
  };
}

export { calcEstimateV3, defaultExtras };
export type { JobInput, ProposalExtras };
