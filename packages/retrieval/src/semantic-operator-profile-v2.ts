import type { LeanDeclarationInspection } from "@mathos/lean"
import type { GoalProfile, LeanDeclaration } from "./types.ts"
import { extractSemanticOperatorProfile, type SemanticOperator } from "./semantic-operator-profile.ts"
import { boundedSemanticRank, evaluateSemanticCandidateCompatibility, type SemanticCandidateCompatibility } from "./semantic-operator-profile-v2-stability.ts"

export const SEMANTIC_OPERATOR_PROFILE_V2_VERSION = "SEMANTIC_OPERATOR_PROFILE_V2" as const
export const SEMANTIC_OPERATOR_PROFILE_V2_FROZEN = true as const
export const MORPHOLOGY_BOOST = "DISABLED" as const
export const RELATION_POLICY = "DIAGNOSTIC_ONLY" as const
export const MAX_SEMANTIC_RANK_CONTRIBUTION = 4 as const

export const FROZEN_V2_ACTIVE_EXACT_OPERATORS = [
  "add", "sub", "neg", "mul", "div", "pow", "inv",
  "le", "lt", "union", "inter", "subset", "mem", "card", "comp",
] as const satisfies readonly SemanticOperator[]

const ACTIVE = new Set<SemanticOperator>(FROZEN_V2_ACTIVE_EXACT_OPERATORS)

export interface FrozenSemanticV2Evidence {
  token: SemanticOperator
  authority: "EXACT_NOTATION"
  activeForBoost: true
}

export function extractFrozenSemanticV2Evidence(goal: string): FrozenSemanticV2Evidence[] {
  return [...new Set(extractSemanticOperatorProfile(goal).sequence)]
    .filter((token): token is SemanticOperator => ACTIVE.has(token))
    .map((token) => ({ token, authority: "EXACT_NOTATION", activeForBoost: true }))
}

export function evaluateFrozenSemanticV2Compatibility(input: {
  goalProfile: GoalProfile
  goalSemanticTokens: string[]
  declaration: LeanDeclaration
  inspection?: LeanDeclarationInspection
}): SemanticCandidateCompatibility {
  return evaluateSemanticCandidateCompatibility({ ...input, strategy: "COMP-A" })
}

export function applyFrozenSemanticV2RankCap(baselineRank: number, semanticRank: number, eligible: boolean): number {
  return boundedSemanticRank(baselineRank, semanticRank, MAX_SEMANTIC_RANK_CONTRIBUTION, eligible)
}
