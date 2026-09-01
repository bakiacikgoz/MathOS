import type { LeanDeclarationInspection } from "@mathos/lean"
import type { FusionMethod, GoalProfile, PremiseCandidate } from "./types.ts"
import { profileCandidate } from "./profile.ts"

export interface FusionOptions {
  method: FusionMethod
  stage1Weight?: number
  leanWeight?: number
  rrfK?: number
}

export interface FusionResult {
  candidates: PremiseCandidate[]
  method: FusionMethod
}

export function enrichForLean(
  candidates: PremiseCandidate[],
  inspections: LeanDeclarationInspection[],
  goal: GoalProfile | null,
  cacheHits: Set<string> = new Set(),
): PremiseCandidate[] {
  const byName = new Map(inspections.map((item) => [item.name, item]))
  return candidates
    .filter((item) => byName.get(item.declaration.name)?.exists !== false)
    .map((item, index) => {
      const inspected = byName.get(item.declaration.name)
      const stage1Rank = item.stage1Rank ?? index + 1
      const merged = mergeInspection(item, inspected, cacheHits.has(item.declaration.name))
      return adjustElaborated({ ...merged, stage1Rank }, goal)
    })
}

export function fuseCandidateRanks(
  stage1: PremiseCandidate[],
  leanAdjusted: PremiseCandidate[],
  options: FusionOptions,
): FusionResult {
  const stage1Ranks = new Map(stage1.map((item, index) => [item.declaration.name, index + 1]))
  const leanSorted = [...leanAdjusted].sort((a, b) => b.score - a.score || (stage1Ranks.get(a.declaration.name) ?? 1e9) - (stage1Ranks.get(b.declaration.name) ?? 1e9) || a.declaration.name.localeCompare(b.declaration.name))
  const leanRanks = new Map(leanSorted.map((item, index) => [item.declaration.name, index + 1]))
  const stageNorm = normalizeScores(stage1)
  const leanNorm = normalizeScores(leanSorted)
  const stageWeight = options.stage1Weight ?? 0.45
  const leanWeight = options.leanWeight ?? 0.55
  const rrfK = options.rrfK ?? 60

  const fused = leanAdjusted.map((item) => {
    const name = item.declaration.name
    const stage1Rank = stage1Ranks.get(name) ?? stage1.length + 1
    const leanRank = leanRanks.get(name) ?? leanAdjusted.length + 1
    const stage1Normalized = stageNorm.get(name) ?? 0
    const leanNormalized = leanNorm.get(name) ?? 0
    let score = item.score
    if (options.method === "SCORE_FUSION") score = stageWeight * stage1Normalized + leanWeight * leanNormalized
    if (options.method === "RRF") score = 1 / (rrfK + stage1Rank) + 1 / (rrfK + leanRank)
    return {
      ...item,
      score: Number(score.toFixed(8)),
      stage1Rank,
      leanRank,
      stage1Normalized,
      leanNormalized,
      fusionMethod: options.method,
    }
  })

  fused.sort((a, b) => b.score - a.score || (a.stage1Rank ?? 1e9) - (b.stage1Rank ?? 1e9) || a.declaration.name.localeCompare(b.declaration.name))
  return {
    method: options.method,
    candidates: fused.map((item, index) => ({ ...item, finalRank: index + 1 })),
  }
}

export function normalizeScores(candidates: PremiseCandidate[]): Map<string, number> {
  if (candidates.length === 0) return new Map()
  const scores = candidates.map((item) => item.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  if (max === min) return new Map(candidates.map((item) => [item.declaration.name, 0.5]))
  return new Map(candidates.map((item) => [item.declaration.name, (item.score - min) / (max - min)]))
}

function mergeInspection(item: PremiseCandidate, inspected: LeanDeclarationInspection | undefined, cacheHit: boolean): PremiseCandidate {
  // Missing metadata is UNKNOWN and neutral: preserve Stage-1 candidate unchanged.
  if (!inspected?.elaborated || !inspected.type) return { ...item, typeSource: item.typeSource ?? "HEADER", cacheHit }
  const profile = profileCandidate({ ...item.declaration, signature: inspected.type })
  return {
    ...item,
    declaration: { ...item.declaration, signature: inspected.type },
    profile: { ...profile, typeSource: "LEAN_ELABORATED", known: true },
    typeSource: "LEAN_ELABORATED",
    cacheHit,
    reasons: [...new Set([...item.reasons, "exact type"])],
  }
}

function adjustElaborated(item: PremiseCandidate, goal: GoalProfile | null): PremiseCandidate {
  if (!goal || item.typeSource !== "LEAN_ELABORATED" || !item.profile) return item
  let extra = 0
  const reasons = [...item.reasons]
  if (goal.propositionHead && item.profile.conclusionHead === goal.propositionHead) {
    extra += 0.18
    reasons.push("elaborated conclusion match")
  } else if (goal.known && item.profile.known && goal.propositionHead && item.profile.conclusionHead && goal.propositionHead !== item.profile.conclusionHead) {
    extra -= 0.22
    reasons.push("strong mismatch")
  }
  const typeHits = goal.typeConstructors.filter((token) => item.profile!.typeConstructors.includes(token)).length
  if (typeHits > 0) extra += 0.08
  return { ...item, score: Math.max(0, Number((item.score + extra).toFixed(3))), reasons: [...new Set(reasons)] }
}
