export const RESEARCH_BENCHMARK_DOMAINS = [
  "ALGEBRA",
  "NUMBER_THEORY",
  "ORDER",
  "SETS",
  "FUNCTIONS",
  "LOGIC",
  "COMBINATORICS",
  "BASIC_ANALYSIS",
  "SEQUENCES",
  "RELATIONS",
] as const
export type ResearchBenchmarkDomain = (typeof RESEARCH_BENCHMARK_DOMAINS)[number]

export const RESEARCH_BENCHMARK_DIFFICULTIES = [
  "TIER_1_DIRECT",
  "TIER_2_RETRIEVAL",
  "TIER_3_DECOMPOSITION",
  "TIER_4_RESEARCH",
] as const
export type ResearchBenchmarkDifficulty = (typeof RESEARCH_BENCHMARK_DIFFICULTIES)[number]

export const RESEARCH_BENCHMARK_CAPABILITIES = [
  "FORMALIZATION",
  "RETRIEVAL",
  "DECOMPOSITION",
  "COMPUTATION",
  "LITERATURE",
  "MULTI_AGENT",
] as const
export type BenchmarkCapability = (typeof RESEARCH_BENCHMARK_CAPABILITIES)[number]

export interface ResearchBenchmarkFixture {
  id: string
  domain: ResearchBenchmarkDomain
  difficulty: ResearchBenchmarkDifficulty
  naturalLanguageObjective: string
  referenceFormalStatement: string
  declarationName: string
  expectedProperties: {
    trueTheorem: boolean
    fidelitySensitive?: boolean
    temptingWrongFormalization?: string
  }
  allowedCapabilities: BenchmarkCapability[]
  forbiddenShortcuts?: string[]
  tags: string[]
}

function F(
  id: string,
  domain: ResearchBenchmarkDomain,
  difficulty: ResearchBenchmarkDifficulty,
  nl: string,
  stmt: string,
  caps: BenchmarkCapability[],
  tags: string[],
  extra: ResearchBenchmarkFixture["expectedProperties"] = { trueTheorem: true },
): ResearchBenchmarkFixture {
  const declarationName = stmt.split(" ")[1] ?? id.toLowerCase().replaceAll("-", "_")
  return {
    id,
    domain,
    difficulty,
    naturalLanguageObjective: nl,
    referenceFormalStatement: stmt,
    declarationName,
    expectedProperties: extra,
    allowedCapabilities: caps,
    tags,
  }
}

export const RESEARCH_BENCHMARK_FIXTURES: ResearchBenchmarkFixture[] = [
  F("RB-ALG-001", "ALGEBRA", "TIER_1_DIRECT", "Show that one plus one equals two.", "theorem rb_alg_001 : 1 + 1 = 2", ["FORMALIZATION"], ["algebra", "equality"]),
  F("RB-LOG-001", "LOGIC", "TIER_1_DIRECT", "Establish a trivially true proposition.", "theorem rb_log_001 : True", ["FORMALIZATION"], ["logic"]),
  F("RB-LOG-002", "LOGIC", "TIER_1_DIRECT", "A true hypothesis implies a true conclusion.", "theorem rb_log_002 : True → True", ["FORMALIZATION"], ["logic", "implication"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_log_002 : False → True" }),
  F("RB-NUM-001", "NUMBER_THEORY", "TIER_1_DIRECT", "Every natural number equals itself.", "theorem rb_num_001 (n : Nat) : n = n", ["FORMALIZATION"], ["identity"]),
  F("RB-LOG-003", "LOGIC", "TIER_1_DIRECT", "From a contradiction any claim follows.", "theorem rb_log_003 (P : Prop) : False → P", ["FORMALIZATION"], ["logic", "ex-falso"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_log_003 (P : Prop) : P → False" }),
  F("RB-SET-001", "SETS", "TIER_1_DIRECT", "Every collection is contained in itself.", "theorem rb_set_001 {α : Type*} (s : Set α) : s ⊆ s", ["FORMALIZATION"], ["sets"]),
  F("RB-ORD-001", "ORDER", "TIER_1_DIRECT", "A natural number is at most itself.", "theorem rb_ord_001 (n : Nat) : n ≤ n", ["FORMALIZATION"], ["order"]),
  F("RB-COM-001", "COMBINATORICS", "TIER_1_DIRECT", "The empty list of naturals has length zero.", "theorem rb_com_001 : ([] : List Nat).length = 0", ["FORMALIZATION"], ["lists"]),
  F("RB-FUN-001", "FUNCTIONS", "TIER_1_DIRECT", "Applying the identity map does nothing.", "theorem rb_fun_001 {α : Type*} (a : α) : (fun x => x) a = a", ["FORMALIZATION"], ["functions"]),
  F("RB-REL-001", "RELATIONS", "TIER_1_DIRECT", "The conjunction of two truths is still true.", "theorem rb_rel_001 : True ∧ True → True", ["FORMALIZATION"], ["logic"]),

  F("RB-ALG-002", "ALGEBRA", "TIER_2_RETRIEVAL", "Adding zero on the right leaves a natural unchanged.", "theorem rb_alg_002 (n : Nat) : n + 0 = n", ["FORMALIZATION", "RETRIEVAL"], ["nat", "add"]),
  F("RB-ALG-003", "ALGEBRA", "TIER_2_RETRIEVAL", "Adding zero on the left leaves a natural unchanged.", "theorem rb_alg_003 (n : Nat) : 0 + n = n", ["FORMALIZATION", "RETRIEVAL"], ["nat", "add"]),
  F("RB-ALG-004", "ALGEBRA", "TIER_2_RETRIEVAL", "Multiplying a natural by one leaves it unchanged.", "theorem rb_alg_004 (n : Nat) : n * 1 = n", ["FORMALIZATION", "RETRIEVAL"], ["nat", "mul"]),
  F("RB-REL-002", "RELATIONS", "TIER_2_RETRIEVAL", "Equality of naturals is symmetric.", "theorem rb_rel_002 (a b : Nat) (h : a = b) : b = a", ["FORMALIZATION", "RETRIEVAL"], ["equality"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_rel_002 (a b : Nat) (h : a = b) : a ≠ b" }),
  F("RB-LOG-004", "LOGIC", "TIER_2_RETRIEVAL", "Conjunction of propositions may be swapped.", "theorem rb_log_004 (P Q : Prop) : P ∧ Q → Q ∧ P", ["FORMALIZATION", "RETRIEVAL"], ["logic"]),
  F("RB-SET-002", "SETS", "TIER_2_RETRIEVAL", "Union of two collections does not depend on order.", "theorem rb_set_002 {α : Type*} (s t : Set α) : s ∪ t = t ∪ s", ["FORMALIZATION", "RETRIEVAL"], ["sets"]),
  F("RB-ORD-002", "ORDER", "TIER_2_RETRIEVAL", "A natural is strictly smaller than its successor.", "theorem rb_ord_002 (n : Nat) : n < n + 1", ["FORMALIZATION", "RETRIEVAL"], ["order"]),
  F("RB-LOG-005", "LOGIC", "TIER_2_RETRIEVAL", "Falsehood is not the case.", "theorem rb_log_005 : ¬False", ["FORMALIZATION", "RETRIEVAL"], ["logic"]),
  F("RB-FUN-002", "FUNCTIONS", "TIER_2_RETRIEVAL", "Composition applies the inner map first.", "theorem rb_fun_002 {α β γ : Type*} (f : β → γ) (g : α → β) (x : α) : (f ∘ g) x = f (g x)", ["FORMALIZATION", "RETRIEVAL"], ["functions"]),
  F("RB-REL-003", "RELATIONS", "TIER_2_RETRIEVAL", "Equality of naturals is transitive.", "theorem rb_rel_003 (a b c : Nat) (h₁ : a = b) (h₂ : b = c) : a = c", ["FORMALIZATION", "RETRIEVAL"], ["equality"]),
  F("RB-COM-002", "COMBINATORICS", "TIER_2_RETRIEVAL", "Length of a concatenation is the sum of lengths.", "theorem rb_com_002 (l m : List Nat) : (l ++ m).length = l.length + m.length", ["FORMALIZATION", "RETRIEVAL"], ["lists"]),
  F("RB-ALG-005", "ALGEBRA", "TIER_2_RETRIEVAL", "Addition of naturals does not depend on order.", "theorem rb_alg_005 (n m : Nat) : n + m = m + n", ["FORMALIZATION", "RETRIEVAL"], ["nat", "comm"]),

  F("RB-REL-004", "RELATIONS", "TIER_3_DECOMPOSITION", "If a equals b and b equals c then a equals c, via an intermediate fact.", "theorem rb_rel_004 (a b c : Nat) (h : a = b ∧ b = c) : a = c", ["FORMALIZATION", "DECOMPOSITION"], ["equality", "and"]),
  F("RB-SET-003", "SETS", "TIER_3_DECOMPOSITION", "Containment of collections is transitive.", "theorem rb_set_003 {α : Type*} (s t u : Set α) (h : s ⊆ t ∧ t ⊆ u) : s ⊆ u", ["FORMALIZATION", "DECOMPOSITION"], ["sets"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_set_003 {α : Type*} (s t u : Set α) (h : s ⊆ t ∧ t ⊆ u) : u ⊆ s" }),
  F("RB-LOG-006", "LOGIC", "TIER_3_DECOMPOSITION", "Implications may be chained.", "theorem rb_log_006 (P Q R : Prop) : (P → Q) → (Q → R) → P → R", ["FORMALIZATION", "DECOMPOSITION"], ["logic"]),
  F("RB-ALG-006", "ALGEBRA", "TIER_3_DECOMPOSITION", "Addition of naturals is associative.", "theorem rb_alg_006 (n m k : Nat) : n + m + k = n + (m + k)", ["FORMALIZATION", "DECOMPOSITION", "RETRIEVAL"], ["nat"]),
  F("RB-SET-004", "SETS", "TIER_3_DECOMPOSITION", "The intersection of two collections sits inside the first.", "theorem rb_set_004 {α : Type*} (s t : Set α) : s ∩ t ⊆ s", ["FORMALIZATION", "DECOMPOSITION"], ["sets"]),
  F("RB-NUM-002", "NUMBER_THEORY", "TIER_3_DECOMPOSITION", "One is at most the successor of any natural.", "theorem rb_num_002 (n : Nat) : 1 ≤ n + 1", ["FORMALIZATION", "DECOMPOSITION"], ["order"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_num_002 (n : Nat) : n + 1 ≤ 1" }),
  F("RB-FUN-003", "FUNCTIONS", "TIER_3_DECOMPOSITION", "Composing with the identity on the left does nothing.", "theorem rb_fun_003 {α β : Type*} (f : α → β) : (fun x => x) ∘ f = f", ["FORMALIZATION", "DECOMPOSITION"], ["functions"]),
  F("RB-ORD-003", "ORDER", "TIER_3_DECOMPOSITION", "The order on naturals is transitive.", "theorem rb_ord_003 (a b c : Nat) (h : a ≤ b ∧ b ≤ c) : a ≤ c", ["FORMALIZATION", "DECOMPOSITION"], ["order"]),
  F("RB-LOG-007", "LOGIC", "TIER_3_DECOMPOSITION", "A double negation of a trivial truth still holds.", "theorem rb_log_007 : ¬¬True", ["FORMALIZATION", "DECOMPOSITION"], ["logic"]),
  F("RB-SEQ-001", "SEQUENCES", "TIER_3_DECOMPOSITION", "A singleton list built from zero has length one.", "theorem rb_seq_001 : ([0] : List Nat).length = 1", ["FORMALIZATION", "DECOMPOSITION"], ["lists", "sequences"]),

  F("RB-LOG-008", "LOGIC", "TIER_4_RESEARCH", "Recover a trivial truth after an unsuccessful proof attempt.", "theorem rb_log_008 : True", ["FORMALIZATION"], ["recovery"]),
  F("RB-ALG-007", "ALGEBRA", "TIER_4_RESEARCH", "Twice a natural is that natural added to itself.", "theorem rb_alg_007 (n : Nat) : n + n = 2 * n", ["FORMALIZATION", "RETRIEVAL", "DECOMPOSITION"], ["nat"]),
  F("RB-NUM-003", "NUMBER_THEORY", "TIER_4_RESEARCH", "A square of a natural is nonnegative; a finite check may precede a proof.", "theorem rb_num_003 (n : Nat) : 0 ≤ n * n", ["FORMALIZATION", "COMPUTATION"], ["nat", "computation"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_num_003 (n : Int) : 0 ≤ n" }),
  F("RB-ALG-008", "ALGEBRA", "TIER_4_RESEARCH", "Successor is injective on naturals.", "theorem rb_alg_008 (a b : Nat) (h : a + 1 = b + 1) : a = b", ["FORMALIZATION", "RETRIEVAL"], ["nat"]),
  F("RB-LIT-001", "LOGIC", "TIER_4_RESEARCH", "A classical identity may be known from sources, yet still needs a formal proof.", "theorem rb_lit_001 (n : Nat) : n = n", ["FORMALIZATION", "LITERATURE"], ["literature"]),
  F("RB-LOG-009", "LOGIC", "TIER_4_RESEARCH", "Repeating a proposition with or does not change it.", "theorem rb_log_009 (P : Prop) : (P ∨ P) ↔ P", ["FORMALIZATION", "DECOMPOSITION"], ["logic"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_log_009 (P : Prop) : (P ∨ P) ↔ ¬P" }),
  F("RB-ANA-001", "BASIC_ANALYSIS", "TIER_4_RESEARCH", "Zero is a lower bound for every natural.", "theorem rb_ana_001 (n : Nat) : 0 ≤ n", ["FORMALIZATION", "RETRIEVAL"], ["analysis", "bound"], { trueTheorem: true, fidelitySensitive: true, temptingWrongFormalization: "theorem rb_ana_001 (n : Int) : 0 ≤ n" }),
  F("RB-COM-003", "COMBINATORICS", "TIER_4_RESEARCH", "Appending the empty list does not change a list of naturals.", "theorem rb_com_003 (l : List Nat) : l ++ [] = l", ["FORMALIZATION", "RETRIEVAL", "COMPUTATION"], ["lists"]),
]

export const RESEARCH_BENCHMARK_TEAM_SUBSET = [
  "RB-ALG-002",
  "RB-REL-002",
  "RB-SET-002",
  "RB-ALG-005",
  "RB-REL-004",
  "RB-SET-003",
  "RB-LOG-006",
  "RB-ALG-007",
  "RB-NUM-003",
  "RB-LOG-009",
] as const

export const TIER_BUDGETS = {
  TIER_1_DIRECT: { maxSteps: 8, maxProofAttempts: 4, maxModelCalls: 6, maxLeanCalls: 6 },
  TIER_2_RETRIEVAL: { maxSteps: 14, maxProofAttempts: 6, maxModelCalls: 10, maxLeanCalls: 10 },
  TIER_3_DECOMPOSITION: { maxSteps: 22, maxProofAttempts: 8, maxModelCalls: 16, maxLeanCalls: 14 },
  TIER_4_RESEARCH: { maxSteps: 35, maxProofAttempts: 10, maxModelCalls: 24, maxLeanCalls: 20 },
} as const

export const TEAM_BUDGET = {
  maxAgents: 3,
  maxRounds: 8,
  maxSteps: 24,
  maxModelCalls: 30,
  maxLeanCalls: 20,
  maxProofAttempts: 12,
} as const
