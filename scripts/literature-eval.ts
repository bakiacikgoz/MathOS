#!/usr/bin/env bun
import { runLiteratureEval } from "../packages/core/src/literature-eval.ts"

const rows = await runLiteratureEval({ real: process.argv.includes("--real") })
console.log("Scenario                    Result")
for (const row of rows) console.log(`${row.id.padEnd(27)} ${row.result}`)
if (rows.some((row) => row.result === "FAIL")) process.exit(1)
