import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, parseFormalizationDraft, parseFidelityPayload } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FormalizationFailed, ProofBodyRejected } from "@mathos/shared"
import { hasProofBody } from "@mathos/domain"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-formal-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const formalDraft = {
  declarationName: "additive_energy_bound",
  leanStatement: "theorem additive_energy_bound (G : Type*) [AddCommGroup G] (A : Set G) : True",
  variableMapping: [{ natural: "G", lean: "G" }],
  assumptionMapping: [],
  uncertainties: [],
}

const fidelityMatch = {
  verdict: "MATCH",
  findings: [],
  naturalSummary: "Energy is large.",
  formalBackTranslation: "For every additive commutative group G and set A, True holds.",
}

const fidelityMismatch = {
  verdict: "POTENTIAL_MISMATCH",
  findings: [
    {
      dimension: "scope",
      severity: "warning",
      message: "Formal statement requires global continuity. Natural statement only requires continuity on [0,1].",
    },
  ],
  naturalSummary: "Continuous on [0,1].",
  formalBackTranslation: "Every globally continuous f : ℝ → ℝ ...",
}

function openApp(root: string, formalizer: FakeModelProvider, auditor = formalizer, lean = new FakeLeanAdapter()) {
  return MathOS.open(root, { modelProvider: formalizer, auditorProvider: auditor, leanAdapter: lean })
}

describe("formal layer", () => {
  test("sorry and proof body are rejected", () => {
    expect(hasProofBody("theorem t : True := by\n  sorry")).toBe(true)
    expect(() =>
      parseFormalizationDraft(
        { declarationName: "t", leanStatement: "theorem t : True := by sorry" },
        { provider: "x", model: "y" },
      ),
    ).toThrow(ProofBodyRejected)
  })

  test("fidelity MATCH vs POTENTIAL_MISMATCH", () => {
    expect(parseFidelityPayload(fidelityMatch).verdict).toBe("MATCH")
    expect(parseFidelityPayload(fidelityMismatch).verdict).toBe("POTENTIAL_MISMATCH")
    expect(parseFidelityPayload(fidelityMismatch).findings[0]?.message).toContain("[0,1]")
  })

  test("persists FS ids and does not promote KERNEL_VERIFIED", async () => {
    const created = await MathOS.init(tempDir(), "formal")
    const fake = new FakeModelProvider()
    fake.enqueue(formalDraft)
    fake.enqueue(fidelityMismatch)
    const app = openApp(created.root, fake)
    try {
      app.createClaim({ kind: "conjecture", title: "Energy", statement: "Every continuous f on [0,1] is bounded." })
      const session = await app.formalize("C-001")
      expect(session.formalStatement.id).toBe("FS-001")
      expect(session.check.result).toBe("ELABORATES")
      expect(session.fidelity?.verdict).toBe("POTENTIAL_MISMATCH")
      expect(app.getClaim("C-001").status).toBe("CONJECTURE")
      expect(session.proofAttempted).toBe(false)

      const approved = app.approveFormal(session.formalStatement.id)
      expect(approved.fidelityStatus).toBe("HUMAN_APPROVED")
      expect(app.getClaim("C-001").status).toBe("FORMALIZED_UNVERIFIED")
      expect(app.getClaim("C-001").status).not.toBe("KERNEL_VERIFIED")
    } finally {
      app.close()
    }
  })

  test("reject does not promote claim", async () => {
    const created = await MathOS.init(tempDir(), "reject")
    const fake = new FakeModelProvider()
    fake.enqueue(formalDraft)
    fake.enqueue(fidelityMatch)
    const app = openApp(created.root, fake)
    try {
      app.createClaim({ kind: "lemma", title: "L", statement: "A useful bound." })
      const session = await app.formalize("L-001")
      app.rejectFormal(session.formalStatement.id)
      expect(app.getClaim("L-001").status).toBe("IDEA")
      expect(app.getFormal("L-001").fidelityStatus).toBe("REJECTED")
    } finally {
      app.close()
    }
  })

  test("repair max attempts", async () => {
    const created = await MathOS.init(tempDir(), "repair")
    const fake = new FakeModelProvider()
    fake.enqueue(formalDraft)
    fake.enqueue(formalDraft)
    fake.enqueue(formalDraft)
    const lean = new FakeLeanAdapter()
    lean.nextResult = { result: "ERROR", diagnostics: [{ severity: "error", message: "unknown identifier" }], leanVersion: "fake", toolchain: null }
    const app = openApp(created.root, fake, fake, lean)
    try {
      app.createClaim({ kind: "theorem", title: "T", statement: "True." })
      await expect(app.formalize("T-001")).rejects.toBeInstanceOf(FormalizationFailed)
      expect(lean.checkCalls).toBe(3)
    } finally {
      app.close()
    }
  })

  test("repair success on second lean check", async () => {
    const created = await MathOS.init(tempDir(), "repair-ok")
    const fake = new FakeModelProvider()
    fake.enqueue(formalDraft)
    fake.enqueue(formalDraft)
    fake.enqueue(fidelityMatch)
    const lean = new FakeLeanAdapter()
    const first = { result: "ERROR" as const, diagnostics: [{ severity: "error" as const, message: "bad" }], leanVersion: "fake", toolchain: null }
    const ok = { result: "ELABORATES" as const, diagnostics: [], leanVersion: "fake", toolchain: null }
    lean.checkStatement = async () => {
      lean.checkCalls += 1
      return lean.checkCalls === 1 ? first : ok
    }
    const app = openApp(created.root, fake, fake, lean)
    try {
      app.createClaim({ kind: "theorem", title: "T", statement: "True." })
      const session = await app.formalize("T-001")
      expect(session.check.repairs).toBe(1)
      expect(session.formalStatement.verificationStatus).toBe("ELABORATES")
    } finally {
      app.close()
    }
  })

  test("reopen keeps formal statement and fidelity", async () => {
    const created = await MathOS.init(tempDir(), "reopen")
    const fake = new FakeModelProvider()
    fake.enqueue(formalDraft)
    fake.enqueue(fidelityMatch)
    const writer = openApp(created.root, fake)
    writer.createClaim({ kind: "conjecture", title: "C", statement: "For every nonempty finite set A..." })
    const session = await writer.formalize("C-001")
    writer.approveFormal(session.formalStatement.id)
    writer.close()

    const reader = MathOS.open(created.root, { leanAdapter: new FakeLeanAdapter(), modelProvider: new FakeModelProvider() })
    try {
      const formal = reader.getFormal("C-001")
      expect(formal.id).toBe("FS-001")
      expect(formal.fidelityStatus).toBe("HUMAN_APPROVED")
      expect(reader.getClaim("C-001").status).toBe("FORMALIZED_UNVERIFIED")
      expect(reader.getFidelity(formal.id)?.verdict).toBe("MATCH")
      const events = readFileSync(join(created.root, ".mathos/events.jsonl"), "utf8")
      expect(events).toContain("formal_statement_created")
      expect(events).toContain("fidelity_approved")
      expect(existsSync(join(created.root, "formal/Claims/C001.lean"))).toBe(true)
    } finally {
      reader.close()
    }
  })
})
