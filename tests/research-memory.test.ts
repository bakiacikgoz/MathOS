import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, PersonalMemoryStore, acceptedProofBody, renderPreferences } from "@mathos/core"
import { composeProof, memorySearchTerms } from "@mathos/domain"
import { FakeModelProvider, type ModelRequest, type ModelResponse } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"

const temps: string[] = []
const temp = (prefix = "mathos-memory-") => { const dir = mkdtempSync(join(tmpdir(), prefix)); temps.push(dir); return dir }
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** Keeps every prompt it was sent, so a test can see what the model was told. */
class RecordingModel extends FakeModelProvider {
  prompts: string[] = []
  override async generate(request: ModelRequest): Promise<ModelResponse> {
    this.prompts.push(request.messages.map((message) => message.content).join("\n"))
    return super.generate(request)
  }
}
const formalDraft = { declarationName: "id_nat", leanStatement: "theorem id_nat (n : Nat) : n = n", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelityMatch = { verdict: "MATCH", findings: [], naturalSummary: "n = n", formalBackTranslation: "For every natural n, n equals n." }
const rejected = (message: string) => ({ result: "ERROR" as const, diagnostics: [{ severity: "error" as const, message }], leanVersion: "fake", toolchain: "leanprover/lean4:v4.33.1" })

function convention(app: MathOS, name: string, value: string) {
  const scope = app.memoryScope()
  const item = app.services.mathematicalContext.proposeItem({ ...scope, scopeKind: "WORKSPACE", scopeId: scope.workspaceId, draft: { kind: "CONVENTION", canonicalName: name, displayText: value, normalizedValue: value, origin: "USER" } })
  return app.services.mathematicalContext.applyProposal(item.id, item.revision)
}

describe("models see the conventions the user approved", () => {
  test("formalizer, fidelity reviewer and prover all read the workspace conventions", async () => {
    const created = await MathOS.init(temp(), "conventions")
    const model = new RecordingModel(), lean = new FakeLeanAdapter()
    const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
    try {
      convention(app, "naturals", "ℕ starts at 0")
      app.createClaim({ kind: "conjecture", title: "Identity", statement: "For every natural number n, n = n." })
      model.enqueue(formalDraft); model.enqueue(fidelityMatch)
      await app.formalize("C-001")
      expect(model.prompts[0]).toContain("WORKSPACE CONVENTIONS")
      expect(model.prompts[0]).toContain("naturals: ℕ starts at 0")
      expect(model.prompts[1]).toContain("ℕ starts at 0")
      app.approveFormal(app.getFormal("C-001").id)
      model.enqueue({ proofBody: "by\n  rfl" })
      await app.prove("C-001")
      expect(model.prompts.at(-1)).toContain("naturals: ℕ starts at 0")
    } finally { app.close() }
  })
})

describe("failed proofs are remembered per statement", () => {
  test("a later session sees what failed before, and a repeated failure is counted, not duplicated", async () => {
    const created = await MathOS.init(temp(), "failures")
    const model = new RecordingModel(), lean = new FakeLeanAdapter()
    const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: lean })
    try {
      app.createClaim({ kind: "conjecture", title: "Identity", statement: "For every natural number n, n = n." })
      model.enqueue(formalDraft); model.enqueue(fidelityMatch)
      await app.formalize("C-001"); app.approveFormal(app.getFormal("C-001").id)
      lean.nextProof = rejected("unknown identifier 'Nat.foo'")
      model.enqueue({ proofBody: "by\n  exact Nat.foo n" })
      await app.prove("C-001", undefined, { maxAttempts: 1 })
      expect(model.prompts.at(-1)).not.toContain("EARLIER FAILED ATTEMPTS")
      expect(app.claimFailures("C-001")).toMatchObject([{ failureClass: "LEAN_REJECTED", occurrenceCount: 1, attemptedApproach: "by\n  exact Nat.foo n" }])

      // A new session: the prover is told about the earlier failure before it tries again.
      model.enqueue({ proofBody: "by\n  exact Nat.foo n" })
      await app.prove("C-001", undefined, { maxAttempts: 1 })
      const prompt = model.prompts.at(-1)!
      expect(prompt).toContain("EARLIER FAILED ATTEMPTS ON THIS STATEMENT")
      expect(prompt).toContain("exact Nat.foo n")
      expect(prompt).toContain("unknown identifier 'Nat.foo'")
      expect(app.claimFailures("C-001")).toMatchObject([{ occurrenceCount: 2 }])
      expect(app.memoryBrief("C-001")).toContain("1 earlier failed proof approach")

      lean.nextProof = { result: "KERNEL_ACCEPTED", diagnostics: [], leanVersion: "fake", toolchain: "leanprover/lean4:v4.33.1" }
      model.enqueue({ proofBody: "by\n  rfl" })
      expect((await app.prove("C-001")).accepted?.status).toBe("KERNEL_ACCEPTED")
      expect(app.getClaim("C-001").status).toBe("KERNEL_VERIFIED")
    } finally { app.close() }
  })
})

describe("research memory notes", () => {
  test("notes keep their basis, need the user for a model's suggestion, and cannot claim Lean without a verified claim", async () => {
    const created = await MathOS.init(temp(), "notes")
    const app = MathOS.open(created.root, { modelProvider: new FakeModelProvider() })
    try {
      const memory = app.services.researchMemory, scope = app.memoryScope()
      app.createClaim({ kind: "conjecture", title: "Odd sums", statement: "The sum of the first n odd numbers is n^2." })
      const own = memory.add(scope, { kind: "DEAD_END", text: "Güçlü tümevarım gereksiz karmaşık", origin: "USER", claimId: "c-001" })
      expect(own).toMatchObject({ id: "MEM-001", basis: "USER", status: "ACTIVE", claimId: "C-001", claimVerified: false })
      const suggestion = memory.add(scope, { kind: "IDEA", text: "Try a telescoping sum", origin: "MODEL" })
      expect(suggestion).toMatchObject({ status: "PROPOSED", basis: "MODEL" })
      expect(memory.list(scope).map((note) => note.id)).toEqual(["MEM-001"])
      expect(memory.accept(suggestion.id)).toMatchObject({ status: "ACTIVE", basis: "MODEL" })
      expect(() => memory.add(scope, { kind: "INSIGHT", text: "true", origin: "MODEL", basis: "USER" })).toThrow("MODEL_MEMORY_BASIS_MUST_BE_MODEL")
      expect(() => memory.add(scope, { kind: "INSIGHT", text: "verified", origin: "USER", basis: "LEAN", claimId: "C-001" })).toThrow("MEMORY_LEAN_BASIS_NEEDS_VERIFIED_CLAIM")
      expect(() => memory.add(scope, { kind: "INSIGHT", text: "x", origin: "USER", claimId: "C-999" })).toThrow("CLAIM_NOT_FOUND")
      expect(() => memory.refute(suggestion.id, " ")).toThrow("MEMORY_REFUTE_REASON_REQUIRED")
      expect(memory.refute(suggestion.id, "fails for n = 0")).toMatchObject({ basis: "REFUTED", reason: "fails for n = 0", status: "ACTIVE" })
      expect(memory.list(scope, { query: "tumevarim" }).map((note) => note.id)).toEqual(["MEM-001"])
      expect(memory.archive(own.id).status).toBe("ARCHIVED")
      expect(memory.list(scope).map((note) => note.id)).toEqual(["MEM-002"])
      expect(memory.restore(own.id).status).toBe("ACTIVE")
      const brief = app.memoryBrief("C-001")
      expect(brief).toContain("RESEARCH MEMORY")
      expect(brief.indexOf("MEM-001")).toBeLessThan(brief.indexOf("MEM-002"))
      expect(brief).toContain("REFUTED, do not rely on it")
      expect(brief).toContain("Refuted because: fails for n = 0")
    } finally { app.close() }
  })

  test("a branch's notes stay on that branch and the branches started from it; workspace notes are everywhere", async () => {
    const created = await MathOS.init(temp(), "branches")
    const app = MathOS.open(created.root, { vcs: new FakeVcs() })
    try {
      const memory = app.services.researchMemory
      memory.add(app.memoryScope(), { kind: "DECISION", text: "main line decision", origin: "USER" })
      memory.add(app.memoryScope(), { kind: "OPEN_QUESTION", text: "workspace question", origin: "USER", scopeKind: "WORKSPACE" })
      const child = await app.createBranch("contradiction approach")
      app.switchBranch(child.id)
      memory.add(app.memoryScope(), { kind: "DEAD_END", text: "contradiction stalls at the base case", origin: "USER" })
      expect(memory.list(app.memoryScope()).map((note) => note.text).sort()).toEqual(["contradiction stalls at the base case", "main line decision", "workspace question"])
      app.switchBranch("B-000")
      expect(memory.list(app.memoryScope()).map((note) => note.text).sort()).toEqual(["main line decision", "workspace question"])
    } finally { app.close() }
  })

  test("search ignores case and Turkish accents", () => {
    expect(memorySearchTerms("Tümevarım İLE Çözüm")).toEqual(["tumevarim", "ile", "cozum"])
  })
})

describe("personal memory", () => {
  test("preferences and verified results live in one readable file", () => {
    const path = join(temp("mathos-personal-"), "config", "personal-memory.json"), store = new PersonalMemoryStore(path, () => "2026-10-12T00:00:00.000Z")
    expect(store.read()).toEqual({ schemaVersion: "mathos.personal-memory.v1", preferences: [], library: [] })
    const preference = store.addPreference("  Answer in Turkish; write proofs step by step.  ")
    expect(preference).toEqual({ id: "PREF-001", text: "Answer in Turkish; write proofs step by step.", createdAt: "2026-10-12T00:00:00.000Z" })
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(renderPreferences(store.read().preferences)).toContain("- Answer in Turkish; write proofs step by step.")
    expect(() => store.addPreference(" ")).toThrow("PREFERENCE_TEXT_REQUIRED")
    expect(() => store.addPreference("x".repeat(501))).toThrow("PREFERENCE_TEXT_TOO_LONG")
    const lemma = { name: "odd_sum", title: "Odd sums", kind: "theorem", naturalStatement: "The sum of the first n odd numbers is n^2.", leanStatement: "theorem odd_sum (n : ℕ) : ∑ i in Finset.range n, (2 * i + 1) = n ^ 2", proofBody: "by\n  induction n <;> simp_all [Finset.sum_range_succ]; ring", leanVersion: "4.33.1", source: { workspace: "w", claimId: "C-001", proofAttemptId: "PA-001" }, verifiedAt: "2026-10-12T00:00:00.000Z" }
    const added = store.addLemma(lemma)
    expect(added).toMatchObject({ duplicate: false, entry: { id: "LIB-001", name: "odd_sum" } })
    expect(store.addLemma(lemma)).toMatchObject({ duplicate: true, entry: { id: "LIB-001" } })
    expect(store.searchLibrary("odd numbers").map((entry) => entry.id)).toEqual(["LIB-001"])
    expect(store.searchLibrary("prime")).toEqual([])
    store.removePreference("pref-001"); store.removeLemma("LIB-001")
    expect(store.read()).toMatchObject({ preferences: [], library: [] })
    expect(() => store.removeLemma("LIB-001")).toThrow("LIBRARY_ENTRY_NOT_FOUND")
    writeFileSync(path, "{broken")
    expect(() => store.read()).toThrow("PERSONAL_MEMORY_INVALID")
  })

  test("an accepted proof keeps only its body, ready to check against the same statement elsewhere", () => {
    expect(acceptedProofBody(composeProof("theorem id_nat (n : Nat) : n = n", "by\n  rfl"))).toBe("by\n  rfl")
  })
})
