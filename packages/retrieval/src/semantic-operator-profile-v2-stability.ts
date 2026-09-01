import type { LeanDeclarationInspection } from "@mathos/lean"
import type { GoalProfile, LeanDeclaration } from "./types.ts"
import { profileCandidate } from "./profile.ts"
import { extractSemanticOperatorProfile, type SemanticOperator } from "./semantic-operator-profile.ts"

export type CompatibilityState = "YES" | "NO" | "UNKNOWN"
export type SemanticCompatibilityStrategy = "COMP-A" | "COMP-B" | "COMP-C" | "COMP-D"

export interface SemanticCandidateCompatibility {
  exactSemanticMatches: string[]
  semanticMatchCount: number
  typeCompatible: CompatibilityState
  conclusionCompatible: CompatibilityState
  signatureCompatible: CompatibilityState
  conjunctionStrength: number
  authority: "HIGH" | "MEDIUM" | "LOW"
  eligibleForSemanticBoost: boolean
  blockedByKnownIncompatibility: boolean
}

const GENERIC_SINGLE = new Set(["add", "mul", "comp", "zero", "one", "self", "comm", "assoc", "mem", "le", "lt", "div"])
const CONCRETE_TYPES = new Set(["nat", "int", "rat", "real", "finset", "set", "list", "array", "option", "prod", "sum", "bool", "string"])

export function evaluateSemanticCandidateCompatibility(input: {
  strategy: SemanticCompatibilityStrategy
  goalProfile: GoalProfile
  goalSemanticTokens: string[]
  declaration: LeanDeclaration
  inspection?: LeanDeclarationInspection
}): SemanticCandidateCompatibility {
  const { strategy, goalProfile, declaration, inspection } = input
  const goalTokens = [...new Set(input.goalSemanticTokens)]
  const text = `${declaration.name} ${declaration.signature}`.toLowerCase()
  const signatureSemantic = new Set(extractSemanticOperatorProfile(declaration.signature).sequence)
  const exactSemanticMatches = goalTokens.filter((token) => tokenInText(text, token) || signatureSemantic.has(token as SemanticOperator))
  const candidateProfile = profileCandidate(declaration)
  const candidateTypes = inspection?.elaborated ? inspection.typeConstructors : candidateProfile.typeConstructors
  const typeCompatible = compareTypes(goalProfile.typeConstructors, candidateTypes, Boolean(inspection?.elaborated))
  const conclusionCompatible = compareConclusion(goalProfile, candidateProfile, inspection)
  const signatureHasExact = exactSemanticMatches.some((token) => signatureSemantic.has(token as SemanticOperator) || tokenInText(declaration.signature.toLowerCase(), token))
  const hasKnownDifferentSignatureSemantics = inspection?.elaborated && signatureSemantic.size > 0 && !goalTokens.some((token) => signatureSemantic.has(token as SemanticOperator))
  const signatureCompatible: CompatibilityState = signatureHasExact ? "YES" : hasKnownDifferentSignatureSemantics ? "NO" : "UNKNOWN"
  const blockedByKnownIncompatibility = typeCompatible === "NO" || conclusionCompatible === "NO" || signatureCompatible === "NO"
  const semanticMatchCount = exactSemanticMatches.length
  const compatibleEvidenceCount = [typeCompatible, conclusionCompatible, signatureCompatible].filter((value) => value === "YES").length
  const hasInformativeConjunction = semanticMatchCount >= 2
  const singleIsGeneric = semanticMatchCount === 1 && GENERIC_SINGLE.has(exactSemanticMatches[0]!)
  let eligible = false
  if (!blockedByKnownIncompatibility) {
    if (strategy === "COMP-B") eligible = hasInformativeConjunction
    else if (strategy === "COMP-C" || strategy === "COMP-A") eligible = hasInformativeConjunction || (semanticMatchCount === 1 && typeCompatible === "YES")
    else eligible = hasInformativeConjunction || (semanticMatchCount === 1 && compatibleEvidenceCount >= 1)
  }
  if (singleIsGeneric && compatibleEvidenceCount === 0) eligible = false
  const conjunctionStrength = semanticMatchCount + compatibleEvidenceCount * 0.5
  const authority = eligible && semanticMatchCount >= 2 && compatibleEvidenceCount >= 1 ? "HIGH" : eligible ? "MEDIUM" : "LOW"
  return { exactSemanticMatches, semanticMatchCount, typeCompatible, conclusionCompatible, signatureCompatible, conjunctionStrength, authority, eligibleForSemanticBoost: eligible, blockedByKnownIncompatibility }
}

export function boundedSemanticRank(baselineRank: number, semanticRank: number, cap: number, eligible: boolean): number {
  if (!Number.isInteger(cap) || cap < 0) throw new Error("semantic rank contribution cap must be a non-negative integer")
  if (!eligible || semanticRank >= baselineRank) return baselineRank
  return baselineRank - Math.min(cap, baselineRank - semanticRank)
}

function compareTypes(goal: string[], candidate: string[], elaborated: boolean): CompatibilityState {
  const left = new Set(goal.map(normalize))
  const right = new Set(candidate.map(normalize))
  if (!left.size || !right.size) return "UNKNOWN"
  if ([...left].some((value) => right.has(value))) return "YES"
  const leftConcrete = [...left].filter((value) => CONCRETE_TYPES.has(value))
  const rightConcrete = [...right].filter((value) => CONCRETE_TYPES.has(value))
  return elaborated && leftConcrete.length > 0 && rightConcrete.length > 0 ? "NO" : "UNKNOWN"
}

function compareConclusion(goal: GoalProfile, candidate: ReturnType<typeof profileCandidate>, inspection?: LeanDeclarationInspection): CompatibilityState {
  const goalShape = shape(goal)
  const candidateShape = inspection?.propositionShape ? shapeInspection(inspection.propositionShape) : shape(candidate)
  if (goalShape && candidateShape) return goalShape === candidateShape ? "YES" : "NO"
  if (goal.propositionHead && candidate.conclusionHead) return normalize(goal.propositionHead) === normalize(candidate.conclusionHead) ? "YES" : "UNKNOWN"
  return "UNKNOWN"
}

function shape(value: { isEquality: boolean; isIff: boolean; isImplication: boolean }): string | null {
  if (value.isEquality) return "EQUALITY"
  if (value.isIff) return "IFF"
  if (value.isImplication) return "IMPLICATION"
  return null
}
function shapeInspection(value: NonNullable<LeanDeclarationInspection["propositionShape"]>): string | null {
  if (value.equality) return "EQUALITY"
  if (value.iff) return "IFF"
  if (value.implication) return "IMPLICATION"
  return null
}
function tokenInText(text: string, token: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text)
}
function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, "") }
