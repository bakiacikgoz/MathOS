import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluateEvidence, releaseTarget } from "../scripts/final-product-capabilities.ts"

describe("final product capability evidence", () => {
  test("maps runtime platform names to release artifact targets", () => {
    expect(releaseTarget("win32", "x64")).toBe("windows-x64")
    expect(releaseTarget("darwin", "arm64")).toBe("darwin-arm64")
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
        gitRevision: "a".repeat(40), status: "PASS", gates: {
          standalone: "PASS", cli: "PASS", tui: "PASS", workspace: "PASS", claimsObjectives: "PASS",
          providerHub: "PASS", providerLive: "PASS", roleRouting: "PASS", literature: "PASS",
          lean: "PASS", realProof: "PASS", verificationGate: "PASS", sandbox: "PASS",
          networkIsolation: "PASS", filesystemIsolation: "PASS", atlas: "PASS", vscodeHost: "PASS",
          reproducibility: "PASS", publication: "PASS", releaseArtifact: "PASS", releaseCheck: "NOT_VERIFIED",
        },
      }))

      const valid = evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true })
      expect(valid.checks.realModel).toBe(true)
      expect(valid.checks.standaloneArtifact).toBe(true)
      expect(valid.checks.windowsRuntimeEvidence).toBe(true)
      expect(valid.checks.macosRuntimeEvidence).toBe(false)

      const stale = evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "b".repeat(40), sandbox: true, vscodeHost: true })
      expect(stale.checks.realModel).toBe(false)
      expect(stale.checks.windowsRuntimeEvidence).toBe(false)

      const evidencePath = join(qualification, "windows-11-x64.json")
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"))
      evidence.status = "NOT_VERIFIED"
      writeFileSync(evidencePath, JSON.stringify(evidence))
      expect(evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true }).checks.windowsRuntimeEvidence).toBe(true)
      evidence.gates.releaseCheck = "FAIL"
      writeFileSync(evidencePath, JSON.stringify(evidence))
      expect(evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true }).checks.windowsRuntimeEvidence).toBe(false)
      evidence.gates.releaseCheck = "PASS"
      evidence.gates.tui = "NOT_VERIFIED"
      writeFileSync(evidencePath, JSON.stringify(evidence))
      expect(evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true }).checks.windowsRuntimeEvidence).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})

describe("release qualification does not promote incomplete evidence", () => {
  test("finds the macOS archive layout produced by build-release", () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-artifact-layout-"))
    try {
      const bin = join(root, "artifacts/releases/1.0.0-rc.1/darwin-arm64/root/bin")
      mkdirSync(bin, { recursive: true }); writeFileSync(join(bin, "mathos"), "fixture")
      const result = evaluateEvidence({ root, platform: "darwin", arch: "arm64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true })
      expect(result.checks.standaloneArtifact).toBe(true)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  test("top-level PASS with only providerLive cannot qualify a platform", () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-incomplete-evidence-"))
    try {
      const dir = join(root, "artifacts/qualification"); mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, "macos-arm64.json"), JSON.stringify({ schemaVersion: "mathos.platform-qualification.v1", platform: "macos-arm64", gitRevision: "a".repeat(40), status: "PASS", gates: { providerLive: "PASS" } }))
      const result = evaluateEvidence({ root, platform: "darwin", arch: "arm64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true })
      expect(result.checks.macosRuntimeEvidence).toBe(false)
      expect(result.checks.vscodeHost).toBe(false)
      expect(result.checks.sandbox).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  test("configured API credentials are not live model evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-no-live-evidence-"))
    try {
      expect(evaluateEvidence({ root, platform: "darwin", arch: "arm64", gitRevision: "a".repeat(40), sandbox: true, vscodeHost: true, directModel: true }).checks.realModel).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
