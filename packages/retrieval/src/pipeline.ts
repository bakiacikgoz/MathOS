import type { GoalProfile, LeanDeclaration, PremiseCandidate, PremiseRetrievalRequest, PremiseRetrievalResult, RetrievalMode } from "./types.ts"
import { DEFAULT_RETRIEVAL_CONFIG } from "./types.ts"
import { rankDeclarations } from "./rank.ts"
import { applyGoalAwareRerank } from "./rerank.ts"
import { profileGoal } from "./profile.ts"
import { buildChannelIndex, generateCandidates, DEFAULT_GENERATION_CONFIG, type ChannelIndex } from "./channels.ts"
import { nameAwareRank } from "./name-rank.ts"
import { formalQueryTokens } from "./normalize.ts"

const PROSE_STOP = new Set(["for", "every", "the", "and", "that", "with", "from", "this", "natural", "number", "prove", "show"])

export function retrieveFromDeclarations(
  declarations: LeanDeclaration[],
  request: PremiseRetrievalRequest,
  indexRevision: string | null,
  channels?: ChannelIndex | null,
): PremiseRetrievalResult {
  const mode = resolveMode(request)
  const goal = request.goal && request.goalAware !== false ? profileGoal(request.goal) : null
  const poolSize = request.candidatePool ?? DEFAULT_RETRIEVAL_CONFIG.candidatePool
  const formal = Boolean(goal)
  const index = channels ?? buildChannelIndex(declarations)
  const generated = generateCandidates(declarations, index, {
    goalText: request.goal ?? request.query,
    goal,
    unknownIdentifiers: request.unknownIdentifiers,
    dependencyNames: request.dependencyNames,
    allowedLocalStatuses: request.allowedLocalStatuses,
    formal,
    config: DEFAULT_GENERATION_CONFIG,
  })
  const generatedDecls = generated.map((item) => item.declaration)
  const evidenceByName = new Map(generated.map((item) => [item.declaration.name, item.evidence]))

  // Step 1: Get lexical scores on the union (keeps signature/symbol overlap signals)
  const lexicalQuery = formal
    ? formalQueryTokens(request.goal ?? request.query).join(" ")
    : request.query
      .split(/\s+/)
      .filter((token) => !PROSE_STOP.has(token.toLowerCase()))
      .join(" ")
  const source = generatedDecls.length ? generatedDecls : declarations
  const lexical = rankDeclarations(source, {
    ...request,
    query: lexicalQuery,
    goal: request.goal,
    maxPremises: Math.max(poolSize, request.maxPremises ?? 20),
  })

  // Step 2: Name-aware cheap rerank on the lexical-scored union → top 200
  const ranked = nameAwareRank(lexical, goal, {
    ...request,
    candidatePool: poolSize,
  }, index)

  // Step 3: Attach generation evidence
  const withEvidence = ranked.map((item) => {
    const evidence = evidenceByName.get(item.declaration.name)
    return evidence ? { ...item, generation: { channels: evidence.channels, matchedTokens: evidence.matchedTokens, channelRanks: evidence.channelRanks as Record<string, number> } } : item
  })

  // Step 4: Goal-aware structural rerank (type/conclusion/shape) → final pool
  const final = request.goalAware === false
    ? withEvidence.slice(0, request.maxPremises ?? 20)
    : applyGoalAwareRerank(withEvidence, goal, { ...request, maxPremises: poolSize })

  const channelCounts: Record<string, number> = {}
  for (const item of generated) {
    for (const channel of item.evidence.channels) channelCounts[channel] = (channelCounts[channel] ?? 0) + 1
  }
  return {
    candidates: final,
    indexRevision,
    query: request.query,
    localCount: final.filter((item) => item.declaration.origin === "workspace").length,
    mathlibCount: final.filter((item) => item.declaration.origin === "mathlib").length,
    mode,
    warning:
      mode === "NATURAL_FALLBACK"
        ? "Formal goal unavailable. Premise ranking is using natural-language fallback and may be noisy. Formalize the claim for goal-aware retrieval."
        : undefined,
    goalProfile: goal ?? undefined,
    candidatePoolSize: withEvidence.length,
    unionSize: generated.length,
    generation: { union: generated.length, channels: channelCounts },
  }
}

export function explainCandidate(item: PremiseCandidate): string[] {
  const lines: string[] = []
  if (item.generation) {
    lines.push("GENERATION")
    lines.push(`  channels ${item.generation.channels.join(" ")}`)
    if (item.generation.matchedTokens.length) lines.push(`  tokens ${item.generation.matchedTokens.slice(0, 8).join(" ")}`)
    lines.push("")
  }
  if (item.selectionReason) {
    lines.push("INSPECTION SELECTION")
    lines.push(`  selected_by ${item.selectionReason}`)
    if (item.stage1Rank) lines.push(`  Top200 rank ${item.stage1Rank}`)
    const diagnostic = item.selectionDiagnostics
    if (diagnostic) {
      lines.push("  Channels:")
      for (const [channel, rank] of Object.entries(diagnostic.channelRanks)) {
        if (channel === "overallRank" || rank == null) continue
        lines.push(`    ${channel.replace(/Rank$/, "").toUpperCase().padEnd(12)} rank ${rank}`)
      }
      lines.push(`  information ${diagnostic.informationScore.toFixed(2)}`)
      lines.push(`  cross-channel ${diagnostic.crossChannelStrength.toFixed(3)}`)
      lines.push(`  consensus ${diagnostic.consensus}`)
      if (diagnostic.matchedTokens.length) lines.push(`  matched ${diagnostic.matchedTokens.join(", ")}`)
      if (diagnostic.exclusionReason) lines.push(`  exclusion ${diagnostic.exclusionReason}`)
    }
    lines.push("")
  }
  const b = item.breakdown as any
  lines.push("NAME SCORE")
  if (b) {
    if (b.lexical) lines.push(`  lexical                +${b.lexical.toFixed(2)}`)
    if (b.nameCoverage) lines.push(`  coverage               +${b.nameCoverage.toFixed(2)}`)
    if (b.orderedMatch) lines.push(`  ordered                +${b.orderedMatch.toFixed(2)}`)
    if (b.bigram) lines.push(`  bigram                 +${b.bigram.toFixed(2)}`)
    if (b.trigram) lines.push(`  trigram                +${b.trigram.toFixed(2)}`)
    if (b.exactSuffix) lines.push(`  semantic suffix        +${b.exactSuffix.toFixed(2)}`)
    if (b.idfBoost) lines.push(`  IDF boost              +${b.idfBoost.toFixed(2)}`)
    if (b.channelBonus) lines.push(`  channels               +${b.channelBonus.toFixed(2)}`)
    if (b.namespace) lines.push(`  namespace              +${b.namespace.toFixed(2)}`)
    if (b.typeOverlap) lines.push(`  type overlap           +${b.typeOverlap.toFixed(2)}`)
    if (b.structure) lines.push(`  structure              +${b.structure.toFixed(2)}`)
    if (b.localBoost) lines.push(`  local                  +${b.localBoost.toFixed(2)}`)
    if (b.dependencyBoost) lines.push(`  dependency             +${b.dependencyBoost.toFixed(2)}`)
    if (b.penalties) lines.push(`  penalties              -${b.penalties.toFixed(2)}`)
  } else {
    lines.push(...item.reasons.map((reason) => `  ${reason}`))
  }
  lines.push("")
  lines.push("LEAN ENRICHMENT")
  lines.push(`  ${item.typeSource === "LEAN_ELABORATED" ? "exact type PASS" : "header index only"}`)
  lines.push(`  cache ${item.cacheHit ? "HIT" : "MISS"}`)
  if (item.fusionMethod) {
    lines.push("")
    lines.push("FINAL FUSION")
    lines.push(`  stage1 rank ${item.stage1Rank ?? "?"}`)
    lines.push(`  lean rank ${item.leanRank ?? "?"}`)
    lines.push(`  method ${item.fusionMethod}`)
    lines.push(`  final rank ${item.finalRank ?? "?"}`)
  }
  return lines
}

function resolveMode(request: PremiseRetrievalRequest): RetrievalMode {
  if (request.mode) return request.mode
  if (request.unknownIdentifiers && request.unknownIdentifiers.length > 0) return "DIAGNOSTIC_REPAIR"
  if (request.goal) return "FORMAL_GOAL"
  return "NATURAL_FALLBACK"
}
