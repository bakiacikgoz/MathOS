import type {
  CandidateProfile,
  GoalProfile,
  PremiseCandidate,
  PremiseRetrievalRequest,
  RetrievalScoreBreakdown,
} from "./types.ts"
import { profileCandidate, signatureFingerprint } from "./profile.ts"

export function applyGoalAwareRerank(
  pool: PremiseCandidate[],
  goal: GoalProfile | null,
  request: PremiseRetrievalRequest,
): PremiseCandidate[] {
  const exclude = new Set((request.excludeNames ?? []).map((item) => item.toLowerCase()))
  const previous = new Set((request.previousNames ?? []).map((item) => item.toLowerCase()))
  const deps = new Set((request.dependencyNames ?? []).map((item) => item.toLowerCase()))
  const unknown = new Set((request.unknownIdentifiers ?? []).map((item) => item.toLowerCase()))

  const rescored = pool
    .filter((item) => !exclude.has(item.declaration.name.toLowerCase()))
    .map((item) => scoreAgainstGoal(item, goal, { deps, unknown, previous, fallback: !goal }))

  rescored.sort((a, b) => b.score - a.score || a.declaration.name.localeCompare(b.declaration.name))
  return diversify(dedupeSignatures(rescored), request.maxPremises ?? 20)
}

function scoreAgainstGoal(
  item: PremiseCandidate,
  goal: GoalProfile | null,
  ctx: { deps: Set<string>; unknown: Set<string>; previous: Set<string>; fallback: boolean },
): PremiseCandidate {
  const profile = item.profile ?? profileCandidate(item.declaration)
  const breakdown: RetrievalScoreBreakdown = {
    lexical: item.score,
    symbol: 0,
    namespace: 0,
    typeOverlap: 0,
    conclusion: 0,
    propositionShape: 0,
    localBoost: 0,
    dependencyBoost: 0,
    penalties: 0,
  }
  const reasons = [...item.reasons]

  if (goal) {
    const nameLower = item.declaration.name.toLowerCase()
    const overlap = (a: string[], b: string[]) => a.filter((token) => b.includes(token)).length
    const symbolHits = overlap(goal.constants, profile.constants) + overlap(goal.operators ?? [], profile.constants)
    if (symbolHits > 0) {
      breakdown.symbol = Math.min(0.28, 0.07 * symbolHits)
      reasons.push("constant overlap")
    }
    if (goal.namespaces.some((ns) => profile.namespaces.includes(ns) || nameLower.startsWith(`${ns}.`))) {
      breakdown.namespace = 0.16
      reasons.push("namespace overlap")
    }
    if (overlap(goal.typeConstructors, profile.typeConstructors) > 0) {
      breakdown.typeOverlap = 0.14
      reasons.push("type constructor overlap")
    }
    if (goal.propositionHead && profile.conclusionHead && goal.propositionHead === profile.conclusionHead) {
      breakdown.conclusion = 0.26
      reasons.push("conclusion shape match")
    } else if (goal.known && profile.known && goal.propositionHead && profile.conclusionHead && goal.propositionHead !== profile.conclusionHead) {
      breakdown.penalties += 0.32
      reasons.push("conclusion mismatch")
    }
    if (isReflexiveEquality(goal.rawTarget) && /rfl$|\.refl$|^rfl$/i.test(item.declaration.name)) {
      breakdown.conclusion += 0.3
      reasons.push("reflexive equality")
    }
    const shape =
      Number(goal.isEquality === profile.isEquality && goal.isEquality) +
      Number(goal.isIff === profile.isIff && goal.isIff) +
      Number(goal.isImplication === profile.isImplication && goal.isImplication)
    if (shape > 0) {
      breakdown.propositionShape = 0.1 * shape
      reasons.push("proposition shape match")
    }
    if (item.declaration.origin === "workspace" && (breakdown.symbol > 0 || breakdown.conclusion > 0 || breakdown.typeOverlap > 0)) {
      breakdown.localBoost = item.declaration.claimStatus === "KERNEL_VERIFIED" ? 0.18 : 0.06
    } else if (item.declaration.origin === "workspace" && breakdown.symbol === 0 && breakdown.conclusion === 0) {
      breakdown.penalties += 0.2
      reasons.push("unrelated local lemma")
    }
    const id = item.declaration.claimId?.toLowerCase()
    if (id && ctx.deps.has(id)) {
      breakdown.dependencyBoost = 0.22
      reasons.push("dependency proximity")
    }
    if ([...ctx.unknown].some((name) => nameLower === name || nameLower.endsWith(`.${name}`))) {
      breakdown.symbol += 0.2
      reasons.push("unknown identifier match")
    }
  } else if (ctx.fallback) {
    breakdown.penalties += 0.12
    reasons.push("weak prose-only match")
  }

  if (ctx.previous.has(item.declaration.name.toLowerCase())) {
    breakdown.penalties += 0.08
    reasons.push("already tried")
  }
  if (item.declaration.unsafeForRelease) breakdown.penalties += 0.25

  const score = Math.max(
    0,
    breakdown.lexical +
      breakdown.symbol +
      breakdown.namespace +
      breakdown.typeOverlap +
      breakdown.conclusion +
      breakdown.propositionShape +
      breakdown.localBoost +
      breakdown.dependencyBoost -
      breakdown.penalties,
  )
  return {
    ...item,
    profile,
    breakdown,
    score: Math.min(1, Number(score.toFixed(3))),
    reasons: [...new Set(reasons)],
  }
}

function dedupeSignatures(items: PremiseCandidate[]): PremiseCandidate[] {
  const seen = new Set<string>()
  const out: PremiseCandidate[] = []
  for (const item of items) {
    const key = signatureFingerprint(item.declaration)
    if (seen.has(key) && (item.score ?? 0) < 0.9) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function diversify(items: PremiseCandidate[], limit: number): PremiseCandidate[] {
  const counts = new Map<string, number>()
  const selected: PremiseCandidate[] = []
  for (const item of items) {
    const ns = item.declaration.name.split(".")[0] ?? "root"
    const used = counts.get(ns) ?? 0
    if (used >= 6 && item.score < 0.85) continue
    counts.set(ns, used + 1)
    selected.push(item)
    if (selected.length >= limit) break
  }
  return selected
}

function isReflexiveEquality(target: string): boolean {
  const match = target.match(/([A-Za-z0-9_'.]+)\s*=\s*([A-Za-z0-9_'.]+)/)
  return Boolean(match && match[1] === match[2])
}
