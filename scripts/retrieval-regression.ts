import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { downstreamProofSuccess, pairedAnalysis, promotionReport } from "@mathos/retrieval"
import { loadRetrievalV3Fixtures } from "./retrieval-v3-eval.ts"

const ROOT = resolve(import.meta.dir, "..")
const BASELINE = resolve(ROOT, "benchmarks/retrieval-v3/regression-baseline.json")
const MAX_ABSOLUTE_REGRESSION = 0.05
const METRICS = ["union", "top200", "inspect30", "final20", "hit10"] as const
const V3_METRICS = ["candidateRecall", "top200", "inspect30", "final20", "hit10", "mrr"] as const

export interface RegressionComparison {
  passed: boolean
  threshold: number
  comparisons: Record<string, { baseline: number; current: number; delta: number; regressed: boolean }>
}

export function compareRetrievalBaseline(baseline: any, current: any, threshold = MAX_ABSOLUTE_REGRESSION): RegressionComparison {
  const comparisons: RegressionComparison["comparisons"] = {}
  for (const metric of METRICS) {
    const before = Number(baseline.metrics[metric])
    const now = Number(current.metrics[metric])
    const delta = Number((now - before).toFixed(8))
    comparisons[metric] = { baseline: before, current: now, delta, regressed: delta < -threshold }
  }
  return { passed: Object.values(comparisons).every((row) => !row.regressed), threshold, comparisons }
}

export async function runRetrievalRegression() {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as { metrics: Record<string, number> }
  const loaded = loadRetrievalV3Fixtures("development", "tuning")
  const paired = pairedAnalysis(loaded.fixtures)
  const comparisons: RegressionComparison["comparisons"] = {}
  for (const metric of V3_METRICS) {
    const before = Number(baseline.metrics[metric])
    const now = Number(paired.baseline.aggregate[metric])
    const delta = Number((now - before).toFixed(8))
    comparisons[metric] = { baseline: before, current: now, delta, regressed: delta < -MAX_ABSOLUTE_REGRESSION }
  }
  const unavailable = { baseline: downstreamProofSuccess([], 10), candidate: downstreamProofSuccess([], 10) }
  const governance = promotionReport(paired, unavailable, false)
  return {
    passed: Object.values(comparisons).every((row) => !row.regressed) && governance.decision === "INCONCLUSIVE",
    threshold: MAX_ABSOLUTE_REGRESSION,
    fixtureSource: "retrieval-v3-development-frozen" as const,
    candidateDecision: governance.decision,
    comparisons,
  }
}

if (import.meta.main) {
  const report = await runRetrievalRegression()
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
