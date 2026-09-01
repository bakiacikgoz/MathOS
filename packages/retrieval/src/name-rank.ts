import type { GoalProfile, LeanDeclaration, PremiseCandidate, PremiseRetrievalRequest, RetrievalScoreBreakdown } from "./types.ts"
import { tokenize } from "./parse.ts"
import { tokenizeName, formalQueryTokens } from "./normalize.ts"
import { profileDeclarationName, matchGoalToDeclaration, profileGoalName, type GoalNameProfile } from "./name-profile.ts"
import type { ChannelIndex } from "./channels.ts"

const FORBIDDEN = new Set(["DISPROVED", "STALE"])

export interface NameScoreBreakdown {
  lexical: number
  nameCoverage: number
  orderedMatch: number
  bigram: number
  trigram: number
  exactSuffix: number
  idfBoost: number
  channelBonus: number
  namespace: number
  typeOverlap: number
  structure: number
  localBoost: number
  dependencyBoost: number
  penalties: number
}

export function nameAwareRank(
  union: PremiseCandidate[],
  goal: GoalProfile | null,
  request: PremiseRetrievalRequest,
  channelIndex?: ChannelIndex | null,
): PremiseCandidate[] {
  const goalTokens = goal ? formalQueryTokens(goal.rawTarget) : tokenize(request.query)
  const goalNameProfile = goal
    ? profileGoalName(goalTokens, goal.operators, goal.typeConstructors, goal.propositionHead)
    : profileGoalName(goalTokens, [], [], undefined)
  const exclude = new Set((request.excludeNames ?? []).map((item) => item.toLowerCase()))
  const previous = new Set((request.previousNames ?? []).map((item) => item.toLowerCase()))
  const deps = new Set((request.dependencyNames ?? []).map((item) => item.toLowerCase()))
  const allowed = new Set(request.allowedLocalStatuses ?? ["KERNEL_VERIFIED"])
  const tokenStats = channelIndex?.tokenStats
  const N = tokenStats?.totalDocuments ?? 1

  const scored = union
    .filter((item) => !exclude.has(item.declaration.name.toLowerCase()))
    .filter((item) => {
      if (item.declaration.claimStatus && FORBIDDEN.has(item.declaration.claimStatus)) return false
      if (item.declaration.origin === "workspace" && item.declaration.claimStatus && !allowed.has(item.declaration.claimStatus)) return false
      return true
    })
    .map((item) => scoreNameAware(item, goalNameProfile, goal, { previous, deps, tokenStats, N }))

  scored.sort((a, b) => {
    const sa = a.score
    const sb = b.score
    if (Math.abs(sa - sb) > 0.001) return sb - sa
    const ba = a.breakdown as unknown as NameScoreBreakdown
    const bb = b.breakdown as unknown as NameScoreBreakdown
    if (ba && bb) {
      if (Math.abs(ba.nameCoverage - bb.nameCoverage) > 0.001) return bb.nameCoverage - ba.nameCoverage
      const ca = a.generation?.channels.length ?? 0
      const cb = b.generation?.channels.length ?? 0
      if (ca !== cb) return cb - ca
    }
    return a.declaration.name.localeCompare(b.declaration.name)
  })

  const limit = request.candidatePool ?? 200
  return scored.slice(0, limit)
}

function scoreNameAware(
  item: PremiseCandidate,
  goalName: GoalNameProfile,
  goal: GoalProfile | null,
  ctx: { previous: Set<string>; deps: Set<string>; tokenStats: { documentFrequency: Record<string, number>; totalDocuments: number; rareThreshold: number } | undefined; N: number },
): PremiseCandidate {
  const declProfile = profileDeclarationName(item.declaration.name)
  const match = matchGoalToDeclaration(goalName, declProfile)
  const breakdown: NameScoreBreakdown = {
    lexical: item.score,
    nameCoverage: 0,
    orderedMatch: 0,
    bigram: 0,
    trigram: 0,
    exactSuffix: 0,
    idfBoost: 0,
    channelBonus: 0,
    namespace: 0,
    typeOverlap: 0,
    structure: 0,
    localBoost: 0,
    dependencyBoost: 0,
    penalties: 0,
  }
  const reasons = [...item.reasons]

  // Multi-token coverage — strongest name signal
  if (match.coverage > 0) {
    breakdown.nameCoverage = match.coverage * 0.35
    reasons.push(`name coverage ${match.matchedTokens.length}/${goalName.primaryTokens.length}`)
    if (match.coverage >= 1) {
      breakdown.nameCoverage += 0.15
      reasons.push("full name coverage")
    }
  }

  // Ordered match boost
  if (match.ordered) {
    breakdown.orderedMatch = 0.12
    reasons.push("ordered token match")
  }

  // N-gram boosts
  if (match.bigramHits > 0) {
    breakdown.bigram = Math.min(0.12, 0.05 * match.bigramHits)
    reasons.push(`${match.bigramHits} bigram match`)
  }
  if (match.trigramHits > 0) {
    breakdown.trigram = Math.min(0.1, 0.06 * match.trigramHits)
    reasons.push(`${match.trigramHits} trigram match`)
  }

  // Exact suffix
  if (match.exactSuffix) {
    breakdown.exactSuffix = 0.08
    reasons.push("semantic suffix match")
  }

  // IDF boost
  if (ctx.tokenStats) {
    let idfSum = 0
    for (const token of match.matchedTokens) {
      const df = ctx.tokenStats.documentFrequency[token] ?? 0
      if (df > 0 && df < ctx.tokenStats.rareThreshold) {
        const idf = Math.log(1 + ctx.N / df)
        idfSum += Math.min(0.04, idf * 0.008)
      }
    }
    if (idfSum > 0) {
      breakdown.idfBoost = Math.min(0.08, idfSum)
      reasons.push("rare token IDF boost")
    }
  }

  // Multi-channel diminishing bonus
  if (item.generation && item.generation.channels.length > 1) {
    const ch = item.generation.channels.length
    breakdown.channelBonus = Math.min(0.1, 0.025 * ch + 0.015)
    reasons.push(`${ch} channels`)
  }

  // Namespace overlap
  if (goal) {
    const nameLower = item.declaration.name.toLowerCase()
    if (goal.namespaces.some((ns) => declProfile.namespaceTokens.includes(ns) || nameLower.startsWith(`${ns}.`))) {
      breakdown.namespace = 0.06
      reasons.push("namespace overlap")
    }
    const typeHits = goal.typeConstructors.filter((token) => declProfile.normalizedTokens.includes(token)).length
    if (typeHits > 0) {
      breakdown.typeOverlap = 0.05
      reasons.push("type constructor overlap")
    }
    if (goal.propositionHead && declProfile.normalizedTokens.includes(goal.propositionHead.toLowerCase())) {
      breakdown.structure = 0.08
      reasons.push("proposition head match")
    }
    if (item.declaration.origin === "workspace" && item.declaration.claimStatus === "KERNEL_VERIFIED") {
      breakdown.localBoost = 0.1
      reasons.push("KERNEL_VERIFIED local")
    }
  }

  // Dependency boost
  const id = item.declaration.claimId?.toLowerCase()
  if (id && ctx.deps.has(id)) {
    breakdown.dependencyBoost = 0.12
    reasons.push("dependency proximity")
  }

  // Penalties
  if (ctx.previous.has(item.declaration.name.toLowerCase())) {
    breakdown.penalties += 0.05
    reasons.push("already tried")
  }
  if (item.declaration.unsafeForRelease) {
    breakdown.penalties += 0.25
    reasons.push("unsafe_for_release")
  }

  // Keep existing lexical score and ADD name-aware signals
  const score = Math.max(0,
    breakdown.lexical +
    breakdown.nameCoverage + breakdown.orderedMatch + breakdown.bigram + breakdown.trigram +
    breakdown.exactSuffix + breakdown.idfBoost + breakdown.channelBonus +
    breakdown.namespace + breakdown.typeOverlap + breakdown.structure +
    breakdown.localBoost + breakdown.dependencyBoost - breakdown.penalties,
  )

  return {
    ...item,
    score: Number(score.toFixed(3)),
    breakdown: breakdown as unknown as RetrievalScoreBreakdown,
    reasons: [...new Set(reasons)],
  }
}
