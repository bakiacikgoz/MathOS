import { readFileSync } from "node:fs"
import { evaluateRetrieval } from "./retrieval-eval.ts"

const BASELINE = new URL("../benchmarks/retrieval-validation-baseline.json", import.meta.url).pathname
const MAX_ABSOLUTE_REGRESSION = 0.05
const METRICS = ["union", "top200", "inspect30", "final20", "hit10"] as const

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

if (import.meta.main) {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"))
  const current = await evaluateRetrieval({ set: "validation" })
  const report = compareRetrievalBaseline(baseline, current)
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
