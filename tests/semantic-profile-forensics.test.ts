import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { extractV2CandidateEvidence, V2_CANDIDATE_CONFIG } from "../packages/retrieval/src/semantic-operator-profile-v2-candidate.ts"
import { assertV2SetAllowed } from "../scripts/semantic-profile-v2.ts"

const ROOT = resolve(import.meta.dir, "..")
const immutable = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-v1-immutable.json`, "utf8"))
const regressions = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-v1-regressions.json`, "utf8"))
const candidate = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-operator-profile-v2-candidate.json`, "utf8"))
const sha256 = (path: string) => createHash("sha256").update(readFileSync(`${ROOT}/${path}`, "utf8").replaceAll("\r\n", "\n")).digest("hex")

describe("semantic profile regression forensics", () => {
  test("V1 spec and closed holdout artifacts are immutable", () => {
    for (const item of Object.values<any>(immutable).filter((value) => value?.path)) expect(sha256(item.path)).toBe(item.sha256)
    expect(immutable.immutable).toBe(true)
  })

  test("paired regression corpus contains all seven hurts", () => {
    expect(regressions.corpus).toHaveLength(7)
    expect(regressions.corpus.filter((row: any) => ["List", "Option", "Topology"].includes(row.domain))).toHaveLength(4)
    expect(regressions.corpus.filter((row: any) => row.baselineStage === "FINAL20" && row.featureRank === null)).toHaveLength(1)
    for (const row of regressions.corpus) {
      expect(row.addedSemanticTokens).toBeArray()
      expect(row.affectedCandidates).toBeArray()
      expect(row.baseline).toBeDefined()
      expect(row.feature).toBeDefined()
    }
  })

  test("token attribution and retrieval utility precision are explicit", () => {
    for (const token of ["add", "sub", "mul", "div", "pow", "inv", "neg", "le", "lt", "union", "inter", "subset", "mem", "card", "comp", "relation_comp", "zero", "one", "assoc", "comm", "self"]) {
      expect(regressions.tokenAttribution[token]).toBeDefined()
      const row = regressions.tokenAttribution[token]
      expect(row.fixturesActivated).toBeGreaterThanOrEqual(0)
      if (row.utilityPrecision !== null) expect(row.utilityPrecision).toBeGreaterThanOrEqual(0)
    }
    expect(regressions.formula.utilityPrecision).toContain("usefulPromotions")
  })

  test("exact and inferred evidence authorities stay separate", () => {
    const evidence = extractV2CandidateEvidence("theorem t (x : Nat) : (x + 0) + 1 = x + 1 := by")
    expect(evidence.find((row) => row.token === "add")?.authority).toBe("EXACT_NOTATION")
    expect(evidence.find((row) => row.token === "zero")?.authority).toBe("DERIVED_STRUCTURE")
    expect(evidence.find((row) => row.token === "zero")?.activeForBoost).toBe(false)
  })

  test("all requested ablations are recorded", () => {
    for (const set of ["development", "validation"]) for (const mode of ["EXACT_ONLY", "EXACT_MULTIPLICITY", "EXACT_SEQUENCE", "MORPHOLOGY_ONLY", "OPERATORS_MORPHOLOGY", "RELATION_ONLY", "ARITHMETIC_ONLY"]) expect(candidate.ablations[set][mode]).toBeDefined()
  })

  test("V2 uses conjunction/type compatibility, generic suppression and bounded boost", () => {
    expect(V2_CANDIDATE_CONFIG.candidateCompatibility).toContain("AT_LEAST_TWO")
    expect(V2_CANDIDATE_CONFIG.genericSingleTokenSuppression).toContain("add")
    expect(V2_CANDIDATE_CONFIG.maxSemanticRankContribution).toBe(12)
    expect(candidate.gatingRules.join(" ")).toContain("two exact")
  })

  test("rank displacement histogram separates gold and non-gold", () => {
    for (const group of ["gold", "nonGold"]) for (const bucket of ["promoted100Plus", "promoted50To99", "promoted20To49", "promoted1To19", "unchanged", "demoted"]) expect(regressions.displacementHistogram[group][bucket]).toBeGreaterThanOrEqual(0)
  })

  test("V2 evaluation cannot target holdout-v1", () => {
    expect(() => assertV2SetAllowed("holdout-v1")).toThrow("forbidden")
    expect(() => assertV2SetAllowed("holdout")).toThrow("forbidden")
    expect(() => assertV2SetAllowed("validation")).not.toThrow()
  })

  test("candidate meets validation utility and regression budgets", () => {
    expect(candidate.frozen).toBe(false)
    expect(candidate.status).toBe("candidate")
    expect(candidate.validationResults.delta.final20).toBeGreaterThanOrEqual(0)
    expect(candidate.validationResults.delta.hit10).toBeGreaterThanOrEqual(0)
    expect(candidate.validationResults.delta.mrr).toBeGreaterThanOrEqual(0)
    expect(candidate.validationResults.paired.hurt).toBe(0)
    expect(candidate.validationResults.paired.completeRegressions).toBe(0)
  })

  test("candidate remains production-isolated", () => {
    for (const path of ["packages/retrieval/src/retriever.ts", "packages/core/src/mathos.ts", "packages/core/src/verify.ts"]) {
      const source = readFileSync(`${ROOT}/${path}`, "utf8")
      expect(source).not.toContain("semantic-operator-profile-v2-candidate")
      expect(source).not.toContain("SEMANTIC_OPERATOR_PROFILE_V2_CANDIDATE")
    }
  })
})
