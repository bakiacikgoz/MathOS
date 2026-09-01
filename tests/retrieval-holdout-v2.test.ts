import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { NativeLeanAdapter } from "@mathos/lean"
import { MATHLIB_FIXTURES } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES } from "../packages/retrieval/src/validation-fixtures.ts"
import { RETRIEVAL_HOLDOUT_FIXTURES } from "../packages/retrieval/src/holdout-fixtures.ts"
import { RETRIEVAL_HOLDOUT_V2_FIXTURES, RETRIEVAL_HOLDOUT_V2_METADATA } from "../packages/retrieval/src/holdout-v2-fixtures.ts"
import { formalGoalFingerprint } from "../packages/retrieval/src/holdout-v2-fingerprint.ts"
import { HOLDOUT_V2_QUOTAS, HOLDOUT_V2_SEED } from "../scripts/generate-retrieval-holdout-v2.ts"
import { assertFrozenManifest, bootstrapPaired, classifyPaired } from "../scripts/retrieval-holdout-v2.ts"

const ROOT = "/Users/yazilim/Projects/mathos"
const DATASET = "packages/retrieval/src/holdout-v2-fixtures.ts"
const manifest = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-holdout-v2-manifest.json`, "utf8"))
const sha = (path: string) => createHash("sha256").update(readFileSync(`${ROOT}/${path}`)).digest("hex")
const chunk = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))
const names = (fixtures: Array<{ expectedAnyOf?: string[]; expected?: string[] }>) => new Set(fixtures.flatMap((item) => item.expectedAnyOf ?? item.expected ?? []).map((name) => name.toLowerCase()))

describe("retrieval holdout-v2 frozen unseen dataset", () => {
  test("schema, freeze, size, domains and weak share", () => {
    expect(RETRIEVAL_HOLDOUT_V2_METADATA.datasetVersion).toBe("retrieval-holdout-v2")
    expect(RETRIEVAL_HOLDOUT_V2_METADATA.frozen).toBe(true)
    expect(RETRIEVAL_HOLDOUT_V2_METADATA.samplingSeed).toBe(HOLDOUT_V2_SEED)
    expect(RETRIEVAL_HOLDOUT_V2_FIXTURES.length).toBeGreaterThanOrEqual(150)
    expect(RETRIEVAL_HOLDOUT_V2_FIXTURES.length).toBe(RETRIEVAL_HOLDOUT_V2_METADATA.fixtureCount)
    expect(Object.keys(RETRIEVAL_HOLDOUT_V2_METADATA.domainDistribution)).toHaveLength(18)
    expect(RETRIEVAL_HOLDOUT_V2_METADATA.weakDomainShare).toBeGreaterThanOrEqual(.30)
    expect(RETRIEVAL_HOLDOUT_V2_METADATA.weakDomainShare).toBeLessThanOrEqual(.40)
    for (const fixture of RETRIEVAL_HOLDOUT_V2_FIXTURES) {
      expect(fixture.id).toBeTruthy(); expect(fixture.goal).toContain("theorem "); expect(fixture.expectedAnyOf.length).toBeGreaterThan(0); expect(fixture.domain).toBeTruthy()
      expect(fixture.goalFingerprint).toBe(formalGoalFingerprint(fixture.goal))
    }
  })

  test("fixture ids, expected declarations and normalized goals are unique", () => {
    expect(new Set(RETRIEVAL_HOLDOUT_V2_FIXTURES.map((item) => item.id)).size).toBe(RETRIEVAL_HOLDOUT_V2_FIXTURES.length)
    expect(new Set(RETRIEVAL_HOLDOUT_V2_FIXTURES.flatMap((item) => item.expectedAnyOf.map((name) => name.toLowerCase()))).size).toBe(RETRIEVAL_HOLDOUT_V2_FIXTURES.length)
    expect(new Set(RETRIEVAL_HOLDOUT_V2_FIXTURES.map((item) => item.goalFingerprint)).size).toBe(RETRIEVAL_HOLDOUT_V2_FIXTURES.length)
  })

  test("expected declaration overlap with all closed prior datasets is zero", () => {
    const current = names(RETRIEVAL_HOLDOUT_V2_FIXTURES)
    for (const prior of [names(MATHLIB_FIXTURES), names(RETRIEVAL_VALIDATION_FIXTURES), names(RETRIEVAL_HOLDOUT_FIXTURES)]) {
      expect([...current].filter((name) => prior.has(name))).toEqual([])
    }
  })

  test("normalized goal overlap with all prior datasets is zero", () => {
    const prior = new Set([...MATHLIB_FIXTURES, ...RETRIEVAL_VALIDATION_FIXTURES, ...RETRIEVAL_HOLDOUT_FIXTURES].map((item) => formalGoalFingerprint(item.goal)))
    expect(RETRIEVAL_HOLDOUT_V2_FIXTURES.filter((item) => prior.has(item.goalFingerprint))).toEqual([])
  })

  test("sampling order and quotas are deterministic", () => {
    expect(RETRIEVAL_HOLDOUT_V2_METADATA.domainDistribution).toEqual(HOLDOUT_V2_QUOTAS)
    for (const domain of Object.keys(HOLDOUT_V2_QUOTAS)) {
      const rows = RETRIEVAL_HOLDOUT_V2_FIXTURES.filter((item) => item.domain === domain)
      expect(rows.map((item) => item.sampleHash)).toEqual([...rows].sort((a, b) => a.sampleHash.localeCompare(b.sampleHash)).map((item) => item.sampleHash))
    }
  })

  test("frozen dataset and V2 inputs match manifest hashes", () => {
    expect(sha(DATASET)).toBe(manifest.holdoutV2.sha256)
    expect(assertFrozenManifest()).toBe(true)
  })

  test("all expected declarations pass real Lean #check in batches of at most 30", async () => {
    const adapter = new NativeLeanAdapter()
    for (const batch of chunk(RETRIEVAL_HOLDOUT_V2_FIXTURES.flatMap((item) => item.expectedAnyOf), 30)) {
      expect(batch.length).toBeLessThanOrEqual(30)
      const checked = await adapter.inspectDeclarations(batch, { workspaceRoot: `${ROOT}/demo` } as any, { timeoutMs: 300_000 })
      expect(checked.timedOut).toBe(false); expect(checked.failed).toBe(false)
      expect(checked.inspections).toHaveLength(batch.length)
      expect(checked.inspections.every((item) => item.exists && item.elaborated)).toBe(true)
    }
  }, 1_800_000)

  test("paired classification, failure taxonomy, aggregation, traces and decision are canonical", () => {
    const result = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-holdout-v2-results.json`, "utf8"))
    expect(result.paired.fixtures).toHaveLength(RETRIEVAL_HOLDOUT_V2_FIXTURES.length)
    expect(result.paired.improved + result.paired.unchanged + result.paired.hurt).toBe(RETRIEVAL_HOLDOUT_V2_FIXTURES.length)
    expect(Object.keys(result.failures.baseline).sort()).toEqual(["LEAN_INSPECTION_FAILED", "NOT_GENERATED", "NOT_INDEXED", "OUTSIDE_FINAL20", "OUTSIDE_INSPECT30", "OUTSIDE_TOP200"].sort())
    expect(Object.keys(result.domains)).toHaveLength(18)
    expect(result.weakDomains.baseline).toBeDefined(); expect(result.activation.activeQueries).toBeGreaterThanOrEqual(0); expect(result.displacement.nonGold.promoted20To49).toBeGreaterThanOrEqual(0)
    expect(result.confidenceIntervals95.top200.iterations).toBe(10_000)
    expect(["PROMOTE", "REJECT", "INCONCLUSIVE"]).toContain(result.decision)
    expect(result.productionIntegration).toBe(false)
  })

  test("bootstrap and classification are deterministic", () => {
    const values = [{ baseline: 0, feature: 1 }, { baseline: 1, feature: 1 }, { baseline: 1, feature: 0 }]
    expect(bootstrapPaired(values, 100, 42)).toEqual(bootstrapPaired(values, 100, 42))
    const base: any = { id: "x", domain: "Nat", final20: { found: true, rank: 10 }, union: {}, top200: {}, inspect30: {} }
    const next: any = { id: "x", domain: "Nat", final20: { found: true, rank: 5 }, union: {}, top200: {}, inspect30: {} }
    expect(classifyPaired(base, next).classification).toBe("IMPROVED")
  })

  test("feature remains absent from production source", () => {
    for (const path of ["packages/retrieval/src/retriever.ts", "packages/retrieval/src/context.ts", "packages/core/src/mathos.ts", "packages/core/src/verify.ts"]) {
      const source = readFileSync(`${ROOT}/${path}`, "utf8")
      expect(source).not.toContain("semantic-operator-profile-v2.ts")
      expect(source).not.toContain("SEMANTIC_OPERATOR_PROFILE_V2")
    }
  })
})
