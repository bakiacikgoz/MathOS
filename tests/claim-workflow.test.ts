import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { runHeadless } from "../apps/tui/src/headless.ts"

const temps: string[] = []
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }) })
async function workspace() { const dir = mkdtempSync(join(tmpdir(), "mathos-workflow-")); temps.push(dir); return (await MathOS.init(dir, "wf")).root }
const fidelityMatch = { verdict: "MATCH", findings: [], naturalSummary: "n = n", formalBackTranslation: "For every natural n, n equals n." }

async function cli(root: string, args: string[]) {
  let output = ""
  const write = process.stdout.write.bind(process.stdout), previous = process.cwd()
  process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
  process.chdir(root)
  try { return { code: await runHeadless(args), output } } finally { process.stdout.write = write; process.chdir(previous) }
}

describe("claim workflow", () => {
  test("a person can write the Lean statement; a bare proposition is named after the claim", async () => {
    const root = await workspace(), model = new FakeModelProvider(), lean = new FakeLeanAdapter()
    model.enqueue(fidelityMatch)
    const app = MathOS.open(root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
    try {
      const claim = app.createClaim({ kind: "lemma", title: "Identity", statement: "For every natural number n, n = n." })
      expect(app.claimWorkflow(claim.id).next).toBe("formalize")
      const session = await app.formalize(claim.id, { leanStatement: "∀ n : Nat, n = n" })
      expect(session.formalStatement.createdBy).toBe("user")
      const name = `claim_${claim.id.toLowerCase().replace(/-/g, "_")}`
      expect(session.formalStatement.sourceText).toBe(`theorem ${name} : ∀ n : Nat, n = n`)
      expect(session.formalStatement.provider).toBeNull()
      const flow = app.claimWorkflow(claim.id)
      expect(flow.next).toBe("review")
      expect(flow.formal?.statement).toBe(`theorem ${name} : ∀ n : Nat, n = n`)
      expect(flow.fidelity?.verdict).toBe("MATCH")
    } finally { app.close() }
  })

  test("a user statement survives a missing auditor model, and Lean's own error is shown when it does not elaborate", async () => {
    const root = await workspace(), model = new FakeModelProvider(), lean = new FakeLeanAdapter()
    const app = MathOS.open(root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
    try {
      const claim = app.createClaim({ kind: "lemma", title: "Identity", statement: "n = n" })
      const session = await app.formalize(claim.id, { leanStatement: "theorem ident (n : Nat) : n = n" })
      expect(session.fidelity).toBeNull()
      expect(session.formalStatement.declarationName).toBe("ident")
      lean.nextResult = { result: "ERROR", diagnostics: [{ severity: "error", message: "unknown identifier 'foo'" }], leanVersion: "fake", toolchain: "fake" }
      await expect(app.formalize(claim.id, { leanStatement: "foo = foo" })).rejects.toThrow("unknown identifier 'foo'")
      await expect(app.formalize(claim.id, { leanStatement: "theorem t : True := by trivial" })).rejects.toThrow()
    } finally { app.close() }
  })

  test("formal approve records the human decision that proving and the gate require, and the workflow moves on", async () => {
    const root = await workspace(), model = new FakeModelProvider(), lean = new FakeLeanAdapter()
    model.enqueue(fidelityMatch)
    const app = MathOS.open(root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
    const claim = app.createClaim({ kind: "theorem", title: "Identity", statement: "For every natural number n, n = n." })
    await app.formalize(claim.id, { leanStatement: "theorem ident (n : Nat) : n = n" })
    app.close()

    const approved = await cli(root, ["formal", "approve", claim.id])
    expect(approved.code).toBe(0)
    expect(JSON.parse(approved.output).fidelityStatus).toBe("HUMAN_APPROVED")
    const shown = await cli(root, ["claim", "show", claim.id, "--json"])
    const flow = JSON.parse(shown.output).workflow
    expect(flow.approved).toBe(true)
    expect(flow.next).toBe("prove")

    const reopened = MathOS.open(root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
    try {
      model.enqueue({ proofBody: "by\n  intro n\n  rfl" })
      const proof = await reopened.prove(claim.id)
      expect(proof.accepted).not.toBeNull()
      const done = reopened.claimWorkflow(claim.id)
      expect(done.verified).toBe(true)
      expect(done.next).toBe("done")
      expect(done.acceptedProof?.id).toBe(proof.accepted!.id)
    } finally { reopened.close() }
  })
})
