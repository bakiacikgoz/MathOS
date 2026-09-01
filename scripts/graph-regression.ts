import { readFileSync } from "node:fs"
import { GRAPH_EVAL_SCENARIOS, runGraphScenario } from "../packages/core/src/graph-eval.ts"

const baseline = JSON.parse(readFileSync(new URL("../benchmarks/research-graph-baseline.json", import.meta.url), "utf8")) as { scenarios: string[] }
const expected = new Set(baseline.scenarios)
const missing = GRAPH_EVAL_SCENARIOS.filter((id) => !expected.has(id))
const rows = baseline.scenarios.map((id) => runGraphScenario(id))
const passed = rows.every((row) => row.result === "PASS") && missing.length === 0
console.log(JSON.stringify({ passed, rows, missing }, null, 2))
if (!passed) process.exitCode = 1
