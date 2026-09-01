import { existsSync, accessSync, constants } from "node:fs"
import { resolve } from "node:path"
import type { DoctorCheck, DoctorReport } from "@mathos/domain"
import { databasePath, eventLogPath, MATHOS_DIR } from "@mathos/shared"
import { isWorkspaceRoot, requiredPaths } from "@mathos/workspace"

export type PlatformReleaseClaim = "SUPPORTED" | "UNTESTED" | "NOT_TESTED"

export interface PlatformCapabilityReport {
  platform: NodeJS.Platform
  releaseClaim: PlatformReleaseClaim
  runtime: { available: boolean; path: string | null }
  sandbox: { available: boolean; backend: string | null; networkIsolation: boolean }
}

function executablePath(name: string): string | null {
  return Bun.which(name) ?? null
}

export function inspectPlatformCapabilities(platform: NodeJS.Platform = process.platform): PlatformCapabilityReport {
  const runtime = executablePath("bun")
  if (platform === "darwin") {
    const sandbox = executablePath("sandbox-exec")
    return {
      platform,
      releaseClaim: "SUPPORTED",
      runtime: { available: Boolean(runtime), path: runtime },
      sandbox: { available: Boolean(sandbox), backend: sandbox ? "macos-sandbox-exec" : null, networkIsolation: Boolean(sandbox) },
    }
  }
  if (platform === "linux") {
    const backend = ["bwrap", "firejail"].map((name) => executablePath(name)).find(Boolean) ?? null
    return {
      platform,
      releaseClaim: "UNTESTED",
      runtime: { available: Boolean(runtime), path: runtime },
      sandbox: { available: false, backend, networkIsolation: false },
    }
  }
  return {
    platform,
    releaseClaim: "NOT_TESTED",
    runtime: { available: Boolean(runtime), path: runtime },
    sandbox: { available: false, backend: null, networkIsolation: false },
  }
}

function platformCheck(): DoctorCheck {
  const capability = inspectPlatformCapabilities()
  const sandbox = capability.sandbox.backend ?? "no implemented backend"
  return {
    name: "Platform support",
    status: capability.releaseClaim === "SUPPORTED" ? "PASS" : "WARN",
    detail: `${process.platform}: ${capability.releaseClaim}; runtime=${capability.runtime.path ?? "missing"}; sandbox=${sandbox}; network isolation=${capability.sandbox.networkIsolation ? "detected" : "unavailable"}`,
  }
}

function bunCheck(): DoctorCheck {
  const version = Bun.version
  return {
    name: "Bun",
    status: version ? "PASS" : "FAIL",
    detail: version ? version : "Bun runtime not detected",
  }
}

function gitCheck(): DoctorCheck {
  const proc = Bun.spawnSync(["git", "--version"], { stdout: "pipe", stderr: "pipe" })
  if (proc.exitCode === 0) {
    return { name: "Git", status: "PASS", detail: new TextDecoder().decode(proc.stdout).trim() }
  }
  return { name: "Git", status: "FAIL", detail: "git is not available on PATH" }
}

function sqliteCheck(root: string): DoctorCheck {
  const db = databasePath(root)
  if (!existsSync(db)) {
    return { name: "SQLite", status: "FAIL", detail: "mathos.db is missing" }
  }
  return { name: "SQLite", status: "PASS", detail: "mathos.db present" }
}

function workspaceCheck(root: string): DoctorCheck {
  if (!isWorkspaceRoot(root)) {
    return { name: "Workspace", status: "FAIL", detail: "mathos.toml or .mathos is missing" }
  }
  const missing = requiredPaths(root).filter((path) => !existsSync(path))
  if (missing.length > 0) {
    return {
      name: "Workspace",
      status: "WARN",
      detail: `missing ${missing.map((item) => item.slice(root.length + 1)).join(", ")}`,
    }
  }
  return { name: "Workspace", status: "PASS", detail: "layout complete" }
}

function databaseCheck(root: string, queryOk: boolean): DoctorCheck {
  if (!existsSync(databasePath(root))) {
    return { name: "Database", status: "FAIL", detail: "database file missing" }
  }
  return {
    name: "Database",
    status: queryOk ? "PASS" : "FAIL",
    detail: queryOk ? "schema reachable" : "unable to query schema",
  }
}

function eventLogCheck(root: string): DoctorCheck {
  const path = eventLogPath(root)
  if (!existsSync(path)) {
    return { name: "Event log", status: "FAIL", detail: `${MATHOS_DIR}/events.jsonl is missing` }
  }
  try {
    accessSync(path, constants.W_OK)
    return { name: "Event log", status: "PASS", detail: "appendable" }
  } catch {
    return { name: "Event log", status: "WARN", detail: "file exists but is not writable" }
  }
}

export function buildDoctorReport(root: string, queryOk: boolean): DoctorReport {
  const checks = [
    platformCheck(),
    bunCheck(),
    gitCheck(),
    sqliteCheck(resolve(root)),
    workspaceCheck(resolve(root)),
    databaseCheck(resolve(root), queryOk),
    eventLogCheck(resolve(root)),
  ]
  return {
    checks,
    ok: checks.every((check) => check.status !== "FAIL"),
  }
}
