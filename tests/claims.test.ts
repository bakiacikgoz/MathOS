import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { ClaimNotFound, InvalidClaimInput, InvalidClaimKind, eventLogPath } from "@mathos/shared"

const temps: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mathos-claim-"))
  temps.push(dir)
  return dir
}

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function events(root: string) {
  return readFileSync(eventLogPath(root), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { action: string; target?: string; metadata?: Record<string, unknown> })
}

describe("claim workflow", () => {
  test("allocates sequential readable ids including COR", async () => {
    const created = await MathOS.init(tempDir(), "ids")
    const app = MathOS.open(created.root)
    try {
      expect(app.createClaim({ kind: "conjecture", title: "A", statement: "stmt A" }).id).toBe("C-001")
      expect(app.createClaim({ kind: "conjecture", title: "B", statement: "stmt B" }).id).toBe("C-002")
      expect(app.createClaim({ kind: "lemma", title: "L", statement: "stmt L" }).id).toBe("L-001")
      expect(app.createClaim({ kind: "corollary", title: "K", statement: "stmt K" }).id).toBe("COR-001")
    } finally {
      app.close()
    }
  })

  test("persists claims and rejects empty fields", async () => {
    const created = await MathOS.init(tempDir(), "persist")
    const writer = MathOS.open(created.root)
    writer.createClaim({ kind: "theorem", title: "Main bound", statement: "The bound holds." })
    writer.close()

    const reader = MathOS.open(created.root)
    try {
      const claims = reader.listClaims()
      expect(claims).toHaveLength(1)
      expect(claims[0]?.id).toBe("T-001")
      expect(claims[0]?.naturalStatement).toBe("The bound holds.")
      expect(() => reader.createClaim({ kind: "lemma", title: "   ", statement: "x" })).toThrow(InvalidClaimInput)
      expect(() => reader.createClaim({ kind: "lemma", title: "ok", statement: "" })).toThrow(InvalidClaimInput)
      expect(() => reader.createClaim({ kind: "mystery", title: "ok", statement: "x" })).toThrow(InvalidClaimKind)
    } finally {
      reader.close()
    }
  })

  test("writes claim_created without making the first claim the objective", async () => {
    const created = await MathOS.init(tempDir(), "events")
    const app = MathOS.open(created.root)
    try {
      app.createClaim({ kind: "conjecture", title: "Energy", statement: "E(A) is large." })
      expect(app.status().mainObjective).toBeNull()
      const createdEvent = events(created.root).find((item) => item.action === "claim_created")
      expect(createdEvent?.target).toBe("C-001")
      expect(createdEvent?.metadata?.claim_type).toBe("conjecture")
      expect(createdEvent?.metadata?.title).toBe("Energy")
      expect(createdEvent?.metadata?.status).toBe("CONJECTURE")
      expect(createdEvent?.metadata?.branch).toBe("B-000")
      expect(createdEvent?.metadata?.statement).toBeUndefined()
    } finally {
      app.close()
    }
  })

  test("main objective persists across reopen and logs the change", async () => {
    const created = await MathOS.init(tempDir(), "objective")
    const writer = MathOS.open(created.root)
    writer.createClaim({ kind: "conjecture", title: "Energy bound", statement: "For every finite A..." })
    writer.createClaim({ kind: "lemma", title: "Helper", statement: "A useful estimate." })
    writer.setMainObjective("C-001")
    writer.close()

    const reader = MathOS.open(created.root)
    try {
      expect(reader.status().mainObjective).toEqual({
        id: "C-001",
        title: "Energy bound",
        status: "CONJECTURE",
      })
      expect(reader.status().research.totalClaims).toBe(2)
      expect(reader.status().research.conjectures).toBe(1)
      const change = events(created.root).find((item) => item.action === "main_objective_changed")
      expect(change?.target).toBe("C-001")
      expect(change?.metadata?.previous).toBeNull()
    } finally {
      reader.close()
    }
  })

  test("invalid objective id is rejected", async () => {
    const created = await MathOS.init(tempDir(), "bad-obj")
    const app = MathOS.open(created.root)
    try {
      expect(() => app.setMainObjective("C-404")).toThrow(ClaimNotFound)
    } finally {
      app.close()
    }
  })

  test("claim detail projection includes empty evidence and dependencies", async () => {
    const created = await MathOS.init(tempDir(), "detail")
    const app = MathOS.open(created.root)
    try {
      app.createClaim({ kind: "definition", title: "Energy", statement: "E(A) is additive energy." })
      const detail = app.getClaimDetail("D-001")
      expect(detail.kind).toBe("definition")
      expect(detail.branchName).toBe("MAIN")
      expect(detail.evidence).toEqual([])
      expect(detail.dependencies).toEqual([])
    } finally {
      app.close()
    }
  })
})
