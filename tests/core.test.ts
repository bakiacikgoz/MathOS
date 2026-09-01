import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { WorkspaceAlreadyInitialized, WorkspaceNotFound, InvalidClaimStatus } from "@mathos/shared"
import { eventLogPath, databasePath } from "@mathos/shared"

const temps: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mathos-"))
  temps.push(dir)
  return dir
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("workspace init", () => {
  test("creates layout, database, and event log", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "demo")
    expect(created.name).toBe("demo")
    expect(existsSync(join(created.root, "MATH.md"))).toBe(true)
    expect(existsSync(join(created.root, "mathos.toml"))).toBe(true)
    expect(existsSync(join(created.root, "research/problem.md"))).toBe(true)
    expect(existsSync(databasePath(created.root))).toBe(true)
    expect(existsSync(eventLogPath(created.root))).toBe(true)

    const log = readFileSync(eventLogPath(created.root), "utf8").trim().split("\n")
    expect(log.length).toBeGreaterThanOrEqual(2)
    const first = JSON.parse(log[0] ?? "{}") as { action?: string }
    expect(first.action).toBe("workspace_initialized")
  })

  test("rejects duplicate init", async () => {
    const parent = tempDir()
    await MathOS.init(parent, "demo")
    await expect(MathOS.init(parent, "demo")).rejects.toBeInstanceOf(WorkspaceAlreadyInitialized)
  })

  test("init in current directory", async () => {
    const dir = tempDir()
    const created = await MathOS.init(dir)
    expect(created.root).toBe(dir)
    expect(existsSync(join(dir, ".mathos/mathos.db"))).toBe(true)
  })
})

describe("open and locate", () => {
  test("finds workspace from a nested directory", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "nested")
    const child = join(created.root, "research", "notes")
    expect(MathOS.locate(child)).toBe(created.root)
  })

  test("missing workspace throws WorkspaceNotFound", () => {
    const dir = tempDir()
    expect(() => MathOS.locate(dir)).toThrow(WorkspaceNotFound)
    expect(MathOS.tryLocate(dir)).toBeNull()
  })
})

describe("claims, dependencies, events", () => {
  test("creates typed claims and projects status from sqlite", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "claims")
    const app = MathOS.open(created.root)
    try {
      const conjecture = app.createClaim({
        kind: "conjecture",
        title: "Additive energy is large",
        naturalStatement: "E(A) is large for dense A.",
        asMainObjective: true,
      })
      expect(conjecture.id).toBe("C-001")
      expect(conjecture.status).toBe("CONJECTURE")

      const lemma = app.createClaim({
        kind: "lemma",
        title: "Cauchy-Schwarz bound",
        naturalStatement: "A Cauchy-Schwarz estimate holds for the energy.",
        status: "INFORMAL_ARGUMENT",
      })
      expect(lemma.id).toBe("L-001")

      const verified = app.createClaim({
        kind: "lemma",
        title: "Energy identity",
        naturalStatement: "The energy identity is available.",
        status: "KERNEL_VERIFIED",
      })
      expect(verified.id).toBe("L-002")

      const dep = app.addDependency(lemma.id, conjecture.id, "depends_on")
      expect(dep.fromClaimId).toBe(lemma.id)

      const status = app.status()
      expect(status.projectName).toBe("claims")
      expect(status.mainObjective?.id).toBe("C-001")
      expect(status.research.conjectures).toBe(1)
      expect(status.research.informal).toBe(1)
      expect(status.research.verified).toBe(1)
      expect(status.branch?.name).toBe("MAIN")
      expect(status.integrity.database).toBe("connected")
      expect(status.integrity.eventLog).toBe("ok")
    } finally {
      app.close()
    }
  })

  test("rejects invalid claim status", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "bad-status")
    const app = MathOS.open(created.root)
    try {
      expect(() =>
        app.createClaim({ kind: "lemma", title: "x", naturalStatement: "y", status: "PROBABLY_TRUE" }),
      ).toThrow(InvalidClaimStatus)
    } finally {
      app.close()
    }
  })

  test("dependency requires existing claims", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "deps")
    const app = MathOS.open(created.root)
    try {
      expect(() => app.addDependency("C-999", "C-998")).toThrow()
    } finally {
      app.close()
    }
  })
})

describe("doctor", () => {
  test("reports pass checks on a fresh workspace", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "health")
    const app = MathOS.open(created.root)
    try {
      const report = await app.doctor()
      const names = report.checks.map((check) => check.name)
      expect(names).toEqual([
        "Bun",
        "Git",
        "SQLite",
        "Workspace",
        "Database",
        "Event log",
        "Model provider",
        "API key",
        "Model",
        "Endpoint",
        "Lean",
        "Lake",
        "Lean project",
        "Mathlib",
        "Toolchain pinned",
        "Lean compile",
        "Declaration inspect",
        "Research graph",
        "Python runtime",
        "Python version",
        "SymPy",
        "Experiment sandbox",
        "Literature providers",
        "Local source extraction",
        "Database/events consistency",
        "Schema version",
        "MathOS version",
      ])
      expect(report.checks.filter((check) => ["Bun", "Git", "SQLite", "Workspace", "Database", "Event log"].includes(check.name)).every((check) => check.status !== "FAIL")).toBe(true)
    } finally {
      app.close()
    }
  }, 20000)
})

describe("branch initialization", () => {
  test("creates an active main branch", async () => {
    const parent = tempDir()
    const created = await MathOS.init(parent, "branch")
    const app = MathOS.open(created.root)
    try {
      const branch = app.currentBranch()
      expect(branch?.name).toBe("MAIN")
      expect(branch?.status).toBe("ACTIVE")
      expect(branch?.id).toBe("B-000")
      expect(branch?.isCurrent).toBe(true)
    } finally {
      app.close()
    }
  })
})
