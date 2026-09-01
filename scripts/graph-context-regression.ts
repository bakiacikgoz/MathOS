import { readFileSync } from "node:fs"
import { runGraphScenario } from "../packages/core/src/graph-eval.ts"

const ids = [
  "planner-context",
  "frontier-context",
  "blocker-context",
  "failure-context",
  "fidelity-context",
  "branch-context-isolation",
  "import-context",
  "context-determinism",
]
const baseline = JSON.parse(readFileSync(new URL("../benchmarks/graph-context-baseline.json", import.meta.url), "utf8"))
const rows = ids.map((id) => runGraphScenario(id))
const passed = rows.every((row) => row.result === "PASS")
console.log(JSON.stringify({ passed, baseline: baseline.kind, rows }, null, 2))
if (!passed) process.exitCode = 1
