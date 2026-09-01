import { existsSync, accessSync, constants } from "node:fs"
import { resolve } from "node:path"
import type { DoctorCheck, DoctorReport } from "@mathos/domain"
import { databasePath, eventLogPath, MATHOS_DIR } from "@mathos/shared"
import { isWorkspaceRoot, requiredPaths } from "@mathos/workspace"

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
