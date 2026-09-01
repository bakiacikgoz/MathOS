import { describe, expect, test } from "bun:test"
import { MATHLIB_FIXTURES } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES, RETRIEVAL_VALIDATION_METADATA } from "../packages/retrieval/src/validation-fixtures.ts"
import { evaluateRetrieval, failureAggregate } from "../scripts/retrieval-eval.ts"
import { compareRetrievalBaseline } from "../scripts/retrieval-regression.ts"
import { validateRetrievalFixtures } from "../scripts/validate-retrieval-fixtures.ts"

let reportPromise: ReturnType<typeof evaluateRetrieval> | null = null
function validationReport() {
  reportPromise ??= evaluateRetrieval({ set: "validation" })
  return reportPromise
}

describe("retrieval validation dataset", () => {
  test("schema, metadata and development separation", () => {
    expect(RETRIEVAL_VALIDATION_METADATA.datasetVersion).toBe("retrieval-validation-v1")
    expect(RETRIEVAL_VALIDATION_METADATA.frozen).toBe(true)
    expect(RETRIEVAL_VALIDATION_FIXTURES.length).toBeGreaterThanOrEqual(50)
    const development = new Set(MATHLIB_FIXTURES.flatMap((fixture) => fixture.expected).map((name) => name.toLowerCase()))
    for (const fixture of RETRIEVAL_VALIDATION_FIXTURES) {
      expect(fixture.id.length).toBeGreaterThan(0)
      expect(fixture.goal.startsWith("theorem ")).toBe(true)
      expect(fixture.expectedAnyOf.length).toBeGreaterThan(0)
      expect(fixture.domain.length).toBeGreaterThan(0)
      expect(fixture.expectedAnyOf.some((name) => development.has(name.toLowerCase()))).toBe(false)
    }
  })

  test("all expected declarations pass real Lean #check", async () => {
    const report = await validateRetrievalFixtures()
    expect(report.fixtureCount).toBe(60)
    expect(report.duplicatesWithDevelopment).toEqual([])
    expect(report.missing).toEqual([])
    expect(report.failed).toBe(false)
  }, 240_000)

  test("failure taxonomy is exhaustive and typed", () => {
    const result = failureAggregate([
      { failureReason: "NOT_INDEXED" },
      { failureReason: "OUTSIDE_TOP200" },
      { failureReason: "OUTSIDE_TOP200" },
      { failureReason: null },
    ])
    expect(result.NOT_INDEXED).toBe(1)
    expect(result.OUTSIDE_TOP200).toBe(2)
    expect(result.NOT_GENERATED).toBe(0)
    expect(Object.keys(result).sort()).toEqual(["LEAN_INSPECTION_FAILED", "NOT_GENERATED", "NOT_INDEXED", "OUTSIDE_FINAL20", "OUTSIDE_INSPECT30", "OUTSIDE_TOP200"].sort())
  })

  test("per-domain, fusion sensitivity and header-vs-Lean aggregation", async () => {
    const report = await validationReport()
    expect(Object.keys(report.domainResults)).toHaveLength(12)
    expect(Object.values(report.domainResults).every((row) => row.fixtureCount === 5)).toBe(true)
    expect(report.sensitivity["0.45/0.55"]).toBeDefined()
    expect(report.sensitivity.RRF).toBeDefined()
    expect(report.sensitivity["stage1-only"]).toBeDefined()
    expect(report.sensitivity["lean-only"]).toBeDefined()
    expect(report.headerVsLean.improved + report.headerVsLean.unchanged + report.headerVsLean.hurt).toBe(60)
  }, 60_000)

  test("canonical baseline serializes and regression comparison reports deltas", async () => {
    const baseline = await Bun.file("benchmarks/retrieval-validation-baseline.json").json()
    expect(baseline.dataset.datasetVersion).toBe("retrieval-validation-v1")
    const same = compareRetrievalBaseline(baseline, baseline)
    expect(same.passed).toBe(true)
    expect(Object.values(same.comparisons).every((row) => row.delta === 0)).toBe(true)
  })

  test("JSON benchmark output is machine readable", () => {
    const result = Bun.spawnSync(["bun", "scripts/retrieval-eval.ts", "--json"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", timeout: 60_000 })
    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(new TextDecoder().decode(result.stdout))
    expect(parsed.development.set).toBe("development")
    expect(parsed.development.fixtureCount).toBe(20)
    expect(parsed.validation.set).toBe("validation")
    expect(parsed.validation.fixtureCount).toBe(60)
    expect(parsed.validation.metrics.union).toBeNumber()
  }, 70_000)
})
