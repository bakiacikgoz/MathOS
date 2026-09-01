import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { downstreamProofSuccess, pairedAnalysis, promotionReport } from "@mathos/retrieval"
import { assertFrozenManifestFiles, assertRetrievalV3SplitIndependence, evaluateHarnessRetrievalV3, loadRetrievalV3Fixtures, runRetrievalV3, semanticTargetFingerprint, validateRetrievalV3Manifest } from "../scripts/retrieval-v3-eval.ts"

describe("retrieval v3 governance", () => {
  test("frozen manifests validate, splits are semantically disjoint, and holdout gold is unavailable to tuning", () => {
    expect(validateRetrievalV3Manifest("development").caseCount).toBe(6)
    expect(validateRetrievalV3Manifest("holdout").caseCount).toBe(6)
    expect(() => assertRetrievalV3SplitIndependence()).not.toThrow()
    expect(() => loadRetrievalV3Fixtures("holdout", "tuning")).toThrow("RETRIEVAL_V3_HOLDOUT_GOLD_FORBIDDEN")
  })

  test("semantic duplicate guard rejects duplicates anywhere across the two splits", () => {
    const root = mkdtempSync(join(tmpdir(), "retrieval-v3-splits-"))
    cpSync("benchmarks/retrieval-v3/development", join(root, "benchmarks/retrieval-v3/development"), { recursive: true })
    cpSync("benchmarks/retrieval-v3/holdout", join(root, "benchmarks/retrieval-v3/holdout"), { recursive: true })
    const path = join(root, "benchmarks/retrieval-v3/holdout/fixtures.json")
    const holdout = JSON.parse(readFileSync(path, "utf8")); holdout.cases[0].goal = JSON.parse(readFileSync(join(root, "benchmarks/retrieval-v3/development/fixtures.json"), "utf8")).cases[0].goal
    writeFileSync(path, JSON.stringify(holdout))
    expect(() => assertRetrievalV3SplitIndependence(root)).toThrow("RETRIEVAL_V3_SEMANTIC_DUPLICATE")
  })

  test("semantic fingerprint canonicalizes binder renaming and simple commutative reorderings", () => {
    const a = "theorem first (a b : Nat) : a + b = b + a"
    const b = "theorem second (x y : Nat) : y + x = x + y"
    expect(semanticTargetFingerprint(a)).toBe(semanticTargetFingerprint(b))
  })

  test("injected adapters and threshold overrides cannot reach the production promotion path", async () => {
    const fake = { detect: async () => ({ leanAvailable: true, lakeAvailable: true, mathlib: true }), probeCompile: async () => ({ ok: true }), checkProof: async () => ({ result: "KERNEL_ACCEPTED", diagnostics: [] }) }
    expect((await evaluateHarnessRetrievalV3("holdout", "final-evaluation", { adapter: fake, minimumCorpusSize: 1 })).decision).toBe("INCONCLUSIVE")
    expect((await (runRetrievalV3 as any)("holdout", "final-evaluation", { adapter: fake, minimumCorpusSize: 1 })).decision).toBe("INCONCLUSIVE")
  })

  test("freeze validation rejects a changed fixture", () => {
    const root = mkdtempSync(join(tmpdir(), "retrieval-v3-freeze-")); writeFileSync(join(root, "fixture.json"), "changed")
    const expected = createHash("sha256").update("original").digest("hex")
    expect(() => assertFrozenManifestFiles({ version: "retrieval-v3", split: "development", frozen: true, caseCount: 1, files: [{ path: "fixture.json", sha256: expected }], governance: { minimumSourceCorpusSize: 1000, minimumPipelineStageSize: 200, requiredCorpusProvenance: "SCANNED_INDEX" } }, root)).toThrow("RETRIEVAL_V3_FREEZE_MISMATCH")
  })

  test("production pipeline supplies representative candidate stages", () => {
    const loaded = loadRetrievalV3Fixtures("development", "tuning")
    expect(Object.values(loaded.corpusSizes).every((size) => size >= 30)).toBe(true)
    expect(loaded.fixtures.every((fixture) => loaded.pipelineStageSizes[fixture.id]! >= fixture.candidates.length && loaded.pipelineStageSizes[fixture.id]! > 0)).toBe(true)
    expect(Object.keys(pairedAnalysis(loaded.fixtures).deltas)).toContain("hit10")
  })

  test("annotations alone cannot produce downstream success or promotion", async () => {
    const loaded = loadRetrievalV3Fixtures("development", "tuning"), paired = pairedAnalysis(loaded.fixtures)
    const unavailable = { baseline: downstreamProofSuccess([], 10), candidate: downstreamProofSuccess([], 10) }
    expect(promotionReport(paired, unavailable, true).decision).toBe("INCONCLUSIVE")
    expect((await runRetrievalV3("development", "tuning")).decision).toBe("INCONCLUSIVE")
  })

  test("downstream success counts only executed kernel outcomes", () => {
    const result = downstreamProofSuccess([{ caseId: "a", executed: true, kernelAccepted: true }, { caseId: "b", executed: true, kernelAccepted: false }, { caseId: "c", executed: false, kernelAccepted: true }], 10)
    expect(result).toMatchObject({ attempted: 2, successes: 1, rate: 0.5, valid: true })
  })
})
