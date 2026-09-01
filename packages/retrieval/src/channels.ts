import { inspectLeanSignature } from "@mathos/lean"
import type { GoalProfile, LeanDeclaration } from "./types.ts"
import { formalQueryTokens, namingPatterns, structureHeadFromGoal, tokenizeName } from "./normalize.ts"
import { bigramsOf, profileDeclarationName, trigramsOf } from "./name-profile.ts"

export type GenerationChannel = "NAME" | "SYMBOL" | "TYPE" | "STRUCTURE" | "NAMESPACE" | "MODULE" | "OPERATOR" | "LOCAL" | "DEPENDENCY" | "DIAGNOSTIC"

export interface CandidateGenerationEvidence {
  channels: GenerationChannel[]
  matchedTokens: string[]
  channelRanks: Partial<Record<GenerationChannel, number>>
}

export interface TokenStats {
  documentFrequency: Record<string, number>
  totalDocuments: number
  rareThreshold: number
}

export interface ChannelIndex {
  names: Record<string, number[]>
  bigrams: Record<string, number[]>
  trigrams: Record<string, number[]>
  types: Record<string, number[]>
  operators: Record<string, number[]>
  namespaces: Record<string, number[]>
  structures: Record<string, number[]>
  modules: Record<string, number[]>
  tokenStats: TokenStats
  counts: {
    names: number
    bigrams: number
    trigrams: number
    types: number
    operators: number
    namespaces: number
    structures: number
    modules: number
  }
}

export interface GeneratedCandidate {
  declaration: LeanDeclaration
  evidence: CandidateGenerationEvidence
}

export interface GenerationConfig {
  generationPerChannel: number
  namespaceCap: number
  operatorCap: number
  localCap: number
  unionCap: number
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  generationPerChannel: 200,
  namespaceCap: 80,
  operatorCap: 80,
  localCap: 50,
  unionCap: 800,
}

export const INDEX_FORMAT_VERSION = 3

export function buildChannelIndex(declarations: LeanDeclaration[]): ChannelIndex {
  const names = Object.create(null) as Record<string, number[]>
  const bigrams = Object.create(null) as Record<string, number[]>
  const trigrams = Object.create(null) as Record<string, number[]>
  const types = Object.create(null) as Record<string, number[]>
  const operators = Object.create(null) as Record<string, number[]>
  const namespaces = Object.create(null) as Record<string, number[]>
  const structures = Object.create(null) as Record<string, number[]>
  const modules = Object.create(null) as Record<string, number[]>
  const docFreq = Object.create(null) as Record<string, number>

  declarations.forEach((declaration, index) => {
    const nameTokens = tokenizeName(declaration.name)
    for (const token of nameTokens) {
      push(names, token, index)
      if (!docFreq[token]) docFreq[token] = 0
      docFreq[token] += 1
    }
    const profile = profileDeclarationName(declaration.name)
    for (const bg of bigramsOf(profile.normalizedTokens)) push(bigrams, bg, index)
    for (const tg of trigramsOf(profile.normalizedTokens)) push(trigrams, tg, index)

    const inspected = inspectLeanSignature(declaration.name, declaration.signature)
    for (const token of inspected.typeConstructors) push(types, token, index)
    for (const token of inspected.operators) push(operators, token, index)
    for (const token of tokenizeName(declaration.signature).slice(0, 12)) push(types, token, index)
    if (inspected.propositionHead) push(structures, inspected.propositionHead.toLowerCase(), index)
    const ns = (declaration.namespace ?? declaration.name.split(".")[0] ?? "").toLowerCase()
    if (ns) push(namespaces, ns, index)
    const moduleTail = declaration.module?.split(".").at(-1)?.toLowerCase()
    if (moduleTail) push(modules, moduleTail, index)
  })

  const totalDocuments = declarations.length
  const rareThreshold = totalDocuments > 0 ? Math.max(1, totalDocuments / 100) : 1

  return {
    names,
    bigrams,
    trigrams,
    types,
    operators,
    namespaces,
    structures,
    modules,
    tokenStats: { documentFrequency: docFreq, totalDocuments, rareThreshold },
    counts: {
      names: Object.keys(names).length,
      bigrams: Object.keys(bigrams).length,
      trigrams: Object.keys(trigrams).length,
      types: Object.keys(types).length,
      operators: Object.keys(operators).length,
      namespaces: Object.keys(namespaces).length,
      structures: Object.keys(structures).length,
      modules: Object.keys(modules).length,
    },
  }
}

export function generateCandidates(
  declarations: LeanDeclaration[],
  index: ChannelIndex,
  input: {
    goalText: string
    goal?: GoalProfile | null
    unknownIdentifiers?: string[]
    dependencyNames?: string[]
    allowedLocalStatuses?: string[]
    config?: GenerationConfig
    formal?: boolean
  },
): GeneratedCandidate[] {
  const config = input.config ?? DEFAULT_GENERATION_CONFIG
  const tokens = formalQueryTokens(input.goalText)
  const typeTokens = (input.goal?.typeConstructors ?? []).concat(tokens.filter((token) => ["finset", "nat", "set", "list", "option", "prod", "int"].includes(token)))
  const nsTokens = unique([...(input.goal?.namespaces ?? []), ...typeTokens.filter((token) => /^[a-z]/.test(token))])
  const head = input.goal?.propositionHead ?? structureHeadFromGoal(input.goalText)
  const allowed = new Set(input.allowedLocalStatuses ?? ["KERNEL_VERIFIED"])
  const bag = new Map<string, GeneratedCandidate>()

  addChannel(bag, declarations, "NAME", topHits(index.names, tokens, config.generationPerChannel), tokens)
  addChannel(bag, declarations, "SYMBOL", topHits(index.names, tokens, config.generationPerChannel), tokens)

  const goalBigrams = makeNgramKeys(tokens, 2)
  const goalTrigrams = makeNgramKeys(tokens, 3)
  addChannel(bag, declarations, "NAME", topNgramHits(index.bigrams, goalBigrams, config.generationPerChannel), goalBigrams)
  addChannel(bag, declarations, "NAME", topNgramHits(index.trigrams, goalTrigrams, config.generationPerChannel), goalTrigrams)

  addChannel(bag, declarations, "TYPE", topHits(index.types, typeTokens, config.generationPerChannel), typeTokens)
  if (head) addChannel(bag, declarations, "STRUCTURE", (index.structures[head.toLowerCase()] ?? []).slice(0, config.generationPerChannel), [head.toLowerCase()])
  // Controlled structural namespace expansion: use proposition shape, never generic `intro`/`symm` tokens.
  if (input.goal?.isExistential) {
    addChannel(bag, declarations, "STRUCTURE", (index.namespaces.exists ?? []).slice(0, 24), ["exists", "existential"])
  }
  if (input.goal?.isIff) {
    addChannel(bag, declarations, "STRUCTURE", (index.namespaces.iff ?? []).slice(0, 24), ["iff"])
  }
  for (const ns of nsTokens) {
    addChannel(bag, declarations, "NAMESPACE", (index.namespaces[ns] ?? []).slice(0, config.namespaceCap), [ns])
  }
  const patterns = namingPatterns(tokens)
  const operatorIds = new Set<number>()
  for (const pattern of patterns) {
    const key = pattern.replaceAll("_", "")
    for (const id of index.operators[key] ?? []) operatorIds.add(id)
    for (const id of index.names[key] ?? []) operatorIds.add(id)
  }
  addChannel(bag, declarations, "OPERATOR", [...operatorIds].slice(0, config.operatorCap), patterns)
  if (input.goal?.typeConstructors.includes("finset") || tokens.includes("card")) {
    addChannel(bag, declarations, "MODULE", (index.modules.card ?? []).slice(0, config.namespaceCap), ["card"])
  }

  declarations.forEach((declaration, id) => {
    if (declaration.origin !== "workspace") return
    if (declaration.claimStatus && !allowed.has(declaration.claimStatus)) return
    if (declaration.claimStatus === "STALE" || declaration.claimStatus === "DISPROVED") return
    addChannel(bag, declarations, "LOCAL", [id], ["local"])
  })
  for (const dep of input.dependencyNames ?? []) {
    const idx = declarations.findIndex((item) => item.claimId === dep || item.name.toLowerCase() === dep.toLowerCase())
    if (idx >= 0) addChannel(bag, declarations, "DEPENDENCY", [idx], [dep.toLowerCase()])
  }
  for (const unknown of input.unknownIdentifiers ?? []) {
    const lower = unknown.toLowerCase()
    const last = lower.split(".").at(-1) ?? lower
    const ids = new Set<number>([...(index.names[last] ?? [])])
    const exact = declarations.findIndex((item) => item.name.toLowerCase() === lower || item.name.toLowerCase().endsWith(`.${last}`))
    if (exact >= 0) ids.add(exact)
    addChannel(bag, declarations, "DIAGNOSTIC", [...ids].slice(0, config.generationPerChannel), [lower])
  }

  const union = [...bag.values()]
  return union.slice(0, config.unionCap)
}

function topNgramHits(posting: Record<string, number[]>, ngrams: string[], cap: number): number[] {
  if (ngrams.length === 0) return []
  const scores = new Map<number, number>()
  for (const ngram of ngrams) {
    for (const id of posting[ngram] ?? []) scores.set(id, (scores.get(id) ?? 0) + 1)
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, cap)
    .map(([id]) => id)
}

function makeNgramKeys(tokens: string[], n: number): string[] {
  if (tokens.length < n) return []
  const out: string[] = []
  for (let i = 0; i <= tokens.length - n; i += 1) {
    out.push(tokens.slice(i, i + n).join("_"))
  }
  return out
}

function topHits(posting: Record<string, number[]>, tokens: string[], cap: number): number[] {
  const scores = new Map<number, number>()
  for (const token of tokens) {
    for (const id of posting[token] ?? []) scores.set(id, (scores.get(id) ?? 0) + 1)
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, cap)
    .map(([id]) => id)
}

function addChannel(
  bag: Map<string, GeneratedCandidate>,
  declarations: LeanDeclaration[],
  channel: GenerationChannel,
  ids: number[],
  tokens: string[],
): void {
  ids.forEach((id, rank) => {
    const declaration = declarations[id]
    if (!declaration) return
    if (declaration.claimStatus === "STALE" || declaration.claimStatus === "DISPROVED") return
    const prev = bag.get(declaration.name)
    if (prev) {
      if (!prev.evidence.channels.includes(channel)) prev.evidence.channels.push(channel)
      prev.evidence.matchedTokens = unique([...prev.evidence.matchedTokens, ...tokens])
      prev.evidence.channelRanks[channel] = rank + 1
      return
    }
    bag.set(declaration.name, {
      declaration,
      evidence: { channels: [channel], matchedTokens: [...tokens], channelRanks: { [channel]: rank + 1 } },
    })
  })
}

function push(map: Record<string, number[]>, key: string, id: number): void {
  const list = Object.prototype.hasOwnProperty.call(map, key) ? map[key]! : (map[key] = [])
  if (list[list.length - 1] !== id) list.push(id)
}

function unique(items: string[]): string[] {
  return [...new Set(items)]
}
