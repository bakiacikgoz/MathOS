#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { runReleaseEval } from "../packages/core/src/release-eval.ts"

const baseline = JSON.parse(readFileSync("benchmarks/release-readiness-baseline.json", "utf8")) as { required: string[] }
const rows = await runReleaseEval()
const missing = baseline.required.filter((id) => !rows.some((row) => row.id === id && (row.result === "PASS" || row.result.startsWith("SKIPPED"))))
const failed = rows.filter((row) => row.result === "FAIL")
const passed = missing.length === 0 && failed.length === 0
console.log(JSON.stringify({ passed, missing, failed: failed.map((row) => row.id) }, null, 2))
if (!passed) process.exit(1)
