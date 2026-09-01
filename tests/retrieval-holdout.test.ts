import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { DEFAULT_RETRIEVAL_CONFIG, StratifiedInspectSelector, extractSemanticOperatorProfile, profileGoal } from "@mathos/retrieval"
import { MATHLIB_FIXTURES } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES } from "../packages/retrieval/src/validation-fixtures.ts"
import { RETRIEVAL_HOLDOUT_FIXTURES, RETRIEVAL_HOLDOUT_METADATA } from "../packages/retrieval/src/holdout-fixtures.ts"
import { bootstrapPaired, classifyPairedRanks } from "../scripts/retrieval-holdout.ts"
import { validateRetrievalHoldout } from "../scripts/validate-retrieval-holdout.ts"

const ROOT = "/Users/yazilim/Projects/mathos"
const SPEC = `${ROOT}/benchmarks/retrieval-experiments/semantic-operator-profile-v1.json`
const INDEX = `${ROOT}/demo/.mathos/index/declarations.json`
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")

describe("semantic operator profile v1", () => {
  test("normalizes arithmetic, order, set, function and relation symbols in sequence", () => {
    const profile = extractSemanticOperatorProfile("theorem t : a + b - c * d / e ^ n ≤ x ∪ y ∩ z ⊆ s ∧ q ∈ s ∧ #s > 0 ∧ f ∘ g = r ∘r p")
    expect(profile.sequence).toEqual(["add", "sub", "mul", "div", "pow", "le", "union", "inter", "subset", "mem", "card", "gt", "comp", "relation_comp"])
    expect(profile.families).toEqual(["ARITHMETIC", "ORDER", "SET_COLLECTION", "FUNCTION", "RELATION"])
  })

  test("preserves operator multiplicity and ordered sequence", () => {
    const neg = extractSemanticOperatorProfile("theorem t : -(-x) = x")
    expect(neg.multiplicity.neg).toBe(2)
    expect(neg.sequence).toEqual(["neg", "neg"])
    const comp = extractSemanticOperatorProfile("theorem t : f ∘ g ∘ h = k")
    expect(comp.multiplicity.comp).toBe(2)
    expect(comp.sequence).toEqual(["comp", "comp"])
  })

  test("extracts pow, inverse and narrow formal morphology", () => {
    const profile = extractSemanticOperatorProfile("theorem t (a b c : Nat) : a ^ 1 + b + c = a + (b + c)")
    expect(profile.multiplicity.pow).toBe(1)
    expect(profile.morphologyTokens).toEqual(["pow", "add", "one", "assoc"])
    expect(extractSemanticOperatorProfile("theorem t : x⁻¹⁻¹ = x").multiplicity.inv).toBe(2)
    expect(extractSemanticOperatorProfile("theorem t : x - x = 0").morphologyTokens).toEqual(["sub", "zero", "self"])
    expect(extractSemanticOperatorProfile("theorem t : a + b = b + a").morphologyTokens).toContain("comm")
  })

  test("extracts relation composition and exact formal properties", () => {
    const profile = extractSemanticOperatorProfile("theorem t : r ∘r p ∘r q = s")
    expect(profile.relation).toEqual({ hasComposition: true, compositionCount: 2 })
    expect(extractSemanticOperatorProfile("theorem t : Symmetric r").relation?.property).toBe("SYMMETRIC")
  })

  test("does not hallucinate semantics from natural-language words", () => {
    const profile = extractSemanticOperatorProfile("This prose says add, multiply, compose, and symmetric without formal notation")
    expect(profile.sequence).toEqual([])
    expect(profile.morphologyTokens).toEqual([])
    expect(profile.relation).toBeUndefined()
  })

  test("feature specification is frozen", () => {
    const spec = JSON.parse(readFileSync(SPEC, "utf8"))
    expect(spec.featureVersion).toBe("SEMANTIC_OPERATOR_PROFILE_V1")
    expect(spec.selectedFromExperiments).toEqual(["ALG-D", "NAT-B", "REL-A"])
    expect(spec.frozen).toBe(true)
    expect(spec.createdAt).toBe("2026-08-24")
  })
})

describe("retrieval holdout v1", () => {
  test("schema, size, metadata and three-way declaration separation", () => {
    expect(RETRIEVAL_HOLDOUT_METADATA.datasetVersion).toBe("retrieval-holdout-v1")
    expect(RETRIEVAL_HOLDOUT_METADATA.frozen).toBe(true)
    expect(RETRIEVAL_HOLDOUT_FIXTURES.length).toBe(100)
    const dev = new Set(MATHLIB_FIXTURES.flatMap((fixture) => fixture.expected).map((name) => name.toLowerCase()))
    const validation = new Set(RETRIEVAL_VALIDATION_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf).map((name) => name.toLowerCase()))
    const names = RETRIEVAL_HOLDOUT_FIXTURES.flatMap((fixture) => fixture.expectedAnyOf)
    expect(new Set(names).size).toBe(100)
    expect(names.filter((name) => dev.has(name.toLowerCase()))).toEqual([])
    expect(names.filter((name) => validation.has(name.toLowerCase()))).toEqual([])
    for (const fixture of RETRIEVAL_HOLDOUT_FIXTURES) {
      expect(fixture.id.length).toBeGreaterThan(0)
      expect(fixture.goal.startsWith("theorem ")).toBe(true)
      expect(fixture.expectedAnyOf.length).toBeGreaterThan(0)
      expect(fixture.domain.length).toBeGreaterThan(0)
    }
  })

  test("all expected declarations pass real Lean check", async () => {
    const report = await validateRetrievalHoldout()
    expect(report.failed).toBe(false)
    expect(report.missing).toEqual([])
    expect(report.developmentOverlap).toEqual([])
    expect(report.validationOverlap).toEqual([])
  }, 240_000)

  test("paired classification and deterministic seeded bootstrap", () => {
    expect(classifyPairedRanks(null, 10)).toBe("IMPROVED")
    expect(classifyPairedRanks(5, 10)).toBe("HURT")
    expect(classifyPairedRanks(5, 5)).toBe("UNCHANGED")
    const values = [{ baseline: 0, feature: 1 }, { baseline: 1, feature: 1 }, { baseline: 1, feature: 0 }, { baseline: 0, feature: 1 }]
    const first = bootstrapPaired(values, 1_000, 42)
    const second = bootstrapPaired(values, 1_000, 42)
    expect(first).toEqual(second)
    expect(first.estimate).toBe(0.25)
    expect(first.low).toBeLessThanOrEqual(first.estimate)
    expect(first.high).toBeGreaterThanOrEqual(first.estimate)
  })

  test("feature is production-isolated and index/config remain unchanged", () => {
    const beforeIndex = hash(INDEX)
    const beforeConfig = structuredClone(DEFAULT_RETRIEVAL_CONFIG)
    extractSemanticOperatorProfile("theorem t : a + b = b + a")
    expect(DEFAULT_RETRIEVAL_CONFIG).toEqual(beforeConfig)
    expect(DEFAULT_RETRIEVAL_CONFIG.inspectTopK).toBe(30)
    expect(new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select([], profileGoal("a = a"), 30).selectorVersion).toBe("stratified-v2")
    const productionSources = ["packages/retrieval/src/retriever.ts", "packages/core/src/mathos.ts", "packages/core/src/proof-context.ts"].filter((relative) => { try { readFileSync(`${ROOT}/${relative}`); return true } catch { return false } }).map((relative) => readFileSync(`${ROOT}/${relative}`, "utf8")).join("\n")
    expect(productionSources).not.toContain("SEMANTIC_OPERATOR_PROFILE_V1")
    expect(productionSources).not.toContain("semantic-operator-profile")
    expect(hash(INDEX)).toBe(beforeIndex)
  })
})
