import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { profileGoal } from "@mathos/retrieval"
import { extractSemanticOperatorProfile } from "../packages/retrieval/src/semantic-operator-profile.ts"
import { applyFrozenSemanticV2RankCap, evaluateFrozenSemanticV2Compatibility, MORPHOLOGY_BOOST, RELATION_POLICY } from "../packages/retrieval/src/semantic-operator-profile-v2.ts"
import { boundedSemanticRank, evaluateSemanticCandidateCompatibility } from "../packages/retrieval/src/semantic-operator-profile-v2-stability.ts"
import { assertStabilityDataset } from "../scripts/semantic-profile-v2-stability.ts"

const ROOT = "/Users/yazilim/Projects/mathos"
const stability = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-operator-profile-v2-stability.json`, "utf8"))
const spec = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-operator-profile-v2.json`, "utf8"))
const hashes = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-operator-profile-v2-frozen-hashes.json`, "utf8"))
const immutable = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-v1-immutable.json`, "utf8"))
const sha = (path: string) => createHash("sha256").update(readFileSync(`${ROOT}/${path}`)).digest("hex")
const declaration = (name: string, signature: string) => ({ name, signature, kind: "theorem" as const, origin: "mathlib" as const })

describe("semantic operator profile V2 stability and freeze", () => {
  test("typed compatibility blocks known formal incompatibility", () => {
    const result = evaluateSemanticCandidateCompatibility({
      strategy: "COMP-D",
      goalProfile: profileGoal("theorem g (x : Nat) : x * x = x := by"),
      goalSemanticTokens: ["mul"],
      declaration: declaration("Int.mul_self", "(x : Int) : x * x = x"),
      inspection: { name: "Int.mul_self", exists: true, type: "(x : Int) → x * x = x", constants: [], typeConstructors: ["Int"], diagnostics: [], elaborated: true, propositionShape: { equality: true } },
    })
    expect(result.typeCompatible).toBe("NO")
    expect(result.blockedByKnownIncompatibility).toBe(true)
    expect(result.eligibleForSemanticBoost).toBe(false)
  })

  test("unknown metadata is not incompatible but generic singleton is blocked", () => {
    const result = evaluateSemanticCandidateCompatibility({
      strategy: "COMP-C",
      goalProfile: profileGoal("theorem g (x : α) : x + x = x := by"),
      goalSemanticTokens: ["add"],
      declaration: declaration("Foo.add_rule", "P x"),
    })
    expect(result.typeCompatible).toBe("UNKNOWN")
    expect(result.blockedByKnownIncompatibility).toBe(false)
    expect(result.eligibleForSemanticBoost).toBe(false)
  })

  test("two exact matches are allowed", () => {
    const result = evaluateSemanticCandidateCompatibility({
      strategy: "COMP-B",
      goalProfile: profileGoal("theorem g (x : Nat) : x + x * x = x := by"),
      goalSemanticTokens: ["add", "mul"],
      declaration: declaration("Nat.add_mul_rule", "(x : Nat) : x + x * x = x"),
    })
    expect(result.semanticMatchCount).toBeGreaterThanOrEqual(2)
    expect(result.eligibleForSemanticBoost).toBe(true)
  })

  test("one exact match plus compatible type is allowed", () => {
    const result = evaluateFrozenSemanticV2Compatibility({
      goalProfile: profileGoal("theorem g (x : Nat) : x ^ 2 = x := by"),
      goalSemanticTokens: ["pow"],
      declaration: declaration("Nat.pow_rule", "(x : Nat) : x ^ 2 = x"),
    })
    expect(result.typeCompatible).toBe("YES")
    expect(result.eligibleForSemanticBoost).toBe(true)
  })

  test("rank cap is explicit and deterministic", () => {
    expect(boundedSemanticRank(100, 10, 4, true)).toBe(96)
    expect(applyFrozenSemanticV2RankCap(100, 10, true)).toBe(96)
    expect(applyFrozenSemanticV2RankCap(100, 10, true)).toBe(applyFrozenSemanticV2RankCap(100, 10, true))
    expect(applyFrozenSemanticV2RankCap(100, 110, true)).toBe(100)
  })

  test("cap sensitivity runner recorded all sequential caps", () => {
    for (const cap of [4, 6, 8, 10, 12, 16, 20]) {
      expect(stability.capSensitivity[String(cap)]).toBeDefined()
      expect(stability.capSensitivity[String(cap)].development.displacement.p95RankMovement).toBeGreaterThanOrEqual(0)
      expect(stability.capSensitivity[String(cap)].validation.paired.completeRegressions).toBe(0)
    }
    expect(stability.selectedCap).toBe(4)
  })

  test("rank displacement has no 20+ non-gold promotions in final config", () => {
    for (const set of ["development", "validation"]) {
      const buckets = stability.final[set].displacement.nonGold
      expect(buckets.promoted100Plus).toBe(0)
      expect(buckets.promoted50To99).toBe(0)
      expect(buckets.promoted20To49).toBe(0)
    }
  })

  test("leave-one-domain-out covers all validation domains", () => {
    expect(Object.keys(stability.leaveOneDomainOut)).toHaveLength(12)
    for (const result of Object.values<any>(stability.leaveOneDomainOut)) {
      expect(result.fixtureCount).toBe(55)
      expect(result.final20Delta).toBeGreaterThanOrEqual(0)
    }
  })

  test("relation exact gate does not confuse function composition", () => {
    expect(extractSemanticOperatorProfile("f ∘ g").sequence).toEqual(["comp"])
    expect(extractSemanticOperatorProfile("r ∘r p").sequence).toEqual(["relation_comp"])
    expect(stability.selectedRelation).toBe("REL-OFF")
    expect(RELATION_POLICY).toBe("DIAGNOSTIC_ONLY")
  })

  test("morphology boost is permanently disabled", () => {
    expect(MORPHOLOGY_BOOST).toBe("DISABLED")
    expect(spec.morphologyPolicy.MORPHOLOGY_BOOST).toBe("DISABLED")
    expect(spec.disabledFamilies.morphology).toEqual(["zero", "one", "assoc", "comm", "self"])
  })

  test("promotion precision and opportunity recall are retrieval utility metrics", () => {
    const utility = stability.final.validation.utility
    expect(utility.semanticPromotionPrecision).toBeGreaterThanOrEqual(0)
    expect(utility.semanticOpportunityRecall).toBeGreaterThanOrEqual(0)
    expect(utility.definition).toContain("Not probability")
  })

  test("final frozen spec serializes and hashes exactly", () => {
    expect(spec.version).toBe("SEMANTIC_OPERATOR_PROFILE_V2")
    expect(spec.status).toBe("FROZEN")
    expect(spec.frozen).toBe(true)
    expect(sha(hashes.spec.path)).toBe(hashes.spec.sha256)
    expect(sha(hashes.implementation.path)).toBe(hashes.implementation.sha256)
  })

  test("V1 and closed holdout-v1 remain immutable", () => {
    for (const item of Object.values<any>(immutable).filter((value) => value?.path)) expect(sha(item.path)).toBe(item.sha256)
  })

  test("holdout evaluation is forbidden", () => {
    expect(() => assertStabilityDataset("retrieval-holdout-v1")).toThrow("forbidden")
    expect(() => assertStabilityDataset("holdout")).toThrow("forbidden")
    expect(() => assertStabilityDataset("validation")).not.toThrow()
  })

  test("frozen V2 remains production-isolated", () => {
    for (const path of ["packages/retrieval/src/retriever.ts", "packages/core/src/mathos.ts", "packages/core/src/verify.ts", "packages/retrieval/src/context.ts"]) {
      const source = readFileSync(`${ROOT}/${path}`, "utf8")
      expect(source).not.toContain("semantic-operator-profile-v2.ts")
      expect(source).not.toContain("SEMANTIC_OPERATOR_PROFILE_V2")
    }
    expect(spec.productionIntegration).toBe(false)
  })
})
