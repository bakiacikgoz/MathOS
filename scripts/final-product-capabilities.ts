import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { inspectSandbox } from "@mathos/computation"
import { mandatoryPlatformGates } from "./qualification/platform-qualification.ts"
import { MATHOS_PRODUCT_VERSION } from "@mathos/shared"
import { verifyRelease } from "./distribution/verify-release.ts"

type PlatformEvidence = {
  schemaVersion: "mathos.platform-qualification.v1"
  platform: string
  gitRevision: string
  status: "PASS" | "NOT_VERIFIED" | "FAIL"
  gates?: Record<string, string>
}

export function releaseTarget(platform: NodeJS.Platform | string, arch: string): string {
  const operatingSystem = platform === "win32" ? "windows" : platform
  return `${operatingSystem}-${arch}`
}

function currentEvidence(root: string, name: string, revision: string): PlatformEvidence | null {
  const path = resolve(root, "artifacts", "qualification", `${name}.json`)
  if (!existsSync(path)) return null
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as PlatformEvidence
    if (value.schemaVersion !== "mathos.platform-qualification.v1" || value.platform !== name || value.gitRevision !== revision || !["PASS", "NOT_VERIFIED"].includes(value.status)) return null
    // release-check consumes this prerequisite matrix. Its own result is recorded
    // afterward, otherwise requiring it here creates a circular qualification gate.
    if (!mandatoryPlatformGates.every(gate => gate === "releaseCheck"
      ? value.gates?.[gate] === "PASS" || value.gates?.[gate] === "NOT_VERIFIED"
      : value.gates?.[gate] === "PASS")) return null
    return value
  } catch { return null }
}

export function evaluateEvidence(options: {
  root: string
  platform: NodeJS.Platform | string
  arch: string
  gitRevision: string
  sandbox: boolean
  vscodeHost: boolean
  directModel?: boolean
}) {
  const windows = currentEvidence(options.root, "windows-11-x64", options.gitRevision)
  const macos = currentEvidence(options.root, "macos-arm64", options.gitRevision)
  const qualifiedModel = windows?.gates?.providerLive === "PASS" || macos?.gates?.providerLive === "PASS"
  const target = releaseTarget(options.platform, options.arch)
  const host = options.platform === "darwin" ? macos : options.platform === "win32" ? windows : null
  const releaseRoot = resolve(options.root, "artifacts", "releases", MATHOS_PRODUCT_VERSION, target, "root")
  const executable = `bin/${options.platform === "win32" ? "mathos.exe" : "mathos"}`
  let standaloneArtifact = false
  let releaseLicenses = false
  try {
    const artifact = verifyRelease(releaseRoot, { gitRevision: options.gitRevision, target, productVersion: MATHOS_PRODUCT_VERSION })
    standaloneArtifact = artifact.ok && artifact.manifest.files.some(file => file.path === executable) && existsSync(resolve(releaseRoot, executable))
    const metadataFiles = ["SBOM.json", "THIRD_PARTY_LICENSES.json", "THIRD_PARTY_NOTICES.txt"]
    if (standaloneArtifact && metadataFiles.every(path => artifact.manifest.files.some(file => file.path === path))) {
      const inventory = JSON.parse(readFileSync(resolve(releaseRoot, "THIRD_PARTY_LICENSES.json"), "utf8"))
      const sbom = JSON.parse(readFileSync(resolve(releaseRoot, "SBOM.json"), "utf8"))
      releaseLicenses = inventory.schemaVersion === "mathos.third-party-licenses.v1"
        && inventory.gitRevision === options.gitRevision && inventory.productVersion === MATHOS_PRODUCT_VERSION
        && inventory.complete === true && inventory.releaseBlocked === false
        && inventory.unresolvedCount === 0 && inventory.missingNoticeCount === 0
        && Array.isArray(inventory.packages) && inventory.packages.length > 0
        && inventory.packages.every((row: { license?: unknown; licenseSource?: unknown }) => typeof row.license === "string" && row.license !== "NOASSERTION" && typeof row.licenseSource === "string")
        && sbom.spdxVersion === "SPDX-2.3" && sbom.dataLicense === "CC0-1.0" && sbom.SPDXID === "SPDXRef-DOCUMENT"
        && typeof sbom.documentNamespace === "string" && Array.isArray(sbom.creationInfo?.creators)
        && readFileSync(resolve(releaseRoot, "THIRD_PARTY_NOTICES.txt"), "utf8").trim().length > 0
    }
  } catch { /* incomplete or invalid packages cannot qualify this candidate */ }
  const checks = {
    realModel: Boolean(qualifiedModel),
    sandbox: options.sandbox && host?.gates?.sandbox === "PASS" && host.gates.networkIsolation === "PASS" && host.gates.filesystemIsolation === "PASS",
    vscodeHost: options.vscodeHost && host?.gates?.vscodeHost === "PASS",
    standaloneArtifact,
    releaseLicenses,
    windowsRuntimeEvidence: Boolean(windows),
    macosRuntimeEvidence: Boolean(macos),
  }
  return { target, checks, blockers: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name) }
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..")
  const revisionResult = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" })
  const gitRevision = revisionResult.exitCode === 0 ? revisionResult.stdout.toString().trim() : "UNKNOWN"
  const sandbox = await inspectSandbox()
  const evaluated = evaluateEvidence({
    root, platform: process.platform, arch: process.arch, gitRevision,
    sandbox: sandbox.available && sandbox.networkIsolation,
    vscodeHost: Boolean(Bun.which("code")),
    directModel: Boolean(process.env.MATHOS_API_KEY && process.env.MATHOS_MODEL),
  })
  const ready = evaluated.blockers.length === 0
  console.log(JSON.stringify({ schemaVersion: "mathos.final-product-capabilities.v1", ...evaluated, sandbox, ready }, null, 2))
  if (!ready) process.exitCode = 1
}
