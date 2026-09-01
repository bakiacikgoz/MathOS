import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inspectLeanSource } from "@mathos/lean"
import {
  compareRankers,
  InMemoryPremiseRetriever,
  loadProfileCache,
  profileCandidate,
  profileCacheKey,
  profileGoal,
  retrieveFromDeclarations,
  saveProfileCache,
  seedDeclarations,
} from "@mathos/retrieval"
import { MathOS } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"

const decls = [
  ...seedDeclarations(),
  {
    name: "Finset.card_union_le",
    kind: "theorem" as const,
    signature: "theorem Finset.card_union_le (s t : Finset α) : (s ∪ t).card ≤ s.card + t.card",
    module: "Mathlib.Data.Finset.Card",
    origin: "mathlib" as const,
  },
  {
    name: "Finset.card_union_of_disjoint",
    kind: "theorem" as const,
    signature: "theorem Finset.card_union_of_disjoint (s t : Finset α) (h : Disjoint s t) : (s ∪ t).card = s.card + t.card",
    module: "Mathlib.Data.Finset.Card",
    origin: "mathlib" as const,
  },
  {
    name: "Nat.Prime",
    kind: "def" as const,
    signature: "def Nat.Prime (n : Nat) : Prop",
    module: "Mathlib.Data.Nat.Prime.Defs",
    origin: "mathlib" as const,
  },
  {
    name: "Finset.Subset.refl",
    kind: "theorem" as const,
    signature: "theorem Finset.Subset.refl (s : Finset α) : s ⊆ s",
    module: "Mathlib.Data.Finset.Basic",
    origin: "mathlib" as const,
  },
  {
    name: "id_nat",
    kind: "theorem" as const,
    signature: "theorem id_nat (n : Nat) : n = n",
    origin: "workspace" as const,
    claimId: "C-001",
    claimStatus: "FORMALIZED_UNVERIFIED",
  },
]

describe("goal-aware retrieval", () => {
  test("GoalProfile extraction", () => {
    const profile = profileGoal("theorem foo (A B : Finset α) : (A ∪ B).card ≤ A.card + B.card")
    expect(profile.isEquality).toBe(false)
    expect(profile.propositionHead).toBe("LE")
    expect(profile.operators).toContain("card")
    expect(profile.typeConstructors).toContain("finset")
    expect(profile.known).toBe(true)
  })

  test("CandidateProfile extraction", () => {
    const profile = profileCandidate(decls.find((item) => item.name === "Eq.refl")!)
    expect(profile.isEquality).toBe(true)
    expect(profile.conclusionHead).toBe("Eq")
  })

  test("conclusion mismatch is penalized", () => {
    const result = retrieveFromDeclarations(decls, {
      query: "subset",
      goal: "theorem t (s : Finset α) : s ⊆ s",
      maxPremises: 10,
    }, "mem")
    expect(result.candidates[0]?.declaration.name).toContain("Subset")
    expect(result.candidates[0]?.declaration.name).not.toBe("Nat.Prime")
  })

  test("current declaration excluded", () => {
    const result = retrieveFromDeclarations(decls, {
      query: "n = n",
      goal: "theorem id_nat (n : Nat) : n = n",
      excludeNames: ["id_nat"],
      maxPremises: 10,
    }, "mem")
    expect(result.candidates.some((item) => item.declaration.name === "id_nat")).toBe(false)
    expect(result.candidates.some((item) => item.declaration.name === "Eq.refl" || item.declaration.name === "rfl")).toBe(true)
  })

  test("natural fallback warning", () => {
    const result = retrieveFromDeclarations(decls, { query: "For every natural number n prove identity", maxPremises: 10 }, "mem")
    expect(result.mode).toBe("NATURAL_FALLBACK")
    expect(result.warning).toContain("Formal goal unavailable")
  })

  test("formal goal mode", () => {
    const result = retrieveFromDeclarations(decls, {
      query: "ignored prose",
      goal: "theorem t (n : Nat) : n = n",
      excludeNames: ["id_nat"],
      maxPremises: 5,
    }, "mem")
    expect(result.mode).toBe("FORMAL_GOAL")
    expect(result.candidates[0]?.declaration.name === "Eq.refl" || result.candidates[0]?.declaration.name === "rfl").toBe(true)
  })

  test("diagnostic repair mode", () => {
    const result = retrieveFromDeclarations(decls, {
      query: "goal",
      goal: "theorem t (A B : Finset α) : (A ∪ B).card ≤ A.card + B.card",
      unknownIdentifiers: ["Finset.card_union_le"],
      previousNames: ["Nat.add_comm"],
      maxPremises: 8,
    }, "mem")
    expect(result.mode).toBe("DIAGNOSTIC_REPAIR")
    expect(result.candidates[0]?.declaration.name).toBe("Finset.card_union_le")
  })

  test("cache hit and invalidation key", () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-cache-"))
    try {
      const key = profileCacheKey("Eq.refl", "4.33.1", "v4.33.1")
      saveProfileCache(dir, { [key]: profileCandidate(decls[0]!) })
      const loaded = loadProfileCache(dir)
      expect(loaded[key]?.declarationName).toBeDefined()
      expect(profileCacheKey("Eq.refl", "4.34.0", "v4.33.1")).not.toBe(key)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("inspectLeanSource equality", () => {
    const inspected = inspectLeanSource("theorem id_nat (n : Nat) : n = n")
    expect(inspected.isEquality).toBe(true)
    expect(inspected.conclusion).toContain("n = n")
  })

  test("proof provenance records retrieval mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-mode-"))
    const created = await MathOS.init(dir, "mode")
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
    const retriever = new InMemoryPremiseRetriever(decls)
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new FakeLeanAdapter(),
      premiseRetriever: retriever,
    })
    try {
      app.createClaim({ kind: "conjecture", title: "Id", statement: "n = n" })
      const formal = await app.formalize("C-001")
      app.approveFormal(formal.formalStatement.id)
      const proved = await app.prove("C-001")
      expect(proved.retrieval?.mode).toBe("FORMAL_GOAL")
      expect(proved.attempts[0]?.retrievalMode).toBe("FORMAL_GOAL")
    } finally {
      app.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("benchmark goal-aware vs baseline", () => {
    const report = compareRankers(decls, [
      { id: "eq", goal: "theorem t (n : Nat) : n = n", expected: ["Eq.refl", "rfl"] },
      {
        id: "card",
        goal: "theorem t (A B : Finset α) : (A ∪ B).card ≤ A.card + B.card",
        expected: ["Finset.card_union_le"],
      },
      { id: "subset", goal: "theorem t (s : Finset α) : s ⊆ s", expected: ["Finset.Subset.refl"] },
    ])
    expect(report.goalAware.hit5).toBeGreaterThanOrEqual(report.baseline.hit5)
    expect(report.goalAware.hit5).toBeGreaterThan(0.5)
  })
})
