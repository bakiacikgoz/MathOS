import { describe, expect, test } from "bun:test"
import {
  agentPayload,
  datasetHash,
  detectSafety,
  publicFixtures,
  runBenchmarkFixture,
  validateDatasetSchema,
} from "../packages/core/src/research-benchmark.ts"
import { RESEARCH_BENCHMARK_SOLUTIONS } from "../benchmarks/research-benchmark-v1/reference/solutions.ts"

describe("research benchmark v1", () => {
  test("schema, uniqueness, coverage, freeze hash", () => {
    const schema = validateDatasetSchema()
    expect(schema.ok).toBe(true)
    expect(schema.fixtureCount).toBe(40)
    expect(datasetHash()).toHaveLength(64)
  })

  test("reference proofs are not in agent payloads", () => {
    const blob = JSON.stringify(publicFixtures().map((item) => agentPayload(item)))
    for (const sol of Object.values(RESEARCH_BENCHMARK_SOLUTIONS)) {
      if (sol.proofBody.length > 12) expect(blob.includes(sol.proofBody)).toBe(false)
    }
    expect(JSON.stringify(publicFixtures()[0])).not.toContain("proofBody")
  })

  test("safety detectors fire independently", () => {
    const safety = detectSafety({
      objectiveStatus: "KERNEL_VERIFIED",
      verificationPassed: false,
      experimentSucceeded: true,
      literatureCited: true,
      fidelityStatus: "REJECTED",
      leakedChildIds: ["L-009"],
    })
    expect(safety.verificationBypass).toBe(1)
    expect(safety.computationAsProof).toBe(1)
    expect(safety.literatureAsProof).toBe(1)
    expect(safety.fidelityBypass).toBe(1)
    expect(safety.branchLeak).toBe(1)
    const clean = detectSafety({
      objectiveStatus: "KERNEL_VERIFIED",
      verificationPassed: true,
      experimentSucceeded: true,
      literatureCited: true,
      fidelityStatus: "HUMAN_APPROVED",
      leakedChildIds: [],
    })
    expect(clean.verificationBypass + clean.computationAsProof + clean.literatureAsProof + clean.fidelityBypass + clean.branchLeak).toBe(0)
  })

  test("clean workspace isolation", async () => {
    const a = await runBenchmarkFixture(publicFixtures().find((item) => item.id === "RB-ALG-001")!, { mode: "fake" })
    const b = await runBenchmarkFixture(publicFixtures().find((item) => item.id === "RB-LOG-001")!, { mode: "fake" })
    expect(a.kernelVerified).toBe(true)
    expect(b.kernelVerified).toBe(true)
    expect(a.id).not.toBe(b.id)
  }, 20000)

  test("fake fixture uses verification provenance", async () => {
    const row = await runBenchmarkFixture(publicFixtures().find((item) => item.id === "RB-ALG-001")!, { mode: "fake" })
    expect(row.kernelVerified).toBe(true)
    expect(row.safety.verificationBypass).toBe(0)
    expect(row.formalized).toBe(true)
    expect(row.fidelityApproved).toBe(true)
  }, 20000)

  test("computation and literature do not count as proof without gate", async () => {
    const comp = await runBenchmarkFixture(publicFixtures().find((item) => item.id === "RB-NUM-003")!, { mode: "fake" })
    const lit = await runBenchmarkFixture(publicFixtures().find((item) => item.id === "RB-LIT-001")!, { mode: "fake" })
    expect(comp.kernelVerified).toBe(true)
    expect(comp.safety.computationAsProof).toBe(0)
    expect(lit.kernelVerified).toBe(true)
    expect(lit.safety.literatureAsProof).toBe(0)
  }, 30000)
})
