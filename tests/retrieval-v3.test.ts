import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pairedAnalysis, promotionReport, downstreamProofSuccess, baselineRanker, lexicalNameCandidateRanker } from "@mathos/retrieval"
import { assertFrozenManifestFiles, loadRetrievalV3Fixtures, runRetrievalV3, validateRetrievalV3Manifest } from "../scripts/retrieval-v3-eval.ts"

describe("retrieval v3 governance", () => {
  test("frozen manifests validate and holdout gold is unavailable to tuning", () => {
    expect(validateRetrievalV3Manifest("development").caseCount).toBe(6)
    expect(validateRetrievalV3Manifest("holdout").caseCount).toBe(6)
    expect(() => loadRetrievalV3Fixtures("holdout", "tuning")).toThrow("RETRIEVAL_V3_HOLDOUT_GOLD_FORBIDDEN")
  })

  test("freeze validation rejects a changed fixture", () => {
    const root = mkdtempSync(join(tmpdir(), "retrieval-v3-freeze-"))
    writeFileSync(join(root, "fixture.json"), "changed")
    const expected = createHash("sha256").update("original").digest("hex")
    expect(() => assertFrozenManifestFiles({ version: "retrieval-v3", split: "development", frozen: true, caseCount: 1, files: [{ path: "fixture.json", sha256: expected }] }, root)).toThrow("RETRIEVAL_V3_FREEZE_MISMATCH")
  })

  test("paired evaluator reports every metric and downstream proof success", () => {
    const fixtures = loadRetrievalV3Fixtures("development", "tuning")
    const paired = pairedAnalysis(fixtures)
    expect(Object.keys(paired.deltas).sort()).toEqual(["candidateRecall", "final20", "hit1", "hit10", "hit5", "inspect30", "latencyMs", "mrr", "top200"].sort())
    const downstream = downstreamProofSuccess(fixtures, lexicalNameCandidateRanker, 10)
    expect(downstream.attempted).toBe(fixtures.length)
    expect(downstream.rate).toBeGreaterThanOrEqual(downstreamProofSuccess(fixtures, baselineRanker, 10).rate)
  })

  test("promotion requires every gate and missing environment is inconclusive", () => {
    const fixtures = loadRetrievalV3Fixtures("development", "tuning")
    const paired = pairedAnalysis(fixtures)
    const downstream = { baseline: downstreamProofSuccess(fixtures, baselineRanker, 10), candidate: downstreamProofSuccess(fixtures, lexicalNameCandidateRanker, 10) }
    expect(promotionReport(paired, downstream, false).decision).toBe("INCONCLUSIVE")
    expect(promotionReport(paired, downstream, true).decision).toBe("PROMOTE")
    const regressed = structuredClone(paired)
    regressed.deltas.hit10 = -1
    expect(promotionReport(regressed, downstream, true).decision).toBe("REJECT")
    expect(runRetrievalV3("holdout", "final-evaluation", false).decision).toBe("INCONCLUSIVE")
  })
})
