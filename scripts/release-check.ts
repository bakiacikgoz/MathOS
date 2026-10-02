#!/usr/bin/env bun
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs"
import { basename, join, resolve, sep } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { homedir, tmpdir } from "node:os"
import { mathosVersion } from "@mathos/shared"

export const RELEASE_CHECK_ORDER = [
  "version", "typecheck", "unit-integration-tests", "verification-trust-tests",
  "sandbox-security-tests", "migrations", "schema-too-new", "fresh-init",
  "backup-restore", "secret-redaction", "event-rebuild", "package-smoke",
  "lean-smoke", "research-regression", "ux-regression", "retrieval-regression",
  "v1-qualification",
  "provider-security",
  "provider-contract",
  "final-product-capabilities",
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
  diagnosticLogDir?: string
  shutdownConfirmed?: boolean
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

function stopReleaseProcessTree(pid: number): void {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
    const taskkill = systemRoot ? join(systemRoot, "System32", "taskkill.exe") : "taskkill"
    const result = spawnSync(taskkill, ["/PID", String(pid), "/T", "/F"], { windowsHide: true, encoding: "utf8", timeout: 30_000 })
    if (result.status !== 0 || result.error) throw new Error(`Could not stop release check process tree PID ${pid}: ${result.stderr || result.error?.message || `taskkill exited ${result.status}`}`)
  } else {
    try { process.kill(-pid, "SIGKILL") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error }
  }
}

export const runReleaseCommand: ReleaseCommandRunner = async (command, options) => {
  const started = Date.now()
  const outputDir = mkdtempSync(join(tmpdir(), "mathos-release-command-"))
  const stdoutPath = join(outputDir, "stdout.log")
  const stderrPath = join(outputDir, "stderr.log")
  const stdoutFd = openSync(stdoutPath, "w")
  const stderrFd = openSync(stderrPath, "w")
  let timedOut = false
  let confirmedClose = false
  let retainLogs = true
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  try {
    const proc = spawn(command[0]!, command.slice(1), {
      cwd: options.cwd,
      env: { ...process.env, npm_execpath: process.execPath, NO_COLOR: "1", FORCE_COLOR: "0" },
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", stdoutFd, stderrFd],
    })
    const closed = new Promise<number | null>((resolveClosed, rejectClosed) => {
      proc.once("error", rejectClosed)
      proc.once("close", (code) => { confirmedClose = true; resolveClosed(code) })
    })
    const deadline = new Promise<"timeout">((resolveDeadline) => {
      deadlineTimer = setTimeout(() => resolveDeadline("timeout"), options.timeoutMs)
    })
    const first = await Promise.race([closed, deadline])
    let exitCode: number | null
    if (first === "timeout") {
      timedOut = true
      if (!confirmedClose) {
        if (!proc.pid) throw new Error("Release check deadline expired without an owned PID; shutdown is unconfirmed")
        stopReleaseProcessTree(proc.pid)
      }
      exitCode = await Promise.race([
        closed,
        new Promise<never>((_, reject) => { closeTimer = setTimeout(() => reject(new Error(`Release check process tree PID ${proc.pid ?? "unknown"} did not close after termination; shutdown is unconfirmed`)), 30_000) }),
      ])
    } else exitCode = first
    closeSync(stdoutFd)
    closeSync(stderrFd)
    const stdout = readFileSync(stdoutPath, "utf8")
    const stderr = readFileSync(stderrPath, "utf8")
    retainLogs = timedOut || exitCode !== 0
    return { exitCode: timedOut ? null : exitCode, stdout, stderr, timedOut, durationMs: Date.now() - started, shutdownConfirmed: confirmedClose, ...(retainLogs ? { diagnosticLogDir: outputDir } : {}) }
  } catch (error) {
    return { exitCode: null, stdout: confirmedClose ? readFileSync(stdoutPath, "utf8") : "", stderr: String(error), timedOut, durationMs: Date.now() - started, diagnosticLogDir: outputDir, shutdownConfirmed: confirmedClose }
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer)
    if (closeTimer) clearTimeout(closeTimer)
    try { closeSync(stdoutFd) } catch {}
    try { closeSync(stderrFd) } catch {}
    if (confirmedClose && !retainLogs) {
      const absolute = resolve(outputDir)
      if (!absolute.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(absolute).startsWith("mathos-release-command-")) {
        throw new Error(`Unsafe release command log cleanup: ${absolute}`)
      }
      rmSync(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
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
    "v1-qualification": [bun, "scripts/run-v1-qualification.ts", "--json"],
    "provider-security": [bun, "scripts/providers/security-scan.ts"],
    "provider-contract": [bun, "scripts/providers/contract-test.ts"],
    "final-product-capabilities": [bun, "scripts/final-product-capabilities.ts"],
  }
}

function unsupportedPlatform(name: ReleaseCheckName, platform: NodeJS.Platform): boolean {
  return name === "lean-smoke" && platform !== "darwin" && platform !== "win32"
}

function validatesEvidence(name: ReleaseCheckName, result: CommandResult): boolean {
  const output = result.stdout + "\n" + result.stderr
  if (name === "version") return result.stdout.includes(mathosVersion())
  if (name === "typecheck" || name === "provider-security" || name === "provider-contract") return true
  if (name === "v1-qualification") {
    try { return JSON.parse(result.stdout).ready === true } catch { return false }
  }
  if (name === "final-product-capabilities") {
    try { return JSON.parse(result.stdout).ready === true } catch { return false }
  }
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
      const evidence = name === "sandbox-security-tests"
        ? `${platform} has no MathOS 0.2 supported OS sandbox release backend`
        : `${platform} is not a supported Lean release platform`
      checks.push({ name, status: "SKIPPED_UNSUPPORTED_PLATFORM", durationMs: 0, command: reportedCommand, evidence, exitCode: null, timedOut: false })
      continue
    }
    const result = await runner(command, { cwd: repositoryRoot, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS })
    let status: ReleaseCheckStatus = result.exitCode === 0 && !result.timedOut && validatesEvidence(name, result) ? "PASS" : "FAIL"
    let evidence = result.timedOut ? `timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms; last output: ${summary(result.stdout, result.stderr)}` : summary(result.stdout, result.stderr)
    if (result.diagnosticLogDir) evidence += `; raw local logs retained at ${result.diagnosticLogDir}`
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
    ready: gitRevision !== "UNKNOWN" && checks.length === RELEASE_CHECK_ORDER.length && checks.every((check) => check.status === "PASS"),
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
