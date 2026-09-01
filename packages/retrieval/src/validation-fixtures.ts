export interface RetrievalValidationFixture {
  id: string
  goal: string
  expectedAnyOf: string[]
  domain: string
}

export const RETRIEVAL_VALIDATION_METADATA = {
  datasetVersion: "retrieval-validation-v1",
  createdAt: "2026-08-24",
  leanVersion: "v4.33.1",
  mathlibVersion: "v4.33.1",
  frozen: true,
} as const

export const RETRIEVAL_VALIDATION_FIXTURES: RetrievalValidationFixture[] = [
  { id: "eq_symm", goal: "theorem validation {α : Sort u} {a b : α} (h : a = b) : b = a", expectedAnyOf: ["Eq.symm"], domain: "Eq/logical" },
  { id: "eq_trans", goal: "theorem validation {α : Sort u} {a b c : α} (h₁ : a = b) (h₂ : b = c) : a = c", expectedAnyOf: ["Eq.trans"], domain: "Eq/logical" },
  { id: "eq_comm", goal: "theorem validation {α : Sort u} {a b : α} : a = b ↔ b = a", expectedAnyOf: ["Eq.comm"], domain: "Eq/logical" },
  { id: "eq_to_iff", goal: "theorem validation {a b : Prop} : a = b → (a ↔ b)", expectedAnyOf: ["Eq.to_iff"], domain: "Eq/logical" },
  { id: "eq_mpr_not", goal: "theorem validation {p q : Prop} (h₁ : p = q) (h₂ : ¬q) : ¬p", expectedAnyOf: ["Eq.mpr_not"], domain: "Eq/logical" },

  { id: "nat_zero_add", goal: "theorem validation (n : Nat) : 0 + n = n", expectedAnyOf: ["Nat.zero_add"], domain: "Nat/Int" },
  { id: "nat_add_assoc", goal: "theorem validation (n m k : Nat) : n + m + k = n + (m + k)", expectedAnyOf: ["Nat.add_assoc"], domain: "Nat/Int" },
  { id: "nat_succ_inj", goal: "theorem validation {m n : Nat} : m.succ = n.succ → m = n", expectedAnyOf: ["Nat.succ.inj"], domain: "Nat/Int" },
  { id: "int_shift_right_zero", goal: "theorem validation (n : Int) : n >>> 0 = n", expectedAnyOf: ["Int.shiftRight_zero"], domain: "Nat/Int" },
  { id: "int_zero_shift_right", goal: "theorem validation (n : Nat) : (0 : Int) >>> n = 0", expectedAnyOf: ["Int.zero_shiftRight"], domain: "Nat/Int" },

  { id: "finset_disjoint_union_left", goal: "theorem validation (s t u : Finset α) : Disjoint (s ∪ t) u ↔ Disjoint s u ∧ Disjoint t u", expectedAnyOf: ["Finset.disjoint_union_left"], domain: "Finset" },
  { id: "finset_erase_insert", goal: "theorem validation {a : α} {s : Finset α} (h : a ∉ s) : (insert a s).erase a = s", expectedAnyOf: ["Finset.erase_insert"], domain: "Finset" },
  { id: "finset_subset_insert_iff", goal: "theorem validation {a : α} {s t : Finset α} : s ⊆ insert a t ↔ s.erase a ⊆ t", expectedAnyOf: ["Finset.subset_insert_iff"], domain: "Finset" },
  { id: "finset_card_singleton", goal: "theorem validation (a : α) : Finset.card {a} = 1", expectedAnyOf: ["Finset.card_singleton"], domain: "Finset" },
  { id: "finset_mem_insert", goal: "theorem validation [DecidableEq α] (a b : α) (s : Finset α) : a ∈ insert b s ↔ a = b ∨ a ∈ s", expectedAnyOf: ["Finset.mem_insert"], domain: "Finset" },

  { id: "set_top_eq_univ", goal: "theorem validation : (⊤ : Set α) = Set.univ", expectedAnyOf: ["Set.top_eq_univ"], domain: "Set" },
  { id: "set_bot_eq_empty", goal: "theorem validation : (⊥ : Set α) = ∅", expectedAnyOf: ["Set.bot_eq_empty"], domain: "Set" },
  { id: "set_union_self", goal: "theorem validation (a : Set α) : a ∪ a = a", expectedAnyOf: ["Set.union_self"], domain: "Set" },
  { id: "set_inter_self", goal: "theorem validation (a : Set α) : a ∩ a = a", expectedAnyOf: ["Set.inter_self"], domain: "Set" },
  { id: "set_mem_union", goal: "theorem validation (x : α) (a b : Set α) : x ∈ a ∪ b ↔ x ∈ a ∨ x ∈ b", expectedAnyOf: ["Set.mem_union"], domain: "Set" },

  { id: "list_to_list_to_array", goal: "theorem validation (as : List α) : as.toArray.toList = as", expectedAnyOf: ["List.toList_toArray"], domain: "List" },
  { id: "list_to_array_eq", goal: "theorem validation {as bs : List α} : (as.toArray = bs.toArray) = (as = bs)", expectedAnyOf: ["List.toArray_eq_toArray_eq"], domain: "List" },
  { id: "list_perm_to_array", goal: "theorem validation {as bs : List α} : as.Perm bs ↔ as.toArray.Perm bs.toArray", expectedAnyOf: ["List.perm_iff_toArray_perm"], domain: "List" },
  { id: "list_to_list_rev", goal: "theorem validation {l : List α} : l.toArray.toListRev = l.reverse", expectedAnyOf: ["List.toListRev_toArray"], domain: "List" },
  { id: "list_byte_array_append", goal: "theorem validation {l l' : List UInt8} : (l ++ l').toByteArray = l.toByteArray ++ l'.toByteArray", expectedAnyOf: ["List.toByteArray_append'"], domain: "List" },

  { id: "function_curry_uncurry", goal: "theorem validation (f : α → β → φ) : Function.curry (Function.uncurry f) = f", expectedAnyOf: ["Function.curry_uncurry"], domain: "Function" },
  { id: "function_uncurry_curry", goal: "theorem validation (f : α × β → φ) : Function.uncurry (Function.curry f) = f", expectedAnyOf: ["Function.uncurry_curry"], domain: "Function" },
  { id: "function_comp_assoc", goal: "theorem validation (f : φ → δ) (g : β → φ) (h : α → β) : (f ∘ g) ∘ h = f ∘ g ∘ h", expectedAnyOf: ["Function.comp_assoc"], domain: "Function" },
  { id: "function_injective_id", goal: "theorem validation : Function.Injective (@id α)", expectedAnyOf: ["Function.injective_id"], domain: "Function" },
  { id: "function_surjective_id", goal: "theorem validation : Function.Surjective (@id α)", expectedAnyOf: ["Function.surjective_id"], domain: "Function" },

  { id: "option_to_array_to_list", goal: "theorem validation {o : Option α} : o.toList.toArray = o.toArray", expectedAnyOf: ["Option.toArray_toList"], domain: "Option" },
  { id: "option_to_list_to_array", goal: "theorem validation {o : Option α} : o.toArray.toList = o.toList", expectedAnyOf: ["Option.toList_toArray"], domain: "Option" },
  { id: "option_to_array_map", goal: "theorem validation {o : Option α} {f : α → β} : (o.map f).toArray = o.toArray.map f", expectedAnyOf: ["Option.toArray_map"], domain: "Option" },
  { id: "option_to_array_empty", goal: "theorem validation {o : Option α} : o.toArray = #[] ↔ o = none", expectedAnyOf: ["Option.toArray_eq_empty_iff"], domain: "Option" },
  { id: "option_some_injective", goal: "theorem validation : Function.Injective (@some α)", expectedAnyOf: ["Option.some_injective"], domain: "Option" },

  { id: "prod_eta", goal: "theorem validation (p : α × β) : (p.1, p.2) = p", expectedAnyOf: ["Prod.eta"], domain: "Prod/Sum" },
  { id: "prod_swap_swap", goal: "theorem validation (x : α × β) : Prod.swap (Prod.swap x) = x", expectedAnyOf: ["Prod.swap_swap"], domain: "Prod/Sum" },
  { id: "prod_swap_mk", goal: "theorem validation (a : α) (b : β) : Prod.swap (a, b) = (b, a)", expectedAnyOf: ["Prod.swap_prod_mk"], domain: "Prod/Sum" },
  { id: "sum_inl_ne_inr", goal: "theorem validation (a : α) (b : β) : Sum.inl a ≠ Sum.inr b", expectedAnyOf: ["Sum.inl_ne_inr"], domain: "Prod/Sum" },
  { id: "sum_inl_injective", goal: "theorem validation : Function.Injective (Sum.inl : α → α ⊕ β)", expectedAnyOf: ["Sum.inl_injective"], domain: "Prod/Sum" },

  { id: "algebra_int_mul_assoc", goal: "theorem validation (a b c : Int) : a * b * c = a * (b * c)", expectedAnyOf: ["Int.mul_assoc"], domain: "algebra" },
  { id: "algebra_nat_pow_two", goal: "theorem validation (a : Nat) : a ^ 2 = a * a", expectedAnyOf: ["Nat.pow_two"], domain: "algebra" },
  { id: "algebra_rat_add_zero", goal: "theorem validation (a : Rat) : a + 0 = a", expectedAnyOf: ["Rat.add_zero"], domain: "algebra" },
  { id: "algebra_rat_sub_self", goal: "theorem validation (a : Rat) : a - a = 0", expectedAnyOf: ["Rat.sub_self"], domain: "algebra" },
  { id: "algebra_rat_inv_inv", goal: "theorem validation (a : Rat) : a⁻¹⁻¹ = a", expectedAnyOf: ["Rat.inv_inv"], domain: "algebra" },

  { id: "order_nat_le_max_right", goal: "theorem validation (a b : Nat) : b ≤ max a b", expectedAnyOf: ["Nat.le_max_right"], domain: "order" },
  { id: "order_nat_min_le_left", goal: "theorem validation (a b : Nat) : min a b ≤ a", expectedAnyOf: ["Nat.min_le_left"], domain: "order" },
  { id: "order_nat_lt_irrefl", goal: "theorem validation (n : Nat) : ¬ n < n", expectedAnyOf: ["Nat.lt_irrefl"], domain: "order" },
  { id: "order_int_le_trans", goal: "theorem validation {a b c : Int} (h₁ : a ≤ b) (h₂ : b ≤ c) : a ≤ c", expectedAnyOf: ["Int.le_trans"], domain: "order" },
  { id: "order_rat_le_refl", goal: "theorem validation (a : Rat) : a ≤ a", expectedAnyOf: ["Rat.le_refl"], domain: "order" },

  { id: "relation_comp_eq", goal: "theorem validation (r : α → β → Prop) : r ∘r (· = ·) = r", expectedAnyOf: ["Relation.comp_eq"], domain: "relations" },
  { id: "relation_eq_comp", goal: "theorem validation (r : α → β → Prop) : (· = ·) ∘r r = r", expectedAnyOf: ["Relation.eq_comp"], domain: "relations" },
  { id: "relation_comp_assoc", goal: "theorem validation (r : γ → δ → Prop) (p : β → γ → Prop) (q : α → β → Prop) : (r ∘r p) ∘r q = r ∘r p ∘r q", expectedAnyOf: ["Relation.comp_assoc"], domain: "relations" },
  { id: "relation_flip_comp", goal: "theorem validation (r : β → γ → Prop) (p : α → β → Prop) : Relation.flip (r ∘r p) = Relation.flip p ∘r Relation.flip r", expectedAnyOf: ["Relation.flip_comp"], domain: "relations" },
  { id: "relation_transgen_trans", goal: "theorem validation {r : α → α → Prop} {a b c : α} : Relation.TransGen r a b → Relation.TransGen r b c → Relation.TransGen r a c", expectedAnyOf: ["Relation.TransGen.trans"], domain: "relations" },

  { id: "metric_path_connected_ball", goal: "theorem validation [NormedAddCommGroup E] {x : E} {r : ℝ} (hr : 0 < r) : IsPathConnected (Metric.ball x r)", expectedAnyOf: ["Metric.isPathConnected_ball"], domain: "topology/analysis" },
  { id: "metric_path_connected_closed_ball", goal: "theorem validation [NormedAddCommGroup E] {x : E} {r : ℝ} (hr : 0 ≤ r) : IsPathConnected (Metric.closedBall x r)", expectedAnyOf: ["Metric.isPathConnected_closedBall"], domain: "topology/analysis" },
  { id: "topology_separable_union", goal: "theorem validation [TopologicalSpace α] {s t : Set α} : IsSeparable (s ∪ t) ↔ IsSeparable s ∧ IsSeparable t", expectedAnyOf: ["TopologicalSpace.isSeparable_union"], domain: "topology/analysis" },
  { id: "topology_separable_closure", goal: "theorem validation [TopologicalSpace α] {s : Set α} : IsSeparable (closure s) ↔ IsSeparable s", expectedAnyOf: ["TopologicalSpace.isSeparable_closure"], domain: "topology/analysis" },
  { id: "metric_ball_preconnected", goal: "theorem validation [PseudoMetricSpace E] [NormedAddCommGroup E] {x : E} {r : ℝ} : IsPreconnected (Metric.ball x r)", expectedAnyOf: ["Metric.isPreconnected_ball"], domain: "topology/analysis" },
]
