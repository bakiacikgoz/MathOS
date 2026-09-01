import { extractSemanticOperatorProfile, type SemanticOperator } from "./semantic-operator-profile.ts"

export const SEMANTIC_OPERATOR_PROFILE_V2_CANDIDATE_VERSION = "SEMANTIC_OPERATOR_PROFILE_V2_CANDIDATE" as const

export type SemanticEvidenceAuthority =
  | "EXACT_NOTATION"
  | "EXACT_IDENTIFIER"
  | "DERIVED_STRUCTURE"
  | "MORPHOLOGY_INFERENCE"

export interface SemanticEvidenceV2Candidate {
  token: string
  authority: SemanticEvidenceAuthority
  activeForBoost: boolean
  source: "OPERATOR" | "RELATION_PROPERTY" | "MORPHOLOGY"
}

export const V2_CANDIDATE_CONFIG = {
  frozen: false,
  maxSemanticRankContribution: 12,
  genericSingleTokenSuppression: ["add", "mul", "comp", "zero", "one", "self", "comm", "assoc"],
  activeExactOperators: ["add", "sub", "neg", "mul", "div", "pow", "inv", "le", "lt", "union", "inter", "subset", "mem", "card", "comp"] as SemanticOperator[],
  excludedPendingEvidence: ["relation_comp"],
  candidateCompatibility: "AT_LEAST_TWO_EXACT_MATCHES_OR_ONE_EXACT_PLUS_FORMAL_TYPE_COMPATIBILITY",
  rankProtection: "ADDITIVE_BASELINE_PRESERVING_BOUNDED_RERANK",
} as const

const ACTIVE = new Set<SemanticOperator>(V2_CANDIDATE_CONFIG.activeExactOperators)

export function extractV2CandidateEvidence(goal: string): SemanticEvidenceV2Candidate[] {
  const profile = extractSemanticOperatorProfile(goal)
  const evidence: SemanticEvidenceV2Candidate[] = profile.sequence.map((token) => ({
    token,
    authority: "EXACT_NOTATION",
    activeForBoost: ACTIVE.has(token),
    source: "OPERATOR",
  }))
  if (profile.relation?.property) evidence.push({
    token: profile.relation.property.toLowerCase(),
    authority: "EXACT_IDENTIFIER",
    activeForBoost: false,
    source: "RELATION_PROPERTY",
  })
  for (const token of profile.morphologyTokens) evidence.push({
    token,
    authority: token === "zero" || token === "one" ? "DERIVED_STRUCTURE" : "MORPHOLOGY_INFERENCE",
    activeForBoost: false,
    source: "MORPHOLOGY",
  })
  return evidence
}
