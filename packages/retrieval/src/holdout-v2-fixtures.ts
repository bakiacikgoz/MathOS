export interface RetrievalHoldoutV2Fixture {
  id: string
  goal: string
  expectedAnyOf: string[]
  domain: string
  goalFingerprint: string
  sampleHash: string
}

export const RETRIEVAL_HOLDOUT_V2_METADATA = {
  "datasetVersion": "retrieval-holdout-v2",
  "createdAt": "2026-08-24",
  "leanVersion": "v4.33.1",
  "mathlibVersion": "v4.33.1",
  "frozen": true,
  "samplingSeed": "mathos-retrieval-holdout-v2-2026-08-24-independent-sample",
  "fixtureCount": 180,
  "domainDistribution": {
    "Logic / Eq": 9,
    "Nat": 15,
    "Int": 15,
    "Algebra": 20,
    "Order": 9,
    "Finset": 9,
    "Set": 9,
    "List": 9,
    "Function": 9,
    "Relations": 10,
    "Option": 8,
    "Prod / Sum": 8,
    "Maps": 8,
    "Sequences": 8,
    "Topology": 9,
    "Analysis": 9,
    "Number theory": 8,
    "Combinatorics": 8
  },
  "weakDomainCount": 60,
  "weakDomainShare": 0.3333333333333333,
  "sourceIndexRevision": "827dabf4588cc464",
  "sourceIndexFormatVersion": 3,
  "sourceDeclarationCount": 234537,
  "samplingMethod": "domain-stratified canonical theorem filtering followed by SHA-256 ordering; frozen semantic feature was not consulted"
} as const

export const RETRIEVAL_HOLDOUT_V2_FIXTURES: RetrievalHoldoutV2Fixture[] = [
  {
    "id": "holdout_v2_logic_eq_01",
    "goal": "theorem holdout_v2_logic_eq_01 : Pi.default_def {α : Sort u_1} {β : α → Sort v} [(a : α) → Inhabited (β a)] : default = fun a => default",
    "expectedAnyOf": [
      "Pi.default_def"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "75ae1cc87eaae4f6387e1802059a85b7a4295d86882689989aa7184b714bb366",
    "sampleHash": "017b31621958c4216ef7b605251f9b342b3a0c347c26180d773ed3b66ee47552"
  },
  {
    "id": "holdout_v2_logic_eq_02",
    "goal": "theorem holdout_v2_logic_eq_02 : Nonempty.exists {α : Sort u_3} {p : Nonempty α → Prop} : (∃ (h : Nonempty α), p h) ↔ ∃ a, p ⋯",
    "expectedAnyOf": [
      "Nonempty.exists"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "ddf888cfa9aefb19a330bcff7535d0e108b18ae10f5c5294d7eebf9ab0124f32",
    "sampleHash": "01c5a2d40f0399cd5d2d519e76126eb319ec4de23448edc07b583ead447b8c25"
  },
  {
    "id": "holdout_v2_logic_eq_03",
    "goal": "theorem holdout_v2_logic_eq_03 : Unique.bijective {A : Sort u_2} {B : Sort u_3} [Unique A] [Unique B] {f : A → B} : Function.Bijective f",
    "expectedAnyOf": [
      "Unique.bijective"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "03b6eee9162da02412b372212df986abf81bc265472fabcea6456632dcd8ae8d",
    "sampleHash": "020885570b85840769c5c403f03e62b2ed91fb6a6b599f20b90a296edb8a57c7"
  },
  {
    "id": "holdout_v2_logic_eq_04",
    "goal": "theorem holdout_v2_logic_eq_04 : Decidable.exists_ne {α : Type u_1} [Nontrivial α] [DecidableEq α] (x : α) : ∃ y, y ≠ x",
    "expectedAnyOf": [
      "Decidable.exists_ne"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "c4a7139f14b860058014e35d5f02b86c64d2a789949123d6497d8436d0e88e43",
    "sampleHash": "02445fbf4d1381f6def23ac2efc2e0f06aa0a0d0e0913ed65ade392a388b5de9"
  },
  {
    "id": "holdout_v2_logic_eq_05",
    "goal": "theorem holdout_v2_logic_eq_05 : Decidable.ne_or_eq {α : Sort u_1} (x y : α) [Decidable (x = y)] : x ≠ y ∨ x = y",
    "expectedAnyOf": [
      "Decidable.ne_or_eq"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "7e2278257018153fa5b25c8ee6c8fe3fb841e523663ecd632b11f18f12161bef",
    "sampleHash": "02a6884a3d7e5047d0b35a0341c9b1ce224738c9e10b0b50871beccfea74d1e7"
  },
  {
    "id": "holdout_v2_logic_eq_06",
    "goal": "theorem holdout_v2_logic_eq_06 : ExistsUnique.choose_eq_iff {α : Sort u_1} {p : α → Prop} {a : α} (h : ∃! x, p x) : Exists.choose h = a ↔ p a",
    "expectedAnyOf": [
      "ExistsUnique.choose_eq_iff"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "92cdd3f00daa04f90424b45c98e828ac98deb0c45b487d44bbc813c1fe6aa451",
    "sampleHash": "0304f36b2651641c5fd6eaacfd4de02478339443e88df75ac194dfe4ef298767"
  },
  {
    "id": "holdout_v2_logic_eq_07",
    "goal": "theorem holdout_v2_logic_eq_07 : Function.Embedding.trans_assoc {α : Type u_1} {β : Type u_2} {γ : Type u_3} {δ : Type u_4}",
    "expectedAnyOf": [
      "Function.Embedding.trans_assoc"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "f24f7ab6840e2a1949f23245367d5af017554b9420cf97a3a6054e3fc4b5dfdd",
    "sampleHash": "05b96e97e06c1eac4c8bb7851f24d157de10cb521b1ab3dea74756ef83a16404"
  },
  {
    "id": "holdout_v2_logic_eq_08",
    "goal": "theorem holdout_v2_logic_eq_08 : ULower.up_eq_up {α : Type u_1} [Encodable α] {a b : ULower α} : a.up = b.up ↔ a = b",
    "expectedAnyOf": [
      "ULower.up_eq_up"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "5508304b18f3278a019763e1251aaafbd3b8d9035dd8052b84f2b14c844619b2",
    "sampleHash": "099e7a62cc01910a729c97f989841331b5e8826556a995d1fb4c007d3fe353d8"
  },
  {
    "id": "holdout_v2_logic_eq_09",
    "goal": "theorem holdout_v2_logic_eq_09 : Nonempty.forall {α : Sort u_3} {p : Nonempty α → Prop} : (∀ (h : Nonempty α), p h) ↔ ∀ (a : α), p ⋯",
    "expectedAnyOf": [
      "Nonempty.forall"
    ],
    "domain": "Logic / Eq",
    "goalFingerprint": "2e637ae03de0845d1e1a7a66c0e5528c11d1c7f2bec6ac95991f1bbd3e72c3de",
    "sampleHash": "0b369f662dc66fe95be0a9a0439d866ee24c355ea3573ad087a1e786f28e3909"
  },
  {
    "id": "holdout_v2_nat_01",
    "goal": "theorem holdout_v2_nat_01 : Nat.ordCompl_dvd (n p : ℕ) : n / p ^ n.factorization p ∣ n",
    "expectedAnyOf": [
      "Nat.ordCompl_dvd"
    ],
    "domain": "Nat",
    "goalFingerprint": "af10c72a177389d578a0f33552745e8c1622d647724e69686eb9d979050da42b",
    "sampleHash": "000055347b65f8a661e32a1f2cd465abc3b1563d8c6879311a5ff43fdcf58b51"
  },
  {
    "id": "holdout_v2_nat_02",
    "goal": "theorem holdout_v2_nat_02 : Nat.monotone_primeCounting' : Monotone Nat.primeCounting'",
    "expectedAnyOf": [
      "Nat.monotone_primeCounting'"
    ],
    "domain": "Nat",
    "goalFingerprint": "893598ac88bf55159b49d98f159b3be9a189d65e30ea2ddff8daa5388338071a",
    "sampleHash": "002b38cf95e804c2c33cfe42f49122c44d40c1b0a274eeea9cb06278150480d0"
  },
  {
    "id": "holdout_v2_nat_03",
    "goal": "theorem holdout_v2_nat_03 : Nat.ascFactorial_eq_factorial_mul_choose' (n k : ℕ) : n.ascFactorial k = k.factorial * (n + k - 1).choose k",
    "expectedAnyOf": [
      "Nat.ascFactorial_eq_factorial_mul_choose'"
    ],
    "domain": "Nat",
    "goalFingerprint": "9a85f71fa40439b024480bd94af3366adc2ef7b3b2dd49259afeb373bdc13937",
    "sampleHash": "00397e680896ed464b1bf2545889ac992800729e0b22d806d2ade738fb0ea56c"
  },
  {
    "id": "holdout_v2_nat_04",
    "goal": "theorem holdout_v2_nat_04 : Nat.sq_add_sq_mul {a b x y u v : ℕ} (ha : a = x ^ 2 + y ^ 2) (hb : b = u ^ 2 + v ^ 2) : ∃ r s, a * b = r ^ 2 + s ^ 2",
    "expectedAnyOf": [
      "Nat.sq_add_sq_mul"
    ],
    "domain": "Nat",
    "goalFingerprint": "51f146feac4bd1618359105b6ae92b4024f7596a8071d6897b0186c5b02c3662",
    "sampleHash": "0039b2a3d4cea8568b59f108bf9f3e6df373c4c826b47dd1fb70ca1ca05fdfa8"
  },
  {
    "id": "holdout_v2_nat_05",
    "goal": "theorem holdout_v2_nat_05 : Nat.add_modEq_left_iff {n a b : ℕ} : a + b ≡ a [MOD n] ↔ n ∣ b",
    "expectedAnyOf": [
      "Nat.add_modEq_left_iff"
    ],
    "domain": "Nat",
    "goalFingerprint": "955a183a2c77f405b8feeb5dc76c507092392afe5b0696787471082f8478741d",
    "sampleHash": "00498b211da049ffe72294c32c99824a4091350d1732408e73dd28b19e9a3ec4"
  },
  {
    "id": "holdout_v2_nat_06",
    "goal": "theorem holdout_v2_nat_06 : Nat.factorization_le_factorization_of_dvd_right {a b c : ℕ} (h : b ∣ c) (hb : b ≠ 0) (hc : c ≠ 0) :",
    "expectedAnyOf": [
      "Nat.factorization_le_factorization_of_dvd_right"
    ],
    "domain": "Nat",
    "goalFingerprint": "34522c75ac090b37f7465724c47221ba115b941c8953cf2cfd97fb01c281e8b2",
    "sampleHash": "005ddb09b113cdfc900aaeb4dc2c3a183950793c460051f1937f733042ef20c6"
  },
  {
    "id": "holdout_v2_nat_07",
    "goal": "theorem holdout_v2_nat_07 : Nat.choose_succ_succ (n k : ℕ) : n.succ.choose k.succ = n.choose k + n.choose k.succ",
    "expectedAnyOf": [
      "Nat.choose_succ_succ"
    ],
    "domain": "Nat",
    "goalFingerprint": "f7c6de6369484267dfd7ae907e9f40dca9328acfe932bd48268dfb0cba8887ba",
    "sampleHash": "007e578e3ed3aeb66120952eac887c633c3f8e7226e2148afd054524edd6f92c"
  },
  {
    "id": "holdout_v2_nat_08",
    "goal": "theorem holdout_v2_nat_08 : Nat.gcd_mul_gcd_eq_iff_dvd_mul_of_coprime {x n m : ℕ} (hcop : n.Coprime m) : x.gcd n * x.gcd m = x ↔ x ∣ n * m",
    "expectedAnyOf": [
      "Nat.gcd_mul_gcd_eq_iff_dvd_mul_of_coprime"
    ],
    "domain": "Nat",
    "goalFingerprint": "896a924fed569bc72afc786e9c27edf523f14cc1faa9cccd9886b98c2e067dcd",
    "sampleHash": "01ad1f8d13dda04e6c5eeaf2fefc108a1ede5ad276ac5a31327101cef88eaf46"
  },
  {
    "id": "holdout_v2_nat_09",
    "goal": "theorem holdout_v2_nat_09 : Nat.divMaxPow_base_mul {p : ℕ} (hp : p ≠ 0) (n : ℕ) : (p * n).divMaxPow p = n.divMaxPow p",
    "expectedAnyOf": [
      "Nat.divMaxPow_base_mul"
    ],
    "domain": "Nat",
    "goalFingerprint": "23b6b870ca0362e78b0191183923bf6caf4f433db7568182ee7fc2bedfe04b97",
    "sampleHash": "01afb725c1b91ce1e9b88142300b95b1684ede308efcdeb89f1c9df4b81f718a"
  },
  {
    "id": "holdout_v2_nat_10",
    "goal": "theorem holdout_v2_nat_10 : Nat.ModEq.mul_left_cancel_iff' {a b c m : ℕ} (hc : c ≠ 0) : c * a ≡ c * b [MOD c * m] ↔ a ≡ b [MOD m]",
    "expectedAnyOf": [
      "Nat.ModEq.mul_left_cancel_iff'"
    ],
    "domain": "Nat",
    "goalFingerprint": "27ea4deeed505f6f222213f2dfc28934dd1d048c6a7b0f3cf87d270174209855",
    "sampleHash": "01e188db76fdaf91de260d4f2cfb45a82ec97f56a11ce44476994ab979485877"
  },
  {
    "id": "holdout_v2_nat_11",
    "goal": "theorem holdout_v2_nat_11 : Nat.land_comm (n m : ℕ) : n &&& m = m &&& n",
    "expectedAnyOf": [
      "Nat.land_comm"
    ],
    "domain": "Nat",
    "goalFingerprint": "ca73a8219c1e2e4d89deab2fe43d52f3530c033ecd84ad45fb174b94a85980d1",
    "sampleHash": "01e990c3fd925dd36280fe0ce7f31513596222b00054ef1a50b48c44ce4a0432"
  },
  {
    "id": "holdout_v2_nat_12",
    "goal": "theorem holdout_v2_nat_12 : Nat.WithBot.add_eq_three_iff {n m : WithBot ℕ} :",
    "expectedAnyOf": [
      "Nat.WithBot.add_eq_three_iff"
    ],
    "domain": "Nat",
    "goalFingerprint": "f7afa6bc3f0522cbe336b2f815d202155d7299003c70858bdb3e0f1f92c9c973",
    "sampleHash": "022a60fae0fcd9cdb3f5cc5813358d8549a64991f2a7eaf67d8451c98f4bb50b"
  },
  {
    "id": "holdout_v2_nat_13",
    "goal": "theorem holdout_v2_nat_13 : Nat.testBit_land (m n k : ℕ) : (m &&& n).testBit k = (m.testBit k && n.testBit k)",
    "expectedAnyOf": [
      "Nat.testBit_land"
    ],
    "domain": "Nat",
    "goalFingerprint": "045c308b01da290ad49a73b8087fbe02a10c1647f72281ebe5f4bc6129e99f21",
    "sampleHash": "02504837cdf1a206e49caecacdbfe06302b3a9850da77451146f9fc8cd0a7712"
  },
  {
    "id": "holdout_v2_nat_14",
    "goal": "theorem holdout_v2_nat_14 : Nat.WithBot.lt_one_iff_le_zero {x : WithBot ℕ} : x < 1 ↔ x ≤ 0",
    "expectedAnyOf": [
      "Nat.WithBot.lt_one_iff_le_zero"
    ],
    "domain": "Nat",
    "goalFingerprint": "38a0c9b3243660200db85d3037864bbe0f6dd18f317ec6311f5524e2d546030f",
    "sampleHash": "0332a3b4dbe38f64c7dc8c37efb1e1b6e42ccceffebb502ae4afd65cae634bcd"
  },
  {
    "id": "holdout_v2_nat_15",
    "goal": "theorem holdout_v2_nat_15 : Nat.choose_mul_factorial_mul_factorial {n k : ℕ} : k ≤ n → n.choose k * k.factorial * (n - k).factorial = n.factorial",
    "expectedAnyOf": [
      "Nat.choose_mul_factorial_mul_factorial"
    ],
    "domain": "Nat",
    "goalFingerprint": "9a988d297efec166b6696735e3ef1db77f93e6fdbdb89aec68c110807f936793",
    "sampleHash": "03411b0137708910ef9bc43d19e4e12c81d3abf10180df11d3f0946ac59d34d1"
  },
  {
    "id": "holdout_v2_int_01",
    "goal": "theorem holdout_v2_int_01 : Int.le_floor {α : Type u_2} [Ring α] [LinearOrder α] [FloorRing α] {z : ℤ} {a : α} : z ≤ ⌊a⌋ ↔ ↑z ≤ a",
    "expectedAnyOf": [
      "Int.le_floor"
    ],
    "domain": "Int",
    "goalFingerprint": "199da48e5893e9e1fcd258ed0727dad510cf857b64598d2a9f0b382baf2277f6",
    "sampleHash": "000b7355acf87b289cf3d344d22bc16c2cae453bcf27b67c2c42d89990339b0e"
  },
  {
    "id": "holdout_v2_int_02",
    "goal": "theorem holdout_v2_int_02 : Int.modEq_natAbs {n a b : ℤ} : a ≡ b [ZMOD ↑n.natAbs] ↔ a ≡ b [ZMOD n]",
    "expectedAnyOf": [
      "Int.modEq_natAbs"
    ],
    "domain": "Int",
    "goalFingerprint": "3ae53280e28cce9efedea066dc367d93db5b3a7adb99aff06f36144eb739c195",
    "sampleHash": "0029e5acf2f211dc26e773dcd9445baf84b9016724b496fdf41797ef56ad088d"
  },
  {
    "id": "holdout_v2_int_03",
    "goal": "theorem holdout_v2_int_03 : Int.bodd_add (m n : ℤ) : (m + n).bodd = (m.bodd ^^ n.bodd)",
    "expectedAnyOf": [
      "Int.bodd_add"
    ],
    "domain": "Int",
    "goalFingerprint": "23dddc1032976d05de3eba3464dc03e82970041e627f31f13accfd36f284dcd0",
    "sampleHash": "01b3c22d75c555084c187b80b471ebf5effedff5d1463099e828bf76c144722e"
  },
  {
    "id": "holdout_v2_int_04",
    "goal": "theorem holdout_v2_int_04 : Int.fib_add_one (n : ℤ) : Int.fib (n + 1) = Int.fib (n + 2) - Int.fib n",
    "expectedAnyOf": [
      "Int.fib_add_one"
    ],
    "domain": "Int",
    "goalFingerprint": "55382c2b9b86d4db91ee0d19b54b9ae3dfdffcdf079b1cff91c13be0431b6ef9",
    "sampleHash": "03ac7bc286b0b4aa7cec6e5f2b4b72cffa7e22fbfd1214e8a36d61c5939bf09b"
  },
  {
    "id": "holdout_v2_int_05",
    "goal": "theorem holdout_v2_int_05 : Int.zpow_pred_clog_lt_self {R : Type u_1} [Semifield R] [LinearOrder R] [IsStrictOrderedRing R] [FloorSemiring R]",
    "expectedAnyOf": [
      "Int.zpow_pred_clog_lt_self"
    ],
    "domain": "Int",
    "goalFingerprint": "1ffecffb3ca711cc92ea5f3d67cfb41ce615c015cf8c44f0cf740c2831cf12f5",
    "sampleHash": "0406e6719a0d44e139cb123acab06b15ce9c65c547ff422d19476db4b15583ab"
  },
  {
    "id": "holdout_v2_int_06",
    "goal": "theorem holdout_v2_int_06 : Int.bodd_zero : Int.bodd 0 = false",
    "expectedAnyOf": [
      "Int.bodd_zero"
    ],
    "domain": "Int",
    "goalFingerprint": "6cf049854ce034087a25b631e861cd10fa82b1a4b8e08e73a723a823f41d64ca",
    "sampleHash": "042b9e19c985fa5701ab8a1c6492b874012432c734288f083a21d03c67498009"
  },
  {
    "id": "holdout_v2_int_07",
    "goal": "theorem holdout_v2_int_07 : Int.cast_ite {R : Type u} [IntCast R] (P : Prop) [Decidable P] (m n : ℤ) :",
    "expectedAnyOf": [
      "Int.cast_ite"
    ],
    "domain": "Int",
    "goalFingerprint": "1e119fda97b2368a411c244a4b366b527f201fff6b46d7f69bb186bc28d38855",
    "sampleHash": "04abb88648106cae3b6600abd967d55a44755077f3a88f697f53862ee3ec23f3"
  },
  {
    "id": "holdout_v2_int_08",
    "goal": "theorem holdout_v2_int_08 : Int.bitwise_or : Int.bitwise or = Int.lor",
    "expectedAnyOf": [
      "Int.bitwise_or"
    ],
    "domain": "Int",
    "goalFingerprint": "8681e9579ea9e548938b660932ee3c536723fafa3a0dbc7c79e1d2f50e783872",
    "sampleHash": "051c472874f0ac91d766177dda90ba5239d3bebe9330dee091e9af0152e1bf2c"
  },
  {
    "id": "holdout_v2_int_09",
    "goal": "theorem holdout_v2_int_09 : Int.emod_abs (a b : ℤ) : a % |b| = a % b",
    "expectedAnyOf": [
      "Int.emod_abs"
    ],
    "domain": "Int",
    "goalFingerprint": "bb0acd721ca333c061b7a318212e36a4be076ee12614197b8ef40ad699abc3e2",
    "sampleHash": "0699f319eff33a73df754e080d2cd1973848096b785d59c20e1a3e992c24cf23"
  },
  {
    "id": "holdout_v2_int_10",
    "goal": "theorem holdout_v2_int_10 : Int.fermatNumber_eq_fermatNumber_sq_sub_two_mul_fermatNumber_sub_one_sq (n : ℕ) :",
    "expectedAnyOf": [
      "Int.fermatNumber_eq_fermatNumber_sq_sub_two_mul_fermatNumber_sub_one_sq"
    ],
    "domain": "Int",
    "goalFingerprint": "6d970e72e83b41a6a2104be1945e4f86ef23eedcd54a7b3d47ac3d00c29e8ec9",
    "sampleHash": "06ad4b02344ab381057a66c0704c7bd2884ca8dfa03a15b6b14e8255fac679f7"
  },
  {
    "id": "holdout_v2_int_11",
    "goal": "theorem holdout_v2_int_11 : Int.csSup_of_not_bddAbove {s : Set ℤ} (h : ¬BddAbove s) : sSup s = 0",
    "expectedAnyOf": [
      "Int.csSup_of_not_bddAbove"
    ],
    "domain": "Int",
    "goalFingerprint": "c35ea4a30a2f72203f52bb99a6520c632035eb36d975cb64c798fbf79bfeddc5",
    "sampleHash": "06fb9932cf4860e9421dbd90a78aee53c60b7ef8569fa0974a38f34601455f9f"
  },
  {
    "id": "holdout_v2_int_12",
    "goal": "theorem holdout_v2_int_12 : Int.csInf_empty : sInf ∅ = 0",
    "expectedAnyOf": [
      "Int.csInf_empty"
    ],
    "domain": "Int",
    "goalFingerprint": "b4482eebb85e3f17994510291e123e86c76bfcc3c2cd0b80ff82f13dfb26a646",
    "sampleHash": "0826e848d3519d7e1a7c26030c0fb08ec248e3cd0ad0e3384e78c33e824506a5"
  },
  {
    "id": "holdout_v2_int_13",
    "goal": "theorem holdout_v2_int_13 : Int.bit_zero : Int.bit false 0 = 0",
    "expectedAnyOf": [
      "Int.bit_zero"
    ],
    "domain": "Int",
    "goalFingerprint": "faf3a28bc471df4d9e7989d4984002530c218a92e6ccc51c1bd888df8da918b4",
    "sampleHash": "08ad68fac0c915d721b16234149285b3b45cbf61753641c0b5db17775b0fd135"
  },
  {
    "id": "holdout_v2_int_14",
    "goal": "theorem holdout_v2_int_14 : Int.floorRing_ceil_eq : @FloorRing.ceil = @Int.ceil",
    "expectedAnyOf": [
      "Int.floorRing_ceil_eq"
    ],
    "domain": "Int",
    "goalFingerprint": "5317ed1f0baf7e1dee23b60367dc09b052ec557d347e31ec388684831431595b",
    "sampleHash": "0a15bb4fa70192df0830d1de18d202154ddfb40a62ce4dd64f7bfe6979447e61"
  },
  {
    "id": "holdout_v2_int_15",
    "goal": "theorem holdout_v2_int_15 : Int.log_zpow {R : Type u_1} [Semifield R] [LinearOrder R] [IsStrictOrderedRing R] [FloorSemiring R] {b : ℕ}",
    "expectedAnyOf": [
      "Int.log_zpow"
    ],
    "domain": "Int",
    "goalFingerprint": "90c3aeaf031e360dce6669b1ada251a00ddd374ad674891214cbae6448dc505c",
    "sampleHash": "0a28db45b4ba1731376fb619128416f1bed0ebe2a6a39129cd1ff966278e670b"
  },
  {
    "id": "holdout_v2_algebra_01",
    "goal": "theorem holdout_v2_algebra_01 : List.length_pos_of_prod_ne_one {M : Type u_4} [Monoid M] (L : List M) (h : L.prod ≠ 1) : 0 < L.length",
    "expectedAnyOf": [
      "List.length_pos_of_prod_ne_one"
    ],
    "domain": "Algebra",
    "goalFingerprint": "9154bc3d1b92d9169102614ff0a487729d0397c4d812b8c21c544f6bf2e9f14c",
    "sampleHash": "0002d3319cbea09da0d0b340f1dea51c1efe6027bcb612dd619728fbb02d72ba"
  },
  {
    "id": "holdout_v2_algebra_02",
    "goal": "theorem holdout_v2_algebra_02 : MvPolynomial.X_divMonomial {σ : Type u_1} {R : Type u_2} [CommSemiring R] (i : σ) :",
    "expectedAnyOf": [
      "MvPolynomial.X_divMonomial"
    ],
    "domain": "Algebra",
    "goalFingerprint": "1f41c72af64d9c1f375e6a2ab8d607d8fd17a6444681a0130d7f7789b5b995d5",
    "sampleHash": "0003313808f2439e734dcaad97089ab2151a37855108b859e2817c2fab7e9954"
  },
  {
    "id": "holdout_v2_algebra_03",
    "goal": "theorem holdout_v2_algebra_03 : Finset.coe_inv {α : Type u_2} [DecidableEq α] [InvolutiveInv α] (s : Finset α) : ↑s⁻¹ = (↑s)⁻¹",
    "expectedAnyOf": [
      "Finset.coe_inv"
    ],
    "domain": "Algebra",
    "goalFingerprint": "e155a6b15663b0d456f80605e39dac96b660eaf379eb3747f978590db47c1a53",
    "sampleHash": "000702497eea1782abd302e3b8204da4571497734b4adf448705b4c32ea90e06"
  },
  {
    "id": "holdout_v2_algebra_04",
    "goal": "theorem holdout_v2_algebra_04 : Polynomial.prod_X_sub_C_coeff_card_pred {R : Type u} {ι : Type w} [CommRing R] (s : Finset ι) (f : ι → R)",
    "expectedAnyOf": [
      "Polynomial.prod_X_sub_C_coeff_card_pred"
    ],
    "domain": "Algebra",
    "goalFingerprint": "c80979b8c836c2b58d92b1b9519230ea08a35f81066bf2a7bf0b1ab769077d92",
    "sampleHash": "0008affc3813903ca9f7633ab59e2a275ee26035a54ffd9cfd23fda3b4fcd557"
  },
  {
    "id": "holdout_v2_algebra_05",
    "goal": "theorem holdout_v2_algebra_05 : ArchimedeanClass.stdPart_div {K : Type u_1} [LinearOrder K] [Field K] [IsOrderedRing K] {x y : K}",
    "expectedAnyOf": [
      "ArchimedeanClass.stdPart_div"
    ],
    "domain": "Algebra",
    "goalFingerprint": "2e6142de782003f60d65b4490dbe33547c52a8f1aa0e5f6e421e46e508897427",
    "sampleHash": "000b9bab8b710490cc9345dd814aa77a02de003eb512dc4d62e8d8a869108a9c"
  },
  {
    "id": "holdout_v2_algebra_06",
    "goal": "theorem holdout_v2_algebra_06 : Submonoid.saturation_sSup {M : Type u_1} [MulOneClass M] {f : Set (Submonoid M)} :",
    "expectedAnyOf": [
      "Submonoid.saturation_sSup"
    ],
    "domain": "Algebra",
    "goalFingerprint": "05b24ff60d3ff22805b7f6bff54ec0a36175934fde046df2ddc84ddbf85a3208",
    "sampleHash": "000d10ec0f5893b9e2786949a695dba8fed689b16ed4d5d1fa4cbe761fcaa0a3"
  },
  {
    "id": "holdout_v2_algebra_07",
    "goal": "theorem holdout_v2_algebra_07 : AddConstMapClass.map_int_add' {F : Type u_1} {G : Type u_2} {H : Type u_3} [FunLike F G H] {b : H}",
    "expectedAnyOf": [
      "AddConstMapClass.map_int_add'"
    ],
    "domain": "Algebra",
    "goalFingerprint": "e747ed85959eb7e68e9b2615b61e2fca51a8f78491667c637a5d7965aaf5998c",
    "sampleHash": "0011f82de22bb4c248534d00239c812f178652084175f45acae346e9a7dcc1f5"
  },
  {
    "id": "holdout_v2_algebra_08",
    "goal": "theorem holdout_v2_algebra_08 : Units.inv_mul_le_one {M : Type u_1} [Monoid M] [LE M] [MulLeftMono M] (u : Mˣ) {a : M} : ↑u⁻¹ * a ≤ 1 ↔ a ≤ ↑u",
    "expectedAnyOf": [
      "Units.inv_mul_le_one"
    ],
    "domain": "Algebra",
    "goalFingerprint": "a349f9cc8f13ec3e6225b38ada41528ce427d6651a4ecde54b8ee6191e79098b",
    "sampleHash": "001a345ad47404f748f4f107cd06dc265fd7950bbe92141fcb52a3b8ccfa6aeb"
  },
  {
    "id": "holdout_v2_algebra_09",
    "goal": "theorem holdout_v2_algebra_09 : PUnit.norm_unit_eq {x : PUnit.{u_1 + 1}} : normUnit x = 1",
    "expectedAnyOf": [
      "PUnit.norm_unit_eq"
    ],
    "domain": "Algebra",
    "goalFingerprint": "15e35c97a3fe1ff6ee07c03bbd7c5f3ec57b94de6330e7224fcef063d2b6fba1",
    "sampleHash": "001dd31ae4dff85066ffdce14ab574bce43f19a314602edad8eaad169a0e3b5c"
  },
  {
    "id": "holdout_v2_algebra_10",
    "goal": "theorem holdout_v2_algebra_10 : MvPolynomial.vars_monomial {R : Type u} {σ : Type u_1} {r : R} {s : σ →₀ ℕ} [CommSemiring R] (h : r ≠ 0) :",
    "expectedAnyOf": [
      "MvPolynomial.vars_monomial"
    ],
    "domain": "Algebra",
    "goalFingerprint": "01279178740382be687745a9b4342245021ffd1e286ae8017fe0fec09e4885f0",
    "sampleHash": "0021d31e4b712fe0d6ec21780392f036e2152a95397df7d1ac7451481180325c"
  },
  {
    "id": "holdout_v2_algebra_11",
    "goal": "theorem holdout_v2_algebra_11 : Subgroup.coe_inf {G : Type u_1} [Group G] (p p' : Subgroup G) : ↑(p ⊓ p') = ↑p ∩ ↑p'",
    "expectedAnyOf": [
      "Subgroup.coe_inf"
    ],
    "domain": "Algebra",
    "goalFingerprint": "0c6f06059c4eec46724145b353170118cc58556c20fcffe0059f89078c4b366c",
    "sampleHash": "0023549f359fa8707b61dc5f270883400a0bd557fa8f94497d4123fe23fb8e90"
  },
  {
    "id": "holdout_v2_algebra_12",
    "goal": "theorem holdout_v2_algebra_12 : Subgroup.unop_closure {G : Type u_2} [Group G] (s : Set Gᵐᵒᵖ) :",
    "expectedAnyOf": [
      "Subgroup.unop_closure"
    ],
    "domain": "Algebra",
    "goalFingerprint": "77b6565683046f0fb5267c3f6f647ee64bf452e8f2e436a39a496681bf41b477",
    "sampleHash": "002779a7a188529acf6a2316d666ca92cbdadd227333a232546f28c4ce7736a1"
  },
  {
    "id": "holdout_v2_algebra_13",
    "goal": "theorem holdout_v2_algebra_13 : LieSubmodule.mem_normalizer {R : Type u_1} {L : Type u_2} {M : Type u_3} [CommRing R] [LieRing L]",
    "expectedAnyOf": [
      "LieSubmodule.mem_normalizer"
    ],
    "domain": "Algebra",
    "goalFingerprint": "c1692ddd81fbdd7170d03fc71bd1885c39aa3fb85bfa374280ae4a48fb93de68",
    "sampleHash": "002d295704ca066af3c14934ff251cc082f68e70e05f02feda61baba915aec08"
  },
  {
    "id": "holdout_v2_algebra_14",
    "goal": "theorem holdout_v2_algebra_14 : LieDerivation.iterate_apply_lie' {R : Type u_1} {L : Type u_2} [CommRing R] [LieRing L] [LieAlgebra R L]",
    "expectedAnyOf": [
      "LieDerivation.iterate_apply_lie'"
    ],
    "domain": "Algebra",
    "goalFingerprint": "f7c61c39781ff7e63c8654d694ebe735057d16807fc019f9ac82e1c214b9d313",
    "sampleHash": "0033292ec4ad3ca5fe9e8b8e50c40aa13a2f0ea4b9b142a7bc08bfbfe45d4ab6"
  },
  {
    "id": "holdout_v2_algebra_15",
    "goal": "theorem holdout_v2_algebra_15 : Polynomial.map_mod_divByMonic {R : Type u} {S : Type v} [Ring R] {p q : Polynomial R} [Ring S] (f : R →+* S)",
    "expectedAnyOf": [
      "Polynomial.map_mod_divByMonic"
    ],
    "domain": "Algebra",
    "goalFingerprint": "415d0905fb6b0ea027126edac5194fed08d17915707e776bd1c90e41926c6840",
    "sampleHash": "003bafdc844ddfbceac7aac45f9dbbed701df07d427aff950a6339599b420868"
  },
  {
    "id": "holdout_v2_algebra_16",
    "goal": "theorem holdout_v2_algebra_16 : NonemptyInterval.length_neg {α : Type u_2} [AddCommGroup α] [PartialOrder α] [IsOrderedAddMonoid α]",
    "expectedAnyOf": [
      "NonemptyInterval.length_neg"
    ],
    "domain": "Algebra",
    "goalFingerprint": "38d40a1c88e2831ae89b7b91f07fd4c90fd561aadcaef2d5af14fffd971e5277",
    "sampleHash": "00411e5538fa838b8b4cae1befa532414f05af8446d98a5fe7a00396d89a2197"
  },
  {
    "id": "holdout_v2_algebra_17",
    "goal": "theorem holdout_v2_algebra_17 : Subgroup.iInf_normalizer_le_normalizer_iSup {G : Type u_2} [Group G] {ι : Sort u_5} (H : ι → Subgroup G) :",
    "expectedAnyOf": [
      "Subgroup.iInf_normalizer_le_normalizer_iSup"
    ],
    "domain": "Algebra",
    "goalFingerprint": "54a603a678639edf946d080f77134b0ef848ac8be72935379534f40320e94fc2",
    "sampleHash": "0045e62b8d493fa7fb52a4324c374dd2f9569ba81d4ce60778b171569e24406e"
  },
  {
    "id": "holdout_v2_algebra_18",
    "goal": "theorem holdout_v2_algebra_18 : Submodule.add_mem_iff_left {R : Type u} {M : Type v} [Ring R] [AddCommGroup M] {module_M : Module R M}",
    "expectedAnyOf": [
      "Submodule.add_mem_iff_left"
    ],
    "domain": "Algebra",
    "goalFingerprint": "fc626a4230b86756c0500bab90d809284b69bccc09948795a1518b444583500b",
    "sampleHash": "004939d06ec0ae7bf3b659b9bb90cda8844c256800e42e799664f59bb864b944"
  },
  {
    "id": "holdout_v2_algebra_19",
    "goal": "theorem holdout_v2_algebra_19 : Function.Injective.leftDistribClass {R : Type u_1} {S : Type u_2} (f : S → R) (hf : Function.Injective f)",
    "expectedAnyOf": [
      "Function.Injective.leftDistribClass"
    ],
    "domain": "Algebra",
    "goalFingerprint": "37dea5d048eb39e185065b326c7e9d9f5906bd30d1342939656835ee09ad5521",
    "sampleHash": "004ffdb13129e3fa54d0622d1b22879948118f4573d0c85f146d99e9f924a50c"
  },
  {
    "id": "holdout_v2_algebra_20",
    "goal": "theorem holdout_v2_algebra_20 : Submonoid.le_comap_mulSingle_pi {ι : Type u_4} {M : ι → Type u_5} [(i : ι) → MulOneClass (M i)]",
    "expectedAnyOf": [
      "Submonoid.le_comap_mulSingle_pi"
    ],
    "domain": "Algebra",
    "goalFingerprint": "7e54fc6880fcdfa6cb3592ca69333abe3077dc9e02e9666d98e55408ff94d4b7",
    "sampleHash": "0058fce87bef587384eacab3a699612746ab9b04bad559e63ad135ec40861523"
  },
  {
    "id": "holdout_v2_order_01",
    "goal": "theorem holdout_v2_order_01 : StrictMono.id_le {β : Type u_2} [LinearOrder β] [WellFoundedLT β] {f : β → β} (hf : StrictMono f) : id ≤ f",
    "expectedAnyOf": [
      "StrictMono.id_le"
    ],
    "domain": "Order",
    "goalFingerprint": "83b0cb2a172db79d3a86088d5d5b13d68079a3c37b998124b57182bf7b411b92",
    "sampleHash": "0021c751da920e14b82327c01d41cc92c2a1bd963dd9f552158266208b4d1c32"
  },
  {
    "id": "holdout_v2_order_02",
    "goal": "theorem holdout_v2_order_02 : Set.Ico_eq_empty_iff {α : Type u_1} [Preorder α] {a b : α} : Set.Ico a b = ∅ ↔ ¬a < b",
    "expectedAnyOf": [
      "Set.Ico_eq_empty_iff"
    ],
    "domain": "Order",
    "goalFingerprint": "414554854e0e3f2f757ffb31732877bfcb0f5abef89b203d48d113083d3d1f68",
    "sampleHash": "002d3c041f71bf120bdbb0536ec58c69001a343689d3e13089365fa51aeb0f55"
  },
  {
    "id": "holdout_v2_order_03",
    "goal": "theorem holdout_v2_order_03 : Monotone.Iic {α : Type u_1} {β : Type u_2} [Preorder α] [Preorder β] {f : α → β} (hf : Monotone f) :",
    "expectedAnyOf": [
      "Monotone.Iic"
    ],
    "domain": "Order",
    "goalFingerprint": "e0179fe95565bb24e7884d2dea395f7bd4a5cc2b8285f374eaeba564bead1e43",
    "sampleHash": "004938a2b67429b097daa03617af9b8853f11831828a0fcc0a52451ac4e3198c"
  },
  {
    "id": "holdout_v2_order_04",
    "goal": "theorem holdout_v2_order_04 : Filter.div_mem_div {α : Type u_2} [Div α] {f g : Filter α} {s t : Set α} : s ∈ f → t ∈ g → s / t ∈ f / g",
    "expectedAnyOf": [
      "Filter.div_mem_div"
    ],
    "domain": "Order",
    "goalFingerprint": "75dcef5afe35faab53643dbfe5281c9756e7e1b71889f7ca563e9b0a7fa0d746",
    "sampleHash": "005df2859854d1f5eddeeec405683587c83ec0b50f5dd727327c3af143adaef5"
  },
  {
    "id": "holdout_v2_order_05",
    "goal": "theorem holdout_v2_order_05 : Filter.lift_mono {α : Type u_1} {β : Type u_2} {f₁ f₂ : Filter α} {g₁ g₂ : Set α → Filter β} (hf : f₁ ≤ f₂)",
    "expectedAnyOf": [
      "Filter.lift_mono"
    ],
    "domain": "Order",
    "goalFingerprint": "2c64842f9762630ab08ffcb810e2bcc8cd067d578f47fd00ad968139e945ac3a",
    "sampleHash": "00623ae60e5e5da5e6e9e19ff81d5cea3500f3ff5e20e571f474c59153975037"
  },
  {
    "id": "holdout_v2_order_06",
    "goal": "theorem holdout_v2_order_06 : Filter.comap_inf_principal_range {α : Type u_1} {β : Type u_2} {g : Filter β} {m : α → β} :",
    "expectedAnyOf": [
      "Filter.comap_inf_principal_range"
    ],
    "domain": "Order",
    "goalFingerprint": "9587759f01db1e8e6303b3cc837f8a60bdafb19c8b7f16a3c8ee7559b2db0a47",
    "sampleHash": "00691b812575e7215c9d887a8fd5f1e4b914f76e8489c5fc05199c7bb0aa3a1a"
  },
  {
    "id": "holdout_v2_order_07",
    "goal": "theorem holdout_v2_order_07 : Filter.comap_eq_lift' {α : Type u_1} {β : Type u_2} {f : Filter β} {m : α → β} :",
    "expectedAnyOf": [
      "Filter.comap_eq_lift'"
    ],
    "domain": "Order",
    "goalFingerprint": "87e1010b05e21937466ea0af2fd415132d2de8a909528d8cc20f750444988c50",
    "sampleHash": "00756b77871c2e3bd24093cf0a4fc7af7f040995a48dfc0117aa2319940073c8"
  },
  {
    "id": "holdout_v2_order_08",
    "goal": "theorem holdout_v2_order_08 : Set.pi_univ_Ioc_update_right {ι : Type u_1} {α : ι → Type u_2} [(i : ι) → Preorder (α i)] [DecidableEq ι]",
    "expectedAnyOf": [
      "Set.pi_univ_Ioc_update_right"
    ],
    "domain": "Order",
    "goalFingerprint": "4aa966ce94fcd39d6101e3f01b549dbb44d5510aad3c2404fab10c731b2704cf",
    "sampleHash": "00772a779796d0ae8cb9b3da57b043542a37fcf2adbfbd6bc73ff5f247d42423"
  },
  {
    "id": "holdout_v2_order_09",
    "goal": "theorem holdout_v2_order_09 : Nat.iInf_lt_succ' {α : Type u_1} [CompleteLattice α] (u : ℕ → α) (n : ℕ) :",
    "expectedAnyOf": [
      "Nat.iInf_lt_succ'"
    ],
    "domain": "Order",
    "goalFingerprint": "25f677263b5a0da9bd2ec1454e69186287fab2a55ce00a0756d5e6a6a9959da9",
    "sampleHash": "007c203cd6eb795058500751c791a2249a6b46168373271d35a1963ed39447a9"
  },
  {
    "id": "holdout_v2_finset_01",
    "goal": "theorem holdout_v2_finset_01 : Finset.sym_succ {α : Type u_1} {s : Finset α} [DecidableEq α] {n : ℕ} :",
    "expectedAnyOf": [
      "Finset.sym_succ"
    ],
    "domain": "Finset",
    "goalFingerprint": "8fa4434f2b0f92c3db043eb7a8a8759f69e97871317eb0badfea3f61d2809e34",
    "sampleHash": "001967602ca79f0d6fcecd23460504594f1acffc5a2740412c7b1e1078dd9fba"
  },
  {
    "id": "holdout_v2_finset_02",
    "goal": "theorem holdout_v2_finset_02 : Finset.forall_disjSups_iff {α : Type u_2} [DecidableEq α] [SemilatticeSup α] [OrderBot α] [DecidableRel Disjoint]",
    "expectedAnyOf": [
      "Finset.forall_disjSups_iff"
    ],
    "domain": "Finset",
    "goalFingerprint": "940dcbaf6073fefc72ece903129daf7d6aabb04cc249ea239cbf536da9eb55a7",
    "sampleHash": "00296c68551fea2cd8d73b693b5dcb49da44131ddfd41d6d68b1cbf9fddf8ac8"
  },
  {
    "id": "holdout_v2_finset_03",
    "goal": "theorem holdout_v2_finset_03 : Finset.subset_powersetCard_univ_iff {α : Type u_1} [Fintype α] {𝒜 : Finset (Finset α)} {r : ℕ} :",
    "expectedAnyOf": [
      "Finset.subset_powersetCard_univ_iff"
    ],
    "domain": "Finset",
    "goalFingerprint": "ba926a8f9e9ef6ee43abea8e1338953a95fd71dc422986c734d039a5d623fd57",
    "sampleHash": "00eeeeb3135edf52dd60ba992c649a30db3907ac3103866988e7e2c48c785ff2"
  },
  {
    "id": "holdout_v2_finset_04",
    "goal": "theorem holdout_v2_finset_04 : Finset.disjSups_empty_left {α : Type u_2} [DecidableEq α] [SemilatticeSup α] [OrderBot α] [DecidableRel Disjoint]",
    "expectedAnyOf": [
      "Finset.disjSups_empty_left"
    ],
    "domain": "Finset",
    "goalFingerprint": "c6dd0e524b48623e0e6dba29fe95bd9bb89e7fd312f2abceff8861d997e58ccd",
    "sampleHash": "0103fcec6ef6688df644ba41e3f7f3e8723a1205909e8ca93cc84e328575d177"
  },
  {
    "id": "holdout_v2_finset_05",
    "goal": "theorem holdout_v2_finset_05 : Finset.nonempty_range_add_one {n : ℕ} : (Finset.range (n + 1)).Nonempty",
    "expectedAnyOf": [
      "Finset.nonempty_range_add_one"
    ],
    "domain": "Finset",
    "goalFingerprint": "0fb731524cde4e3b4caba15806ae90ecffcb4be536fa9a8d725eb073457505ef",
    "sampleHash": "011eb2da83079850e11ae0ce6e798cbaf2e4c4d6a60d309e41494dea3020ab3e"
  },
  {
    "id": "holdout_v2_finset_06",
    "goal": "theorem holdout_v2_finset_06 : Finset.fold_hom {α : Type u_1} {β : Type u_2} {γ : Type u_3} {op : β → β → β} [hc : Std.Commutative op]",
    "expectedAnyOf": [
      "Finset.fold_hom"
    ],
    "domain": "Finset",
    "goalFingerprint": "b73f99b4499384a8138d6929cc40c6926bbbc04d174fc2776512b42b6380b88b",
    "sampleHash": "0133dceab380a5e1464ebdcf71e3e82a3a51680f37a63415c0b412c5460f2c90"
  },
  {
    "id": "holdout_v2_finset_07",
    "goal": "theorem holdout_v2_finset_07 : Finset.card_le_of_interleaved {α : Type u_2} [LinearOrder α] {s t : Finset α}",
    "expectedAnyOf": [
      "Finset.card_le_of_interleaved"
    ],
    "domain": "Finset",
    "goalFingerprint": "5af844b3af6ff46cd270bb2bfce3b199fe774280145b18dcf52c28f49f9fbc1b",
    "sampleHash": "015e13cfd4cfc12df6be37adcfc92c4e021a5712fc4e44702c5788ab7536994f"
  },
  {
    "id": "holdout_v2_finset_08",
    "goal": "theorem holdout_v2_finset_08 : Finset.min_le_of_eq {α : Type u_2} [LinearOrder α] {s : Finset α} {a b : α} (h₁ : b ∈ s) (h₂ : s.min = ↑a) : a ≤ b",
    "expectedAnyOf": [
      "Finset.min_le_of_eq"
    ],
    "domain": "Finset",
    "goalFingerprint": "c815b0514ab6426d6ebf574166a24a2dde3f37f6b1a2e70ea5a259fb28002c04",
    "sampleHash": "017f4585a4929d31d1d1e913da5cd0f169843e739601f867de399c01fbb41bc8"
  },
  {
    "id": "holdout_v2_finset_09",
    "goal": "theorem holdout_v2_finset_09 : Finset.sym_univ {α : Type u_1} [DecidableEq α] [Fintype α] (n : ℕ) : Finset.univ.sym n = Finset.univ",
    "expectedAnyOf": [
      "Finset.sym_univ"
    ],
    "domain": "Finset",
    "goalFingerprint": "fc17a2886ccb660fce48267f8d5544643de6e29f098330b39356877e054a5ebe",
    "sampleHash": "01a23096064175ac9e191d08e72c4d153c478351114a08007363cd9588f3d048"
  },
  {
    "id": "holdout_v2_set_01",
    "goal": "theorem holdout_v2_set_01 : Set.univ_prod {α : Type u_1} {β : Type u_2} {t : Set β} : Set.univ ×ˢ t = Prod.snd ⁻¹' t",
    "expectedAnyOf": [
      "Set.univ_prod"
    ],
    "domain": "Set",
    "goalFingerprint": "4951933141cdcbb3ef92940bb7286fec2a10ced377f8456e1ddfc80257707f3c",
    "sampleHash": "001661674c582da3a15eb1c54d7d44d3b1e8f50a4dc651f71a87e562cfd6c52a"
  },
  {
    "id": "holdout_v2_set_02",
    "goal": "theorem holdout_v2_set_02 : Set.union_univ {α : Type u} (s : Set α) : s ∪ Set.univ = Set.univ",
    "expectedAnyOf": [
      "Set.union_univ"
    ],
    "domain": "Set",
    "goalFingerprint": "eab0272802d9c079b67efe3ada25aa3b212a562bd31cfa751ba7aec94dedf883",
    "sampleHash": "0032b33882bfb6ae64a3cb08fd0d74b69c5ee4c767009ba58096da805ccf694a"
  },
  {
    "id": "holdout_v2_set_03",
    "goal": "theorem holdout_v2_set_03 : Set.ncard_le_ncard_insert {α : Type u_1} (a : α) (s : Set α) : s.ncard ≤ (insert a s).ncard",
    "expectedAnyOf": [
      "Set.ncard_le_ncard_insert"
    ],
    "domain": "Set",
    "goalFingerprint": "2ad88f0e4c71dbb278c2688078b5e78cbcf11343ad7e42b61eb84bcfa73428a1",
    "sampleHash": "0045c2acf1fcbd313624537611f91985995a19ebe02d6e822fbc27c4708d1b94"
  },
  {
    "id": "holdout_v2_set_04",
    "goal": "theorem holdout_v2_set_04 : Set.lt_eq_ssubset {α : Type u} : (fun x1 x2 => x1 ⊂ x2) = fun x1 x2 => x1 ⊂ x2",
    "expectedAnyOf": [
      "Set.lt_eq_ssubset"
    ],
    "domain": "Set",
    "goalFingerprint": "a58f4819e54ded95b989ef0b3813f6d9535457853e0e0e05c948a09034cc6283",
    "sampleHash": "0072807d7e466320141ac6ca427e08e8cb0e03a9ab2a783c1f8c90c38aff36d0"
  },
  {
    "id": "holdout_v2_set_05",
    "goal": "theorem holdout_v2_set_05 : Set.strictAntiOn_iff_strictAnti {α : Type u} {β : Type v} {s : Set α} [Preorder α] [Preorder β] {f : α → β} :",
    "expectedAnyOf": [
      "Set.strictAntiOn_iff_strictAnti"
    ],
    "domain": "Set",
    "goalFingerprint": "4a68be6f1f1d637f6d6e71d8000446e74ec055e29c08f35a2e8ca34f7bedbdc5",
    "sampleHash": "0075a4e10a25ca1e76c4621d1080312a97d94961e46bd5f2ffda7f6a6cc25914"
  },
  {
    "id": "holdout_v2_set_06",
    "goal": "theorem holdout_v2_set_06 : Set.biUnion_sdiff_biUnion_subset {α : Type u_1} {β : Type u_2} (t : α → Set β) (s₁ s₂ : Set α) :",
    "expectedAnyOf": [
      "Set.biUnion_sdiff_biUnion_subset"
    ],
    "domain": "Set",
    "goalFingerprint": "3529d41cdc65c6e4ab29949fff756f505591f3da60aa919fd41e53eeb55dea83",
    "sampleHash": "007b5ef47c74475cec086163d37a349dbb1a88e1b932bea5054615409f0eadd3"
  },
  {
    "id": "holdout_v2_set_07",
    "goal": "theorem holdout_v2_set_07 : Finset.finite_toSet_toFinset {α : Type u} (s : Finset α) : ⋯.toFinset = s",
    "expectedAnyOf": [
      "Finset.finite_toSet_toFinset"
    ],
    "domain": "Set",
    "goalFingerprint": "d858bce4412759b64016e2fc20ddbc6155f4f2b3d38a751791a1cba1901bf200",
    "sampleHash": "00a79e2243675c1e1347caf832bc80bf6e05067dfb718726b3cf9bca0ea0d75e"
  },
  {
    "id": "holdout_v2_set_08",
    "goal": "theorem holdout_v2_set_08 : Set.iUnion_image_sup_right {α : Type u_2} [SemilatticeSup α] (s t : Set α) :",
    "expectedAnyOf": [
      "Set.iUnion_image_sup_right"
    ],
    "domain": "Set",
    "goalFingerprint": "c2e4061af9d59889b7876b3587ea31b2014e06182f0f522c4b565fd6c6d92af4",
    "sampleHash": "00b783e05b0c09057a509ca88db133df08441bd9a39de7f150ee3cb9e3c3da52"
  },
  {
    "id": "holdout_v2_set_09",
    "goal": "theorem holdout_v2_set_09 : Set.inter_iUnion {β : Type u_2} {ι : Sort u_5} (s : Set β) (t : ι → Set β) : s ∩ ⋃ i, t i = ⋃ i, s ∩ t i",
    "expectedAnyOf": [
      "Set.inter_iUnion"
    ],
    "domain": "Set",
    "goalFingerprint": "a45fc1775a760e7dd341e80ba352f72b05d95aac02592bc670f3c20f0b0a6cea",
    "sampleHash": "00c030da05a26c8a8690b73ec2b5191466b0b09745d19e14ebd7087eae48ea5f"
  },
  {
    "id": "holdout_v2_list_01",
    "goal": "theorem holdout_v2_list_01 : List.inter_subset_left {α : Type u_1} [DecidableEq α] {l₁ l₂ : List α} : l₁ ∩ l₂ ⊆ l₁",
    "expectedAnyOf": [
      "List.inter_subset_left"
    ],
    "domain": "List",
    "goalFingerprint": "dfd422d5f89a63eb1b4c7fcf062268085e63e2d5286833456d4573cc51574e77",
    "sampleHash": "00561720df7384d72339d987a49c2dcbe280645b65c987dd9820f7c3f69bca49"
  },
  {
    "id": "holdout_v2_list_02",
    "goal": "theorem holdout_v2_list_02 : List.getLast_flatten_eq_getLast_getLast {α : Type u_1} {l : List (List α)} (hl : l.flatten ≠ [])",
    "expectedAnyOf": [
      "List.getLast_flatten_eq_getLast_getLast"
    ],
    "domain": "List",
    "goalFingerprint": "dcd5eefef7283c8fabb07d7dc0f2fcb951281e0a51b8439e63e26fb4b401b23e",
    "sampleHash": "00b41a560ee1e098a9da8e78de03d49aa5b7b9fef23cf77f20dea2d0d31d3576"
  },
  {
    "id": "holdout_v2_list_03",
    "goal": "theorem holdout_v2_list_03 : List.not_nodup_cons_of_mem {α : Type u} {l : List α} {a : α} : a ∈ l → ¬(a :: l).Nodup",
    "expectedAnyOf": [
      "List.not_nodup_cons_of_mem"
    ],
    "domain": "List",
    "goalFingerprint": "35a38f3dfb65aed70835f08292380b5ebb849b216363b6d274e5324f8f5c0968",
    "sampleHash": "00e32da5c9709be4aec893210314b5de0e0dbe93cb3000b045690b6b5d3dc873"
  },
  {
    "id": "holdout_v2_list_04",
    "goal": "theorem holdout_v2_list_04 : List.reverse_rotate {α : Type u} (l : List α) (n : ℕ) :",
    "expectedAnyOf": [
      "List.reverse_rotate"
    ],
    "domain": "List",
    "goalFingerprint": "f4319fd31194aa5e25949ad3ad3444f02e37ba567abb7230db7536c8e7e1eab3",
    "sampleHash": "010f7dd116ee9cfee52e101b0a02eb0bf2d78998ff13391e5cf0b76667742669"
  },
  {
    "id": "holdout_v2_list_05",
    "goal": "theorem holdout_v2_list_05 : List.Lex.ne_iff {α : Type u} {l₁ l₂ : List α} (H : l₁.length ≤ l₂.length) :",
    "expectedAnyOf": [
      "List.Lex.ne_iff"
    ],
    "domain": "List",
    "goalFingerprint": "0e0af9cb27a7e209054c8f8ce4d27353e408efdf524f3339da8d03d5b929d517",
    "sampleHash": "011b830c4268db12d445d9425eb279c66639dc1820b89e7b57ddca4edcf185ad"
  },
  {
    "id": "holdout_v2_list_06",
    "goal": "theorem holdout_v2_list_06 : List.orderedInsert_cons_of_le {α : Type u_1} (r : α → α → Prop) [DecidableRel r] {a b : α} (l : List α)",
    "expectedAnyOf": [
      "List.orderedInsert_cons_of_le"
    ],
    "domain": "List",
    "goalFingerprint": "24fc6787e72fba2f94e03a8aaa5a8696a1709dec3c98c7825dc6092469487b52",
    "sampleHash": "013f5da46ecddf0475579e34473e91bd6abd4f2d5042c52fdfcd1102a4c60049"
  },
  {
    "id": "holdout_v2_list_07",
    "goal": "theorem holdout_v2_list_07 : List.modifyLast_concat {α : Type u_1} (f : α → α) (a : α) (l : List α) : List.modifyLast f (l ++ [a]) = l ++ [f a]",
    "expectedAnyOf": [
      "List.modifyLast_concat"
    ],
    "domain": "List",
    "goalFingerprint": "0b36b7f68f4742f7c09fc3e06b426d9b88ca49ec8fc8b1eb7ae4c0d37d3079e8",
    "sampleHash": "019598ecbf514335cd9009032a337d3f0bfe1feca4872db36052f454ded3b6cc"
  },
  {
    "id": "holdout_v2_list_08",
    "goal": "theorem holdout_v2_list_08 : List.mem_keys_kinsert {α : Type u} {β : α → Type v} [DecidableEq α] {a a' : α} {b' : β a'} {l : List (Sigma β)} :",
    "expectedAnyOf": [
      "List.mem_keys_kinsert"
    ],
    "domain": "List",
    "goalFingerprint": "5718d637e77fc883f7d9f2cb1b8ff284856ab31ecb5940cfa44282a8b2a9978d",
    "sampleHash": "01b8fc047db96c2f8140b37962022a3c25c7eabf9bca072c2255d25cec7573f6"
  },
  {
    "id": "holdout_v2_list_09",
    "goal": "theorem holdout_v2_list_09 : List.subset_singleton_iff {α : Type u} {a : α} {L : List α} : L ⊆ [a] ↔ ∃ n, L = List.replicate n a",
    "expectedAnyOf": [
      "List.subset_singleton_iff"
    ],
    "domain": "List",
    "goalFingerprint": "7d54762daab1b863aa5311b029f0ff19b3241b051dcbd76321060999b99dccac",
    "sampleHash": "01bd41fe4096a95fa0dadd71c8d472c951284ec164c5cf0ff021ba9561da06d7"
  },
  {
    "id": "holdout_v2_function_01",
    "goal": "theorem holdout_v2_function_01 : Equiv.prodCongrLeft_trans_prodComm {α₁ : Type u_9} {β₁ : Type u_11} {β₂ : Type u_12}",
    "expectedAnyOf": [
      "Equiv.prodCongrLeft_trans_prodComm"
    ],
    "domain": "Function",
    "goalFingerprint": "e276fe158e4863dd9b167324e763f6f712fccf2ab863707c3252bb4dba796c1a",
    "sampleHash": "0005c45ed353f95eb3586e7f08cf8806b4c14f1427c6275284093ef4c42cfc8d"
  },
  {
    "id": "holdout_v2_function_02",
    "goal": "theorem holdout_v2_function_02 : Equiv.sumCongr_symm {α : Type u_9} {β : Type u_10} {γ : Type u_11} {δ : Type u_12} (e : α ≃ β)",
    "expectedAnyOf": [
      "Equiv.sumCongr_symm"
    ],
    "domain": "Function",
    "goalFingerprint": "648839637c7d0ce0bccfde6e808f4b4312b0dffa239b36abb5f207d0a7879cbc",
    "sampleHash": "007f336a48c36f59b4b15fe241ab089d9aef692b7cc3d047793d95505048ecdc"
  },
  {
    "id": "holdout_v2_function_03",
    "goal": "theorem holdout_v2_function_03 : Equiv.piCongrSigmaFiber_symm_apply {α : Type u_9} {β : Type u_10} {f : α → β}",
    "expectedAnyOf": [
      "Equiv.piCongrSigmaFiber_symm_apply"
    ],
    "domain": "Function",
    "goalFingerprint": "50ba861cc2a2678dfac92eb122d9be4aa52a5e0ea8d64382123d19403f1e18fb",
    "sampleHash": "00a6b4a611612bd5594cf07cfc56afaf1566ad912b1cb9cfa02ce0103cc4b1b0"
  },
  {
    "id": "holdout_v2_function_04",
    "goal": "theorem holdout_v2_function_04 : Equiv.optionCongr_refl {α : Type u_1} : (Equiv.refl α).optionCongr = Equiv.refl (Option α)",
    "expectedAnyOf": [
      "Equiv.optionCongr_refl"
    ],
    "domain": "Function",
    "goalFingerprint": "5f9ebb439ad2e23491a2cf0dfd0f28bd695a1c0720d830807e2d14e144151fd2",
    "sampleHash": "01b6af6587e0ed8a853589b02dcb20caa49f6571ff7390d0aa8c7c230e260d4a"
  },
  {
    "id": "holdout_v2_function_05",
    "goal": "theorem holdout_v2_function_05 : Equiv.symm_apply_eq {α : Sort u_1} {β : Sort u_2} (e : α ≃ β) {x : β} {y : α} : e.symm x = y ↔ x = e y",
    "expectedAnyOf": [
      "Equiv.symm_apply_eq"
    ],
    "domain": "Function",
    "goalFingerprint": "e915b75a862a9c34e66536f9ba31e86bcd70fcc905e1e3458a8547f12da8f28a",
    "sampleHash": "01cfbf74d1efde4fc4fa9eab03957402cd7813501e8a0b5fa0bf7388b6787991"
  },
  {
    "id": "holdout_v2_function_06",
    "goal": "theorem holdout_v2_function_06 : Equiv.uniqueSigma_symm_apply {α : Type u_10} {β : α → Type u_9} [Unique α] (y : β default) :",
    "expectedAnyOf": [
      "Equiv.uniqueSigma_symm_apply"
    ],
    "domain": "Function",
    "goalFingerprint": "580b39a6803c8ee0d2884217e06a161521b29b2f4edd0b84a4b6048a519da7d9",
    "sampleHash": "0390e8d1d612aae7afd017b0fc8428e75cfe2662b11b49ed1a8b575bfa320a02"
  },
  {
    "id": "holdout_v2_function_07",
    "goal": "theorem holdout_v2_function_07 : Function.update_injective {α : Sort u} {β : α → Sort v} [DecidableEq α] (f : (a : α) → β a) (a' : α) :",
    "expectedAnyOf": [
      "Function.update_injective"
    ],
    "domain": "Function",
    "goalFingerprint": "dd615bcb0cc193eb36f3b0f4a8ee1984caa639602b510138881176a1f4863f3d",
    "sampleHash": "047a659738b0be585e1719dff85dda8abf5a73936ec7ab54a0c9e11e65229aec"
  },
  {
    "id": "holdout_v2_function_08",
    "goal": "theorem holdout_v2_function_08 : Function.Commute.iterate_right {α : Type u} {f g : α → α} (h : Function.Commute f g) (n : ℕ) :",
    "expectedAnyOf": [
      "Function.Commute.iterate_right"
    ],
    "domain": "Function",
    "goalFingerprint": "b1c50ba94d3905611b90e3f2b2fcaa1326ea7f6ef5e3c016634b77b3083216f1",
    "sampleHash": "048246112de991c62ad10ff8b18fe17cca46cdb53785f786b0aa19f1be52447b"
  },
  {
    "id": "holdout_v2_function_09",
    "goal": "theorem holdout_v2_function_09 : Function.Involutive.symm_eq_self_of_involutive {α : Sort u_1} (f : Equiv.Perm α) (h : Function.Involutive ⇑f) :",
    "expectedAnyOf": [
      "Function.Involutive.symm_eq_self_of_involutive"
    ],
    "domain": "Function",
    "goalFingerprint": "44aa7dc29f3ddc320bfc30144cd00a704f1d4c82f587c02e42954d24ce87bc27",
    "sampleHash": "04a7d1f2fe2b7a79689d0b66e3950343b6c2b0fd32123912ea5f3b46e86762de"
  },
  {
    "id": "holdout_v2_relations_01",
    "goal": "theorem holdout_v2_relations_01 : Module.isTrivialRelation_iff_vanishesTrivially {R : Type u_1} {M : Type u_2} [CommRing R]",
    "expectedAnyOf": [
      "Module.isTrivialRelation_iff_vanishesTrivially"
    ],
    "domain": "Relations",
    "goalFingerprint": "bc09592e5878a7b71696c437c82499879b4d3ca455b91f1b1a9fa90dd4626fb6",
    "sampleHash": "01aa8ec1758657c3b0f66023527cfc15d22e4d5f2c76b83405eb4b66a2baeb6a"
  },
  {
    "id": "holdout_v2_relations_02",
    "goal": "theorem holdout_v2_relations_02 : Relation.cutExpand_fibration {α : Type u_1} (r : α → α → Prop) :",
    "expectedAnyOf": [
      "Relation.cutExpand_fibration"
    ],
    "domain": "Relations",
    "goalFingerprint": "fb532b2dd769fa75d15e4b54f3c7789dd00c9ae79624d4f9380a15fe8df916bd",
    "sampleHash": "03e81cf743a6483feb1503b252ad93bf4d875ebf81c7e521758729d15016190b"
  },
  {
    "id": "holdout_v2_relations_03",
    "goal": "theorem holdout_v2_relations_03 : Std.Refl.rel_of_ne_imp {α : Type u_1} {r : α → α → Prop} [Std.Refl r] {x y : α} (hr : x ≠ y → r x y) : r x y",
    "expectedAnyOf": [
      "Std.Refl.rel_of_ne_imp"
    ],
    "domain": "Relations",
    "goalFingerprint": "ce37990988fdca7ee6df6616bb9abb049f8d9e6e5680e57aeb31790e7d310088",
    "sampleHash": "0598c15045cb42d646778c5beaff48a08490fb3caf246fb49d25beec218ecbb2"
  },
  {
    "id": "holdout_v2_relations_04",
    "goal": "theorem holdout_v2_relations_04 : Stream'.WSeq.liftRel_destruct_iff {α : Type u} {β : Type v} {R : α → β → Prop} {s : Stream'.WSeq α}",
    "expectedAnyOf": [
      "Stream'.WSeq.liftRel_destruct_iff"
    ],
    "domain": "Relations",
    "goalFingerprint": "117aa404d6e981113cdd4452bebc197b4ae0643087a4386df403fca1eb30baed",
    "sampleHash": "05e5288a29f4c3d7dcc0e22d7208bf04a8469d0be59a556b75b6ff22232443b0"
  },
  {
    "id": "holdout_v2_relations_05",
    "goal": "theorem holdout_v2_relations_05 : RelEmbedding.inj {α : Type u_1} {β : Type u_2} {r : α → α → Prop} {s : β → β → Prop} (f : r ↪r s) {a b : α} :",
    "expectedAnyOf": [
      "RelEmbedding.inj"
    ],
    "domain": "Relations",
    "goalFingerprint": "2b8b6d5c8d78660e7ae47bd6afb8205a9a67f42f1d70e3f24ec95ff7b9dd1805",
    "sampleHash": "07b1c34953162c2c1e4d785d40fdd1981a5d3a9e5fcf0472bd0add48ce28df20"
  },
  {
    "id": "holdout_v2_relations_06",
    "goal": "theorem holdout_v2_relations_06 : RelHom.coe_fn_injective {α : Type u_1} {β : Type u_2} {r : α → α → Prop} {s : β → β → Prop} :",
    "expectedAnyOf": [
      "RelHom.coe_fn_injective"
    ],
    "domain": "Relations",
    "goalFingerprint": "f188cb14cf6862248e587f2aecf4a6c96310227ae7b479a4c84f35dc908aadf4",
    "sampleHash": "09d9b4da2fdccffd9927f8e9455183137c9a1cda45ecfbd4bc35809c14a2a0cb"
  },
  {
    "id": "holdout_v2_relations_07",
    "goal": "theorem holdout_v2_relations_07 : Stream'.WSeq.liftRel_bind {α : Type u} {β : Type v} {γ : Type w} {δ : Type u_1} (R : α → β → Prop)",
    "expectedAnyOf": [
      "Stream'.WSeq.liftRel_bind"
    ],
    "domain": "Relations",
    "goalFingerprint": "6d100f9165846f6712ab4092ce5b7abbca216e77c6b3f36d7262499661ec7689",
    "sampleHash": "09e288a0c5c0041ec1b8fe8c27dbca03cd908d61d2fe7da1b8b7221718d5b670"
  },
  {
    "id": "holdout_v2_relations_08",
    "goal": "theorem holdout_v2_relations_08 : SimplexCategoryGenRel.IsAdmissible.sortedLT {m : ℕ} {L : List ℕ} (hL : SimplexCategoryGenRel.IsAdmissible m L) :",
    "expectedAnyOf": [
      "SimplexCategoryGenRel.IsAdmissible.sortedLT"
    ],
    "domain": "Relations",
    "goalFingerprint": "012dcdaf5aa3ea5f58bd61b7b00f9c35f6d89757d0aea2cf164b1df49dc5b160",
    "sampleHash": "0ad7b5c24d128916aa751c26183b46711cbb93527fdfa4aa02444721126f8af5"
  },
  {
    "id": "holdout_v2_relations_09",
    "goal": "theorem holdout_v2_relations_09 : RelEmbedding.coe_trans {α : Type u_1} {β : Type u_2} {γ : Type u_3} {r : α → α → Prop}",
    "expectedAnyOf": [
      "RelEmbedding.coe_trans"
    ],
    "domain": "Relations",
    "goalFingerprint": "c1e0232455349f09967c9daa96c04327593d957bdaa7a7ce208b17fffec6e795",
    "sampleHash": "119c185bb21de0ff114973161b1c8727b5e887d3bbe0c2770b9b78ffef7f2926"
  },
  {
    "id": "holdout_v2_relations_10",
    "goal": "theorem holdout_v2_relations_10 : SimplexCategoryGenRel.isAdmissible_iff_pairwise_and_le {m : ℕ} {L : List ℕ} :",
    "expectedAnyOf": [
      "SimplexCategoryGenRel.isAdmissible_iff_pairwise_and_le"
    ],
    "domain": "Relations",
    "goalFingerprint": "6b157dab803e0de1c847aeebbd0a16e9ddf1f038f86060cede3e1a356f4fd926",
    "sampleHash": "12b146ac9b844cf869cd3049f14dd9e97723ffc1f2d5cb709ba2a848ccb5a534"
  },
  {
    "id": "holdout_v2_option_01",
    "goal": "theorem holdout_v2_option_01 : Option.mem_map {α : Type u_1} {β : Type u_2} {f : α → β} {y : β} {o : Option α} :",
    "expectedAnyOf": [
      "Option.mem_map"
    ],
    "domain": "Option",
    "goalFingerprint": "5a4e5f95de7ba59ab02c4579a924c01c192934601c171dcd4904a9617a8ac22a",
    "sampleHash": "0140a642c3a59273e13ee36bf860a65e02c0e6c658bec873190dbaf39d3de336"
  },
  {
    "id": "holdout_v2_option_02",
    "goal": "theorem holdout_v2_option_02 : Option.orElse_eq_none {α : Type u_1} (o o' : Option α) : (o <|> o') = none ↔ o = none ∧ o' = none",
    "expectedAnyOf": [
      "Option.orElse_eq_none"
    ],
    "domain": "Option",
    "goalFingerprint": "e47c278adab43a00adeccfcd4f9871359cc702611448866e3886fffa0d0c8f62",
    "sampleHash": "05ae0d95f8a86fc6146ffe61e91899b53d13ecd6ecc14b50d8ed2947d9329167"
  },
  {
    "id": "holdout_v2_option_03",
    "goal": "theorem holdout_v2_option_03 : Option.getD_default_eq_iget {α : Type u_1} [Inhabited α] (o : Option α) : o.getD default = o.iget",
    "expectedAnyOf": [
      "Option.getD_default_eq_iget"
    ],
    "domain": "Option",
    "goalFingerprint": "08ca187dbebef3b02c7259f9e004549b2ab8e404552330da50053d74bb04a3bc",
    "sampleHash": "086ac4eac9b4941c5ed558cc6ba35cb185240d2e60049d9c5047c834271193fd"
  },
  {
    "id": "holdout_v2_option_04",
    "goal": "theorem holdout_v2_option_04 : Option.seq_some {α β : Type u_5} {a : α} {f : α → β} : some f <*> some a = some (f a)",
    "expectedAnyOf": [
      "Option.seq_some"
    ],
    "domain": "Option",
    "goalFingerprint": "e3c1ade7ff88f1ceff6cde0e5b62048609a3d2581f70972d9daa0684f1819f53",
    "sampleHash": "0dcd2076c0dd1fe52d30639f49e8a9b65221653daa351b1149b0e4a12a3d2ed9"
  },
  {
    "id": "holdout_v2_option_05",
    "goal": "theorem holdout_v2_option_05 : Option.map_coe' {α : Type u_1} {β : Type u_2} {a : α} {f : α → β} : Option.map f (some a) = some (f a)",
    "expectedAnyOf": [
      "Option.map_coe'"
    ],
    "domain": "Option",
    "goalFingerprint": "27b6d116ff23eb83ba6e4f7003e46b4949ae99a48a6939ffc6617ed933a47386",
    "sampleHash": "14d03adfc226ca4971f324a7ecc97d531e75d0cd4698f4c63eb246a202a9f0f8"
  },
  {
    "id": "holdout_v2_option_06",
    "goal": "theorem holdout_v2_option_06 : Option.map_inj {α : Type u_1} {β : Type u_2} {f g : α → β} : Option.map f = Option.map g ↔ f = g",
    "expectedAnyOf": [
      "Option.map_inj"
    ],
    "domain": "Option",
    "goalFingerprint": "897c4bc637636087f4ce117a723a92c65adf544e9aa9981e68b317257fe3d7bd",
    "sampleHash": "1bb02e13d9503198cea8e7f4d1e7cec6cbce54614cdd03ebe2918f22c893f371"
  },
  {
    "id": "holdout_v2_option_07",
    "goal": "theorem holdout_v2_option_07 : Option.none_eq_map_iff {α : Type u_1} {β : Type u_2} {x : Option α} {f : α → β} :",
    "expectedAnyOf": [
      "Option.none_eq_map_iff"
    ],
    "domain": "Option",
    "goalFingerprint": "e318b241027fa6f6acab205baa8abcbdb43d58cfaf2c5308dc168d4a03325a60",
    "sampleHash": "1fed6755f6ad1549b66d77653db7d7389a279a0d3b84a6e8bbf932330e6b8dec"
  },
  {
    "id": "holdout_v2_option_08",
    "goal": "theorem holdout_v2_option_08 : Option.coe_get {α : Type u_1} {o : Option α} (h : o.isSome = true) : some (o.get h) = o",
    "expectedAnyOf": [
      "Option.coe_get"
    ],
    "domain": "Option",
    "goalFingerprint": "1eea7e4759b8a3d27f79072875b1583d8a6338927f46176f6c94c29da64a764e",
    "sampleHash": "23842c247cd2564d8f5fa1380298f7ca1191d8cfba07288361a27f87b7cee840"
  },
  {
    "id": "holdout_v2_prod_sum_01",
    "goal": "theorem holdout_v2_prod_sum_01 : WithBot.orderIsoPUnitSumLex_symm_inr {α : Type u_1} [LE α] (a : α) :",
    "expectedAnyOf": [
      "WithBot.orderIsoPUnitSumLex_symm_inr"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "1d1572748a94564422c97f102976dcf55cff09a4bceb265025f84c36ce4a07c8",
    "sampleHash": "005a26a8e3b867a97bf57340c981b3bb83aff5ec7665fb034cb98b70727df44e"
  },
  {
    "id": "holdout_v2_prod_sum_02",
    "goal": "theorem holdout_v2_prod_sum_02 : Sum.Ico_inr_inr {α : Type u_1} {β : Type u_2} [Preorder α] [Preorder β] [LocallyFiniteOrder α]",
    "expectedAnyOf": [
      "Sum.Ico_inr_inr"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "b52582f52d156e5204ae784aa2e00d3a5f8a9b385bd4b73f39e504bd8b4a4425",
    "sampleHash": "022cf6bb5be780a6cb01a1abad237fe36f2d6de9c8ac8a8c98f8b20028f0b2a5"
  },
  {
    "id": "holdout_v2_prod_sum_03",
    "goal": "theorem holdout_v2_prod_sum_03 : WithTop.orderIsoSumLexPUnit_symm_inr {α : Type u_1} [LE α] (x : PUnit.{u_4 + 1}) :",
    "expectedAnyOf": [
      "WithTop.orderIsoSumLexPUnit_symm_inr"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "36e8d7a88494fb58a0982b8df403d426a0a238e6e3afac9352631e033926a502",
    "sampleHash": "03be1de61bc9721de2ff25b9d8f714cc5bf1edfa80655bb392b65ef9dbe0f7e4"
  },
  {
    "id": "holdout_v2_prod_sum_04",
    "goal": "theorem holdout_v2_prod_sum_04 : Sum.Ioo_inr_inr {α : Type u_1} {β : Type u_2} [Preorder α] [Preorder β] [LocallyFiniteOrder α]",
    "expectedAnyOf": [
      "Sum.Ioo_inr_inr"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "3469b586a20d63604ce6dae0ce8d4dd81c8f0f61c2c9a2827ef92649031e9227",
    "sampleHash": "044e822156f09365bd5da21c5285da60c25e80ddbb1f49eae3e9922f0da8afab"
  },
  {
    "id": "holdout_v2_prod_sum_05",
    "goal": "theorem holdout_v2_prod_sum_05 : Sum.inr_strictMono {α : Type u_1} {β : Type u_2} [Preorder α] [Preorder β] : StrictMono Sum.inr",
    "expectedAnyOf": [
      "Sum.inr_strictMono"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "c632328239fb301106e24e30b03f1e4c265fe2c01da05dca19ebf818110cec69",
    "sampleHash": "05925b8524757636c5d4cab113b84e4e57ac4bee11d5aabe9937f4dae956351b"
  },
  {
    "id": "holdout_v2_prod_sum_06",
    "goal": "theorem holdout_v2_prod_sum_06 : Prod.snd_comp_mk {α : Type u_1} {β : Type u_2} (x : α) : Prod.snd ∘ Prod.mk x = id",
    "expectedAnyOf": [
      "Prod.snd_comp_mk"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "a31367fa1c58cbffdf91d723abaa659ed0ea26cc7b9a5c0ccc900d9b359499f4",
    "sampleHash": "06c5278df8fb4e6c06e121cd10696d61b194e0f1133833a01edb9bc3e2bd693d"
  },
  {
    "id": "holdout_v2_prod_sum_07",
    "goal": "theorem holdout_v2_prod_sum_07 : Sum.elim_swap {α : Type u_3} {β : Type u_4} {γ : Type u_5} {f : α → γ} {g : β → γ} :",
    "expectedAnyOf": [
      "Sum.elim_swap"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "5635379cdec8975a3266e0268caf7b03ec60fc43c1359a772a3976dedcc99698",
    "sampleHash": "0856737e9edd8639027f84774b3f837562520ee856d14b3a777c09b25fad961e"
  },
  {
    "id": "holdout_v2_prod_sum_08",
    "goal": "theorem holdout_v2_prod_sum_08 : Prod.fst_injective {α : Type u_1} {β : Type u_2} [Subsingleton β] : Function.Injective Prod.fst",
    "expectedAnyOf": [
      "Prod.fst_injective"
    ],
    "domain": "Prod / Sum",
    "goalFingerprint": "21438464c1fb03ea6dd348b0009a394ec46662e0bf636f581bc868025414c5e1",
    "sampleHash": "09c852a0ad5f1837a86536e2bcacf90d7b112b1dc00fc6021bece0693a4abfa2"
  },
  {
    "id": "holdout_v2_maps_01",
    "goal": "theorem holdout_v2_maps_01 : LinearMap.mem_eqLocus {R : Type u_1} {R₂ : Type u_2} {M : Type u_3} {M₂ : Type u_4} [Semiring R]",
    "expectedAnyOf": [
      "LinearMap.mem_eqLocus"
    ],
    "domain": "Maps",
    "goalFingerprint": "2b4f736bf2d2667d28191c42ca31b6bcd6259354c3e174f4443d5b8b5fb42748",
    "sampleHash": "001a651e99e0d09e99cb0b2cc23dfe04b03f3cbc6b21c5a3d5b28fcfe65ebadb"
  },
  {
    "id": "holdout_v2_maps_02",
    "goal": "theorem holdout_v2_maps_02 : Equiv.Perm.decomposeOption_symm_of_none_apply {α : Type u_1} [DecidableEq α] (e : Equiv.Perm α) (i : Option α) :",
    "expectedAnyOf": [
      "Equiv.Perm.decomposeOption_symm_of_none_apply"
    ],
    "domain": "Maps",
    "goalFingerprint": "1f57440a2c189aaa32d2d175a3440c1537eb75f0c960dcaa141b9a656cf168c6",
    "sampleHash": "001baeb80c1d3c50444b2385f842a898c58031f154a39069f76209d44eb54ef4"
  },
  {
    "id": "holdout_v2_maps_03",
    "goal": "theorem holdout_v2_maps_03 : Finsupp.nonTorsionWeight_of {σ : Type u_1} {M : Type u_2} (R : Type u_3) [Semiring R] (w : σ → M)",
    "expectedAnyOf": [
      "Finsupp.nonTorsionWeight_of"
    ],
    "domain": "Maps",
    "goalFingerprint": "af66cbc97ab771419be658e8aa9de65e92fa81940b330adbf3a5449eb06eb239",
    "sampleHash": "002238f0fb31a08ff51f5dc706521b3f319afbaa68ace8d6ba074f2fd219be3c"
  },
  {
    "id": "holdout_v2_maps_04",
    "goal": "theorem holdout_v2_maps_04 : Finsupp.degLex_def {α : Type u_1} {r : α → α → Prop} {s : ℕ → ℕ → Prop} {a b : α →₀ ℕ} :",
    "expectedAnyOf": [
      "Finsupp.degLex_def"
    ],
    "domain": "Maps",
    "goalFingerprint": "4c88a7a338f0916318c635476f069f946e5de9f7c85bed4fd94a77670a65196b",
    "sampleHash": "00718d7f6dbd267df8f148c3d71ec9abdaeaab6c1a868575f1f0a82474b95c0d"
  },
  {
    "id": "holdout_v2_maps_05",
    "goal": "theorem holdout_v2_maps_05 : LinearMap.toMatrix_mulVec_repr {R : Type u_1} [CommSemiring R] {m : Type u_3} {n : Type u_4}",
    "expectedAnyOf": [
      "LinearMap.toMatrix_mulVec_repr"
    ],
    "domain": "Maps",
    "goalFingerprint": "e9aa1b68e5450a4a434f0d29dd44c8c366da6995130101f08c1b121abcb7bf35",
    "sampleHash": "009038235954853c2ab8e5dfbd214c38db777a3bfdc01231d312b4026e1fa87e"
  },
  {
    "id": "holdout_v2_maps_06",
    "goal": "theorem holdout_v2_maps_06 : LinearMap.eventually_codisjoint_ker_pow_range_pow {R : Type u_1} {M : Type u_2} [Ring R] [AddCommGroup M]",
    "expectedAnyOf": [
      "LinearMap.eventually_codisjoint_ker_pow_range_pow"
    ],
    "domain": "Maps",
    "goalFingerprint": "ef14bd0470a30dbdefe1d0a6cf0c7d960b6c5bd9cfb9dffe3e21766fb4470e00",
    "sampleHash": "009b58bfee61482cd526e4ab09524c79d48cb9b965917029b9ab770af1f4b149"
  },
  {
    "id": "holdout_v2_maps_07",
    "goal": "theorem holdout_v2_maps_07 : RingHom.eq_of_eqOn_stop {R : Type u} {S : Type v} [NonAssocSemiring R] [NonAssocSemiring S] {f g : R →+* S}",
    "expectedAnyOf": [
      "RingHom.eq_of_eqOn_stop"
    ],
    "domain": "Maps",
    "goalFingerprint": "ba54cc9fa7ed268c4545c1df327531c8ddb6f3bc64ad07f8c778240c8f2881f1",
    "sampleHash": "009e8526e8a8e8f1b9111b9d61474e09153f5c58aca53cea497ad3d4f26c65f2"
  },
  {
    "id": "holdout_v2_maps_08",
    "goal": "theorem holdout_v2_maps_08 : RingHom.coe_snd {R : Type u_1} {S : Type u_3} [NonAssocSemiring R] [NonAssocSemiring S] :",
    "expectedAnyOf": [
      "RingHom.coe_snd"
    ],
    "domain": "Maps",
    "goalFingerprint": "b1890a4a32f9f4863591f53f621f8298f44d9bbfa9dd22c00705598193aa5cc5",
    "sampleHash": "00a4ce8501a3b75bd9fee4a53c9995518e90538f0d24addf72ec27694d935332"
  },
  {
    "id": "holdout_v2_sequences_01",
    "goal": "theorem holdout_v2_sequences_01 : HahnSeries.orderTop_self_sub_one_pos_iff {Γ : Type u_1} {R : Type u_3} [LinearOrder Γ] [Zero Γ]",
    "expectedAnyOf": [
      "HahnSeries.orderTop_self_sub_one_pos_iff"
    ],
    "domain": "Sequences",
    "goalFingerprint": "070847d1699869b33aab96e0fcbd7139b7fd781dd4c11b9d3efc1bd68298ab5f",
    "sampleHash": "0007e66fe7b578719bb77ba7a5664172506e768878c2d17fcf7b05d020d8e0e7"
  },
  {
    "id": "holdout_v2_sequences_02",
    "goal": "theorem holdout_v2_sequences_02 : HasFPowerSeriesWithinOnBall.tendstoLocallyUniformlyOn' {𝕜 : Type u_1} {E : Type u_2} {F : Type u_3}",
    "expectedAnyOf": [
      "HasFPowerSeriesWithinOnBall.tendstoLocallyUniformlyOn'"
    ],
    "domain": "Sequences",
    "goalFingerprint": "d39c7e579f4639b1884fa5698bb17e2f01e60bfb3e54a6e9a87a490800002e33",
    "sampleHash": "0013eeb9f592331387a74d73ca1e712d33e2a7e69b37fa241a55c9c983d92963"
  },
  {
    "id": "holdout_v2_sequences_03",
    "goal": "theorem holdout_v2_sequences_03 : HasFiniteFPowerSeriesOnBall.eq_partialSum' {𝕜 : Type u_1} {E : Type u_2} {F : Type u_3}",
    "expectedAnyOf": [
      "HasFiniteFPowerSeriesOnBall.eq_partialSum'"
    ],
    "domain": "Sequences",
    "goalFingerprint": "d1786e457e65e2095e9c83a967e0031d19ccfaaa43ce3fa029f48b460f1789ce",
    "sampleHash": "004006ec8651c97704146f77f2b04d3328c834bc6bb6bf167c80d97f045d93b3"
  },
  {
    "id": "holdout_v2_sequences_04",
    "goal": "theorem holdout_v2_sequences_04 : Real.summable_one_div_nat_pow {p : ℕ} : (Summable fun n => 1 / ↑n ^ p) ↔ 1 < p",
    "expectedAnyOf": [
      "Real.summable_one_div_nat_pow"
    ],
    "domain": "Sequences",
    "goalFingerprint": "c4e7585410502f9240ac66e563b1e340641793816e55ac1737861e896d7fa7e1",
    "sampleHash": "005234af8d31189afee09bdf800c9f191d7c0996ef48157c3e96dd0dbc9a2e3d"
  },
  {
    "id": "holdout_v2_sequences_05",
    "goal": "theorem holdout_v2_sequences_05 : HahnSeries.mem_cardSuppLTAddSubgroup {Γ : Type u_1} {R : Type u_2} (κ : Cardinal.{u_1}) [PartialOrder Γ]",
    "expectedAnyOf": [
      "HahnSeries.mem_cardSuppLTAddSubgroup"
    ],
    "domain": "Sequences",
    "goalFingerprint": "e6003ee23c02f880db2aeb7fd91e7f826ce4c460686f89ea4b1e469ade63884f",
    "sampleHash": "0055f77063e11b6b78e94a3c658b0b9634a6cf2bcecf0de1682e783c8ade19dd"
  },
  {
    "id": "holdout_v2_sequences_06",
    "goal": "theorem holdout_v2_sequences_06 : PowerSeries.nat_le_order {R : Type u_1} [Semiring R] (φ : PowerSeries R) (n : ℕ)",
    "expectedAnyOf": [
      "PowerSeries.nat_le_order"
    ],
    "domain": "Sequences",
    "goalFingerprint": "427e45d1dd4690cd025967de7644d77a34ef9f6883d6593cac9de29c7cb1d627",
    "sampleHash": "00918a6dd7ab06ba43a5eec1e19d05efb162d7eb6c0f90e6267699bb3e26881c"
  },
  {
    "id": "holdout_v2_sequences_07",
    "goal": "theorem holdout_v2_sequences_07 : FormalMultilinearSeries.apply_eq_zero_of_lt_order {𝕜 : Type u} {E : Type v} {F : Type w} [Semiring 𝕜] {n : ℕ}",
    "expectedAnyOf": [
      "FormalMultilinearSeries.apply_eq_zero_of_lt_order"
    ],
    "domain": "Sequences",
    "goalFingerprint": "96fa316985146441ff932eb25f11d0c510c9396d0eb6cb3274c684f5450b4824",
    "sampleHash": "00d5729195bd201e236ac3ad8292507d5a57fa908f81a3c8afe58f2a57027916"
  },
  {
    "id": "holdout_v2_sequences_08",
    "goal": "theorem holdout_v2_sequences_08 : MvPolynomial.coe_C {σ : Type u_1} {R : Type u_2} [CommSemiring R] (a : R) :",
    "expectedAnyOf": [
      "MvPolynomial.coe_C"
    ],
    "domain": "Sequences",
    "goalFingerprint": "224d18d300a25762b6e3785a2cab86d511954dfcf162205c2a9fa528a7f761a4",
    "sampleHash": "00e44615a3c7acd5fbd629bbfaa64a589112f413efca1b134e985e43ff1b364a"
  },
  {
    "id": "holdout_v2_topology_01",
    "goal": "theorem holdout_v2_topology_01 : Path.hasBasis_uniformity {X : Type u_1} [UniformSpace X] {x y : X} :",
    "expectedAnyOf": [
      "Path.hasBasis_uniformity"
    ],
    "domain": "Topology",
    "goalFingerprint": "4119d5a657b8a100da9a51f90bbdb5194602ad334d0ab0027c4fe3061358483f",
    "sampleHash": "0003495c074c53ca3f194fcfd31995adf53b9b04916d0e31f23ac9f6a22f65cb"
  },
  {
    "id": "holdout_v2_topology_02",
    "goal": "theorem holdout_v2_topology_02 : IsCompact.prod {X : Type u} {Y : Type v} [TopologicalSpace X] [TopologicalSpace Y] {s : Set X} {t : Set Y}",
    "expectedAnyOf": [
      "IsCompact.prod"
    ],
    "domain": "Topology",
    "goalFingerprint": "9fff166ecf56c0e6c861820ef04fb02e2d7f7a4022c0f923fd70383bf5846e68",
    "sampleHash": "000abca85316467e4d98e844ef45a4f4da53685c3e16242df1bf5e823945bb27"
  },
  {
    "id": "holdout_v2_topology_03",
    "goal": "theorem holdout_v2_topology_03 : BoundedContinuousFunction.bounded {α : Type u} {β : Type v} [TopologicalSpace α] [PseudoMetricSpace β]",
    "expectedAnyOf": [
      "BoundedContinuousFunction.bounded"
    ],
    "domain": "Topology",
    "goalFingerprint": "bcd7a525cfbdc13896b83502f339b41e7722659e9995b2356dcd8a59ba80c75f",
    "sampleHash": "0012fe3f2e15ebb9122cfc79e29f18b688629b1165b71d7c5cff3a8d07b3d017"
  },
  {
    "id": "holdout_v2_topology_04",
    "goal": "theorem holdout_v2_topology_04 : IsCompact.inter_iInter_nonempty {X : Type u} [TopologicalSpace X] {s : Set X} {ι : Type v} (hs : IsCompact s)",
    "expectedAnyOf": [
      "IsCompact.inter_iInter_nonempty"
    ],
    "domain": "Topology",
    "goalFingerprint": "f95e8266be27d0d6fee072311b99798867b4c4d78b138ece8816ed6d06b74a35",
    "sampleHash": "0017066b2f8bec01e8c0944fcd1eeb28f463c5a2927ffd9ab5a2b70c95caf258"
  },
  {
    "id": "holdout_v2_topology_05",
    "goal": "theorem holdout_v2_topology_05 : TopCat.GlueData.fromOpenSubsetsGlue_isOpenEmbedding {α : Type u} [TopologicalSpace α] {J : Type u}",
    "expectedAnyOf": [
      "TopCat.GlueData.fromOpenSubsetsGlue_isOpenEmbedding"
    ],
    "domain": "Topology",
    "goalFingerprint": "bc5b88c73e78850a4f6a41dc08940a3d4efc9fc53d9f9c1100cd5fd8b7e2d146",
    "sampleHash": "002962c193b1d2be56809382f408265f47aaa82bb047ab301c405a485d78ecc1"
  },
  {
    "id": "holdout_v2_topology_06",
    "goal": "theorem holdout_v2_topology_06 : Finset.isCompact_biUnion {X : Type u} {ι : Type u_1} [TopologicalSpace X] (s : Finset ι) {f : ι → Set X}",
    "expectedAnyOf": [
      "Finset.isCompact_biUnion"
    ],
    "domain": "Topology",
    "goalFingerprint": "a8fdfb46e4f29d8e80ae5879385cf948d211659290b435d01273908125b43747",
    "sampleHash": "002a5941e83d8a1355f7a0ab1435876c55182ade24358a5c322aae1e05a317e8"
  },
  {
    "id": "holdout_v2_topology_07",
    "goal": "theorem holdout_v2_topology_07 : Filter.Eventually.curry_nhds {X : Type u} {Y : Type v} [TopologicalSpace X] [TopologicalSpace Y]",
    "expectedAnyOf": [
      "Filter.Eventually.curry_nhds"
    ],
    "domain": "Topology",
    "goalFingerprint": "b0bf4fe3c650ec04f5b532b4c4de6bbdb6fb5d2a8e7d3da7877aa855a7b0f047",
    "sampleHash": "002afbf3fb585c3f16332c067f1c09d48d9032d3006acd76603786f5d71bf613"
  },
  {
    "id": "holdout_v2_topology_08",
    "goal": "theorem holdout_v2_topology_08 : ContinuousWithinAt.congr_of_insert {α : Type u_1} {β : Type u_2} [TopologicalSpace α] [TopologicalSpace β]",
    "expectedAnyOf": [
      "ContinuousWithinAt.congr_of_insert"
    ],
    "domain": "Topology",
    "goalFingerprint": "51c503a9a65e54900a2e3aaf3231eb77eb37d6e23ddf943567c0c526c03740b2",
    "sampleHash": "002b2f33d3bb9b3bf40907992d238a68cc32c15f4c272d18afa1569290fc5753"
  },
  {
    "id": "holdout_v2_topology_09",
    "goal": "theorem holdout_v2_topology_09 : ContinuousLinearEquiv.refl_apply (R₁ : Type u_1) [Semiring R₁] (M₁ : Type u_4) [TopologicalSpace M₁]",
    "expectedAnyOf": [
      "ContinuousLinearEquiv.refl_apply"
    ],
    "domain": "Topology",
    "goalFingerprint": "279469a70939d9ccd1e6f874b22ed541d89bea028b259fa80e59539802093736",
    "sampleHash": "003129881c8dafe475546929bf63df8248099e33957d6c2f6eebd583adb3132f"
  },
  {
    "id": "holdout_v2_analysis_01",
    "goal": "theorem holdout_v2_analysis_01 : Wbtw.left_mem_image_Ici_of_right_ne {R : Type u_1} {V : Type u_2} {P : Type u_4} [Field R]",
    "expectedAnyOf": [
      "Wbtw.left_mem_image_Ici_of_right_ne"
    ],
    "domain": "Analysis",
    "goalFingerprint": "6340ee6794fa84401b1abad4602b2d1bd442b546a488615e175bf3a861e67dfb",
    "sampleHash": "00053b4cb82bcb690b7d372ed8eb7ed5b5f71f7a56fc7a1718f88db899dd189e"
  },
  {
    "id": "holdout_v2_analysis_02",
    "goal": "theorem holdout_v2_analysis_02 : ContDiffAt.comp_contDiffWithinAt {𝕜 : Type u_1} {E : Type u_2} {F : Type u_3} {G : Type u_4}",
    "expectedAnyOf": [
      "ContDiffAt.comp_contDiffWithinAt"
    ],
    "domain": "Analysis",
    "goalFingerprint": "f7076fd016532a3c144f58fd171c9123f55313d1218944b6ce004f85f3c7b70d",
    "sampleHash": "00072ad817053cab3fb845c7a29bc74060bf52952efafd0ef686002e45776f50"
  },
  {
    "id": "holdout_v2_analysis_03",
    "goal": "theorem holdout_v2_analysis_03 : Orientation.rightAngleRotation_symm {E : Type u_1} [NormedAddCommGroup E] [InnerProductSpace ℝ E]",
    "expectedAnyOf": [
      "Orientation.rightAngleRotation_symm"
    ],
    "domain": "Analysis",
    "goalFingerprint": "75d796e89813ae7879f970d3c1a2c5d00df0aee6505435a2cb0b8ad1a18bbce9",
    "sampleHash": "00089e7768a78e99a6faac0e8b11398941ad0c73901e021b1c4ed9fdae94d6cd"
  },
  {
    "id": "holdout_v2_analysis_04",
    "goal": "theorem holdout_v2_analysis_04 : SchauderBasis.range_proj_eq_span {𝕜 : Type u_1} [NontriviallyNormedField 𝕜] {X : Type u_2}",
    "expectedAnyOf": [
      "SchauderBasis.range_proj_eq_span"
    ],
    "domain": "Analysis",
    "goalFingerprint": "1aaebf50b3ed75373067daed5d9e6ff5d505da5076d4b025afc93ea55ed5a57f",
    "sampleHash": "000a8c00cf112ae02c97cc1a3aeabe7246344d13460a977ab7347a172540fe6e"
  },
  {
    "id": "holdout_v2_analysis_05",
    "goal": "theorem holdout_v2_analysis_05 : Real.Angle.abs_cos_eq_of_two_nsmul_eq {θ ψ : Real.Angle} (h : 2 • θ = 2 • ψ) : |θ.cos| = |ψ.cos|",
    "expectedAnyOf": [
      "Real.Angle.abs_cos_eq_of_two_nsmul_eq"
    ],
    "domain": "Analysis",
    "goalFingerprint": "1afa2880d2552e340fc5a0acb108f8b313e0c28f244007beb58b7c2ba9294ed4",
    "sampleHash": "00322129da494104db382175ef4a2bb634448ae2a8755801839efa5977828d62"
  },
  {
    "id": "holdout_v2_analysis_06",
    "goal": "theorem holdout_v2_analysis_06 : Filter.EventuallyEq.extDerivWithin' {𝕜 : Type u_1} {E : Type u_2} {F : Type u_3}",
    "expectedAnyOf": [
      "Filter.EventuallyEq.extDerivWithin'"
    ],
    "domain": "Analysis",
    "goalFingerprint": "976889b66221a581b96b38e6d832a2d559b426cdb900d1b00cd347f6b29318e9",
    "sampleHash": "003b490ad34628216b3492b479765a57ae557f5f51615d034a6fe3d6054f666d"
  },
  {
    "id": "holdout_v2_analysis_07",
    "goal": "theorem holdout_v2_analysis_07 : Real.arcsin_mem_Icc (x : ℝ) : Real.arcsin x ∈ Set.Icc (-(Real.pi / 2)) (Real.pi / 2)",
    "expectedAnyOf": [
      "Real.arcsin_mem_Icc"
    ],
    "domain": "Analysis",
    "goalFingerprint": "75abb972294a0e58692488fb136519977c6e1322a8d2d1abcba7883dd8a99747",
    "sampleHash": "0064fcf2d517c26eccbd6d53a2fec8d9332263ad39d2efa6f46dbb311af8c08f"
  },
  {
    "id": "holdout_v2_analysis_08",
    "goal": "theorem holdout_v2_analysis_08 : Matrix.toLpLin_one {n : Type u_2} {R : Type u_4} [Fintype n] [DecidableEq n] [CommRing R] (p : ENNReal) :",
    "expectedAnyOf": [
      "Matrix.toLpLin_one"
    ],
    "domain": "Analysis",
    "goalFingerprint": "ad3b9122619759ff2d570b2a526380ebdc8a25e5dc8a3fde0bb8ba6a77cfdf75",
    "sampleHash": "00673bd1331655a030b3de5c6d4e1cf9c9c3b35d9f80a269a0972153c73ccf44"
  },
  {
    "id": "holdout_v2_analysis_09",
    "goal": "theorem holdout_v2_analysis_09 : HasStrictDerivAt.clm_apply {𝕜 : Type u} [NontriviallyNormedField 𝕜] {F : Type v} [NormedAddCommGroup F]",
    "expectedAnyOf": [
      "HasStrictDerivAt.clm_apply"
    ],
    "domain": "Analysis",
    "goalFingerprint": "e8a20a65c88a20be4bde49586265d46ea8449942257e00e3d89fd90a0df31f07",
    "sampleHash": "00729e0f6d7f1c91e524aed8c2035871056ca446dbe95a14d92e3dda623d06db"
  },
  {
    "id": "holdout_v2_number_theory_01",
    "goal": "theorem holdout_v2_number_theory_01 : Irrational.mul_ratCast {x : ℝ} (h : Irrational x) {q : ℚ} (hq : q ≠ 0) : Irrational (x * ↑q)",
    "expectedAnyOf": [
      "Irrational.mul_ratCast"
    ],
    "domain": "Number theory",
    "goalFingerprint": "914b33b22e04ea0cd2aee48051ab617b48afc3f6820628ca834c69182669de0e",
    "sampleHash": "00086fbf695f88ceeb2c3017b4c6150276feb851765e5f5df92f8e2df87dbee2"
  },
  {
    "id": "holdout_v2_number_theory_02",
    "goal": "theorem holdout_v2_number_theory_02 : NumberField.natAbs_discr_eq_absNorm_differentIdeal_mul_natAbs_discr_pow (K : Type u_1)",
    "expectedAnyOf": [
      "NumberField.natAbs_discr_eq_absNorm_differentIdeal_mul_natAbs_discr_pow"
    ],
    "domain": "Number theory",
    "goalFingerprint": "671d55ac8755f88b3bc46b518f75be37c14db49768a0c3b3b71c7167a4f0e095",
    "sampleHash": "00090696dfb1153be91afed18cd95779c39aedcefef229caedc723741d549cc1"
  },
  {
    "id": "holdout_v2_number_theory_03",
    "goal": "theorem holdout_v2_number_theory_03 : NumberField.basisMatrix_eq_embeddingsMatrixReindex (K : Type u_1) [Field K] [NumberField K] :",
    "expectedAnyOf": [
      "NumberField.basisMatrix_eq_embeddingsMatrixReindex"
    ],
    "domain": "Number theory",
    "goalFingerprint": "7ac200bb57cf4b323e0131ab2a05c1dced95711cb03fb7cbc4c5a95be0131062",
    "sampleHash": "000af531f7575b3d4fda16459ea7565ff3b5a77ce3dcff5404856b9ccaea4bed"
  },
  {
    "id": "holdout_v2_number_theory_04",
    "goal": "theorem holdout_v2_number_theory_04 : PythagoreanTriple.symm {x y z : ℤ} (h : PythagoreanTriple x y z) : PythagoreanTriple y x z",
    "expectedAnyOf": [
      "PythagoreanTriple.symm"
    ],
    "domain": "Number theory",
    "goalFingerprint": "eeb6cbe779a586e9b266f685aedcc072e5de92bf073ba47f1260a3c47df47dfa",
    "sampleHash": "001190d3be7774f2de288631377ec867197999fc0f01f21c056af2ffdbc9762d"
  },
  {
    "id": "holdout_v2_number_theory_05",
    "goal": "theorem holdout_v2_number_theory_05 : jacobiSym.quadratic_reciprocity_one_mod_four {a b : ℕ} (ha : a % 4 = 1) (hb : Odd b) :",
    "expectedAnyOf": [
      "jacobiSym.quadratic_reciprocity_one_mod_four"
    ],
    "domain": "Number theory",
    "goalFingerprint": "b993f789ef49382c4fafed1ed0a2d79059fd18a9ef100230b0b6000758de6992",
    "sampleHash": "006c225f9b2b6261afaaa5c9c12e77672aa7213a7608c3cccb85a8e774d74869"
  },
  {
    "id": "holdout_v2_number_theory_06",
    "goal": "theorem holdout_v2_number_theory_06 : LindemannWeierstrass.hasDerivAt_cexp_mul_sumIDeriv (p : Polynomial ℂ) (s : ℂ) (x : ℝ) :",
    "expectedAnyOf": [
      "LindemannWeierstrass.hasDerivAt_cexp_mul_sumIDeriv"
    ],
    "domain": "Number theory",
    "goalFingerprint": "ad8b6fd57357adde1a4871edaba26d32275bfdbcd454c3bcaebdf33a4940b79c",
    "sampleHash": "0090ed5722506b109340ef1594e5d838b3d5317fd6b6194666becba0730f8306"
  },
  {
    "id": "holdout_v2_number_theory_07",
    "goal": "theorem holdout_v2_number_theory_07 : NumberField.Ideal.liesOver_primesOverSpanEquivMonicFactorsMod_symm {K : Type u_1} [Field K]",
    "expectedAnyOf": [
      "NumberField.Ideal.liesOver_primesOverSpanEquivMonicFactorsMod_symm"
    ],
    "domain": "Number theory",
    "goalFingerprint": "8b7fdd5b8df1535239898414b0687d9611f8227c0da2d9312bb746b241a485c6",
    "sampleHash": "00a9910269d03189090c0fabfa3c6fcfd7ca84197245cd79a6eff9a46744ddfd"
  },
  {
    "id": "holdout_v2_number_theory_08",
    "goal": "theorem holdout_v2_number_theory_08 : IsCyclotomicExtension.discr_prime_pow_ne_two' {p k : ℕ} {K : Type u} {L : Type v} {ζ : L} [Field K] [Field L]",
    "expectedAnyOf": [
      "IsCyclotomicExtension.discr_prime_pow_ne_two'"
    ],
    "domain": "Number theory",
    "goalFingerprint": "e8dbc5b39262f061cc1ca1401b4fc4292778db0ebea969906bbeddc4e4537c04",
    "sampleHash": "00dd6bad407211e1eb6206b43ba76d69f3cdd73a543f9d1550de179f9ebed41c"
  },
  {
    "id": "holdout_v2_combinatorics_01",
    "goal": "theorem holdout_v2_combinatorics_01 : SimpleGraph.not_cliqueFree_iff_top_isContained {α : Type u_1} {G : SimpleGraph α} (n : ℕ) :",
    "expectedAnyOf": [
      "SimpleGraph.not_cliqueFree_iff_top_isContained"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "254de443251edb12c7f14928202d1bfb972313a3364344732e5acc5c3f39f13a",
    "sampleHash": "00193e67b2dd5c03efe555f5dfb74ccefff690b9b3ee4ef6d7cab8f1a8f2af06"
  },
  {
    "id": "holdout_v2_combinatorics_02",
    "goal": "theorem holdout_v2_combinatorics_02 : Matroid.isBase_restrict_iff' {α : Type u_1} {M : Matroid α} {I X : Set α} :",
    "expectedAnyOf": [
      "Matroid.isBase_restrict_iff'"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "6f8ac28f6bf869e1b7bee0e8293f8a8ae66fead884f1a99378783308643c4760",
    "sampleHash": "00312adda135bf0251b53c03302fc2c957d6c3e5953234aae5317cd5ea89cf59"
  },
  {
    "id": "holdout_v2_combinatorics_03",
    "goal": "theorem holdout_v2_combinatorics_03 : UV.compress_injOn {α : Type u_1} [GeneralizedBooleanAlgebra α] [DecidableRel Disjoint] [DecidableLE α]",
    "expectedAnyOf": [
      "UV.compress_injOn"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "9f5d9bb157b6cfc2a8b4c78ddd6b186111294cd4edc2071bc73ee72d7cadf51c",
    "sampleHash": "0047a03ca355bbffe2f12c72b299774e27afb13eded4165e7d615c0226a5aeba"
  },
  {
    "id": "holdout_v2_combinatorics_04",
    "goal": "theorem holdout_v2_combinatorics_04 : SimpleGraph.Walk.ofSupport_singleton {V : Type u} (G : SimpleGraph V) (v : V) :",
    "expectedAnyOf": [
      "SimpleGraph.Walk.ofSupport_singleton"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "c7e14d99bc1caec76f7f3b77d9f096ec589855460dcbcc1f3d404f22298b91fe",
    "sampleHash": "00a5cca681a1b8ec8a630624f16ebbd3edbe3f3d37eedd46e689f193748bcda0"
  },
  {
    "id": "holdout_v2_combinatorics_05",
    "goal": "theorem holdout_v2_combinatorics_05 : SimpleGraph.Walk.length_reverse {V : Type u} {G : SimpleGraph V} {u v : V} (p : G.Walk u v) :",
    "expectedAnyOf": [
      "SimpleGraph.Walk.length_reverse"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "0e20d759666d14b3565d8cd3fc86f8809a5eeb7cb61daea748d27ca79e70ad90",
    "sampleHash": "00f3741fe70bc38c76713ff92d94200c215db3718a5a58fc01703ce1ef249155"
  },
  {
    "id": "holdout_v2_combinatorics_06",
    "goal": "theorem holdout_v2_combinatorics_06 : SimpleGraph.Walk.isPath_iff_injective_get_support {V : Type u} {G : SimpleGraph V} {u v : V} (p : G.Walk u v) :",
    "expectedAnyOf": [
      "SimpleGraph.Walk.isPath_iff_injective_get_support"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "8b4327f1ec540e2be918eced5036baf4ce70b52865a872b14635327c254bb092",
    "sampleHash": "0124a9e0e5a04adb2fc3aab01e00a8d670a67af1e5edc207e6333d0027c576a9"
  },
  {
    "id": "holdout_v2_combinatorics_07",
    "goal": "theorem holdout_v2_combinatorics_07 : SimpleGraph.EdgeLabeling.labelGraph_le {V : Type u_1} {G : SimpleGraph V} {K : Type u_3}",
    "expectedAnyOf": [
      "SimpleGraph.EdgeLabeling.labelGraph_le"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "8677349b419637165b469b88294b13f2ce72f5f73d60cc8d909d3d0f48265314",
    "sampleHash": "0124f3cc40d24dbb99a10a02ca2f4c92acce6e44569354c0e76786b5aafaf078"
  },
  {
    "id": "holdout_v2_combinatorics_08",
    "goal": "theorem holdout_v2_combinatorics_08 : Nat.bell_eq_sum_partition (n : ℕ) : n.bell = ∑ p, p.parts.bell",
    "expectedAnyOf": [
      "Nat.bell_eq_sum_partition"
    ],
    "domain": "Combinatorics",
    "goalFingerprint": "794aacea10bbe7ea68f85f87897c731c21dd92a0c9e806bd67e14fb24ae6f10c",
    "sampleHash": "0154981c4915cab0a09ffae0b639e6d38218b86354ef731e945f92584e0d42eb"
  }
]
