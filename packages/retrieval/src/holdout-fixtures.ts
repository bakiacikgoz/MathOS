export interface RetrievalHoldoutFixture {
  id: string
  goal: string
  expectedAnyOf: string[]
  domain: string
}

export const RETRIEVAL_HOLDOUT_METADATA = {
  "datasetVersion": "retrieval-holdout-v1",
  "createdAt": "2026-08-24",
  "leanVersion": "v4.33.1",
  "mathlibVersion": "v4.33.1",
  "frozen": true,
  "selection": {
    "method": "deterministic domain-stratified SHA-256 ordering over indexed theorem/lemma declarations",
    "seed": "retrieval-holdout-v1",
    "featureSpecificationFrozenBeforeSelection": true,
    "weakDomainCount": 36
  }
} as const

export const RETRIEVAL_HOLDOUT_FIXTURES: RetrievalHoldoutFixture[] = [
  {
    "id": "holdout_algebra_01",
    "goal": "theorem holdout_algebra_01 : ∀ {S : Type u_1} {R : Type u_2} {A : Type u_3} [inst : CommSemiring R]\n  [inst_1 : NonUnitalNonAssocSemiring A] [inst_2 : Module R A] [inst_3 : SetLike S A]\n  [inst_4 : NonUnitalSubsemiringClass S A] [hSR : SMulMemClass S R A] (s : S),\n  Function.Injective ⇑(NonUnitalSubalgebraClass.subtype s)",
    "expectedAnyOf": [
      "NonUnitalSubalgebraClass.subtype_injective"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_02",
    "goal": "theorem holdout_algebra_02 : ∀ {R : Type u_1} [inst : AddCommMonoid R] {a b : Tropical (WithTop R)},\n  a * b = 0 ↔ a = 0 ∨ b = 0",
    "expectedAnyOf": [
      "Tropical.mul_eq_zero_iff"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_03",
    "goal": "theorem holdout_algebra_03 : ∀ {R : Type u_1} {A : Type u_2} {B : Type u_3} {C : Type u_4} [inst : Monoid R]\n  [inst_1 : NonUnitalNonAssocSemiring A] [inst_2 : DistribMulAction R A] [inst_3 : Star A]\n  [inst_4 : NonUnitalNonAssocSemiring B] [inst_5 : DistribMulAction R B] [inst_6 : Star B]\n  [inst_7 : NonUnitalNonAssocSemiring C] [inst_8 : DistribMulAction R C] [inst_9 : Star C] (f : A →⋆ₙₐ[R] B)\n  (g : A →⋆ₙₐ[R] C), (NonUnitalStarAlgHom.snd R B C).comp (f.prod g) = g",
    "expectedAnyOf": [
      "NonUnitalStarAlgHom.snd_prod"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_04",
    "goal": "theorem holdout_algebra_04 : ∀ {R : Type u_1} {A : Type u_2} {M : Type u_3} {N : Type u_4}\n  [inst : CommSemiring R] [inst_1 : Semiring A] [inst_2 : Algebra R A] [inst_3 : Monoid M] [inst_4 : Monoid N] (m : M)\n  (n : N) (a : A),\n  (MonoidAlgebra.curryAlgEquiv R) (MonoidAlgebra.single (m, n) a) = MonoidAlgebra.single m (MonoidAlgebra.single n a)",
    "expectedAnyOf": [
      "MonoidAlgebra.curryAlgEquiv_single"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_05",
    "goal": "theorem holdout_algebra_05 : ∀ {ι : Type u_3} {V : Type u_2} [inst : CategoryTheory.Category.{u_1, u_2} V]\n  [inst_1 : CategoryTheory.Preadditive V] {c : ComplexShape ι} {C D E : HomologicalComplex V c}\n  (hom : (i j : ι) → c.Rel j i → (C.X i ⟶ D.X j)) (g : D ⟶ E),\n  CategoryTheory.CategoryStruct.comp (Homotopy.nullHomotopicMap' hom) g =\n    Homotopy.nullHomotopicMap' fun i j hij => CategoryTheory.CategoryStruct.comp (hom i j hij) (g.f j)",
    "expectedAnyOf": [
      "Homotopy.nullHomotopicMap'_comp"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_06",
    "goal": "theorem holdout_algebra_06 : ∀ {R : Type u_1} {S : Type u_2} {M : Type u_3} [inst : Ring R] [inst_1 : Ring S] (f : R →+ S)\n  (x y : MonoidAlgebra R M), MonoidAlgebra.map f (x - y) = MonoidAlgebra.map f x - MonoidAlgebra.map f y",
    "expectedAnyOf": [
      "MonoidAlgebra.map_sub"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_07",
    "goal": "theorem holdout_algebra_07 : ∀ {ι : Type u_1} {β : ι → Type u_2} [inst : (i : ι) → AddCommMonoid (β i)]\n  [inst_1 : DecidableEq ι] {γ : Type u_3} [inst_2 : AddCommMonoid γ] (φ : (i : ι) → β i →+ γ) (i : ι) (x : β i),\n  (DirectSum.toAddMonoid φ) ((DirectSum.of β i) x) = (φ i) x",
    "expectedAnyOf": [
      "DirectSum.toAddMonoid_of"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_08",
    "goal": "theorem holdout_algebra_08 : ∀ {X Y : AlgebraicGeometry.Scheme} (f : X ⟶ Y)\n  [AlgebraicGeometry.Flat f] [AlgebraicGeometry.FormallyUnramified f] [AlgebraicGeometry.LocallyOfFinitePresentation f],\n  AlgebraicGeometry.Etale f",
    "expectedAnyOf": [
      "AlgebraicGeometry.Etale.of_formallyUnramified_of_flat"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_09",
    "goal": "theorem holdout_algebra_09 : ∀ {R : Type u_1} [inst : NonAssocSemiring R] (s : Subsemiring R) {x y : R},\n  x ∈ s → y ∈ s → x + y ∈ s",
    "expectedAnyOf": [
      "Subsemiring.add_mem"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_10",
    "goal": "theorem holdout_algebra_10 : ∀ {p q n : ℕ}\n  (x :\n    (CategoryTheory.MonoidalCategoryStruct.tensorObj (SSet.stdSimplex.obj { len := p })\n          (SSet.stdSimplex.obj { len := q })).obj\n      (Opposite.op { len := n }))\n  (i : Fin (n + 1)), ((SSet.prodStdSimplex.objEquiv x) i).1 = x.1 i",
    "expectedAnyOf": [
      "SSet.prodStdSimplex.objEquiv_apply_fst"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_11",
    "goal": "theorem holdout_algebra_11 : ∀ {R : Type u_1} {L : Type u_2} [inst : CommRing R] [inst_1 : LieRing L]\n  [inst_2 : LieAlgebra R L] {k l : ℕ} {I J : LieIdeal R L},\n  LieAlgebra.derivedSeries R (↥I) k = ⊥ →\n    LieAlgebra.derivedSeries R (↥J) l = ⊥ → LieAlgebra.derivedSeries R (↥(I + J)) (k + l) = ⊥",
    "expectedAnyOf": [
      "LieIdeal.derivedSeries_add_eq_bot"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_algebra_12",
    "goal": "theorem holdout_algebra_12 : ∀ {R : Type u_1} [inst : CommSemiring R] (t : Multiset (Polynomial R))\n  [Nontrivial R], (∀ f ∈ t, f.Monic) → t.prod.degree = (Multiset.map Polynomial.degree t).sum",
    "expectedAnyOf": [
      "Polynomial.degree_multiset_prod_of_monic"
    ],
    "domain": "Algebra"
  },
  {
    "id": "holdout_nat_01",
    "goal": "theorem holdout_nat_01 : ∀ {x y : ℕ}, 0 < y ∧ y ≤ x → x - y < x",
    "expectedAnyOf": [
      "Nat.div_rec_lemma"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_02",
    "goal": "theorem holdout_nat_02 : ∀ {n i : ℕ}, n < 2 ^ i → n.testBit i = false",
    "expectedAnyOf": [
      "Nat.testBit_eq_false_of_lt"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_03",
    "goal": "theorem holdout_nat_03 : ∀ {p n : ℕ}, Nat.Prime p → (p ^ n).factorization p = n",
    "expectedAnyOf": [
      "Nat.factorization_pow_self"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_04",
    "goal": "theorem holdout_nat_04 : ∀ (n : ℕ), n ≡ (Nat.digits 10 n).sum [MOD 9]",
    "expectedAnyOf": [
      "Nat.modEq_nine_digits_sum"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_05",
    "goal": "theorem holdout_nat_05 : ∀ {a b : ℕ} (c : ℕ), a ≤ b → a.choose c ≤ b.choose c",
    "expectedAnyOf": [
      "Nat.choose_le_choose"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_06",
    "goal": "theorem holdout_nat_06 : ∀ (n : ℕ), n < n.sqrt.succ * n.sqrt.succ",
    "expectedAnyOf": [
      "Nat.lt_succ_sqrt"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_07",
    "goal": "theorem holdout_nat_07 : HoldoutTypeCheck.lean:39:8: warning: `Nat.add_div_le_add_div` has been deprecated: Use `Nat.div_add_div_le_add_div` instead\nNat.add_div_le_add_div : ∀ (a b c : ℕ), a / c + b / c ≤ (a + b) / c",
    "expectedAnyOf": [
      "Nat.add_div_le_add_div"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_nat_08",
    "goal": "theorem holdout_nat_08 : ∀ {n p k : ℕ}, n ≠ 0 → (n.factorization = fun₀ | p => k) → n = p ^ k",
    "expectedAnyOf": [
      "Nat.eq_pow_of_factorization_eq_single"
    ],
    "domain": "Nat"
  },
  {
    "id": "holdout_int_01",
    "goal": "theorem holdout_int_01 : ∀ (n : ℕ), 0 <<< n = 0",
    "expectedAnyOf": [
      "Int.zero_shiftLeft"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_02",
    "goal": "theorem holdout_int_02 : ∀ {n m k : ℤ},\n  n.lcm m = n.natAbs * m.natAbs → (k * n).lcm m = n.natAbs * k.lcm m",
    "expectedAnyOf": [
      "Int.lcm_mul_left_left_eq_mul_of_lcm_eq_mul"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_03",
    "goal": "theorem holdout_int_03 : ∀ {m n : ℤ}, m.lcm n = m.natAbs * n.natAbs ↔ m = 0 ∨ n = 0 ∨ m.gcd n = 1",
    "expectedAnyOf": [
      "Int.lcm_eq_mul_iff"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_04",
    "goal": "theorem holdout_int_04 : ∀ {m n : ℤ}, Odd (m + n) ↔ (Odd n ↔ Even m)",
    "expectedAnyOf": [
      "Int.odd_add'"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_05",
    "goal": "theorem holdout_int_05 : ∀ {x y : ℤ} (n : ℕ),\n  4 ∣ x - y → ¬2 ∣ x → emultiplicity 2 (x ^ n - y ^ n) = emultiplicity 2 (x - y) + emultiplicity 2 ↑n",
    "expectedAnyOf": [
      "Int.two_pow_sub_pow'"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_06",
    "goal": "theorem holdout_int_06 : ∀ {a b c : ℤ}, a.fmod b = c → b ∣ c - a",
    "expectedAnyOf": [
      "Int.dvd_sub_self_of_fmod_eq"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_07",
    "goal": "theorem holdout_int_07 : ∀ (b : Bool) (n : ℤ), (Int.bit b n).testBit 0 = b",
    "expectedAnyOf": [
      "Int.testBit_bit_zero"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_int_08",
    "goal": "theorem holdout_int_08 : ∀ {a b c d : ℤ},\n  b < 0 → 0 < d → b ∣ a → d ∣ c → (a / b ≤ c / d ↔ c * b ≤ d * a)",
    "expectedAnyOf": [
      "Int.ediv_le_ediv_iff_of_dvd_of_neg_of_pos"
    ],
    "domain": "Int"
  },
  {
    "id": "holdout_relations_01",
    "goal": "theorem holdout_relations_01 : ∀ {α : Type u_1} {β : Type u_2} {r : β → β → Prop},\n  Equivalence r → ∀ (f : α → β), Equivalence (Function.onFun r f)",
    "expectedAnyOf": [
      "Equivalence.comap"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_02",
    "goal": "theorem holdout_relations_02 : ∀ {α : Type u_1} {r : α → α → Prop} {a a₁ a₂ : α},\n  r a₁ a → r a₂ a → Relation.CutExpand r {a₁, a₂} {a}",
    "expectedAnyOf": [
      "Relation.cutExpand_double"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_03",
    "goal": "theorem holdout_relations_03 : ∀ {α : Type u_1} {r : α → α → Prop} [Std.Refl r] {x y : α}, x ≠ y → r x y ↔ r x y",
    "expectedAnyOf": [
      "Std.Refl.ne_imp_iff"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_04",
    "goal": "theorem holdout_relations_04 : ∀ {α : Type u_1} {a b c : α} [inst : Preorder α],\n  AntisymmRel (fun x1 x2 => x1 ≤ x2) a b →\n    Relation.SymmGen (fun x1 x2 => x1 ≤ x2) b c → Relation.SymmGen (fun x1 x2 => x1 ≤ x2) a c",
    "expectedAnyOf": [
      "Relation.SymmGen.of_antisymmRel_of_symmGen"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_05",
    "goal": "theorem holdout_relations_05 : ∀ {α : Type u_1} {r : α → α → Prop} {a' a b : α},\n  r a' a → Relation.CutExpand r {a', b} {a, b}",
    "expectedAnyOf": [
      "Relation.cutExpand_pair_left"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_06",
    "goal": "theorem holdout_relations_06 : ∀ {α : Type u_1} {β : Type u_2} {γ : Type u_3} {r : α → β → Prop} (f : γ → α),\n  Relation.Comp (fun x1 x2 => f x1 = x2) r = fun x => r (f x)",
    "expectedAnyOf": [
      "Relation.fun_eq_comp"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_07",
    "goal": "theorem holdout_relations_07 : ∀ {α : Type u_1} {a b c : α} [inst : Preorder α],\n  Relation.SymmGen (fun x1 x2 => x1 ≤ x2) a b →\n    AntisymmRel (fun x1 x2 => x1 ≤ x2) b c → Relation.SymmGen (fun x1 x2 => x1 ≤ x2) a c",
    "expectedAnyOf": [
      "Relation.SymmGen.of_symmGen_of_antisymmRel"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_relations_08",
    "goal": "theorem holdout_relations_08 : ∀ {α : Type u_1} {r : α → α → Prop} [Std.Irrefl r] (p : α → Prop),\n  (∀ {a' a : α}, r a' a → p a → p a') →\n    ∀ {s' s : Multiset α}, Relation.CutExpand r s' s → (∀ a ∈ s, p a) → ∀ a ∈ s', p a",
    "expectedAnyOf": [
      "Relation.cutExpand_closed"
    ],
    "domain": "Relations"
  },
  {
    "id": "holdout_eq_logic_01",
    "goal": "theorem holdout_eq_logic_01 : ∀ {α : Sort u_1} [inst : DecidableEq α] (i j a : α), (Equiv.swap i j) ((Equiv.swap i j) a) = a",
    "expectedAnyOf": [
      "Equiv.swap_apply_self"
    ],
    "domain": "Eq / Logic"
  },
  {
    "id": "holdout_eq_logic_02",
    "goal": "theorem holdout_eq_logic_02 : ∀ {α : Type u_1} {β : α → Type u_2} {P : (x : α) → β x → Prop} [(a : α) → Encodable (β a)]\n  [(x : α) → (y : β x) → Decidable (P x y)], (∀ (x : α), ∃ y, P x y) ↔ ∃ f, ∀ (x : α), P x (f x)",
    "expectedAnyOf": [
      "Encodable.skolem"
    ],
    "domain": "Eq / Logic"
  },
  {
    "id": "holdout_eq_logic_03",
    "goal": "theorem holdout_eq_logic_03 : ∀ {α : Type u_1}, Function.Injective ULift.down",
    "expectedAnyOf": [
      "ULift.down_injective"
    ],
    "domain": "Eq / Logic"
  },
  {
    "id": "holdout_eq_logic_04",
    "goal": "theorem holdout_eq_logic_04 : ∀ {M : Type u_1} {N : Type u_2} {P : Type u_3} {φ : M → N} {ψ : N → P} {χ : M → P},\n  CompTriple φ ψ χ → ∀ (x : M), ψ (φ x) = χ x",
    "expectedAnyOf": [
      "CompTriple.comp_apply"
    ],
    "domain": "Eq / Logic"
  },
  {
    "id": "holdout_eq_logic_05",
    "goal": "theorem holdout_eq_logic_05 : ∀ {α : Sort u_1} [inst : DecidableEq α] {a b x : α},\n  x ≠ a → x ≠ b → (Equiv.swap a b) x = x",
    "expectedAnyOf": [
      "Equiv.swap_apply_of_ne_of_ne"
    ],
    "domain": "Eq / Logic"
  },
  {
    "id": "holdout_eq_logic_06",
    "goal": "theorem holdout_eq_logic_06 : ∀ {α : Type u_1} {ι : Type u_2} {f : ι → α},\n  Function.Injective f ↔ Pairwise (Function.onFun (fun x1 x2 => x1 ≠ x2) f)",
    "expectedAnyOf": [
      "Function.injective_iff_pairwise_ne"
    ],
    "domain": "Eq / Logic"
  },
  {
    "id": "holdout_finset_01",
    "goal": "theorem holdout_finset_01 : ∀ {α : Type u_1} {β : Type u_2} [inst : Monoid β] (s : Finset α) (f : α → β)\n  (comm : (↑s).Pairwise (Function.onFun Commute f)) (m : β), (∀ x ∈ s, f x = m) → s.noncommProd f comm = m ^ s.card",
    "expectedAnyOf": [
      "Finset.noncommProd_eq_pow_card"
    ],
    "domain": "Finset"
  },
  {
    "id": "holdout_finset_02",
    "goal": "theorem holdout_finset_02 : ∀ {α : Type u_1} [inst : DecidableEq α], Monotone Finset.shadow",
    "expectedAnyOf": [
      "Finset.shadow_monotone"
    ],
    "domain": "Finset"
  },
  {
    "id": "holdout_finset_03",
    "goal": "theorem holdout_finset_03 : ∀ {α : Type u_1} [inst : DecidableEq α] (s₁ : Finset α), s₁ \\ s₁ = ∅",
    "expectedAnyOf": [
      "Finset.sdiff_self"
    ],
    "domain": "Finset"
  },
  {
    "id": "holdout_finset_04",
    "goal": "theorem holdout_finset_04 : ∀ {α : Type u_1} {s : Finset α} (x : ↑↑s), ↑x ∈ s",
    "expectedAnyOf": [
      "Finset.coe_mem"
    ],
    "domain": "Finset"
  },
  {
    "id": "holdout_finset_05",
    "goal": "theorem holdout_finset_05 : ∀ {k : Type u_1} {V : Type u_2} {P : Type u_3} [inst : Ring k]\n  [inst_1 : AddCommGroup V] [inst_2 : Module k V] [S : AddTorsor V P] {ι : Type u_4} (s : Finset ι) (w₁ w₂ : ι → k)\n  (p : ι → P), (Finset.affineCombination k s p) w₁ -ᵥ (Finset.affineCombination k s p) w₂ = (s.weightedVSub p) (w₁ - w₂)",
    "expectedAnyOf": [
      "Finset.affineCombination_vsub"
    ],
    "domain": "Finset"
  },
  {
    "id": "holdout_set_01",
    "goal": "theorem holdout_set_01 : ∀ {α : Type u_1} {M : Type u_2} [inst : LE M] [inst_1 : One M] {s : Set α} {f g : α → M},\n  (∀ a ∈ s, f a ≤ g a) → (∀ a ∉ s, f a ≤ 1) → f ≤ s.mulIndicator g",
    "expectedAnyOf": [
      "Set.le_mulIndicator"
    ],
    "domain": "Set"
  },
  {
    "id": "holdout_set_02",
    "goal": "theorem holdout_set_02 : ∀ {α : Type u_1} {s t : Set α}, s ∩ t ⊆ t",
    "expectedAnyOf": [
      "Set.inter_subset_right"
    ],
    "domain": "Set"
  },
  {
    "id": "holdout_set_03",
    "goal": "theorem holdout_set_03 : ∀ {α : Type u_1} {p : Set α} (s : Finset α) (H : ∀ (x : α), x ∈ s ↔ x ∈ p), p.toFinset = s",
    "expectedAnyOf": [
      "Set.toFinset_ofFinset"
    ],
    "domain": "Set"
  },
  {
    "id": "holdout_set_04",
    "goal": "theorem holdout_set_04 : ∀ {α : Type u_1} {M : Type u_2} {N : Type u_3} [inst : One M] [inst_1 : One N]\n  {s : Set α} {f : α → M} {g : M → N}, g 1 = 1 → s.mulIndicator (g ∘ f) = g ∘ s.mulIndicator f",
    "expectedAnyOf": [
      "Set.mulIndicator_comp_of_one"
    ],
    "domain": "Set"
  },
  {
    "id": "holdout_set_05",
    "goal": "theorem holdout_set_05 : ∀ {α : Type u_1} (s t : Set α), (s ∪ t).encard ≤ s.encard + t.encard",
    "expectedAnyOf": [
      "Set.encard_union_le"
    ],
    "domain": "Set"
  },
  {
    "id": "holdout_list_01",
    "goal": "theorem holdout_list_01 : ∀ {α : Type u_1} {β : Type u_2} [inst : LT α] [inst_1 : LT β] {l₁ l₂ : List α} {f : α → β},\n  (∀ (x y : α), x < y → f x < f y) → l₁ < l₂ → List.map f l₁ < List.map f l₂",
    "expectedAnyOf": [
      "List.map_lt"
    ],
    "domain": "List"
  },
  {
    "id": "holdout_list_02",
    "goal": "theorem holdout_list_02 : ∀ {α : Type u_1} [inst : BEq α] [LawfulBEq α] {l₁ l₂ : List α},\n  l₁.Perm l₂ ↔ ∀ (a : α), List.count a l₁ = List.count a l₂",
    "expectedAnyOf": [
      "List.perm_iff_count"
    ],
    "domain": "List"
  },
  {
    "id": "holdout_list_03",
    "goal": "theorem holdout_list_03 : ∀ {α : Type u_1} {β : Type u_2} {l : List α} {f : α → β} {b : β},\n  List.map f l = List.replicate l.length b ↔ ∀ x ∈ l, f x = b",
    "expectedAnyOf": [
      "List.map_eq_replicate_iff"
    ],
    "domain": "List"
  },
  {
    "id": "holdout_list_04",
    "goal": "theorem holdout_list_04 : ∀ {M : Type u_1} [inst : CommMonoid M] (l l' : List M),\n  l.length = l'.length → l.prod * l'.prod = (List.zipWith (fun x1 x2 => x1 * x2) l l').prod",
    "expectedAnyOf": [
      "List.prod_mul_prod_eq_prod_zipWith_of_length_eq"
    ],
    "domain": "List"
  },
  {
    "id": "holdout_list_05",
    "goal": "theorem holdout_list_05 : ∀ {α : Type u_1} [inst : SeminormedRing α] {l : List α},\n  l ≠ [] → ‖l.prod‖ ≤ (List.map norm l).prod",
    "expectedAnyOf": [
      "List.norm_prod_le'"
    ],
    "domain": "List"
  },
  {
    "id": "holdout_function_01",
    "goal": "theorem holdout_function_01 : ∀ {α : Sort u_1} {β : Sort u_2} [Uncountable α] {f : α → β},\n  Function.Injective f → Uncountable β",
    "expectedAnyOf": [
      "Function.Injective.uncountable"
    ],
    "domain": "Function"
  },
  {
    "id": "holdout_function_02",
    "goal": "theorem holdout_function_02 : ∀ {ι : Type u_1} {π : ι → Type u_2} [inst : DecidableEq ι]\n  [inst_1 : (i : ι) → SemilatticeSup (π i)] (f : (i : ι) → π i) (i : ι) (a b : π i),\n  Function.update f i (a ⊔ b) = Function.update f i a ⊔ Function.update f i b",
    "expectedAnyOf": [
      "Function.update_sup"
    ],
    "domain": "Function"
  },
  {
    "id": "holdout_function_03",
    "goal": "theorem holdout_function_03 : ∀ {R : Type u_1} {L : Type u_2} {L₂ : Type u_3} [inst : CommRing R]\n  [inst_1 : LieRing L] [inst_2 : LieAlgebra R L] [inst_3 : LieRing L₂] [inst_4 : LieAlgebra R L₂] {f : L →ₗ⁅R⁆ L₂},\n  Function.Surjective ⇑f → LieAlgebra.IsEngelian R L → LieAlgebra.IsEngelian R L₂",
    "expectedAnyOf": [
      "Function.Surjective.isEngelian"
    ],
    "domain": "Function"
  },
  {
    "id": "holdout_function_04",
    "goal": "theorem holdout_function_04 : ∀ {X : Type u_1} {Y : Type u_2} [inst : TopologicalSpace X]\n  [inst_1 : TopologicalSpace Y] [T2Space X] {f : X → Y} {g : Y → X},\n  Function.LeftInverse f g → Continuous f → Continuous g → Topology.IsClosedEmbedding g",
    "expectedAnyOf": [
      "Function.LeftInverse.isClosedEmbedding"
    ],
    "domain": "Function"
  },
  {
    "id": "holdout_function_05",
    "goal": "theorem holdout_function_05 : ∀ (α : Type u_1) {β : Type u_1} (b : β), Function.OfArity.const α b 0 = b",
    "expectedAnyOf": [
      "Function.OfArity.const_zero"
    ],
    "domain": "Function"
  },
  {
    "id": "holdout_option_01",
    "goal": "theorem holdout_option_01 : ∀ {α : Type u_1} {p : α → Prop} {o : Option { x // p x }},\n  o.unattach.toArray = o.toArray.unattach",
    "expectedAnyOf": [
      "Option.toArray_unattach"
    ],
    "domain": "Option"
  },
  {
    "id": "holdout_option_02",
    "goal": "theorem holdout_option_02 : ∀ {α : Type u_1} [t : TopologicalSpace α] [m : WeakPseudoEMetricSpace α] {a b : α},\n  edist (some a) (some b) = edist a b",
    "expectedAnyOf": [
      "Option.edist_some_some"
    ],
    "domain": "Option"
  },
  {
    "id": "holdout_option_03",
    "goal": "theorem holdout_option_03 : ∀ {α : Type u_1} {β : Type u_2} [inst : Max α] [inst_1 : Max β] {o o' : Option α} {f : α → β},\n  (∀ (x y : α), f (x ⊔ y) = f x ⊔ f y) → Option.map f (o ⊔ o') = Option.map f o ⊔ Option.map f o'",
    "expectedAnyOf": [
      "Option.map_max"
    ],
    "domain": "Option"
  },
  {
    "id": "holdout_option_04",
    "goal": "theorem holdout_option_04 : ∀ {α : Type u_1} (o o' : Option α) (x : α),\n  (o <|> o') = some x ↔ o = some x ∨ o = none ∧ o' = some x",
    "expectedAnyOf": [
      "Option.orElse_eq_some"
    ],
    "domain": "Option"
  },
  {
    "id": "holdout_prod_sum_01",
    "goal": "theorem holdout_prod_sum_01 : ∀ {α : Type u_1} {β : Type u_2} [inst : Preorder α] [inst_1 : Preorder β] {a b : Lex (α × β)},\n  a ⋖ b ↔\n    (ofLex a).1 = (ofLex b).1 ∧ (ofLex a).2 ⋖ (ofLex b).2 ∨\n      (ofLex a).1 ⋖ (ofLex b).1 ∧ IsMax (ofLex a).2 ∧ IsMin (ofLex b).2",
    "expectedAnyOf": [
      "Prod.Lex.covBy_iff"
    ],
    "domain": "Prod / Sum"
  },
  {
    "id": "holdout_prod_sum_02",
    "goal": "theorem holdout_prod_sum_02 : ∀ {α : Type u_1} {β : Type u_2} {ι : Sort u_3} [inst : SupSet α] [inst_1 : SupSet β] (f : ι → α × β),\n  (iSup f).1 = ⨆ i, (f i).1",
    "expectedAnyOf": [
      "Prod.fst_iSup"
    ],
    "domain": "Prod / Sum"
  },
  {
    "id": "holdout_prod_sum_03",
    "goal": "theorem holdout_prod_sum_03 : ∀ {α : Type u_1} {r : α → α → Prop} {β : Type u_2} {s : β → β → Prop},\n  Subrelation (Sum.LiftRel r s) (Sum.Lex r s)",
    "expectedAnyOf": [
      "Sum.liftRel_subrelation_lex"
    ],
    "domain": "Prod / Sum"
  },
  {
    "id": "holdout_prod_sum_04",
    "goal": "theorem holdout_prod_sum_04 : ∀ (α : Type u_1) (β : Type u_2) [inst : Max α] [inst_1 : Max β] (p q : α × β),\n  p ⊔ q = (p.1 ⊔ q.1, p.2 ⊔ q.2)",
    "expectedAnyOf": [
      "Prod.sup_def"
    ],
    "domain": "Prod / Sum"
  },
  {
    "id": "holdout_order_01",
    "goal": "theorem holdout_order_01 : ∀ {ι : Sort u_1} {α : Type u_2} [inst : LinearOrder α] {f : ι → α} {a : α},\n  ⋃ i, Set.Icc a (f i) = Set.Ici a ↔ ∀ x ≥ a, ∃ i, x ≤ f i",
    "expectedAnyOf": [
      "Set.iUnion_Icc_eq_Ici_self_iff"
    ],
    "domain": "Order"
  },
  {
    "id": "holdout_order_02",
    "goal": "theorem holdout_order_02 : ∀ {α : Type u_1} {f : Filter α} {s : Set α}, (∃ t ∈ f, t ⊆ s) ↔ s ∈ f",
    "expectedAnyOf": [
      "Filter.exists_mem_subset_iff"
    ],
    "domain": "Order"
  },
  {
    "id": "holdout_order_03",
    "goal": "theorem holdout_order_03 : ∀ {d n : ℕ}, d < n → ∃ᶠ (m : ℕ) in Filter.atTop, m % n = d",
    "expectedAnyOf": [
      "Nat.frequently_mod_eq"
    ],
    "domain": "Order"
  },
  {
    "id": "holdout_order_04",
    "goal": "theorem holdout_order_04 : ∀ {α : Type u_1} [inst : Lattice α] [inst_1 : OrderBot α] {a : α} (P : Finpartition a),\n  (↑P.parts).PairwiseDisjoint id",
    "expectedAnyOf": [
      "Finpartition.disjoint"
    ],
    "domain": "Order"
  },
  {
    "id": "holdout_order_05",
    "goal": "theorem holdout_order_05 : ∀ {α : Type u_1} {β : Type u_2} [inst : Preorder β] {f : α → β} {l : Filter α} {a : α},\n  IsMinFilter f l a → ∀ (l' : Filter α), IsMinFilter f (l ⊓ l') a",
    "expectedAnyOf": [
      "IsMinFilter.filter_inf"
    ],
    "domain": "Order"
  },
  {
    "id": "holdout_topology_01",
    "goal": "theorem holdout_topology_01 : ∀ {α : Type u_1} {β : Type u_2} {γ : Type u_3}\n  [inst : PseudoMetricSpace α] [inst_1 : PseudoMetricSpace β] [inst_2 : PseudoMetricSpace γ] {f : α → β → γ}\n  {K₂ : NNReal},\n  (∀ (a : α), AntilipschitzWith K₂ (f a)) →\n    ∀ {s : Set α} {t : Set β}, Bornology.IsBounded (Set.image2 f s t) → Bornology.IsBounded s ∨ Bornology.IsBounded t",
    "expectedAnyOf": [
      "AntilipschitzWith.isBounded_of_image2_right"
    ],
    "domain": "Topology"
  },
  {
    "id": "holdout_topology_02",
    "goal": "theorem holdout_topology_02 : ∀ {a b : ℝ} (x y : ↑(Set.Icc a b)) (t : ↑unitInterval),\n  Set.Icc.convexComb x y (unitInterval.symm t) = Set.Icc.convexComb y x t",
    "expectedAnyOf": [
      "Set.Icc.convexComb_symm"
    ],
    "domain": "Topology"
  },
  {
    "id": "holdout_topology_03",
    "goal": "theorem holdout_topology_03 : ∀ {R : Type u_1} {A : Type u_2} [inst : CommSemiring R]\n  [inst_1 : StarRing R] [inst_2 : NonUnitalSemiring A] [inst_3 : StarRing A] [inst_4 : Module R A]\n  [inst_5 : IsScalarTower R A A] [inst_6 : SMulCommClass R A A] [inst_7 : StarModule R A] [inst_8 : TopologicalSpace A]\n  [inst_9 : IsSemitopologicalSemiring A] [inst_10 : ContinuousConstSMul R A] [inst_11 : ContinuousStar A] {x : A}\n  {s : NonUnitalStarSubalgebra R A}, IsClosed ↑s → (NonUnitalStarAlgebra.elemental R x ≤ s ↔ x ∈ s)",
    "expectedAnyOf": [
      "NonUnitalStarAlgebra.elemental.le_iff_mem"
    ],
    "domain": "Topology"
  },
  {
    "id": "holdout_topology_04",
    "goal": "theorem holdout_topology_04 : ∀ {α : Type u_1} {R : Type u_2} [inst : TopologicalSpace R] [inst_1 : Star R] [ContinuousStar R]\n  [inst_3 : TopologicalSpace α] {f : α → R} {s : Set α}, ContinuousOn f s → ContinuousOn (fun x => star (f x)) s",
    "expectedAnyOf": [
      "ContinuousOn.star"
    ],
    "domain": "Topology"
  },
  {
    "id": "holdout_analysis_01",
    "goal": "theorem holdout_analysis_01 : ∀ {n : Type u_1} {A : Type u_2} [inst : DecidableEq n] [inst_1 : Zero A] [inst_2 : One A]\n  (i : n), 1 i i = 1",
    "expectedAnyOf": [
      "CStarMatrix.one_apply_eq"
    ],
    "domain": "Analysis"
  },
  {
    "id": "holdout_analysis_02",
    "goal": "theorem holdout_analysis_02 : ∀ {E : Type u_1} [inst : NormedAddCommGroup E]\n  [inst_1 : InnerProductSpace ℝ E] [inst_2 : FiniteDimensional ℝ E] {F : Type u_2} [inst_3 : NormedAddCommGroup F]\n  [inst_4 : NormedSpace ℝ F] (f : E → F), IsOpen {x | InnerProductSpace.HarmonicAt f x}",
    "expectedAnyOf": [
      "InnerProductSpace.isOpen_setOfPred_harmonicAt"
    ],
    "domain": "Analysis"
  },
  {
    "id": "holdout_analysis_03",
    "goal": "theorem holdout_analysis_03 : ∀ {𝕜 : Type u_1} {𝕜' : Type u_2}\n  [inst : NontriviallyNormedField 𝕜] [inst_1 : NontriviallyNormedField 𝕜'] {σ : 𝕜 →+* 𝕜'} {E : Type u_3}\n  [inst_2 : NormedAddCommGroup E] [inst_3 : NormedSpace 𝕜 E] {F : Type u_4} [inst_4 : NormedAddCommGroup F]\n  [inst_5 : NormedSpace 𝕜' F] (f : E →SL[σ] F) {σ' : 𝕜' →+* 𝕜} [RingHomInvPair σ σ'] [RingHomIsometric σ]\n  [RingHomIsometric σ'] [CompleteSpace F],\n  Function.Surjective ⇑f → ∃ C ≥ 0, ∀ (y : F), ∃ x, dist (f x) y ≤ 1 / 2 * ‖y‖ ∧ ‖x‖ ≤ C * ‖y‖",
    "expectedAnyOf": [
      "ContinuousLinearMap.exists_approx_preimage_norm_le"
    ],
    "domain": "Analysis"
  },
  {
    "id": "holdout_analysis_04",
    "goal": "theorem holdout_analysis_04 : ∀ {𝕜 : Type u_1} [inst : NontriviallyNormedField 𝕜] {E : Type u_2}\n  [inst_1 : NormedAddCommGroup E] [inst_2 : NormedSpace 𝕜 E] {F : Type u_3} [inst_3 : NormedAddCommGroup F]\n  [inst_4 : NormedSpace 𝕜 F] {f : E → F} {x : E} {R : Type u_4} [inst_5 : Monoid R] [inst_6 : DistribMulAction R F]\n  [SMulCommClass 𝕜 R F] [ContinuousConstSMul R F], DifferentiableAt 𝕜 f x → ∀ (c : R), DifferentiableAt 𝕜 (c • f) x",
    "expectedAnyOf": [
      "DifferentiableAt.const_smul"
    ],
    "domain": "Analysis"
  },
  {
    "id": "holdout_analysis_05",
    "goal": "theorem holdout_analysis_05 : ∀ {𝕜 : Type u_1} {E : Type u_2} {β : Type u_3} [inst : Semiring 𝕜] [inst_1 : PartialOrder 𝕜]\n  [inst_2 : AddCommMonoid E] [inst_3 : AddCommMonoid β] [inst_4 : PartialOrder β] [IsOrderedAddMonoid β]\n  [inst_6 : SMul 𝕜 E] [inst_7 : Module 𝕜 β] [PosSMulMono 𝕜 β] {s : Set E} {f : E → β},\n  ConvexOn 𝕜 s f → Convex 𝕜 {p | p.1 ∈ s ∧ f p.1 ≤ p.2}",
    "expectedAnyOf": [
      "ConvexOn.convex_epigraph"
    ],
    "domain": "Analysis"
  },
  {
    "id": "holdout_sequences_01",
    "goal": "theorem holdout_sequences_01 : ∀ {β : Type u_1} [Nonempty β] [inst : SemilatticeSup β]\n  {f : β → ENNReal}, Antitone f → (Filter.Tendsto f Filter.atTop (nhds 0) ↔ ∀ (ε : ENNReal), 0 < ε → ∃ n, f n < ε)",
    "expectedAnyOf": [
      "ENNReal.tendsto_atTop_zero_iff_lt_of_antitone"
    ],
    "domain": "Sequences"
  },
  {
    "id": "holdout_sequences_02",
    "goal": "theorem holdout_sequences_02 : ∀ {X : Type u_1} {l : Type u_2} {R : Type u_3} {m' : l → Type u_4} {n' : l → Type u_5}\n  [inst : AddCommMonoid R] [inst_1 : TopologicalSpace R] {L : SummationFilter X}\n  {f : X → Matrix ((i : l) × m' i) ((i : l) × n' i) R}, Summable f L → Summable (fun x => (f x).blockDiag') L",
    "expectedAnyOf": [
      "Summable.matrix_blockDiag'"
    ],
    "domain": "Sequences"
  },
  {
    "id": "holdout_sequences_03",
    "goal": "theorem holdout_sequences_03 : ∀ {C : ℝ} {f g : ℝ → ℝ} {l : Filter ℝ},\n  Filter.Tendsto (fun x => g x / f x) l Filter.atTop → 0 < C → Asymptotics.IsBigOWith C l f g",
    "expectedAnyOf": [
      "Tactic.ComputeAsymptotics.isBigOWith_of_tendsto_top"
    ],
    "domain": "Sequences"
  },
  {
    "id": "holdout_sequences_04",
    "goal": "theorem holdout_sequences_04 : ∀ (t : ℝ),\n  Filter.Tendsto (fun n => (1 + t / ↑n) ^ n) Filter.atTop (nhds (Real.exp t))",
    "expectedAnyOf": [
      "Real.tendsto_one_add_div_pow_exp"
    ],
    "domain": "Sequences"
  },
  {
    "id": "holdout_maps_functions_01",
    "goal": "theorem holdout_maps_functions_01 : ∀ {G : Type u_1} [inst : Group G] (a : G), Equiv.symm (Equiv.mulLeft a) = Equiv.mulLeft a⁻¹",
    "expectedAnyOf": [
      "Equiv.mulLeft_symm"
    ],
    "domain": "Maps / Functions"
  },
  {
    "id": "holdout_maps_functions_02",
    "goal": "theorem holdout_maps_functions_02 : ∀ {α : Type u_1} [inst : DecidableEq α] [inst_1 : Fintype α],\n  5 ≤ Nat.card α → ∀ {N : Subgroup (Equiv.Perm α)} [N.Normal], Nontrivial ↥N → alternatingGroup α ≤ N",
    "expectedAnyOf": [
      "Equiv.Perm.alternatingGroup_le_of_normal"
    ],
    "domain": "Maps / Functions"
  },
  {
    "id": "holdout_maps_functions_03",
    "goal": "theorem holdout_maps_functions_03 : HoldoutTypeCheck.lean:183:8: warning: `Equiv.Perm.inv_trans_self` has been deprecated: use `pull_end` simpset instead\n@Equiv.Perm.inv_trans_self : ∀ {α : Type u_1} (e : Equiv.Perm α), Equiv.trans e⁻¹ e = 1",
    "expectedAnyOf": [
      "Equiv.Perm.inv_trans_self"
    ],
    "domain": "Maps / Functions"
  },
  {
    "id": "holdout_maps_functions_04",
    "goal": "theorem holdout_maps_functions_04 : ∀ {α : Type u_1} {β : Type u_2} {γ : Type u_3} (b : β × γ),\n  (Equiv.sumProdDistrib α β γ).symm (Sum.inr b) = (Sum.inr b.1, b.2)",
    "expectedAnyOf": [
      "Equiv.sumProdDistrib_symm_apply_right"
    ],
    "domain": "Maps / Functions"
  },
  {
    "id": "holdout_basic_number_theory_01",
    "goal": "theorem holdout_basic_number_theory_01 : ∀ {F : Type u_1} {F' : Type u_2}\n  [inst : FunLike F UpperHalfPlane ℂ] [inst_1 : FunLike F' UpperHalfPlane ℂ] (k : ℤ) (Γ : Subgroup (GL (Fin 2) ℝ))\n  [Fact (IsCusp OnePoint.infty Γ)] [Γ.HasDetPlusMinusOne] [DiscreteTopology ↥Γ] [ModularFormClass F Γ k]\n  [ModularFormClass F' Γ k] (f : F) {f' : F'},\n  UpperHalfPlane.IsZeroAtImInfty ⇑f' → UpperHalfPlane.IsZeroAtImInfty (UpperHalfPlane.petersson k ⇑f ⇑f')",
    "expectedAnyOf": [
      "UpperHalfPlane.IsZeroAtImInfty.petersson_isZeroAtImInfty_right"
    ],
    "domain": "Basic number theory"
  },
  {
    "id": "holdout_basic_number_theory_02",
    "goal": "theorem holdout_basic_number_theory_02 : ∀ {α : Type u_1} (i : α) (x : α → ℕ), (Poly.proj i) x = ↑(x i)",
    "expectedAnyOf": [
      "Poly.proj_apply"
    ],
    "domain": "Basic number theory"
  },
  {
    "id": "holdout_basic_number_theory_03",
    "goal": "theorem holdout_basic_number_theory_03 : ∀ {n : ℕ},\n  n ≠ 0 → ArithmeticFunction.carmichael n = Monoid.exponent (ZMod n)ˣ",
    "expectedAnyOf": [
      "ArithmeticFunction.carmichael_eq_exponent"
    ],
    "domain": "Basic number theory"
  },
  {
    "id": "holdout_basic_number_theory_04",
    "goal": "theorem holdout_basic_number_theory_04 : ∀ {p : ℕ} [hp_prime : Fact (Nat.Prime p)] (n : ℕ) (x : ℤ_[p]) (a b : ℤ),\n  x - ↑a ∈ Ideal.span {↑p ^ n} → x - ↑b ∈ Ideal.span {↑p ^ n} → ↑a = ↑b",
    "expectedAnyOf": [
      "PadicInt.zmod_congr_of_sub_mem_span_aux"
    ],
    "domain": "Basic number theory"
  },
  {
    "id": "holdout_combinatorics_01",
    "goal": "theorem holdout_combinatorics_01 : ∀ {V : Type u_1} {G : SimpleGraph V}, ⊥.verts = ∅",
    "expectedAnyOf": [
      "SimpleGraph.Subgraph.verts_bot"
    ],
    "domain": "Combinatorics"
  },
  {
    "id": "holdout_combinatorics_02",
    "goal": "theorem holdout_combinatorics_02 : ∀ {α : Type u_1} (G : SimpleGraph α) [inst : DecidableRel G.Adj] {ε : ℝ}\n  {s t u : Finset α} [inst_1 : DecidableEq α] [inst_2 : Fintype α],\n  2 * ε ≤ ↑(G.edgeDensity s t) →\n    G.IsUniform ε s t →\n      Disjoint s t →\n        2 * ε ≤ ↑(G.edgeDensity s u) →\n          G.IsUniform ε s u →\n            Disjoint s u →\n              2 * ε ≤ ↑(G.edgeDensity t u) →\n                G.IsUniform ε t u →\n                  Disjoint t u → (1 - 2 * ε) * ε ^ 3 * ↑s.card * ↑t.card * ↑u.card ≤ ↑(G.cliqueFinset 3).card",
    "expectedAnyOf": [
      "SimpleGraph.triangle_counting"
    ],
    "domain": "Combinatorics"
  },
  {
    "id": "holdout_combinatorics_03",
    "goal": "theorem holdout_combinatorics_03 : ∀ {α : Type u_1} {G : SimpleGraph α} [Nontrivial α] (u : α), G.eccent u ≠ 0",
    "expectedAnyOf": [
      "SimpleGraph.eccent_ne_zero"
    ],
    "domain": "Combinatorics"
  },
  {
    "id": "holdout_combinatorics_04",
    "goal": "theorem holdout_combinatorics_04 : ∀ {V : Type u_1} {G : SimpleGraph V} {u v w : V} (p : G.Walk u v) (h : G.Adj v w),\n  p.concat h = p.append (SimpleGraph.Walk.cons h SimpleGraph.Walk.nil)",
    "expectedAnyOf": [
      "SimpleGraph.Walk.concat_eq_append"
    ],
    "domain": "Combinatorics"
  }
]
