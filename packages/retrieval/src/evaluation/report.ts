import type { PairedAnalysis } from "./paired-analysis.ts"
import type { DownstreamMetrics } from "./downstream.ts"
export type PromotionDecision = "PROMOTE" | "REJECT" | "INCONCLUSIVE"
export interface PromotionReport { decision: PromotionDecision; checks: Record<string, boolean | null>; reasons: string[]; paired: PairedAnalysis; downstream: { baseline: DownstreamMetrics; candidate: DownstreamMetrics } }
export function promotionReport(paired: PairedAnalysis, downstream: PromotionReport["downstream"], environmentReady = false): PromotionReport {
  const checks: PromotionReport["checks"] = {
    hit10NonDecreasing: paired.deltas.hit10! >= 0, mrrMateriallyNonNegative: paired.deltas.mrr! >= -0.001,
    noMajorDomainRegression: Object.values(paired.domainHit10Deltas).every((delta) => delta >= -0.10),
    noCompletenessRegression: paired.completenessRegressions.length === 0,
    latencyAcceptable: paired.candidate.aggregate.latencyMs <= Math.max(paired.baseline.aggregate.latencyMs * 1.25, paired.baseline.aggregate.latencyMs + 2),
    downstreamNonDecreasing: downstream.baseline.valid && downstream.candidate.valid ? downstream.candidate.rate >= downstream.baseline.rate : null,
    environmentReady: environmentReady && downstream.baseline.valid && downstream.candidate.valid ? true : null,
  }
  const reasons = Object.entries(checks).filter(([, value]) => value !== true).map(([key, value]) => `${key}:${value === null ? "unavailable" : "failed"}`)
  const decision: PromotionDecision = !environmentReady || paired.baseline.aggregate.cases === 0 || !downstream.baseline.valid || !downstream.candidate.valid ? "INCONCLUSIVE" : reasons.length ? "REJECT" : "PROMOTE"
  return { decision, checks, reasons, paired, downstream }
}
