import { resolve } from "node:path"
import {
  AggregateInspectSelector,
  diagnoseFixtures,
  enrichForLean,
  fuseCandidateRanks,
  goldFound,
  HybridPremiseRetriever,
  MATHLIB_FIXTURES,
  metricsFor,
  namesOf,
  rankDeclarations,
  readIndex,
  retrieveFromDeclarations,
  stageRecall,
  StratifiedInspectSelector,
} from "@mathos/retrieval"
import type { FusionMethod, GoalProfile, InspectSelectorMode, PremiseCandidate } from "@mathos/retrieval"
import type { LeanDeclarationInspection } from "@mathos/lean"
import { NativeLeanAdapter } from "@mathos/lean"

const DEMO = resolve(resolve(import.meta.dir, ".."), "demo")
const cacheFile = await Bun.file(`${DEMO}/.mathos/index/lean-inspection-cache.json`).json().catch(() => ({ entries: {} })) as {
  entries: Record<string, { inspection: LeanDeclarationInspection }>
}
const stored = readIndex(DEMO)
if (!stored) {
  console.error("demo index missing; run mathos index build")
  process.exit(1)
}

const decls = stored.declarations
const genStart = performance.now()
const diagnosis = diagnoseFixtures(decls, MATHLIB_FIXTURES, stored.channels ?? undefined)
const genMs = performance.now() - genStart
const stages = stageRecall(diagnosis)

const lexical: string[][] = []
const header: string[][] = []
const headers: ReturnType<typeof retrieveFromDeclarations>[] = []
for (const item of MATHLIB_FIXTURES) {
  const request = { query: item.goal, goal: item.goal, maxPremises: 200, candidatePool: 200, skipInspect: true }
  lexical.push(rankDeclarations(decls, request).map((entry) => entry.declaration.name))
  const result = retrieveFromDeclarations(decls, request, stored.manifest.revision, stored.channels)
  headers.push(result)
  header.push(result.candidates.map((entry) => entry.declaration.name))
}

const ablationStart = performance.now()
const ablation = {
  fixedStratified: runAblation("FIXED", "SCORE_FUSION"),
  dynamicRedistribution: runAblation("DYNAMIC", "SCORE_FUSION"),
  softQuotaConsensus: runAblation("SOFT_CONSENSUS", "SCORE_FUSION"),
  softConsensusRedundancy: runAblation("SOFT_CONSENSUS_REDUNDANCY", "SCORE_FUSION"),
}
const ablationMs = performance.now() - ablationStart

const selectionOnly = process.argv.includes("--selection-only")
if (selectionOnly) {
  console.log(JSON.stringify({
    fixtures: MATHLIB_FIXTURES.length,
    generationMs: genMs,
    ablationMs,
    stages,
    selectors: Object.fromEntries(Object.entries(ablation).map(([name, value]) => [name, {
      inspect30Recall: value.inspect30Recall,
      final20Recall: value.final20Recall,
      top200ToInspect30: value.top200ToInspect30,
      top200Golds: value.top200Golds,
      selectedTop200Golds: value.selectedTop200Golds,
      domainInspectRecall: value.domainInspectRecall,
      quality: value.quality,
    }])),
    remainingTop200Misses: ablation.softConsensusRedundancy.traces.filter((trace) => trace.top200.found && !trace.inspect30.found),
    baselineTop200Misses: ablation.fixedStratified.traces.filter((trace) => trace.top200.found && !trace.inspect30.found).map((trace) => ({ id: trace.id, expected: trace.expected, top200: trace.top200, channelRanks: trace.channelRanks, exclusionReason: trace.exclusionReason })),
    targets: ablation.softConsensusRedundancy.traces.filter((trace) => trace.id === "comp" || trace.id === "set_subset_union"),
  }, null, 2))
} else console.log(JSON.stringify({
  fixtures: MATHLIB_FIXTURES.length,
  generationMs: genMs,
  ablationMs,
  stages,
  ablation,
  diagnosis: diagnosis.map((row) => ({
    id: row.id,
    union: row.union,
    top200: row.top200,
    inspect30: row.inspect30,
    final20: row.final20,
    channels: row.channels,
    unionSize: row.unionSize,
  })),
  lexical: metricsFor(lexical, MATHLIB_FIXTURES),
  header: metricsFor(header, MATHLIB_FIXTURES),
}, null, 2))

if (process.argv.includes("--inspect")) {
  const adapter = new NativeLeanAdapter()
  const retriever = new HybridPremiseRetriever(DEMO, () => [], adapter)
  const enriched: string[][] = []
  const coldStart = performance.now()
  for (const item of MATHLIB_FIXTURES) {
    const result = await retriever.retrieve({ query: item.goal, goal: item.goal, maxPremises: 20 })
    enriched.push(namesOf(result.candidates))
  }
  const coldMs = performance.now() - coldStart
  const warmStart = performance.now()
  let hits = 0
  let misses = 0
  let inspectHits = 0
  let finalHits = 0
  for (const item of MATHLIB_FIXTURES) {
    const result = await retriever.retrieve({ query: item.goal, goal: item.goal, maxPremises: 20 })
    hits += result.cacheHits ?? 0
    misses += result.cacheMisses ?? 0
    if (goldFound(result.inspectedCandidates ?? [], item.expected).found) inspectHits += 1
    if (goldFound(namesOf(result.candidates), item.expected).found) finalHits += 1
  }
  console.log(JSON.stringify({
    enriched: metricsFor(enriched, MATHLIB_FIXTURES),
    inspect30Recall: inspectHits / MATHLIB_FIXTURES.length,
    final20Recall: finalHits / MATHLIB_FIXTURES.length,
    coldMs,
    warmMs: performance.now() - warmStart,
    cacheHits: hits,
    cacheMisses: misses,
  }, null, 2))
}

function runAblation(mode: InspectSelectorMode, fusion: FusionMethod) {
  const finalLists: string[][] = []
  let inspectHits = 0
  let finalHits = 0
  let top200Golds = 0
  let selectedTop200Golds = 0
  const domainStats: Record<string, { fixtures: number; inspectHits: number }> = {}
  const traces = []
  for (let i = 0; i < MATHLIB_FIXTURES.length; i += 1) {
    const fixture = MATHLIB_FIXTURES[i]!
    const headerResult = headers[i]!
    const goal = headerResult.goalProfile!
    const selector = new StratifiedInspectSelector(mode)
    const selection = selector.select(headerResult.candidates, goal, 30)
    const selectedNames = selection.selected.map((row) => row.candidate.declaration.name)
    const inspections = selection.selected.map((row) => cacheFile.entries[row.candidate.declaration.name]?.inspection ?? headerInspection(row.candidate))
    const stage1 = headerResult.candidates.map((candidate, index) => ({
      ...candidate,
      stage1Rank: index + 1,
      selectionReason: selection.selected.find((row) => row.candidate.declaration.name === candidate.declaration.name)?.selectionReason,
    }))
    const adjusted = enrichForLean(stage1, inspections, goal)
    const fused = fuseCandidateRanks(stage1, adjusted, { method: fusion }).candidates.slice(0, 20)
    const finalNames = namesOf(fused)
    finalLists.push(finalNames)
    const inspect = goldFound(selectedNames, fixture.expected)
    const final = goldFound(finalNames, fixture.expected)
    if (inspect.found) inspectHits += 1
    if (final.found) finalHits += 1
    const domain = (fixture.expected[0]?.split(".")[0] || "Root")
    const domainStat = domainStats[domain] ??= { fixtures: 0, inspectHits: 0 }
    domainStat.fixtures += 1
    if (inspect.found) domainStat.inspectHits += 1
    if (diagnosis[i]!.top200.found) {
      top200Golds += 1
      if (inspect.found) selectedTop200Golds += 1
    }
    const selectedGold = selection.selected.find((row) => fixture.expected.some((name) => name.toLowerCase() === row.candidate.declaration.name.toLowerCase()))
    const top200GoldName = fixture.expected.find((name) => headerResult.candidates.some((candidate) => candidate.declaration.name.toLowerCase() === name.toLowerCase()))
    const goldDiagnostic = top200GoldName ? selection.diagnostics[top200GoldName] : undefined
    traces.push({
      id: fixture.id,
      expected: fixture.expected,
      union: diagnosis[i]!.union,
      top200: diagnosis[i]!.top200,
      inspect30: inspect,
      selectedBy: selectedGold?.selectionReason ?? null,
      selectorVersion: selection.selectorVersion,
      channelRanks: goldDiagnostic?.ranks ?? null,
      matchedTokens: goldDiagnostic?.matchedTokens ?? [],
      informationScore: goldDiagnostic?.informationScore ?? null,
      crossChannelStrength: goldDiagnostic?.crossChannelStrength ?? null,
      consensus: goldDiagnostic?.consensus ?? null,
      exclusionReason: selectedGold ? null : (goldDiagnostic?.exclusionReason ?? (diagnosis[i]!.top200.found ? "CHANNEL_NOT_ELIGIBLE" : "OUTSIDE_TOP200")),
      quotaTrace: selection.quotaTrace.map((quota) => {
        const rankKey = `${quota.channel.toLowerCase()}Rank`
        const goldLocalRank = goldDiagnostic ? (goldDiagnostic.ranks as unknown as Record<string, number | null>)[rankKey] ?? null : null
        return { ...quota, goldEligible: goldLocalRank !== null, goldLocalRank }
      }),
      leanInspection: selectedGold
        ? (cacheFile.entries[selectedGold.candidate.declaration.name] ? "CACHE" : "HEADER_FALLBACK")
        : "NOT_SELECTED",
      final,
    })
  }
  return {
    inspect30Recall: inspectHits / MATHLIB_FIXTURES.length,
    final20Recall: finalHits / MATHLIB_FIXTURES.length,
    top200ToInspect30: top200Golds ? selectedTop200Golds / top200Golds : 0,
    top200Golds,
    selectedTop200Golds,
    domainInspectRecall: Object.fromEntries(Object.entries(domainStats).sort(([a], [b]) => a.localeCompare(b)).map(([domain, value]) => [domain, value.inspectHits / value.fixtures])),
    quality: metricsFor(finalLists, MATHLIB_FIXTURES),
    traces,
  }
}

function headerInspection(candidate: PremiseCandidate): LeanDeclarationInspection {
  const profile = candidate.profile
  return {
    name: candidate.declaration.name,
    exists: true,
    type: candidate.declaration.signature,
    constants: profile?.constants ?? [],
    typeConstructors: profile?.typeConstructors ?? [],
    conclusion: candidate.declaration.signature.split(":").slice(1).join(":").trim(),
    propositionShape: {
      equality: profile?.isEquality,
      iff: profile?.isIff,
      implication: profile?.isImplication,
    },
    diagnostics: [],
    elaborated: true,
  }
}
