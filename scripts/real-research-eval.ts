#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadRealResearchDataset, validateRealResearchDataset } from "../packages/core/src/evaluation/real-research-eval.ts"
import { runRealResearchCase } from "../packages/core/src/evaluation/research-case-runner.ts"
import { formatRealResearchReport, nondeterministicRegression, summarizeRealResearch, type RealResearchSummary } from "../packages/core/src/evaluation/research-report.ts"

const args = process.argv.slice(2)
const json = args.includes("--json")
const validation = validateRealResearchDataset()
if (args.includes("--validate")) {
  console.log(json ? JSON.stringify(validation, null, 2) : `real-research-v1 manifest ${validation.ok ? "PASS" : "FAIL"} (${validation.caseCount} cases)\n${validation.errors.join("\n")}`)
  process.exit(validation.ok ? 0 : 1)
}
if (!validation.ok) throw new Error(`Invalid frozen dataset: ${validation.errors.join("; ")}`)

const valueAfter = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined
const wanted = valueAfter("--case")
const limit = Number(valueAfter("--limit") ?? Number.POSITIVE_INFINITY)
const baselinePath = valueAfter("--baseline")
const dataset = loadRealResearchDataset()
const cases = dataset.cases.filter((item) => !wanted || item.id === wanted).slice(0, limit)
if (!cases.length) throw new Error(`No case selected${wanted ? ` for ${wanted}` : ""}`)

const rows = []
for (const item of cases) rows.push(await runRealResearchCase(item))
const summary = summarizeRealResearch(rows)
let baseline: RealResearchSummary | undefined
if (baselinePath && existsSync(baselinePath)) baseline = (JSON.parse(readFileSync(baselinePath, "utf8")) as { summary: RealResearchSummary }).summary
const regression = nondeterministicRegression(summary, baseline)
const run = { benchmark: "real-research-v1", createdAt: new Date().toISOString(), manifestHash: dataset.manifest.manifestHash, mode: "REAL_MODEL_REAL_LEAN_REAL_RETRIEVAL", hardGate: false, summary, regression, rows }
const outputDir = resolve("artifacts/real-research-v1")
mkdirSync(outputDir, { recursive: true })
const output = resolve(outputDir, `run-${Date.now()}.json`)
writeFileSync(output, `${JSON.stringify(run, null, 2)}\n`)
console.log(json ? JSON.stringify({ ...run, output }, null, 2) : `${formatRealResearchReport(summary)}\nArtifact ${output}\nRegression ${regression.classification}`)
