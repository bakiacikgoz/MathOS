import { readFileSync } from "node:fs"
import { runMultiAgentEval } from "../packages/core/src/multi-agent-eval.ts"

const BASELINE = new URL("../benchmarks/multi-agent-loop-baseline.json", import.meta.url).pathname

if (import.meta.main) {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as { scenarios: string[] }
  const rows = await runMultiAgentEval("fake")
  const passed = rows.every((row) => row.result === "PASS") && rows.length === baseline.scenarios.length
  console.log(JSON.stringify({ passed, rows }, null, 2))
  if (!passed) process.exitCode = 1
}
