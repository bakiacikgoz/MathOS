import { readFileSync } from "node:fs"
import { runMultiAgentScenario } from "../packages/core/src/multi-agent-eval.ts"

const BASELINE = new URL("../benchmarks/local-parallel-runtime-baseline.json", import.meta.url).pathname
const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as { checks: Record<string, string> }
const ids = Object.values(baseline.checks)
const rows = []
for (const id of ids) rows.push(await runMultiAgentScenario(id, "fake"))
const passed = rows.every((row) => row.result === "PASS")
console.log(JSON.stringify({ passed, rows }, null, 2))
if (!passed) process.exitCode = 1
