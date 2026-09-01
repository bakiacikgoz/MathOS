#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { runUxEval } from "../packages/core/src/ux-eval.ts"

const baseline = JSON.parse(readFileSync("benchmarks/product-ux-baseline.json", "utf8")) as { scenarios: string[] }
const rows = await runUxEval()
const missing = baseline.scenarios.filter((id) => !rows.some((row) => row.id === id && row.result === "PASS"))
const extraFail = rows.filter((row) => row.result === "FAIL")
const passed = missing.length === 0 && extraFail.length === 0
console.log(JSON.stringify({ passed, missing, extraFail }, null, 2))
if (!passed) process.exit(1)
