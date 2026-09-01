#!/usr/bin/env bun
import { runComputationEval } from "../packages/core/src/computation-eval.ts"

const rows = await runComputationEval()
console.log("Scenario                    Result")
for (const row of rows) console.log(`${row.id.padEnd(27)} ${row.result}`)
if (rows.some((row) => row.result === "FAIL")) process.exit(1)
