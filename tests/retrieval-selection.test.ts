import { describe, expect, test } from "bun:test"
import {
  enrichForLean,
  fuseCandidateRanks,
  normalizeScores,
  profileGoal,
  StratifiedInspectSelector,
  type GoalProfile,
  type PremiseCandidate,
} from "@mathos/retrieval"

function candidate(name: string, score: number, options: {
  channels?: string[]
  signature?: string
  origin?: "workspace" | "mathlib"
  status?: string
  type?: number
  symbol?: number
  structure?: number
  dependency?: number
  channelRanks?: Record<string, number>
  matchedTokens?: string[]
} = {}): PremiseCandidate {
  return {
    declaration: {
      name,
      kind: "theorem",
      signature: options.signature ?? `theorem ${name} : True`,
      origin: options.origin ?? "mathlib",
      claimStatus: options.status,
    },
    score,
    reasons: [],
    breakdown: {
      lexical: score,
      symbol: options.symbol ?? 0,
      namespace: 0,
      typeOverlap: options.type ?? 0,
      conclusion: options.structure ?? 0,
      propositionShape: 0,
      localBoost: 0,
      dependencyBoost: options.dependency ?? 0,
      penalties: 0,
    },
    generation: { channels: options.channels ?? [], matchedTokens: options.matchedTokens ?? [], channelRanks: options.channelRanks ?? {} },
  }
}

function fill(primary: PremiseCandidate[]): PremiseCandidate[] {
  return [...Array.from({ length: 80 }, (_, i) => candidate(`Noise${i}.lemma`, 0.8 - i / 200)), ...primary]
}

describe("stratified inspection selection", () => {
  test("stratified quota fills exact limit", () => {
    const goal = profileGoal("theorem t (n : Nat) : n = n")
    expect(new StratifiedInspectSelector().select(fill([]), goal, 30).selected).toHaveLength(30)
  })

  test("duplicate candidates use one slot", () => {
    const goal = profileGoal("theorem t : True")
    const dup = candidate("A.same", 1)
    const selected = new StratifiedInspectSelector().select([dup, { ...dup }, ...fill([]).slice(0, 29)], goal, 30).selected
    expect(selected.filter((row) => row.candidate.declaration.name === "A.same")).toHaveLength(1)
    expect(selected).toHaveLength(30)
  })

  test("unused quota redistributes", () => {
    const goal = profileGoal("theorem t : True")
    const selected = new StratifiedInspectSelector().select(fill([]), goal, 30).selected
    expect(selected.filter((row) => row.selectionReason === "OVERALL").length).toBeGreaterThan(9)
  })

  test("informative multi-token name is protected", () => {
    const goal = profileGoal("theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B")
    const gold = candidate("Finset.card_union_le", 0.01, { channels: ["NAME"] })
    const selected = new StratifiedInspectSelector().select(fill([gold]), goal, 30).selected
    expect(selected.find((row) => row.candidate.declaration.name === gold.declaration.name)?.selectionReason).toBe("NAME")
  })

  test("single generic token is not name-protected", () => {
    const goal = profileGoal("theorem t (n : Nat) : n = n")
    const generic = candidate("Other.refl", 0.01, { channels: ["NAME"] })
    const selected = new StratifiedInspectSelector().select(fill([generic]), goal, 10).selected
    expect(selected.find((row) => row.candidate.declaration.name === "Other.refl")?.selectionReason).not.toBe("NAME")
  })

  test("repeated operator multiplicity is preserved", () => {
    const goal = profileGoal("theorem t (x : Int) : - -x = x")
    expect(goal.operatorMultiplicity?.neg).toBe(2)
  })

  test("existential structure selects Exists namespace", () => {
    const goal = profileGoal("theorem t (n : Nat) : ∃ m, n ≤ m")
    const gold = candidate("Exists.intro", 0.01)
    const selected = new StratifiedInspectSelector().select(fill([gold]), goal, 30).selected
    expect(selected.find((row) => row.candidate.declaration.name === "Exists.intro")?.selectionReason).toBe("STRUCTURE")
  })

  test("Iff structure selects symmetry-like declaration", () => {
    const goal = profileGoal("theorem t (p q : Prop) : (p ↔ q) → (q ↔ p)")
    const gold = candidate("Iff.symm", 0.01)
    const selected = new StratifiedInspectSelector().select(fill([gold]), goal, 30).selected
    expect(selected.find((row) => row.candidate.declaration.name === "Iff.symm")?.selectionReason).toBe("STRUCTURE")
  })

  test("subset plus refl combination is structural", () => {
    const goal = profileGoal("theorem t (s : Finset α) : s ⊆ s")
    const gold = candidate("Finset.Subset.refl", 0.01)
    const selected = new StratifiedInspectSelector().select(fill([gold]), goal, 30).selected
    expect(selected.some((row) => row.candidate.declaration.name === "Finset.Subset.refl")).toBe(true)
  })

  test("local and dependency reservations", () => {
    const goal = profileGoal("theorem t : True")
    const local = candidate("Mathos.local", 0.01, { origin: "workspace", status: "KERNEL_VERIFIED" })
    const dep = candidate("Mathos.dep", 0.02, { dependency: 0.2, channels: ["DEPENDENCY"] })
    const selected = new StratifiedInspectSelector().select(fill([local, dep]), goal, 30).selected
    expect(selected.some((row) => row.candidate.declaration.name === "Mathos.local" && row.selectionReason === "LOCAL")).toBe(true)
    expect(selected.some((row) => row.candidate.declaration.name === "Mathos.dep" && row.selectionReason === "DEPENDENCY")).toBe(true)
  })

  test("every selected candidate has a selection reason", () => {
    const goal = profileGoal("theorem t : True")
    expect(new StratifiedInspectSelector().select(fill([]), goal, 30).selected.every((row) => Boolean(row.selectionReason))).toBe(true)
  })
})

describe("stratified-v2 quota pressure", () => {
  const goal = profileGoal("theorem t (a b : Nat) : a + b = b + a")

  test("soft quota minimum", () => {
    const rows = Array.from({ length: 12 }, (_, i) => candidate(`Nat.add_comm_${i}`, 0.2, { channels: ["NAME"], channelRanks: { NAME: i + 1 }, matchedTokens: ["add", "comm"] }))
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS").select(fill(rows), goal, 30)
    expect(result.quotaTrace.find((row) => row.channel === "NAME")?.selected).toBe(4)
  })

  test("soft quota overflow", () => {
    const rows = Array.from({ length: 12 }, (_, i) => candidate(`Nat.add_comm_${i}`, 0.2, { channels: ["NAME", "OPERATOR"], channelRanks: { NAME: i + 1, OPERATOR: i + 1 }, matchedTokens: ["add", "comm"] }))
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS").select(fill(rows), goal, 30)
    expect(result.selected.filter((row) => rows.some((item) => item.declaration.name === row.candidate.declaration.name)).length).toBeGreaterThan(4)
  })

  test("dynamic redistribution uses pressure outside fixed reservation", () => {
    const deep = candidate("Nat.add_assoc", 0.01, { channels: ["STRUCTURE", "OPERATOR"], channelRanks: { STRUCTURE: 1, OPERATOR: 1 }, matchedTokens: ["add", "assoc"] })
    const result = new StratifiedInspectSelector("DYNAMIC").select(fill([deep]), goal, 30)
    expect(result.selected.some((row) => row.candidate.declaration.name === "Nat.add_assoc")).toBe(true)
  })

  test("cross-channel consensus protects dominant candidate", () => {
    const dominant = candidate("Nat.add_comm", 0.01, { channels: ["NAME", "TYPE", "SYMBOL", "OPERATOR"], channelRanks: { NAME: 2, TYPE: 3, SYMBOL: 4, OPERATOR: 2 }, matchedTokens: ["add", "comm"] })
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS").select(fill([dominant]), goal, 30)
    expect(result.diagnostics["Nat.add_comm"]?.top10Consensus).toBeGreaterThanOrEqual(3)
    expect(result.selected.some((row) => row.candidate.declaration.name === "Nat.add_comm")).toBe(true)
  })

  test("formal channel authority exceeds equal name-only evidence", () => {
    const nameOnly = candidate("Other.add_comm", 0.01, { channels: ["NAME"], channelRanks: { NAME: 1 }, matchedTokens: ["add", "comm"] })
    const typed = candidate("Other.typed", 0.01, { channels: ["TYPE"], channelRanks: { TYPE: 1 }, type: 0.2 })
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS").select(fill([nameOnly, typed]), goal, 30)
    expect(result.diagnostics["Other.typed"]!.crossChannelStrength).toBeGreaterThan(result.diagnostics["Other.add_comm"]!.crossChannelStrength)
  })

  test("generic token has low information", () => {
    const generic = candidate("Other.refl", 0.01, { channels: ["NAME"], channelRanks: { NAME: 1 }, matchedTokens: ["refl"] })
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS").select(fill([generic]), goal, 30)
    expect(result.diagnostics["Other.refl"]!.informationScore).toBeLessThan(2)
  })

  test("multi-token combination has high information", () => {
    const combo = candidate("Function.comp_apply", 0.01, { channels: ["NAME", "OPERATOR"], channelRanks: { NAME: 2, OPERATOR: 2 }, matchedTokens: ["comp", "apply"] })
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS").select(fill([combo]), profileGoal("theorem t (f g x) : (f ∘ g) x = f (g x)"), 30)
    expect(result.diagnostics["Function.comp_apply"]!.informationScore).toBeGreaterThan(2)
  })

  test("redundancy control applies cluster penalty", () => {
    const cluster = Array.from({ length: 12 }, (_, i) => candidate(`Finset.foo_le_${i}`, 0.2, { channels: ["TYPE", "SYMBOL"], channelRanks: { TYPE: i + 1, SYMBOL: i + 1 }, signature: "theorem x (s : Finset Nat) : s.card ≤ s.card" }))
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select(fill(cluster), profileGoal("theorem t (s : Finset Nat) : s.card ≤ s.card"), 30)
    expect(cluster.some((item) => (result.diagnostics[item.declaration.name]?.redundancyPenalty ?? 0) > 0)).toBe(true)
  })

  test("namespace diversity is not over-aggressive", () => {
    const finset = Array.from({ length: 10 }, (_, i) => candidate(`Finset.card_rule_${i}`, 0.4, { channels: ["TYPE", "SYMBOL"], channelRanks: { TYPE: i + 1, SYMBOL: i + 1 }, matchedTokens: ["card", "finset"] }))
    const result = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select(fill(finset), profileGoal("theorem t (s : Finset Nat) : s.card = s.card"), 30)
    expect(result.selected.filter((row) => row.candidate.declaration.name.startsWith("Finset.")).length).toBeGreaterThan(2)
  })

  test("selection is deterministic and obeys hard limit", () => {
    const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY")
    const first = selector.select(fill([]), goal, 30).selected.map((row) => row.candidate.declaration.name)
    const second = selector.select(fill([]), goal, 30).selected.map((row) => row.candidate.declaration.name)
    expect(first).toEqual(second)
    expect(first).toHaveLength(30)
  })
})

describe("final rank fusion", () => {
  const goal = profileGoal("theorem t (n : Nat) : n = n")
  const stage1 = [candidate("Eq.refl", 1), candidate("Nat.Prime", 0.8)]

  test("unknown metadata is neutral", () => {
    const adjusted = enrichForLean(stage1, [{ name: "Eq.refl", exists: true, constants: [], typeConstructors: [], diagnostics: [], elaborated: false }], goal)
    expect(adjusted[0]?.score).toBe(stage1[0]?.score)
    expect(adjusted[0]?.reasons).not.toContain("strong mismatch")
  })

  test("real elaborated mismatch gets penalty", () => {
    const adjusted = enrichForLean(stage1, [{
      name: "Nat.Prime", exists: true, type: "def Nat.Prime (n : Nat) : Prop", constants: ["nat"], typeConstructors: ["nat"], conclusion: "Prop", propositionShape: {}, diagnostics: [], elaborated: true,
    }], goal)
    const prime = adjusted.find((item) => item.declaration.name === "Nat.Prime")!
    expect(prime.score).toBeLessThan(0.8)
    expect(prime.reasons).toContain("strong mismatch")
  })

  test("score normalization maps range", () => {
    const normalized = normalizeScores(stage1)
    expect(normalized.get("Eq.refl")).toBe(1)
    expect(normalized.get("Nat.Prime")).toBe(0)
  })

  test("normalized score fusion", () => {
    const adjusted = [candidate("Eq.refl", 0.9), candidate("Nat.Prime", 1.1)]
    const fused = fuseCandidateRanks(stage1, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 })
    expect(fused.method).toBe("SCORE_FUSION")
    expect(fused.candidates[0]?.fusionMethod).toBe("SCORE_FUSION")
  })

  test("reciprocal rank fusion", () => {
    const adjusted = [candidate("Nat.Prime", 1.1), candidate("Eq.refl", 0.9)]
    const fused = fuseCandidateRanks(stage1, adjusted, { method: "RRF", rrfK: 60 })
    expect(fused.candidates).toHaveLength(2)
    expect(fused.candidates.every((item) => item.score > 0)).toBe(true)
  })

  test("deterministic final ordering", () => {
    const tied = [candidate("B.same", 1), candidate("A.same", 1)]
    const first = fuseCandidateRanks(tied, tied, { method: "SCORE_FUSION" }).candidates.map((item) => item.declaration.name)
    const second = fuseCandidateRanks(tied, tied, { method: "SCORE_FUSION" }).candidates.map((item) => item.declaration.name)
    expect(first).toEqual(second)
  })
})
