import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { composeProof, declarationsMatch, scanForbidden } from "@mathos/domain"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { ProofPrerequisiteFailed } from "@mathos/shared"
import { databasePath } from "@mathos/shared"
import { DatabaseClient } from "@mathos/storage"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-proof-"))
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
  declarationName: "id_nat",
  leanStatement: "theorem id_nat (n : Nat) : n = n",
  variableMapping: [],
  assumptionMapping: [],
  uncertainties: [],
}
const fidelityMatch = {
  verdict: "MATCH",
  findings: [],
  naturalSummary: "n = n",
  formalBackTranslation: "For every natural n, n equals n.",
}

function openApp(root: string, model: FakeModelProvider, lean = new FakeLeanAdapter()) {
  return MathOS.open(root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
}

async function readyClaim(app: MathOS, kind: "conjecture" | "theorem" = "conjecture") {
  const claim = app.createClaim({
    kind,
    title: "Identity",
    statement: "For every natural number n, n = n.",
  })
  const session = await app.formalize(claim.id)
  app.approveFormal(session.formalStatement.id)
  return claim
}

describe("proof layer", () => {
  test("sorry admit unsafe axiom rejected", () => {
    expect(scanForbidden("by\n  sorry")).toContain("sorry")
    expect(scanForbidden("by\n  admit")).toContain("admit")
    expect(scanForbidden("unsafe def x := 1")).toContain("unsafe")
    expect(scanForbidden("axiom boom : False")).toContain("axiom")
  })

  test("statement cannot mutate", () => {
    const formal = "theorem id_nat (n : Nat) : n = n"
    const mutated = composeProof("theorem other : True", "by\n  rfl")
    expect(declarationsMatch(formal, mutated)).toBe(false)
  })

  test("kernel accepted alone does not promote without human fidelity", async () => {
    const created = await MathOS.init(tempDir(), "gate")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue({ ...fidelityMatch, verdict: "POTENTIAL_MISMATCH" })
    const app = openApp(created.root, model)
    try {
      app.createClaim({ kind: "conjecture", title: "Id", statement: "n = n" })
      await app.formalize("C-001")
      expect(app.getFormal("C-001").fidelityStatus).toBe("AI_REVIEWED")
      model.enqueue({ proofBody: "by\n  rfl" })
      const session = await app.prove("C-001")
      expect(session.accepted?.status).toBe("KERNEL_ACCEPTED")
      expect(app.getClaim("C-001").status).not.toBe("KERNEL_VERIFIED")
      expect(session.verification?.passed).toBe(false)
    } finally {
      app.close()
    }
  })

  test("human approval + accepted proof promotes KERNEL_VERIFIED", async () => {
    const created = await MathOS.init(tempDir(), "ok")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    model.enqueue({ proofBody: "by\n  rfl" })
    const app = openApp(created.root, model)
    try {
      await readyClaim(app)
      const session = await app.prove("C-001")
      expect(session.accepted?.id).toBe("PA-001")
      expect(session.verification?.passed).toBe(true)
      expect(app.getClaim("C-001").status).toBe("KERNEL_VERIFIED")
      expect(session.accepted?.provider).toBe("fake")
    } finally {
      app.close()
    }
  })

  test("sorry proof is rejected before kernel and does not promote", async () => {
    const created = await MathOS.init(tempDir(), "sorry")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    model.enqueue({ proofBody: "by\n  sorry" })
    model.enqueue({ proofBody: "by\n  sorry" })
    model.enqueue({ proofBody: "by\n  sorry" })
    const app = openApp(created.root, model)
    try {
      await readyClaim(app)
      const session = await app.prove("C-001")
      expect(session.accepted).toBeNull()
      expect(session.attempts).toHaveLength(3)
      expect(app.getClaim("C-001").status).toBe("FORMALIZED_UNVERIFIED")
    } finally {
      app.close()
    }
  })

  test("max 3 attempts then stop", async () => {
    const created = await MathOS.init(tempDir(), "loop")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    const lean = new FakeLeanAdapter()
    lean.nextProof = { result: "ERROR", diagnostics: [{ severity: "error", message: "type mismatch" }], leanVersion: "fake", toolchain: "leanprover/lean4:v4.33.1" }
    model.enqueue({ proofBody: "by\n  trivial" })
    model.enqueue({ proofBody: "by\n  trivial" })
    model.enqueue({ proofBody: "by\n  trivial" })
    const app = openApp(created.root, model, lean)
    try {
      await readyClaim(app)
      const session = await app.prove("C-001")
      expect(session.attempts).toHaveLength(3)
      expect(lean.proofCalls).toBe(3)
      expect(app.getClaim("C-001").status).toBe("FORMALIZED_UNVERIFIED")
    } finally {
      app.close()
    }
  })

  test("theorem requires human approved fidelity", async () => {
    const created = await MathOS.init(tempDir(), "thm")
    const model = new FakeModelProvider()
    model.enqueue({ ...formalDraft, declarationName: "t" })
    model.enqueue(fidelityMatch)
    const app = openApp(created.root, model)
    try {
      app.createClaim({ kind: "theorem", title: "T", statement: "True" })
      await app.formalize("T-001")
      await expect(app.prove("T-001")).rejects.toBeInstanceOf(ProofPrerequisiteFailed)
    } finally {
      app.close()
    }
  })

  test("verify is deterministic and reopen persists", async () => {
    const created = await MathOS.init(tempDir(), "reopen")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    model.enqueue({ proofBody: "by\n  rfl" })
    const writer = openApp(created.root, model)
    await readyClaim(writer)
    await writer.prove("C-001")
    writer.close()

    const reader = MathOS.open(created.root, { leanAdapter: new FakeLeanAdapter(), modelProvider: new FakeModelProvider() })
    try {
      expect(reader.getClaim("C-001").status).toBe("KERNEL_VERIFIED")
      const proofs = reader.listProofs("C-001")
      expect(proofs.some((item) => item.status === "KERNEL_ACCEPTED")).toBe(true)
      const again = await reader.verify("C-001")
      expect(again.passed).toBe(true)
      const events = readFileSync(join(created.root, ".mathos/events.jsonl"), "utf8")
      expect(events).toContain("proof_attempt_accepted")
      expect(events).toContain("claim_kernel_verified")
    } finally {
      reader.close()
    }
  })

  test("verified claim evidence is immutable until the claim is downgraded", async () => {
    const created = await MathOS.init(tempDir(), "evidence-lock")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    model.enqueue({ proofBody: "by\n  rfl" })
    const app = openApp(created.root, model)
    await readyClaim(app)
    await app.prove("C-001")
    app.close()

    const client = new DatabaseClient(databasePath(created.root))
    client.migrate()
    try {
      expect(() => client.db.query("UPDATE verification_runs SET gate_json = '[]' WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("DELETE FROM verification_runs WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("UPDATE proof_attempts SET status = 'FAILED' WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("DELETE FROM proof_attempts WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("UPDATE formal_statements SET fidelity_status = 'REJECTED' WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("DELETE FROM formal_statements WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("UPDATE fidelity_reviews SET verdict = 'MISMATCH' WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      expect(() => client.db.query("DELETE FROM fidelity_reviews WHERE claim_id = ?").run("C-001")).toThrow("downgrade")
      client.db.query("UPDATE claims SET status = 'STALE' WHERE id = ?").run("C-001")
      expect(client.db.query("DELETE FROM verification_runs WHERE claim_id = ?").run("C-001").changes).toBeGreaterThan(0)
    } finally { client.close() }
  })
})
