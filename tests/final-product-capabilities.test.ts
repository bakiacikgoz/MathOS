import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluateEvidence, releaseTarget } from "../scripts/final-product-capabilities.ts"

describe("final product capability evidence", () => {
  test("maps runtime platform names to release artifact targets", () => {
    expect(releaseTarget("win32", "x64")).toBe("windows-x64")
    expect(releaseTarget("darwin", "arm64")).toBe("macos-arm64")
  })

  test("requires current validated platform evidence and accepts subscription model proof", () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-final-capabilities-"))
    try {
      const qualification = join(root, "artifacts", "qualification")
      const release = join(root, "artifacts", "releases", "1.0.0-rc.1", "windows-x64", "root", "bin")
      mkdirSync(qualification, { recursive: true }); mkdirSync(release, { recursive: true })
      writeFileSync(join(release, "mathos.exe"), "fixture")
      writeFileSync(join(qualification, "windows-11-x64.json"), JSON.stringify({
        schemaVersion: "mathos.platform-qualification.v1", platform: "windows-11-x64",
        gitRevision: "a".repeat(40), status: "PASS", gates: { providerLive: "PASS" },
      }))

      const valid = evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true })
      expect(valid.checks.realModel).toBe(true)
      expect(valid.checks.standaloneArtifact).toBe(true)
      expect(valid.checks.windowsRuntimeEvidence).toBe(true)
      expect(valid.checks.macosRuntimeEvidence).toBe(false)

      const stale = evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "b".repeat(40), sandbox: true, vscodeHost: true })
      expect(stale.checks.realModel).toBe(false)
      expect(stale.checks.windowsRuntimeEvidence).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
