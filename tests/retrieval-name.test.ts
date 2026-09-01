import { describe, expect, test } from "bun:test"
import {
  buildChannelIndex,
  formalQueryTokens,
  INDEX_FORMAT_VERSION,
  nameAwareRank,
  profileDeclarationName,
  matchGoalToDeclaration,
  profileGoalName,
  retrieveFromDeclarations,
  seedDeclarations,
  tokenizeName,
} from "@mathos/retrieval"

describe("name-aware recall", () => {
  test("declaration name profile tokenization", () => {
    const p = profileDeclarationName("Finset.card_union_le")
    expect(p.nameTokens).toEqual(["card", "union", "le"])
    expect(p.namespaceTokens).toEqual(["finset"])
    expect(p.normalizedTokens).toEqual(["finset", "card", "union", "le"])
    expect(p.suffixTokens).toContain("le")
  })

  test("nested namespace", () => {
    const p = profileDeclarationName("CategoryTheory.BraidedCategory.ofBifunctor.firstMap")
    expect(p.normalizedTokens).toContain("category")
    expect(p.normalizedTokens).toContain("theory")
    expect(p.nameTokens).toContain("first")
    expect(p.nameTokens).toContain("map")
  })

  test("protected theorem parsing", () => {
    const p = profileDeclarationName("Iff.symm")
    expect(p.nameTokens).toContain("symm")
    expect(p.namespaceTokens).toContain("iff")
    expect(p.suffixTokens).toContain("symm")
  })

  test("attribute-prefixed declaration parsed", () => {
    const { parseLeanDeclarations } = require("@mathos/retrieval")
    const parsed = parseLeanDeclarations(
      '@[simp]\ntheorem Function.comp_apply (f : β → δ) (g : α → β) (x : α) : comp f g x = f (g x) := rfl\n',
      { origin: "mathlib", module: "Init.Core" },
    )
    expect(parsed[0]?.name).toBe("Function.comp_apply")
  })

  test("name token coverage 3/3 boosts rank", () => {
    const decls = [
      ...seedDeclarations(),
      { name: "Finset.card_union_le", kind: "theorem" as const, signature: "theorem Finset.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t", module: "Mathlib.Data.Finset.Card", origin: "mathlib" as const },
      { name: "Nat.Prime", kind: "def" as const, signature: "def Nat.Prime (n : Nat) : Prop", origin: "mathlib" as const },
      { name: "Other.card_union_le", kind: "theorem" as const, signature: "theorem Other.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t", origin: "mathlib" as const },
    ]
    const result = retrieveFromDeclarations(decls, {
      query: "card union le",
      goal: "theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B",
      maxPremises: 10,
      candidatePool: 50,
    }, "t")
    const names = result.candidates.map((item) => item.declaration.name)
    expect(names).toContain("Finset.card_union_le")
  })

  test("ordered token match boosts rank", () => {
    const goal = profileGoalName(["card", "union", "le"], ["le", "card", "union"], ["finset"], "LE")
    const match = matchGoalToDeclaration(goal, profileDeclarationName("Finset.card_union_le"))
    expect(match.coverage).toBe(1)
    expect(match.ordered).toBe(true)
    expect(match.bigramHits).toBeGreaterThan(0)
  })

  test("bigram match detected", () => {
    const goal = profileGoalName(["card", "union"], ["card", "union"], [], undefined)
    const match = matchGoalToDeclaration(goal, profileDeclarationName("Finset.card_union_le"))
    expect(match.bigramHits).toBeGreaterThan(0)
  })

  test("trigram match detected", () => {
    const goal = profileGoalName(["card", "union", "le"], ["le"], ["finset"], "LE")
    const match = matchGoalToDeclaration(goal, profileDeclarationName("Finset.card_union_le"))
    expect(match.trigramHits).toBeGreaterThan(0)
  })

  test("semantic suffix _le _symm _refl detected", () => {
    expect(profileDeclarationName("Eq.refl").suffixTokens).toContain("refl")
    expect(profileDeclarationName("Iff.symm").suffixTokens).toContain("symm")
    expect(profileDeclarationName("Finset.card_union_le").suffixTokens).toContain("le")
  })

  test("IDF weighting favors rare tokens", () => {
    const decls = [
      ...seedDeclarations(),
      { name: "Common.eq", kind: "theorem" as const, signature: "theorem Common.eq : True", origin: "mathlib" as const },
      { name: "Rare.card_union_le", kind: "theorem" as const, signature: "theorem Rare.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t", origin: "mathlib" as const },
      ...Array.from({ length: 100 }, (_, i) => ({ name: `Common${i}.eq`, kind: "theorem" as const, signature: `theorem Common${i}.eq : True`, origin: "mathlib" as const })),
    ]
    const index = buildChannelIndex(decls)
    expect(index.tokenStats.documentFrequency.eq).toBeGreaterThan(index.tokenStats.documentFrequency.union ?? 0)
  })

  test("multi-channel diminishing bonus", () => {
    const candidates = [
      { declaration: seedDeclarations()[1]!, score: 0.5, reasons: [], generation: { channels: ["NAME", "SYMBOL", "STRUCTURE"], matchedTokens: ["eq", "refl"], channelRanks: {} } },
      { declaration: seedDeclarations()[1]!, score: 0.5, reasons: [], generation: { channels: ["NAME"], matchedTokens: ["eq"], channelRanks: {} } },
    ]
    const ranked = nameAwareRank(candidates, null, { query: "eq refl", maxPremises: 5, candidatePool: 10 })
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(ranked[1]?.score ?? 0)
  })

  test("deterministic tie-break", () => {
    const candidates = [
      { declaration: { name: "B.eq", kind: "theorem" as const, signature: "theorem B.eq : True", origin: "mathlib" as const }, score: 0.5, reasons: [] },
      { declaration: { name: "A.eq", kind: "theorem" as const, signature: "theorem A.eq : True", origin: "mathlib" as const }, score: 0.5, reasons: [] },
    ]
    const ranked = nameAwareRank(candidates, null, { query: "eq", maxPremises: 5, candidatePool: 10 })
    expect(ranked[0]?.declaration.name).toBe("A.eq")
  })

  test("index format version is 3", () => {
    expect(INDEX_FORMAT_VERSION).toBe(3)
  })
})
