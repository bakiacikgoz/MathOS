#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { runComputationEval } from "../packages/core/src/computation-eval.ts"

const baseline = JSON.parse(readFileSync("benchmarks/computation-runtime-baseline.json", "utf8")) as { scenarios: string[] }
const rows = await runComputationEval()
const required = baseline.scenarios
const missing = required.filter((id) => !rows.some((row) => row.id === id && row.result !== "FAIL"))
console.log("computation-regression")
for (const row of rows) console.log(`  ${row.id}: ${row.result}`)
if (missing.length) {
  console.error(`FAIL missing/failed: ${missing.join(",")}`)
  process.exit(1)
}
console.log("PASS")
