#!/usr/bin/env bun
import { resolve } from "node:path"
import { homedir } from "node:os"
import { mathosVersion } from "@mathos/shared"

export const RELEASE_CHECK_ORDER = [
  "version", "typecheck", "unit-integration-tests", "verification-trust-tests",
  "sandbox-security-tests", "migrations", "schema-too-new", "fresh-init",
  "backup-restore", "secret-redaction", "event-rebuild", "package-smoke",
  "lean-smoke", "research-regression", "ux-regression", "retrieval-regression",
] as const

export type ReleaseCheckName = typeof RELEASE_CHECK_ORDER[number]
export type ReleaseCheckStatus = "PASS" | "FAIL" | "SKIPPED_UNSUPPORTED_PLATFORM"

export interface ReleaseCheckResult {
  name: ReleaseCheckName
  status: ReleaseCheckStatus
  durationMs: number
  command: string[]
  evidence: string
  exitCode: number | null
  timedOut: boolean
}

export interface ReleaseCheckReport {
  version: string
  gitRevision: string
  checks: ReleaseCheckResult[]
  ready: boolean
}

interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

export type ReleaseCommandRunner = (command: string[], options: { cwd: string; timeoutMs: number }) => Promise<CommandResult>

const repositoryRoot = resolve(import.meta.dir, "..")
const bun = process.execPath
const DEFAULT_TIMEOUT_MS = 180_000

function summary(stdout: string, stderr: string): string {
  const output = (stdout + "\n" + stderr)
    .replaceAll(repositoryRoot, "<repo>")
    .replaceAll(homedir(), "<home>")
    .replace(/\u001b\[[0-9;]*m/gu, "")
    .trim()
  if (!output) return "command produced no output"
  return output.split("\n").map((line) => line.trim()).filter(Boolean).slice(-12).join("\n").slice(0, 2_000)
}

export const runReleaseCommand: ReleaseCommandRunner = async (command, options) => {
  const started = Date.now()
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill("SIGKILL")
  }, options.timeoutMs)
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { exitCode: timedOut ? null : exitCode, stdout, stderr, timedOut, durationMs: Date.now() - started }
  } catch (error) {
    return { exitCode: null, stdout: "", stderr: String(error), timedOut, durationMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

function unitTestFiles(): string[] {
  const listed = Bun.spawnSync(["git", "ls-files", "tests/*.test.ts", "tests/*.test.tsx"], { cwd: repositoryRoot })
  if (listed.exitCode !== 0) return ["tests/__MISSING_TEST_DISCOVERY__.test.ts"]
  const excluded = /(?:release-check|package-smoke|verification-trust|sandbox|release\.test|event-projection|lean-real|lean-inspect|research-native|multi-agent-native|retrieval-validation|retrieval-holdout)/u
  return new TextDecoder().decode(listed.stdout).trim().split("\n").filter((file) => file && !excluded.test(file))
}

function commands(): Record<ReleaseCheckName, string[]> {
  return {
    version: [bun, "apps/tui/src/cli.ts", "--version"],
    typecheck: [bun, "run", "typecheck"],
    "unit-integration-tests": [bun, "test", ...unitTestFiles()],
    "verification-trust-tests": [bun, "test", "tests/verification-trust.test.ts"],
    "sandbox-security-tests": [bun, "test", "tests/sandbox.test.ts", "tests/sandbox-security.test.ts"],
    migrations: [bun, "test", "tests/release.test.ts", "-t", "fresh migrate is idempotent"],
    "schema-too-new": [bun, "test", "tests/release.test.ts", "-t", "newer schema guard"],
    "fresh-init": [bun, "test", "tests/core.test.ts", "-t", "creates layout, database, and event log"],
    "backup-restore": [bun, "test", "tests/release.test.ts", "-t", "backup restore semantic equivalence"],
    "secret-redaction": [bun, "test", "tests/release.test.ts", "-t", "secret canary does not leak"],
    "event-rebuild": [bun, "test", "tests/event-projection.test.ts", "-t", "rebuild"],
    "package-smoke": [bun, "test", "tests/package-smoke.test.ts"],
    "lean-smoke": [bun, "scripts/lean-smoke.ts"],
    "research-regression": [bun, "scripts/research-regression.ts"],
    "ux-regression": [bun, "scripts/ux-regression.ts"],
    "retrieval-regression": [bun, "scripts/retrieval-regression.ts"],
  }
}

function unsupportedPlatform(name: ReleaseCheckName, platform: NodeJS.Platform): boolean {
  return name === "lean-smoke" && platform !== "darwin"
}

function validatesEvidence(name: ReleaseCheckName, result: CommandResult): boolean {
  const output = result.stdout + "\n" + result.stderr
  if (name === "version") return result.stdout.includes(mathosVersion())
  if (name === "typecheck") return true
  if (name.endsWith("-regression") || name === "lean-smoke") {
    try {
      return JSON.parse(result.stdout).passed === true
    } catch {
      return false
    }
  }
  return /\((?:pass)\)|\b[1-9][0-9]* pass\b/u.test(output)
}

export async function executeReleaseCheck(options: {
  runner?: ReleaseCommandRunner
  platform?: NodeJS.Platform
  timeoutMs?: number
  commandOverrides?: Partial<Record<ReleaseCheckName, string[]>>
} = {}): Promise<ReleaseCheckReport> {
  const runner = options.runner ?? runReleaseCommand
  const platform = options.platform ?? process.platform
  const configured = { ...commands(), ...options.commandOverrides }
  const checks: ReleaseCheckResult[] = []

  for (const name of RELEASE_CHECK_ORDER) {
    const command = configured[name]
    const reportedCommand = command?.map((part) => part === bun ? "bun" : part.replaceAll(repositoryRoot, "<repo>").replaceAll(homedir(), "<home>")) ?? []
    if (!command?.length) {
      checks.push({ name, status: "FAIL", durationMs: 0, command: [], evidence: "missing release check command", exitCode: null, timedOut: false })
      continue
    }
    if (unsupportedPlatform(name, platform)) {
      checks.push({ name, status: "SKIPPED_UNSUPPORTED_PLATFORM", durationMs: 0, command: reportedCommand, evidence: `${platform} is not a supported Lean release platform`, exitCode: null, timedOut: false })
      continue
    }
    const result = await runner(command, { cwd: repositoryRoot, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS })
    let status: ReleaseCheckStatus = result.exitCode === 0 && !result.timedOut && validatesEvidence(name, result) ? "PASS" : "FAIL"
    let evidence = result.timedOut ? `timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : summary(result.stdout, result.stderr)
    if (result.exitCode === 0 && !result.timedOut && !validatesEvidence(name, result)) {
      evidence = `command exited successfully without required evidence; ${evidence}`
    }
    checks.push({ name, status, durationMs: result.durationMs, command: reportedCommand, evidence, exitCode: result.exitCode, timedOut: result.timedOut })
  }

  const revision = await runner(["git", "rev-parse", "HEAD"], { cwd: repositoryRoot, timeoutMs: 10_000 })
  const revisionText = revision.stdout.trim()
  const gitRevision = revision.exitCode === 0 && /^[0-9a-f]{40}$/u.test(revisionText) ? revisionText : "UNKNOWN"
  return {
    version: mathosVersion(),
    gitRevision,
    checks,
    ready: gitRevision !== "UNKNOWN" && checks.length === RELEASE_CHECK_ORDER.length && checks.every((check) => check.status === "PASS" || check.status === "SKIPPED_UNSUPPORTED_PLATFORM"),
  }
}

function textReport(report: ReleaseCheckReport): string {
  const rows = report.checks.map((check) => `${check.name.padEnd(28)} ${check.status.padEnd(32)} ${check.durationMs}ms`)
  return ["MATHOS RELEASE CHECK", `Version ${report.version}`, `Revision ${report.gitRevision}`, "", ...rows, "", report.ready ? "READY" : "NOT_READY"].join("\n")
}

if (import.meta.main) {
  if (process.argv.includes("--contract-probe")) {
    console.log(JSON.stringify({ ok: true, runtime: process.execPath }))
    process.exit(0)
  }
  const report = await executeReleaseCheck()
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2))
  else console.log(textReport(report))
  if (!report.ready) process.exitCode = 1
}
