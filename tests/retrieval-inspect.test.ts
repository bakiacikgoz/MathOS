import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FakeLeanAdapter, parseCheckOutput } from "@mathos/lean"
import {
  applyLeanEnrichment,
  InMemoryPremiseRetriever,
  readInspectionCache,
  retrieveFromDeclarations,
  seedDeclarations,
  writeInspectionCache,
} from "@mathos/retrieval"
import { MathOS } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-insp-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const decls = [
  ...seedDeclarations(),
  {
    name: "Finset.card_union_le",
    kind: "theorem" as const,
    signature: "theorem Finset.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t",
    module: "Mathlib.Data.Finset.Card",
    origin: "mathlib" as const,
  },
  {
    name: "Nat.Prime",
    kind: "def" as const,
    signature: "def Nat.Prime (n : Nat) : Prop",
    origin: "mathlib" as const,
  },
]

describe("lean inspection", () => {
  test("single declaration inspection parse", () => {
    const parsed = parseCheckOutput(
      ["Eq.refl"],
      "Eq.refl.{u} {α : Sort u} (a : α) : a = a\n",
    )
    expect(parsed[0]?.exists).toBe(true)
    expect(parsed[0]?.elaborated).toBe(true)
    expect(parsed[0]?.propositionShape?.equality).toBe(true)
    expect(parsed[0]?.type).toContain("a = a")
  })

  test("batch declaration inspection parse", () => {
    const parsed = parseCheckOutput(
      ["Eq.refl", "Finset.card_union_le"],
      "Eq.refl.{u} {α : Sort u} (a : α) : a = a\nFinset.card_union_le.{u} {α : Type u} (s t : Finset α) : #(s ∪ t) ≤ #s + #t\n",
    )
    expect(parsed).toHaveLength(2)
    expect(parsed[1]?.propositionShape?.inequality).toBe(true)
  })

  test("unknown declaration", () => {
    const parsed = parseCheckOutput(["NoSuch.thm"], "error: unknown identifier 'NoSuch.thm'\n")
    expect(parsed[0]?.exists).toBe(false)
    expect(parsed[0]?.elaborated).toBe(false)
  })

  test("inspection cache write/read and invalidation", () => {
    const dir = tempDir()
    const inspection = parseCheckOutput(["Eq.refl"], "Eq.refl (a : α) : a = a")[0]!
    const file = readInspectionCache(dir, "4.33.1", "v4.33.1").file
    file.entries["Eq.refl"] = { inspection, sourceHash: null, storedAt: new Date().toISOString() }
    writeInspectionCache(dir, file)
    expect(readInspectionCache(dir, "4.33.1", "v4.33.1").stats.valid).toBe(1)
    expect(readInspectionCache(dir, "4.34.0", "v4.33.1").stats.stale).toBe(1)
    expect(readInspectionCache(dir, "4.33.1", "v4.99.0").stats.valid).toBe(0)
  })

  test("timeout fallback", async () => {
    const lean = new FakeLeanAdapter()
    lean.inspectTimeout = true
    const retriever = new InMemoryPremiseRetriever(decls, lean)
    const result = await retriever.retrieve({
      query: "theorem t (n : Nat) : n = n",
      goal: "theorem t (n : Nat) : n = n",
      maxPremises: 5,
    })
    expect(result.enrichment).toBe("LEAN_ENRICHMENT_FAILED")
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  test("parse failure fallback", async () => {
    const lean = new FakeLeanAdapter()
    lean.inspectFail = true
    const retriever = new InMemoryPremiseRetriever(decls, lean)
    const result = await retriever.retrieve({ query: "n = n", goal: "theorem t (n : Nat) : n = n" })
    expect(result.enrichment).toBe("LEAN_ENRICHMENT_FAILED")
  })

  test("Lean enriched reranking and strong mismatch", () => {
    const header = retrieveFromDeclarations(decls, {
      query: "theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B",
      goal: "theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B",
      maxPremises: 10,
    }, "mem")
    const lean = new FakeLeanAdapter()
    lean.inspectTypes.set("Finset.card_union_le", "theorem Finset.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t")
    lean.inspectTypes.set("Nat.Prime", "def Nat.Prime (n : Nat) : Prop")
    const enriched = applyLeanEnrichment(header, [
      {
        name: "Finset.card_union_le",
        exists: true,
        type: "theorem Finset.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t",
        constants: ["finset", "card", "union"],
        typeConstructors: ["finset"],
        conclusion: "#(s ∪ t) ≤ #s + #t",
        propositionShape: { inequality: true },
        diagnostics: [],
        elaborated: true,
      },
      {
        name: "Nat.Prime",
        exists: true,
        type: "def Nat.Prime (n : Nat) : Prop",
        constants: ["nat", "prime"],
        typeConstructors: ["nat"],
        conclusion: "Prop",
        propositionShape: {},
        diagnostics: [],
        elaborated: true,
      },
    ], { query: header.query, goal: header.goalProfile?.rawTarget, maxPremises: 10 }, new Set())
    expect(enriched.candidates[0]?.declaration.name).toBe("Finset.card_union_le")
    expect(enriched.candidates.some((item) => item.reasons.includes("strong mismatch") && item.declaration.name === "Nat.Prime")).toBe(false)
  })

  test("unknown inspection discarded and self exclusion survives", () => {
    const header = retrieveFromDeclarations(decls, {
      query: "n = n",
      goal: "theorem id_nat (n : Nat) : n = n",
      excludeNames: ["id_nat", "Eq.refl"],
      maxPremises: 8,
    }, "mem")
    const enriched = applyLeanEnrichment(header, [
      { name: "ghost", exists: false, constants: [], typeConstructors: [], diagnostics: [], elaborated: false },
    ], { query: "n = n", goal: "theorem id_nat (n : Nat) : n = n", excludeNames: ["id_nat", "Eq.refl"], maxPremises: 8 }, new Set())
    expect(enriched.candidates.some((item) => item.declaration.name === "id_nat")).toBe(false)
    expect(enriched.candidates.some((item) => item.declaration.name === "ghost")).toBe(false)
  })

  test("proof provenance records enrichment", async () => {
    const created = await MathOS.init(tempDir(), "insp")
    const model = new FakeModelProvider()
    model.enqueue({
      declarationName: "id_nat",
      leanStatement: "theorem id_nat (n : Nat) : n = n",
      variableMapping: [],
      assumptionMapping: [],
      uncertainties: [],
    })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "n=n", formalBackTranslation: "n=n" })
    model.enqueue({ proofBody: "by\n  rfl" })
    const lean = new FakeLeanAdapter()
    lean.inspectTypes.set("Eq.refl", "theorem Eq.refl (a : α) : a = a")
    const retriever = new InMemoryPremiseRetriever(decls, lean)
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: lean,
      premiseRetriever: retriever,
    })
    try {
      app.createClaim({ kind: "conjecture", title: "Id", statement: "n = n" })
      const formal = await app.formalize("C-001")
      app.approveFormal(formal.formalStatement.id)
      const proved = await app.prove("C-001")
      expect(proved.retrieval?.enrichment === "LEAN_ELABORATED" || proved.retrieval?.enrichment === "HEADER").toBe(true)
      expect(proved.attempts[0]?.retrievalProvenance?.inspectSelectionStrategy).toBe("STRATIFIED")
      expect(proved.attempts[0]?.retrievalProvenance?.inspectSelectorVersion).toBe("stratified-v2")
      expect(proved.attempts[0]?.retrievalProvenance?.fusionMethod).toBe("SCORE_FUSION")
      expect(lean.inspectCalls).toBeGreaterThan(0)
    } finally {
      app.close()
    }
  })
})
