#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

export type QualificationTarget = "macos-arm64" | "windows-11-x64"
export type GateStatus = "PASS" | "FAIL" | "NOT_VERIFIED"

export const mandatoryPlatformGates = [
  "standalone", "cli", "tui", "workspace", "claimsObjectives", "providerHub",
  "providerLive", "roleRouting", "literature", "lean", "realProof",
  "verificationGate", "sandbox", "networkIsolation", "filesystemIsolation",
  "atlas", "vscodeHost", "reproducibility", "publication", "releaseArtifact",
  "releaseCheck",
] as const

export function validateQualificationHost(target: QualificationTarget, platform = process.platform, arch = process.arch) {
  const expected = target === "macos-arm64" ? { platform: "darwin", arch: "arm64" } : { platform: "win32", arch: "x64" }
  if (platform !== expected.platform || arch !== expected.arch) {
    throw new Error(`QUALIFICATION_HOST_MISMATCH: ${target} requires ${expected.platform}/${expected.arch}; got ${platform}/${arch}`)
  }
  return expected
}

export function createPlatformEvidence(target: QualificationTarget, gitRevision: string, generatedAt = new Date().toISOString()) {
  return {
    schemaVersion: "mathos.platform-qualification.v1" as const,
    platform: target,
    gitRevision,
    generatedAt,
    status: "NOT_VERIFIED" as GateStatus,
    gates: Object.fromEntries(mandatoryPlatformGates.map(gate => [gate, "NOT_VERIFIED"])) as Record<(typeof mandatoryPlatformGates)[number], GateStatus>,
    evidence: {},
    notes: ["Set a gate to PASS only after recording real evidence produced on this exact host and revision."],
  }
}

export function platformQualificationCommands(target: QualificationTarget) {
  const artifactTarget = target === "macos-arm64" ? "darwin-arm64" : "windows-x64"
  const executable = target === "macos-arm64" ? "./artifacts/releases/1.0.0-rc.1/darwin-arm64/root/bin/mathos" : ".\\artifacts\\releases\\1.0.0-rc.1\\windows-x64\\root\\bin\\mathos.exe"
  return {
    target,
    nonInteractive: [
      "bun install --frozen-lockfile",
      "bun run typecheck",
      "bun run build",
      "bun test",
      "bun run providers:contract",
      "bun run providers:qualification",
      "bun run vscode:verify",
      `bun scripts/distribution/build-release.ts --target=${artifactTarget}`,
      `bun scripts/distribution/verify-release.ts artifacts/releases/1.0.0-rc.1/${artifactTarget}/root`,
      "bun run qualification:v1",
      "bun run software-completion-v2",
      "bun scripts/final-product-capabilities.ts",
      "bun run release-check",
    ],
    interactive: [
      { gate: "standalone", command: `${executable} --version --json`, expected: "version and gitRevision match final HEAD" },
      { gate: "cli", command: `${executable} doctor --json`, expected: "standalone environment report succeeds" },
      { gate: "tui", command: executable, expected: "real PTY session exercises workspace, C-001, palette, provider selection, role assignment, and clean quit" },
      { gate: "sandbox", command: "bun scripts/security-sandbox-smoke.ts", expected: "real production OCI attack matrix passes, including network and filesystem isolation" },
      { gate: "atlas", command: `${executable} atlas snapshot --json`, expected: "C-001 is KERNEL_VERIFIED without exposing the session token" },
      { gate: "vscodeHost", command: "code --install-extension dist/mathos-1.0.0-rc.1.vsix --force", expected: "real Extension Host activation, command exercise, bridge teardown, and zero orphan processes" },
    ],
  }
}

function gitRevision(root: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error("GIT_REVISION_UNAVAILABLE")
  return result.stdout.toString().trim()
}

if (import.meta.main) {
  const target = (process.argv.find(value => value.startsWith("--target="))?.slice(9) ?? (process.platform === "darwin" ? "macos-arm64" : "windows-11-x64")) as QualificationTarget
  if (!(["macos-arm64", "windows-11-x64"] as string[]).includes(target)) throw new Error(`QUALIFICATION_TARGET_UNSUPPORTED: ${target}`)
  const root = resolve(import.meta.dir, "..", "..")
  const commands = platformQualificationCommands(target)
  if (process.argv.includes("--write-skeleton")) {
    validateQualificationHost(target)
    const output = resolve(root, "artifacts", "qualification", `${target}.json`)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(createPlatformEvidence(target, gitRevision(root)), null, 2)}\n`)
    console.log(JSON.stringify({ output, status: "NOT_VERIFIED", commands }, null, 2))
  } else {
    console.log(JSON.stringify({ schemaVersion: "mathos.platform-qualification-plan.v1", gitRevision: gitRevision(root), ...commands }, null, 2))
  }
}
