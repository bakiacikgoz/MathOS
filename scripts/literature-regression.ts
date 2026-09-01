#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { runLiteratureEval } from "../packages/core/src/literature-eval.ts"

const baseline = JSON.parse(readFileSync("benchmarks/literature-runtime-baseline.json", "utf8")) as { scenarios: string[] }
const rows = await runLiteratureEval()
const missing = baseline.scenarios.filter((id) => !rows.some((row) => row.id === id && row.result === "PASS"))
console.log("literature-regression")
for (const row of rows) console.log(`  ${row.id}: ${row.result}`)
if (missing.length) {
  console.error(`FAIL missing/failed: ${missing.join(",")}`)
  process.exit(1)
}
console.log("PASS")
