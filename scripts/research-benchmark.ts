#!/usr/bin/env bun
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  credentialsAvailable,
  datasetHash,
  environmentFingerprint,
  formatHumanReport,
  publicFixtures,
  runBenchmarkFixture,
  selectFixtures,
  summarizeResults,
  validateDatasetSchema,
  validateLeanReferences,
  writeDatasetArtifact,
  writeGovernance,
  RESULTS_DIR,
  BENCHMARK_VERSION,
} from "../packages/core/src/research-benchmark.ts"

const args = process.argv.slice(2)
const json = args.includes("--json")
const validate = args.includes("--validate")
const fake = args.includes("--fake") || (!args.includes("--model") && !validate)
const model = args.includes("--model")
const team = args.includes("--mode") && args[args.indexOf("--mode") + 1]?.includes("team")
const tier = args.includes("--tier") ? args[args.indexOf("--tier") + 1] : undefined
const domain = args.includes("--domain") ? args[args.indexOf("--domain") + 1] : undefined
const fixture = args.includes("--fixture") ? args[args.indexOf("--fixture") + 1] : undefined
const resumeId = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : undefined

if (validate) {
  writeDatasetArtifact()
  writeGovernance()
  const schema = validateDatasetSchema()
  const lean = await validateLeanReferences()
  const report = { schema, lean, datasetHash: datasetHash(), environment: environmentFingerprint() }
  console.log(json ? JSON.stringify(report, null, 2) : `schema ${schema.ok} lean ${lean.statements} hash ${schema.datasetHash}`)
  if (!schema.ok || !lean.statements) process.exit(1)
  process.exit(0)
}

if (model && !credentialsAvailable()) {
  const skipped = { result: "SKIPPED_NO_CREDENTIALS", datasetHash: datasetHash() }
  console.log(json ? JSON.stringify(skipped, null, 2) : "REAL MODEL BENCHMARK SKIPPED_NO_CREDENTIALS")
  process.exit(0)
}

const fixtures = selectFixtures({ tier, domain, fixture, team })
mkdirSync(RESULTS_DIR, { recursive: true })
const runId = resumeId ?? `BENCH-${Date.now()}`
const out = join(RESULTS_DIR, `${runId}.json`)
let completed = new Set<string>()
let results: Awaited<ReturnType<typeof runBenchmarkFixture>>[] = []
if (resumeId && existsSync(out)) {
  const prev = JSON.parse(readFileSync(out, "utf8")) as { results: Array<{ id: string }> }
  results = prev.results as Awaited<ReturnType<typeof runBenchmarkFixture>>[]
  completed = new Set(prev.results.map((row) => row.id))
}

for (const item of fixtures) {
  if (completed.has(item.id)) continue
  const row = await runBenchmarkFixture(item, { mode: model ? "model" : "fake", lean: "fake" })
  results.push(row)
  writeFileSync(out, `${JSON.stringify({ id: runId, benchmarkVersion: BENCHMARK_VERSION, datasetHash: datasetHash(), mode: team ? "MULTI_AGENT_SEQUENTIAL" : "SINGLE_AGENT", environment: environmentFingerprint(), results }, null, 2)}\n`)
}

const summary = summarizeResults(results)
const text = formatHumanReport(summary, { mode: model ? "model" : "fake", datasetHash: datasetHash() })
if (json) console.log(JSON.stringify({ runId, summary, results, fixtures: publicFixtures().length }, null, 2))
else console.log(text)
if (summary.invalid) process.exit(1)
