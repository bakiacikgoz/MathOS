import type { GoalProfile, PremiseCandidate } from "./types.ts"
import { formalQueryTokens } from "./normalize.ts"
import { matchGoalToDeclaration, profileDeclarationName, profileGoalName } from "./name-profile.ts"

export type InspectionSelectionReason =
  | "OVERALL" | "NAME" | "STRUCTURE" | "TYPE" | "SYMBOL" | "OPERATOR" | "LOCAL" | "DEPENDENCY" | "DIVERSITY"

export type InspectExclusionReason =
  | "OUTSIDE_TOP200" | "CHANNEL_NOT_ELIGIBLE" | "QUOTA_EXHAUSTED" | "DUPLICATE" | "DIVERSITY_PENALTY"
  | "GENERIC_TOKEN" | "LOW_INFORMATION" | "LOW_SCORE" | "EXCLUDED_STATUS"

export type InspectSelectorMode = "FIXED" | "DYNAMIC" | "SOFT_CONSENSUS" | "SOFT_CONSENSUS_REDUNDANCY"
export type InspectRankChannel = "OVERALL" | "NAME" | "STRUCTURE" | "TYPE" | "SYMBOL" | "OPERATOR" | "LOCAL" | "DEPENDENCY"

export interface CandidateChannelRanks {
  overallRank: number
  nameRank: number | null
  structureRank: number | null
  typeRank: number | null
  symbolRank: number | null
  operatorRank: number | null
  localRank: number | null
  dependencyRank: number | null
}

export interface InspectCandidateDiagnostic {
  ranks: CandidateChannelRanks
  scores: Record<InspectRankChannel, number>
  informationScore: number
  crossChannelStrength: number
  top10Consensus: number
  consensus: "HIGH" | "MEDIUM" | "LOW" | "NONE"
  matchedTokens: string[]
  eligibleChannels: InspectRankChannel[]
  selected: boolean
  selectionReason?: InspectionSelectionReason
  exclusionReason?: InspectExclusionReason
  marginalValue?: number
  redundancyPenalty?: number
}

export interface InspectQuotaTrace {
  channel: InspectionSelectionReason
  minimum: number
  target: number
  softMaximum: number
  selected: number
  eligible: number
  pressure: number
}

export interface SelectedInspectionCandidate {
  candidate: PremiseCandidate
  selectionReason: InspectionSelectionReason
  stage1Rank: number
  diagnostic?: InspectCandidateDiagnostic
}

export interface InspectSelection {
  strategy: "AGGREGATE" | "STRATIFIED"
  selectorVersion: string
  mode: InspectSelectorMode | "AGGREGATE"
  limit: number
  selected: SelectedInspectionCandidate[]
  diagnostics: Record<string, InspectCandidateDiagnostic>
  quotaTrace: InspectQuotaTrace[]
}

export interface InspectCandidateSelector {
  select(candidates: PremiseCandidate[], goal: GoalProfile, limit: number): InspectSelection
}

const GENERIC_NAME_TOKENS = new Set(["refl", "intro", "comm", "apply", "elim", "trans", "symm"])
const CHANNELS: InspectRankChannel[] = ["OVERALL", "NAME", "STRUCTURE", "TYPE", "SYMBOL", "OPERATOR", "LOCAL", "DEPENDENCY"]
const AUTHORITY: Record<InspectRankChannel, number> = {
  OVERALL: 0.7, NAME: 0.82, STRUCTURE: 1.0, TYPE: 1.0, SYMBOL: 1.0, OPERATOR: 0.95, LOCAL: 0.9, DEPENDENCY: 0.88,
}
const FIXED_TARGETS: Record<InspectionSelectionReason, number> = {
  OVERALL: 9, NAME: 6, STRUCTURE: 5, TYPE: 3, SYMBOL: 2, OPERATOR: 1, LOCAL: 1, DEPENDENCY: 1, DIVERSITY: 2,
}
const SOFT: Record<InspectionSelectionReason, { min: number; target: number; max: number }> = {
  OVERALL: { min: 7, target: 9, max: 11 }, NAME: { min: 4, target: 6, max: 9 }, STRUCTURE: { min: 3, target: 5, max: 8 },
  TYPE: { min: 2, target: 3, max: 6 }, SYMBOL: { min: 2, target: 3, max: 6 }, OPERATOR: { min: 1, target: 2, max: 5 },
  LOCAL: { min: 1, target: 1, max: 3 }, DEPENDENCY: { min: 1, target: 1, max: 3 }, DIVERSITY: { min: 0, target: 0, max: 2 },
}

export class AggregateInspectSelector implements InspectCandidateSelector {
  select(candidates: PremiseCandidate[], _goal: GoalProfile, limit: number): InspectSelection {
    const selected = candidates.slice(0, limit).map((candidate, index) => ({ candidate, selectionReason: "OVERALL" as const, stage1Rank: index + 1 }))
    return { strategy: "AGGREGATE", selectorVersion: "aggregate-v1", mode: "AGGREGATE", limit, selected, diagnostics: {}, quotaTrace: [] }
  }
}

export class StratifiedInspectSelector implements InspectCandidateSelector {
  constructor(private readonly mode: InspectSelectorMode = "SOFT_CONSENSUS_REDUNDANCY") {}

  select(candidates: PremiseCandidate[], goal: GoalProfile, limit: number): InspectSelection {
    const rows = candidates.slice(0, 200).map((candidate, index) => makeRow(candidate, index + 1, goal))
    assignChannelRanks(rows)
    const selected: SelectedInspectionCandidate[] = []
    const selectedKeys = new Set<string>()
    const selectedByChannel = new Map<InspectionSelectionReason, number>()
    const quotaTrace: InspectQuotaTrace[] = []

    const take = (reason: InspectionSelectionReason, quota: number, ordered: Row[], eligible: (row: Row) => boolean) => {
      let used = 0
      for (const row of ordered) {
        if (selected.length >= limit || used >= quota) break
        if (!eligible(row) || forbidden(row.candidate) || selectedKeys.has(keyOf(row.candidate))) continue
        add(row, reason)
        used += 1
      }
      return used
    }
    const add = (row: Row, reason: InspectionSelectionReason) => {
      selectedKeys.add(keyOf(row.candidate))
      selectedByChannel.set(reason, (selectedByChannel.get(reason) ?? 0) + 1)
      const diagnostic = row.diagnostic
      diagnostic.selected = true
      diagnostic.selectionReason = reason
      selected.push({ candidate: row.candidate, selectionReason: reason, stage1Rank: row.stage1Rank, diagnostic })
    }
    const channelRows = (channel: InspectRankChannel) => [...rows].filter((row) => row.diagnostic.scores[channel] > 0)
      .sort((a, b) => channelOrder(a, b, channel))

    if (this.mode === "FIXED") {
      const legacyRows = (channel: InspectRankChannel) => [...rows]
        .filter((row) => legacyScore(row.candidate, goal, channel) > 0)
        .sort((a, b) => legacyScore(b.candidate, goal, channel) - legacyScore(a.candidate, goal, channel) || a.stage1Rank - b.stage1Rank || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name))
      for (const reason of Object.keys(FIXED_TARGETS) as InspectionSelectionReason[]) {
        const quota = Math.max(0, Math.round(FIXED_TARGETS[reason] / 30 * limit))
        const channel = reason === "DIVERSITY" ? "OVERALL" : reason as InspectRankChannel
        const ordered = reason === "OVERALL" || reason === "DIVERSITY" ? rows : legacyRows(channel)
        const used = take(reason, quota, ordered, (row) => reason === "DIVERSITY"
          ? selected.every((item) => namespaceOf(item.candidate) !== namespaceOf(row.candidate))
          : reason === "OVERALL" || legacyScore(row.candidate, goal, channel) > 0)
        quotaTrace.push(trace(reason, quota, quota, quota, used, ordered.length))
      }
      take("OVERALL", limit - selected.length, rows, () => true)
    } else if (this.mode === "DYNAMIC") {
      for (const reason of Object.keys(FIXED_TARGETS) as InspectionSelectionReason[]) {
        if (reason === "DIVERSITY") continue
        const channel = reason as InspectRankChannel
        const target = Math.max(0, Math.round(FIXED_TARGETS[reason] / 30 * limit))
        const ordered = channelRows(channel)
        const used = take(reason, target, ordered, (row) => eligibleFor(row, channel))
        quotaTrace.push(trace(reason, target, target, Math.max(target, target + 3), used, ordered.length))
      }
      fillMarginal(rows, selected, selectedKeys, selectedByChannel, limit, false, add)
    } else {
      for (const reason of Object.keys(SOFT) as InspectionSelectionReason[]) {
        if (reason === "DIVERSITY") continue
        const spec = SOFT[reason]
        const minimum = Math.max(0, Math.round(spec.min / 30 * limit))
        const channel = reason as InspectRankChannel
        const ordered = channelRows(channel)
        const used = take(reason, minimum, ordered, (row) => eligibleFor(row, channel))
        quotaTrace.push(trace(reason, minimum, Math.round(spec.target / 30 * limit), Math.round(spec.max / 30 * limit), used, ordered.length))
      }
      fillMarginal(rows, selected, selectedKeys, selectedByChannel, limit, this.mode === "SOFT_CONSENSUS_REDUNDANCY", add)
    }

    if (selected.length < Math.min(limit, rows.filter((row) => !forbidden(row.candidate)).length)) {
      take("OVERALL", limit - selected.length, rows, () => true)
    }
    finalizeDiagnostics(rows, selectedKeys)
    return {
      strategy: "STRATIFIED",
      selectorVersion: this.mode === "FIXED" ? "stratified-v1" : "stratified-v2",
      mode: this.mode,
      limit,
      selected,
      diagnostics: Object.fromEntries(rows.map((row) => [row.candidate.declaration.name, row.diagnostic])),
      quotaTrace,
    }
  }
}

interface Row { candidate: PremiseCandidate; stage1Rank: number; diagnostic: InspectCandidateDiagnostic }

function makeRow(candidate: PremiseCandidate, stage1Rank: number, goal: GoalProfile): Row {
  const matchedTokens = [...new Set(candidate.generation?.matchedTokens ?? [])]
  const name = informativeName(candidate, goal)
  const scores: Record<InspectRankChannel, number> = {
    OVERALL: 1 / Math.sqrt(stage1Rank),
    NAME: name.score + generationRankSignal(candidate, "NAME"),
    STRUCTURE: structureScore(candidate, goal) + generationRankSignal(candidate, "STRUCTURE"),
    TYPE: typeScore(candidate) + generationRankSignal(candidate, "TYPE"),
    SYMBOL: symbolScore(candidate) + generationRankSignal(candidate, "SYMBOL"),
    OPERATOR: operatorScore(candidate) + generationRankSignal(candidate, "OPERATOR"),
    LOCAL: candidate.declaration.origin === "workspace" ? 1 + (candidate.breakdown?.localBoost ?? 0) : 0,
    DEPENDENCY: dependencyScore(candidate) + generationRankSignal(candidate, "DEPENDENCY"),
  }
  const eligibleChannels = CHANNELS.filter((channel) => scores[channel] > 0)
  const informationScore = name.information + multiChannelTokenInformation(candidate, matchedTokens)
  return {
    candidate, stage1Rank,
    diagnostic: {
      ranks: { overallRank: stage1Rank, nameRank: null, structureRank: null, typeRank: null, symbolRank: null, operatorRank: null, localRank: null, dependencyRank: null },
      scores, informationScore, crossChannelStrength: 0, top10Consensus: 0, consensus: "NONE", matchedTokens,
      eligibleChannels, selected: false,
    },
  }
}

function assignChannelRanks(rows: Row[]): void {
  for (const channel of CHANNELS.filter((value) => value !== "OVERALL")) {
    const ranked = rows.filter((row) => row.diagnostic.scores[channel] > 0).sort((a, b) => channelOrder(a, b, channel))
    ranked.forEach((row, index) => setRank(row.diagnostic.ranks, channel, index + 1))
  }
  for (const row of rows) {
    let strength = 0
    let top10 = 0
    for (const channel of CHANNELS.filter((value) => value !== "OVERALL")) {
      const rank = getRank(row.diagnostic.ranks, channel)
      if (!rank) continue
      const contribution = AUTHORITY[channel] / Math.sqrt(rank)
      strength += contribution
      if (rank <= 10 && row.diagnostic.scores[channel] >= 1) top10 += 1
    }
    row.diagnostic.top10Consensus = top10
    row.diagnostic.crossChannelStrength = strength
    row.diagnostic.consensus = top10 >= 3 ? "HIGH" : top10 >= 2 ? "MEDIUM" : strength > 0 ? "LOW" : "NONE"
  }
}

function fillMarginal(
  rows: Row[], selected: SelectedInspectionCandidate[], selectedKeys: Set<string>, selectedByChannel: Map<InspectionSelectionReason, number>,
  limit: number, redundancy: boolean, add: (row: Row, reason: InspectionSelectionReason) => void,
): void {
  while (selected.length < limit) {
    const candidates = rows.filter((row) => !selectedKeys.has(keyOf(row.candidate)) && !forbidden(row.candidate))
    if (!candidates.length) break
    for (const row of candidates) {
      const novel = novelSignal(row, selected)
      const pressure = pressureBonus(row, selectedByChannel)
      const redundancyPenalty = redundancy ? redundancyAgainst(row, selected) : 0
      row.diagnostic.redundancyPenalty = redundancyPenalty
      row.diagnostic.marginalValue =
        row.diagnostic.crossChannelStrength * 2.8 + row.diagnostic.informationScore * 0.35 + novel * 1.2 + pressure
        + 1 / Math.sqrt(row.stage1Rank) - redundancyPenalty
    }
    candidates.sort((a, b) => (b.diagnostic.marginalValue ?? 0) - (a.diagnostic.marginalValue ?? 0) || a.stage1Rank - b.stage1Rank || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name))
    const winner = candidates[0]!
    const reason = strongestReason(winner)
    add(winner, reason)
  }
}

function pressureBonus(row: Row, selected: Map<InspectionSelectionReason, number>): number {
  let best = 0
  for (const channel of row.diagnostic.eligibleChannels) {
    if (channel === "OVERALL") continue
    const reason = channel as InspectionSelectionReason
    const spec = SOFT[reason]
    if (!spec) continue
    const used = selected.get(reason) ?? 0
    if (used < spec.max) best = Math.max(best, (spec.max - used) * 0.08 * AUTHORITY[channel])
  }
  return best
}

function novelSignal(row: Row, selected: SelectedInspectionCandidate[]): number {
  const represented = new Set(selected.flatMap((item) => item.diagnostic?.eligibleChannels ?? []))
  const novelChannels = row.diagnostic.eligibleChannels.filter((channel) => channel !== "OVERALL" && !represented.has(channel)).length
  return Math.min(2, novelChannels) + (row.diagnostic.top10Consensus >= 2 ? 0.5 : 0)
}

function redundancyAgainst(row: Row, selected: SelectedInspectionCandidate[]): number {
  const ns = namespaceOf(row.candidate)
  const pattern = declarationPattern(row.candidate.declaration.name)
  const signature = signaturePattern(row.candidate.declaration.signature)
  let sameNamespace = 0
  let samePattern = 0
  let sameSignature = 0
  for (const item of selected) {
    if (namespaceOf(item.candidate) === ns) sameNamespace += 1
    if (declarationPattern(item.candidate.declaration.name) === pattern) samePattern += 1
    if (signaturePattern(item.candidate.declaration.signature) === signature) sameSignature += 1
  }
  const authoritative = row.diagnostic.top10Consensus >= 2 || row.diagnostic.informationScore >= 4
  const penalty = Math.max(0, sameNamespace - 4) * 0.1 + Math.max(0, samePattern - 1) * 0.35 + Math.max(0, sameSignature - 2) * 0.25
  return authoritative ? penalty * 0.35 : penalty
}

function strongestReason(row: Row): InspectionSelectionReason {
  const channels = row.diagnostic.eligibleChannels.filter((channel) => channel !== "OVERALL")
  if (!channels.length) return "OVERALL"
  channels.sort((a, b) => {
    const ar = getRank(row.diagnostic.ranks, a) ?? 999
    const br = getRank(row.diagnostic.ranks, b) ?? 999
    return AUTHORITY[b] / Math.sqrt(br) - AUTHORITY[a] / Math.sqrt(ar) || a.localeCompare(b)
  })
  return channels[0] as InspectionSelectionReason
}

function finalizeDiagnostics(rows: Row[], selected: Set<string>): void {
  for (const row of rows) {
    if (selected.has(keyOf(row.candidate))) continue
    const diagnostic = row.diagnostic
    if (forbidden(row.candidate)) diagnostic.exclusionReason = "EXCLUDED_STATUS"
    else if (diagnostic.eligibleChannels.length <= 1) diagnostic.exclusionReason = diagnostic.informationScore <= 0 ? "LOW_INFORMATION" : "CHANNEL_NOT_ELIGIBLE"
    else if (diagnostic.marginalValue !== undefined) diagnostic.exclusionReason = diagnostic.redundancyPenalty && diagnostic.redundancyPenalty > 0.5 ? "DIVERSITY_PENALTY" : "LOW_SCORE"
    else diagnostic.exclusionReason = "QUOTA_EXHAUSTED"
  }
}

function legacyScore(candidate: PremiseCandidate, goal: GoalProfile, channel: InspectRankChannel): number {
  if (channel === "OVERALL") return 1
  if (channel === "NAME") return legacyNameScore(candidate, goal)
  if (channel === "STRUCTURE") return structureScore(candidate, goal)
  if (channel === "TYPE") return typeScore(candidate)
  if (channel === "SYMBOL") return symbolScore(candidate)
  if (channel === "OPERATOR") return operatorScore(candidate)
  if (channel === "LOCAL") return Number(candidate.declaration.origin === "workspace")
  return dependencyScore(candidate)
}

function legacyNameScore(candidate: PremiseCandidate, goal: GoalProfile): number {
  const tokens = formalQueryTokens(goal.rawTarget)
  const goalName = profileGoalName(tokens, goal.operators, goal.typeConstructors, goal.propositionHead)
  const declaration = profileDeclarationName(candidate.declaration.name)
  const match = matchGoalToDeclaration(goalName, declaration)
  const multiplicity = repeatedTokenScore(tokens, declaration.normalizedTokens)
  const informative = match.matchedTokens.filter((token) => !GENERIC_NAME_TOKENS.has(token))
  const namespaceRelevant = goal.namespaces.some((ns) => declaration.namespaceTokens.includes(ns))
  const typeRelevant = goal.typeConstructors.some((type) => declaration.normalizedTokens.includes(type))
  if (informative.length < 2 && !(informative.length === 1 && (namespaceRelevant || typeRelevant))) return 0
  return informative.length * 4 + match.coverage * 3 + match.bigramHits * 2 + match.trigramHits * 3 + Number(match.ordered) * 2 + multiplicity * 2 + Number(namespaceRelevant || typeRelevant)
}

function informativeName(candidate: PremiseCandidate, goal: GoalProfile): { score: number; information: number } {
  const tokens = formalQueryTokens(goal.rawTarget)
  const goalName = profileGoalName(tokens, goal.operators, goal.typeConstructors, goal.propositionHead)
  const declaration = profileDeclarationName(candidate.declaration.name)
  const match = matchGoalToDeclaration(goalName, declaration)
  const informative = match.matchedTokens.filter((token) => !GENERIC_NAME_TOKENS.has(token))
  const generic = match.matchedTokens.filter((token) => GENERIC_NAME_TOKENS.has(token))
  const namespaceRelevant = goal.namespaces.some((ns) => declaration.namespaceTokens.includes(ns))
  const typeRelevant = goal.typeConstructors.some((type) => declaration.normalizedTokens.includes(type))
  const combination = informative.length >= 1 && generic.length >= 1 ? 2 : 0
  const information = informative.length * 2 + Math.max(0, informative.length - 1) * 2 + combination + repeatedTokenScore(tokens, declaration.normalizedTokens)
  if (informative.length < 2 && !(informative.length === 1 && (namespaceRelevant || typeRelevant || generic.length > 0))) return { score: 0, information }
  return {
    score: informative.length * 4 + match.coverage * 3 + match.bigramHits * 2 + match.trigramHits * 3 + Number(match.ordered) * 2 + combination + Number(namespaceRelevant || typeRelevant),
    information,
  }
}

function multiChannelTokenInformation(candidate: PremiseCandidate, matched: string[]): number {
  const informative = matched.filter((token) => !GENERIC_NAME_TOKENS.has(token.toLowerCase())).length
  const generic = matched.filter((token) => GENERIC_NAME_TOKENS.has(token.toLowerCase())).length
  return informative * 0.7 + (informative > 0 && generic > 0 ? 1 : 0) + Math.max(0, new Set(candidate.generation?.channels ?? []).size - 1) * 0.35
}

function repeatedTokenScore(goalTokens: string[], declarationTokens: string[]): number {
  const count = (items: string[], token: string) => items.filter((item) => item === token).length
  let score = 0
  for (const token of new Set(goalTokens)) score += Math.min(count(goalTokens, token), count(declarationTokens, token))
  return score
}

function structureScore(candidate: PremiseCandidate, goal: GoalProfile): number {
  const lower = candidate.declaration.name.toLowerCase()
  const tokens = profileDeclarationName(candidate.declaration.name).normalizedTokens
  let score = (candidate.breakdown?.conclusion ?? 0) * 10 + (candidate.breakdown?.propositionShape ?? 0) * 8
  if (goal.isExistential && (lower.startsWith("exists.") || tokens.includes("exists") || tokens.includes("existential"))) score += 10
  if (goal.isIff && (lower.startsWith("iff.") || tokens.includes("iff"))) score += 5
  if (goal.isIff && tokens.some((token) => token === "symm" || token === "comm")) score += 4
  const raw = goal.rawTarget.toLowerCase()
  if (raw.includes("⊆") && tokens.includes("subset") && tokens.includes("refl")) score += 10
  if ((goal.operatorMultiplicity?.neg ?? 0) >= 2 && tokens.filter((token) => token === "neg").length >= 2) score += 10
  return score
}
function typeScore(candidate: PremiseCandidate): number { return (candidate.breakdown?.typeOverlap ?? 0) * 10 + Number(candidate.generation?.channels.includes("TYPE")) }
function symbolScore(candidate: PremiseCandidate): number { return (candidate.breakdown?.symbol ?? 0) * 10 + Number(candidate.generation?.channels.includes("SYMBOL")) }
function operatorScore(candidate: PremiseCandidate): number { return Number(candidate.generation?.channels.includes("OPERATOR")) * 2 + Number(candidate.reasons.includes("constant overlap")) }
function dependencyScore(candidate: PremiseCandidate): number { return (candidate.breakdown?.dependencyBoost ?? 0) * 10 + Number(candidate.generation?.channels.includes("DEPENDENCY")) }

function generationRankSignal(candidate: PremiseCandidate, channel: string): number {
  const rank = candidate.generation?.channelRanks?.[channel]
  return rank && rank > 0 ? 4 / Math.sqrt(rank) : 0
}
function channelOrder(a: Row, b: Row, channel: InspectRankChannel): number {
  return b.diagnostic.scores[channel] - a.diagnostic.scores[channel] || b.diagnostic.informationScore - a.diagnostic.informationScore || a.stage1Rank - b.stage1Rank || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name)
}
function eligibleFor(row: Row, channel: InspectRankChannel): boolean { return row.diagnostic.scores[channel] > 0 }
function diversityEligible(row: Row, selected: SelectedInspectionCandidate[]): boolean {
  const count = selected.filter((item) => namespaceOf(item.candidate) === namespaceOf(row.candidate)).length
  return count < 2 || row.diagnostic.top10Consensus >= 2
}
function trace(channel: InspectionSelectionReason, min: number, target: number, max: number, selected: number, eligible: number): InspectQuotaTrace {
  return { channel, minimum: min, target, softMaximum: max, selected, eligible, pressure: Math.max(0, eligible - selected) }
}
function setRank(ranks: CandidateChannelRanks, channel: InspectRankChannel, value: number): void {
  const key = `${channel.toLowerCase()}Rank` as keyof CandidateChannelRanks
  ;(ranks as unknown as Record<string, number | null>)[key] = value
}
function getRank(ranks: CandidateChannelRanks, channel: InspectRankChannel): number | null {
  return (ranks as unknown as Record<string, number | null>)[`${channel.toLowerCase()}Rank`] ?? null
}
function namespaceOf(candidate: PremiseCandidate): string { return candidate.declaration.name.split(".")[0]?.toLowerCase() ?? "root" }
function declarationPattern(name: string): string { return name.split(".").at(-1)?.toLowerCase().replace(/'$/g, "").replace(/_(iff|of|left|right|le|lt|eq).*$/g, "") ?? name }
function signaturePattern(signature: string): string { return signature.toLowerCase().replace(/[a-z_][a-z0-9_']*/g, "x").replace(/\s+/g, " ").slice(-100) }
function keyOf(candidate: PremiseCandidate): string { return candidate.declaration.name.toLowerCase() }
function forbidden(candidate: PremiseCandidate): boolean { return candidate.declaration.claimStatus === "STALE" || candidate.declaration.claimStatus === "DISPROVED" }
