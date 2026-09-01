import type { LeanDeclaration, PremiseRetrievalRequest } from "./types.ts"
import { rankDeclarations } from "./rank.ts"
import { retrieveFromDeclarations } from "./pipeline.ts"
import type { PremiseCandidate } from "./types.ts"
import { buildChannelIndex, generateCandidates, type ChannelIndex } from "./channels.ts"
import { profileGoal } from "./profile.ts"

export interface BenchmarkCase {
  id: string
  goal: string
  expected: string[]
}

export interface RankMetrics {
  hit1: number
  hit5: number
  hit10: number
  mrr: number
}

export interface StageRecall {
  union: number
  top200: number
  inspect30: number
  final20: number
}

export function hitAtK(ranked: string[], expected: string[], k: number): number {
  const top = new Set(ranked.slice(0, k).map((name) => name.toLowerCase()))
  return expected.some((name) => top.has(name.toLowerCase())) ? 1 : 0
}

export function reciprocalRank(ranked: string[], expected: string[]): number {
  const want = new Set(expected.map((name) => name.toLowerCase()))
  const index = ranked.findIndex((name) => want.has(name.toLowerCase()))
  return index === -1 ? 0 : 1 / (index + 1)
}

export function metricsFor(rankedLists: string[][], cases: BenchmarkCase[]): RankMetrics {
  const n = cases.length || 1
  let hit1 = 0
  let hit5 = 0
  let hit10 = 0
  let mrr = 0
  rankedLists.forEach((ranked, i) => {
    hit1 += hitAtK(ranked, cases[i]!.expected, 1)
    hit5 += hitAtK(ranked, cases[i]!.expected, 5)
    hit10 += hitAtK(ranked, cases[i]!.expected, 10)
    mrr += reciprocalRank(ranked, cases[i]!.expected)
  })
  return { hit1: hit1 / n, hit5: hit5 / n, hit10: hit10 / n, mrr: mrr / n }
}

export function compareRankers(declarations: LeanDeclaration[], cases: BenchmarkCase[]) {
  const lexical: string[][] = []
  const goalAware: string[][] = []
  for (const item of cases) {
    const request: PremiseRetrievalRequest = { query: item.goal, goal: item.goal, maxPremises: 20, candidatePool: 80, skipInspect: true }
    lexical.push(rankDeclarations(declarations, request).map((entry) => entry.declaration.name))
    goalAware.push(retrieveFromDeclarations(declarations, request, "bench").candidates.map((entry) => entry.declaration.name))
  }
  return {
    cases: cases.length,
    baseline: metricsFor(lexical, cases),
    goalAware: metricsFor(goalAware, cases),
  }
}

export function namesOf(candidates: PremiseCandidate[]): string[] {
  return candidates.map((item) => item.declaration.name)
}

export function goldFound(names: string[], expected: string[]): { found: boolean; rank: number | null } {
  const want = new Set(expected.map((item) => item.toLowerCase()))
  const index = names.findIndex((name) => want.has(name.toLowerCase()))
  return { found: index >= 0, rank: index >= 0 ? index + 1 : null }
}

export function diagnoseFixtures(declarations: LeanDeclaration[], cases: BenchmarkCase[], channels?: ChannelIndex) {
  const index = channels ?? buildChannelIndex(declarations)
  return cases.map((item) => {
    const goal = profileGoal(item.goal)
    const generated = generateCandidates(declarations, index, { goalText: item.goal, goal, formal: true })
    const unionNames = generated.map((entry) => entry.declaration.name)
    const result = retrieveFromDeclarations(declarations, { query: item.goal, goal: item.goal, maxPremises: 20, candidatePool: 200 }, "diag", index)
    const pool = result.candidates.map((entry) => entry.declaration.name)
    const gold = goldFound(unionNames, item.expected)
    const inPool = goldFound(pool, item.expected)
    const channelsHit = generated
      .filter((entry) => item.expected.some((name) => name.toLowerCase() === entry.declaration.name.toLowerCase()))
      .flatMap((entry) => entry.evidence.channels)
    return {
      id: item.id,
      expected: item.expected,
      union: gold,
      top200: inPool,
      inspect30: goldFound(pool.slice(0, 30), item.expected),
      final20: goldFound(pool.slice(0, 20), item.expected),
      channels: [...new Set(channelsHit)],
      unionSize: generated.length,
    }
  })
}

export function stageRecall(rows: ReturnType<typeof diagnoseFixtures>): StageRecall {
  const n = rows.length || 1
  return {
    union: rows.filter((row) => row.union.found).length / n,
    top200: rows.filter((row) => row.top200.found).length / n,
    inspect30: rows.filter((row) => row.inspect30.found).length / n,
    final20: rows.filter((row) => row.final20.found).length / n,
  }
}

export const MATHLIB_FIXTURES: BenchmarkCase[] = [
  { id: "eq", goal: "theorem t (n : Nat) : n = n", expected: ["Eq.refl", "rfl"] },
  { id: "card", goal: "theorem t (A B : Finset α) : #(A ∪ B) ≤ #A + #B", expected: ["Finset.card_union_le"] },
  { id: "subset", goal: "theorem t (s : Finset α) : s ⊆ s", expected: ["Finset.Subset.refl", "Set.Subset.refl", "Subset.refl"] },
  { id: "add_le", goal: "theorem t (a b c d : Nat) : a ≤ b → c ≤ d → a + c ≤ b + d", expected: ["Nat.add_le_add", "add_le_add"] },
  { id: "list_append", goal: "theorem t (l : List α) : l ++ [] = l", expected: ["List.append_nil", "List.concat_nil"] },
  { id: "comp", goal: "theorem t (f : β → γ) (g : α → β) (x : α) : (f ∘ g) x = f (g x)", expected: ["Function.comp_apply"] },
  { id: "imp", goal: "theorem t (p q : Prop) : p → q → p", expected: ["imp_intro", "True.intro"] },
  { id: "iff", goal: "theorem t (p q : Prop) : (p ↔ q) → (q ↔ p)", expected: ["Iff.symm"] },
  { id: "exists", goal: "theorem t (n : Nat) : ∃ m, n ≤ m", expected: ["Exists.intro"] },
  { id: "mul_comm", goal: "theorem t (a b : Nat) : a * b = b * a", expected: ["Nat.mul_comm", "mul_comm"] },
  { id: "mem_union", goal: "theorem t (a : α) (s t : Finset α) : a ∈ s ∪ t ↔ a ∈ s ∨ a ∈ t", expected: ["Finset.mem_union"] },
  { id: "list_length", goal: "theorem t (l₁ l₂ : List α) : (l₁ ++ l₂).length = l₁.length + l₂.length", expected: ["List.length_append"] },
  { id: "set_subset_union", goal: "theorem t (s t : Set α) : s ⊆ s ∪ t", expected: ["Set.subset_union_left"] },
  { id: "nat_succ_le", goal: "theorem t (n m : Nat) : n ≤ m → Nat.succ n ≤ Nat.succ m", expected: ["Nat.succ_le_succ"] },
  { id: "comp_id", goal: "theorem t (f : α → β) : f ∘ id = f", expected: ["Function.comp_id"] },
  { id: "option_get", goal: "theorem t (x y : α) : Option.getD (some x) y = x", expected: ["Option.getD_some"] },
  { id: "and_true", goal: "theorem t (p : Prop) : (p ∧ True) ↔ p", expected: ["and_true"] },
  { id: "int_neg", goal: "theorem t (a : Int) : - -a = a", expected: ["Int.neg_neg"] },
  { id: "list_mem_cons", goal: "theorem t (a : α) (l : List α) : a ∈ a :: l", expected: ["List.mem_cons_self"] },
  { id: "finset_card_empty", goal: "theorem t : Finset.card (∅ : Finset α) = 0", expected: ["Finset.card_empty"] },
]
