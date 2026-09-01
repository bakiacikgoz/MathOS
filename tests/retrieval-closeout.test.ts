import { resolve } from "node:path"
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"

const ROOT = resolve(import.meta.dir, "..")

describe("retrieval closeout artifacts", () => {
  test("V2 decision is REJECTED and hashes match frozen files", () => {
    const root = ROOT
    const decision = JSON.parse(readFileSync(`${root}/benchmarks/retrieval-experiments/semantic-operator-profile-v2-decision.json`, "utf8"))
    const governance = JSON.parse(readFileSync(`${root}/benchmarks/retrieval-governance.json`, "utf8"))
    const sha = (path: string) => createHash("sha256").update(readFileSync(`${root}/${path}`)).digest("hex")
    expect(decision.decision).toBe("REJECTED")
    expect(decision.productionIntegrated).toBe(false)
    expect(decision.reasonCodes).toContain("NO_UPSTREAM_GAIN")
    expect(sha(decision.spec.path)).toBe(decision.spec.sha256)
    expect(sha(decision.implementation.path)).toBe(decision.implementation.sha256)
    expect(sha(decision.holdoutV2.datasetPath)).toBe(decision.holdoutV2.datasetSha256)
    expect(sha(decision.holdoutV2.resultPath)).toBe(decision.holdoutV2.resultSha256)
    expect(governance.closedDatasets).toHaveLength(2)
    expect(governance.runtimeCoupling).toBe(false)
  })
})
