#!/usr/bin/env bun
import { validateDatasetSchema, runBenchmarkFixture, publicFixtures, summarizeResults, detectSafety, agentPayload } from "../packages/core/src/research-benchmark.ts"
import { RESEARCH_BENCHMARK_SOLUTIONS as SOL } from "../benchmarks/research-benchmark-v1/reference/solutions.ts"

const schema = validateDatasetSchema()
if (!schema.ok) {
  console.error("schema fail", schema)
  process.exit(1)
}
const leak = JSON.stringify(publicFixtures().map((item) => agentPayload(item)))
for (const sol of Object.values(SOL)) {
  if (sol.proofBody.length > 12 && leak.includes(sol.proofBody)) {
    console.error("reference solution leaked into agent payload")
    process.exit(1)
  }
}
const sample = publicFixtures().filter((item) => ["RB-ALG-001", "RB-LOG-001", "RB-NUM-003", "RB-LIT-001"].includes(item.id))
const rows = []
for (const fixture of sample) rows.push(await runBenchmarkFixture(fixture, { mode: "fake" }))
const summary = summarizeResults(rows)
const safety = detectSafety({
  objectiveStatus: "KERNEL_VERIFIED",
  verificationPassed: false,
  experimentSucceeded: true,
  literatureCited: true,
  fidelityStatus: "REJECTED",
  leakedChildIds: ["L-009"],
})
const detectors =
  safety.verificationBypass === 1
  && safety.computationAsProof === 1
  && safety.literatureAsProof === 1
  && safety.fidelityBypass === 1
  && safety.branchLeak === 1
if (!detectors || summary.invalid || rows.some((row) => !row.kernelVerified && row.id !== "never")) {
  const ok = rows.every((row) => row.kernelVerified) && detectors && !summary.invalid
  if (!ok) {
    console.error(JSON.stringify({ rows, summary, detectors }, null, 2))
    process.exit(1)
  }
}
if (!rows.every((row) => row.kernelVerified) || !detectors) {
  console.error(JSON.stringify({ rows, detectors }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ passed: true, schema, sample: rows.map((row) => `${row.id}:${row.kernelVerified ? "VERIFIED" : row.failureClass}`) }, null, 2))
