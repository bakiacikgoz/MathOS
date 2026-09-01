import { readFileSync } from "node:fs"
import { runResearchEval } from "../packages/core/src/research-eval.ts"

const BASELINE = new URL("../benchmarks/research-loop-baseline.json", import.meta.url).pathname

export async function compareResearchBaseline() {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as { scenarios: Array<{ id: string; expectedOutcome: string }> }
  const rows = await runResearchEval("fake")
  const comparisons = rows.map((row) => {
    const expected = baseline.scenarios.find((item) => item.id === row.id)
    return { id: row.id, result: row.result, stopReason: row.stopReason, expected: expected?.expectedOutcome, passed: row.result === "PASS" }
  })
  return { passed: comparisons.every((row) => row.passed), comparisons }
}

if (import.meta.main) {
  const report = await compareResearchBaseline()
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
