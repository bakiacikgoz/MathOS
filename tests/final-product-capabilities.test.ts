import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluateEvidence, releaseTarget } from "../scripts/final-product-capabilities.ts"
import { createReleaseManifest, MATHOS_PRODUCT_VERSION } from "@mathos/shared"

function writeArtifactIdentity(root: string, target: string, executable: string, revision = "a".repeat(40), metadataPaths: string[] = []) {
  const releaseRoot = join(root, "artifacts", "releases", MATHOS_PRODUCT_VERSION, target, "root")
  const manifest = createReleaseManifest({ root: releaseRoot, target, productVersion: MATHOS_PRODUCT_VERSION, gitRevision: revision, buildId: "fixture", paths: [`bin/${executable}`, ...metadataPaths] })
  writeFileSync(join(releaseRoot, "RELEASE-MANIFEST.json"), JSON.stringify(manifest))
  writeFileSync(join(releaseRoot, "SHA256SUMS"), manifest.files.map(file => `${file.sha256}  ${file.path}`).join("\n") + "\n")
}

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
      writeArtifactIdentity(root, "windows-x64", "mathos.exe")
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
      expect(stale.checks.standaloneArtifact).toBe(false)
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
      writeArtifactIdentity(root, "darwin-arm64", "mathos")
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

test("standalone qualification rejects missing, tampered or another revision's artifact manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-candidate-integrity-"))
  try {
    const bin = join(root, "artifacts", "releases", MATHOS_PRODUCT_VERSION, "windows-x64", "root", "bin")
    mkdirSync(bin, { recursive: true }); writeFileSync(join(bin, "mathos.exe"), "fixture")
    const evaluate = () => evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: false, vscodeHost: false }).checks.standaloneArtifact
    expect(evaluate()).toBe(false)
    writeArtifactIdentity(root, "windows-x64", "mathos.exe", "b".repeat(40))
    expect(evaluate()).toBe(false)
    writeArtifactIdentity(root, "windows-x64", "mathos.exe")
    expect(evaluate()).toBe(true)
    writeFileSync(join(bin, "mathos.exe"), "modified bytes")
    expect(evaluate()).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("public capability gate rejects unresolved or unbound third-party licenses", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-license-capability-"))
  try {
    const releaseRoot = join(root, "artifacts", "releases", MATHOS_PRODUCT_VERSION, "windows-x64", "root")
    mkdirSync(join(releaseRoot, "bin"), { recursive: true }); writeFileSync(join(releaseRoot, "bin", "mathos.exe"), "fixture")
    const metadata = ["SBOM.json", "THIRD_PARTY_LICENSES.json", "THIRD_PARTY_NOTICES.txt"]
    writeFileSync(join(releaseRoot, "SBOM.json"), JSON.stringify({ spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", documentNamespace: "https://example.test/fixture", creationInfo: { creators: ["Tool: fixture"], created: "2026-10-01T00:00:00Z" } }))
    writeFileSync(join(releaseRoot, "THIRD_PARTY_NOTICES.txt"), "Fixture third-party notice text")
    const inventory = { schemaVersion: "mathos.third-party-licenses.v1", gitRevision: "a".repeat(40), productVersion: MATHOS_PRODUCT_VERSION, complete: false, releaseBlocked: true, unresolvedCount: 1, missingNoticeCount: 0, packages: [{ license: "NOASSERTION", licenseSource: null }] }
    const evaluate = () => evaluateEvidence({ root, platform: "win32", arch: "x64", gitRevision: "a".repeat(40), sandbox: false, vscodeHost: false }).checks as unknown as { releaseLicenses: boolean }
    const save = () => { writeFileSync(join(releaseRoot, "THIRD_PARTY_LICENSES.json"), JSON.stringify(inventory)); writeArtifactIdentity(root, "windows-x64", "mathos.exe", "a".repeat(40), metadata) }
    save(); expect(evaluate().releaseLicenses).toBe(false)
    Object.assign(inventory, { complete: true, releaseBlocked: false, unresolvedCount: 0, packages: [{ license: "MIT", licenseSource: "fixture/package.json" }] })
    save(); expect(evaluate().releaseLicenses).toBe(true)
    inventory.gitRevision = "b".repeat(40)
    save(); expect(evaluate().releaseLicenses).toBe(false)
    inventory.gitRevision = "a".repeat(40); inventory.missingNoticeCount = 1
    save(); expect(evaluate().releaseLicenses).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
