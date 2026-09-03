import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { inspectSandbox } from "@mathos/computation"

type PlatformEvidence = {
  schemaVersion: "mathos.platform-qualification.v1"
  platform: string
  gitRevision: string
  status: "PASS" | "NOT_VERIFIED" | "FAIL"
  gates?: Record<string, string>
}

export function releaseTarget(platform: NodeJS.Platform | string, arch: string): string {
  const operatingSystem = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform
  return `${operatingSystem}-${arch}`
}

function currentEvidence(root: string, name: string, revision: string): PlatformEvidence | null {
  const path = resolve(root, "artifacts", "qualification", `${name}.json`)
  if (!existsSync(path)) return null
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as PlatformEvidence
    if (value.schemaVersion !== "mathos.platform-qualification.v1" || value.platform !== name || value.gitRevision !== revision || value.status !== "PASS") return null
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
  const checks = {
    realModel: Boolean(options.directModel || qualifiedModel),
    sandbox: options.sandbox,
    vscodeHost: options.vscodeHost,
    standaloneArtifact: existsSync(resolve(options.root, "artifacts", "releases", "1.0.0-rc.1", target, "root", "bin", options.platform === "win32" ? "mathos.exe" : "mathos")),
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
