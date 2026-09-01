#!/usr/bin/env bun
import { runUxEval } from "../packages/core/src/ux-eval.ts"

const json = process.argv.includes("--json")
const rows = await runUxEval()
if (json) {
  console.log(JSON.stringify({ scenarios: rows, passed: rows.every((row) => row.result === "PASS") }, null, 2))
} else {
  console.log("Scenario                         Result")
  for (const row of rows) console.log(`${row.id.padEnd(34)} ${row.result}${row.detail ? `  ${row.detail}` : ""}`)
}
if (rows.some((row) => row.result === "FAIL")) process.exit(1)
