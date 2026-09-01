import { describe, expect, test } from "bun:test"
import { loadRealResearchDataset, validateRealResearchDataset } from "../packages/core/src/evaluation/real-research-eval.ts"
import { formalTargetMatches, hasExplicitFidelityApproval, isTimeoutReason, type RealResearchCaseResult } from "../packages/core/src/evaluation/research-case-runner.ts"
import { nondeterministicRegression, summarizeRealResearch } from "../packages/core/src/evaluation/research-report.ts"

const row = (overrides: Partial<RealResearchCaseResult> = {}): RealResearchCaseResult => ({
  id: "CASE", domain: "logic", difficulty: "direct", status: "COMPLETED", reason: null,
  kernelVerified: true, formalizationSucceeded: true, fidelityApprovalRequired: true, proofCompiled: true,
  proofAttempts: 2, modelCalls: 4, leanCalls: 3, wallClockMs: 100,
  environment: { realModel: true, realLean: true, realRetrieval: true, model: "test", leanVersion: "test" }, ...overrides,
})

describe("real research capability benchmark v1", () => {
  test("frozen manifest is complete, hashed, closed, and covers requested domains", () => {
    const validation = validateRealResearchDataset()
    expect(validation.ok).toBe(true)
    expect(validation.caseCount).toBeGreaterThanOrEqual(40)
    expect(validation.caseCount).toBeLessThanOrEqual(60)
    const dataset = loadRealResearchDataset()
    expect(dataset.cases.every((item) => item.knownProof.exists && !item.provenance.openProblem)).toBe(true)
    expect(new Set(dataset.cases.map((item) => item.domain))).toEqual(new Set(dataset.manifest.categories))
    const finiteSets = dataset.cases.filter((item) => item.domain === "finite sets")
    expect(finiteSets.length).toBeGreaterThan(0)
    expect(finiteSets.every((item) => item.expectedFormalTarget.includes("Finset"))).toBe(true)
  })

  test("a normalized target mismatch cannot count as successful formalization", () => {
    expect(formalTargetMatches("theorem generated (n : Nat) : n + 0 = n", "theorem expected (n : Nat) : n + 0 = n")).toBe(true)
    expect(formalTargetMatches("theorem generated (n : Nat) : n + 1 = n", "theorem expected (n : Nat) : n + 0 = n")).toBe(false)
    expect(formalTargetMatches("theorem generated : True := by trivial", "theorem expected : False")).toBe(false)
  })

  test("fidelity cannot continue without explicit human approval", async () => {
    const benchmarkCase = loadRealResearchDataset().cases[0]!
    expect(await hasExplicitFidelityApproval(undefined, { benchmarkCase, formalStatement: benchmarkCase.expectedFormalTarget })).toBe(false)
    expect(await hasExplicitFidelityApproval(async () => true, { benchmarkCase, formalStatement: benchmarkCase.expectedFormalTarget })).toBe(true)
  })

  test("all model, Lean, step, and generic timeout forms are classified", () => {
    for (const reason of ["STEP_TIMEOUT", "MODEL_TIMEOUT", "LEAN_TIMEOUT", "EXECUTION_TIMEOUT", "request timed out"]) expect(isTimeoutReason(reason)).toBe(true)
    expect(isTimeoutReason("BLOCKED_NEEDS_HUMAN")).toBe(false)
  })

  test("configuration blocks are excluded instead of becoming fake capability results", () => {
    const summary = summarizeRealResearch([row(), row({ status: "BLOCKED_CONFIGURATION", kernelVerified: false, environment: { realModel: false, realLean: false, realRetrieval: false, model: null, leanVersion: null } })])
    expect(summary.eligibleCases).toBe(1)
    expect(summary.blockedConfigurationCases).toBe(1)
    expect(summary.kernelVerifiedRate).toBe(1)
  })

  test("reports all primary and secondary metrics and remains a soft regression signal", () => {
    const current = summarizeRealResearch([row(), row({ status: "TIMED_OUT", kernelVerified: false, proofCompiled: false, proofAttempts: 4, modelCalls: 8, leanCalls: 6, wallClockMs: 300 })])
    expect(current).toMatchObject({ kernelVerifiedRate: 0.5, formalizationSuccessRate: 1, fidelityApprovalRequiredRate: 1, proofCompileRate: 0.5, medianProofAttempts: 3, medianModelCalls: 6, medianLeanCalls: 4.5, medianWallClock: 200, blockedRate: 0, timeoutRate: 0.5 })
    const regression = nondeterministicRegression(current, { ...current, kernelVerifiedRate: 0.8 })
    expect(regression.classification).toBe("REGRESSION_SIGNAL")
    expect(regression.hardGate).toBe(false)
  })
})
