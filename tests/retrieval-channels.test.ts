import { describe, expect, test } from "bun:test"
import {
  buildChannelIndex,
  expandSymbols,
  formalQueryTokens,
  generateCandidates,
  INDEX_FORMAT_VERSION,
  retrieveFromDeclarations,
  tokenizeName,
} from "@mathos/retrieval"

const decls = [
  { name: "Finset.card_union_le", kind: "theorem" as const, signature: "theorem Finset.card_union_le (s t : Finset α) : #(s ∪ t) ≤ #s + #t", module: "Mathlib.Data.Finset.Card", origin: "mathlib" as const },
  { name: "Nat.add_le_add", kind: "theorem" as const, signature: "theorem Nat.add_le_add (a b c d : Nat) (h₁ : a ≤ b) (h₂ : c ≤ d) : a + c ≤ b + d", origin: "mathlib" as const },
  { name: "Eq.refl", kind: "theorem" as const, signature: "theorem Eq.refl (a : α) : a = a", origin: "mathlib" as const },
  { name: "mathos_ok", kind: "lemma" as const, signature: "theorem mathos_ok : True", origin: "workspace" as const, claimId: "L-001", claimStatus: "KERNEL_VERIFIED" },
  { name: "mathos_stale", kind: "lemma" as const, signature: "theorem mathos_stale : True", origin: "workspace" as const, claimId: "L-002", claimStatus: "STALE" },
  { name: "mathos_bad", kind: "lemma" as const, signature: "theorem mathos_bad : False", origin: "workspace" as const, claimId: "L-003", claimStatus: "DISPROVED" },
]

describe("stage-1 generation", () => {
  test("name token index", () => {
    expect(tokenizeName("Finset.card_union_le")).toEqual(["finset", "card", "union", "le"])
    expect(tokenizeName("Nat.add_le_add")).toContain("add")
  })

  test("symbol normalization", () => {
    expect(expandSymbols("#(A ∪ B) ≤ #A + #B")).toEqual(expect.arrayContaining(["card", "union", "le", "add"]))
    expect(formalQueryTokens("theorem t (s : Finset α) : s ⊆ s")).toEqual(expect.arrayContaining(["subset", "finset"]))
  })

  test("operator and namespace indexes find gold", () => {
    const index = buildChannelIndex(decls)
    expect(index.names.card?.length).toBeGreaterThan(0)
    expect(index.namespaces.finset?.length).toBeGreaterThan(0)
    const generated = generateCandidates(decls, index, { goalText: "theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B", formal: true })
    expect(generated.some((item) => item.declaration.name === "Finset.card_union_le")).toBe(true)
    const gold = generated.find((item) => item.declaration.name === "Finset.card_union_le")
    expect(gold?.evidence.channels).toEqual(expect.arrayContaining(["NAME", "SYMBOL"]))
  })

  test("union de-duplicates and respects caps", () => {
    const index = buildChannelIndex(decls)
    const generated = generateCandidates(decls, index, {
      goalText: "theorem t (n : Nat) : n = n",
      formal: true,
      config: { generationPerChannel: 2, namespaceCap: 2, operatorCap: 2, localCap: 2, unionCap: 3 },
    })
    const names = generated.map((item) => item.declaration.name)
    expect(new Set(names).size).toBe(names.length)
    expect(generated.length).toBeLessThanOrEqual(3)
  })

  test("formal signals outrank prose", () => {
    const result = retrieveFromDeclarations(decls, {
      query: "natural identity story",
      goal: "theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B",
      maxPremises: 5,
    }, "t")
    expect(result.candidates[0]?.declaration.name).toBe("Finset.card_union_le")
    expect(result.mode).toBe("FORMAL_GOAL")
  })

  test("diagnostic channel", () => {
    const index = buildChannelIndex(decls)
    const generated = generateCandidates(decls, index, {
      goalText: "goal",
      unknownIdentifiers: ["Finset.card_union_le"],
    })
    expect(generated.some((item) => item.evidence.channels.includes("DIAGNOSTIC"))).toBe(true)
  })

  test("local verified included; STALE and DISPROVED excluded", () => {
    const index = buildChannelIndex(decls)
    const generated = generateCandidates(decls, index, { goalText: "True", allowedLocalStatuses: ["KERNEL_VERIFIED"] })
    const names = generated.map((item) => item.declaration.name)
    expect(names).toContain("mathos_ok")
    expect(names).not.toContain("mathos_stale")
    expect(names).not.toContain("mathos_bad")
  })

  test("index format version is 3", () => {
    expect(INDEX_FORMAT_VERSION).toBe(3)
  })
})
