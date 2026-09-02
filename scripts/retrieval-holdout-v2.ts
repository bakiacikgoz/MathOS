import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { readFileSync, statSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import {
  StratifiedInspectSelector, enrichForLean, fuseCandidateRanks, generateCandidates, goldFound, metricsFor,
  profileGoal, readIndex, readInspectionCache, retrieveFromDeclarations,
} from "@mathos/retrieval"
import { RETRIEVAL_HOLDOUT_V2_FIXTURES, RETRIEVAL_HOLDOUT_V2_METADATA } from "../packages/retrieval/src/holdout-v2-fixtures.ts"
import { applyFrozenSemanticV2RankCap, evaluateFrozenSemanticV2Compatibility, extractFrozenSemanticV2Evidence } from "../packages/retrieval/src/semantic-operator-profile-v2.ts"

const ROOT = resolve(import.meta.dir, "..")
const DEMO = `${ROOT}/demo`
const RESULT = `${ROOT}/benchmarks/retrieval-holdout-v2-results.json`
const MANIFEST = `${ROOT}/benchmarks/retrieval-holdout-v2-manifest.json`
const DATASET = `${ROOT}/packages/retrieval/src/holdout-v2-fixtures.ts`
const WEAK = new Set(["Nat", "Int", "Algebra", "Relations"])
const BOOTSTRAP_SEED = 0x6d617468

type Found = { found: boolean; rank: number | null }
type Policy = "BASELINE" | "FROZEN_V2"
type Row = {
  id: string; domain: string; expected: string[]; union: Found; top200: Found; inspect30: Found; final20: Found;
  unionNames: string[]; topNames: string[]; inspectNames: string[]; finalNames: string[]; cacheMissing: boolean;
  stage1Ms: number; semanticMs: number; compatibilityMs: number; fullMs: number; activation: number; trace?: any
}

export function classifyPaired(baseline: Row, feature: Row) {
  const before = reciprocal(baseline.final20.rank), after = reciprocal(feature.final20.rank)
  const classification = after > before ? "IMPROVED" : after < before ? "HURT" : "UNCHANGED"
  return {
    id: baseline.id, domain: baseline.domain, classification,
    completeFix: !baseline.final20.found && feature.final20.found,
    completeRegression: baseline.final20.found && !feature.final20.found,
    ranks: {
      union: [baseline.union.rank, feature.union.rank], top200: [baseline.top200.rank, feature.top200.rank],
      inspect30: [baseline.inspect30.rank, feature.inspect30.rank], final20: [baseline.final20.rank, feature.final20.rank],
    },
  }
}

export function bootstrapPaired(values: Array<{ baseline: number; feature: number }>, iterations = 10_000, seed = BOOTSTRAP_SEED) {
  if (!values.length) return { estimate: 0, low: 0, high: 0, iterations, seed, containsZero: true }
  let state = seed >>> 0
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
  const samples: number[] = []
  for (let run = 0; run < iterations; run += 1) {
    let sum = 0
    for (let index = 0; index < values.length; index += 1) { const row = values[Math.floor(random() * values.length)]!; sum += row.feature - row.baseline }
    samples.push(sum / values.length)
  }
  samples.sort((a, b) => a - b)
  const estimate = values.reduce((sum, row) => sum + row.feature - row.baseline, 0) / values.length
  const low = samples[Math.floor(iterations * .025)]!, high = samples[Math.floor(iterations * .975)]!
  return { estimate, low, high, iterations, seed, containsZero: low <= 0 && high >= 0 }
}

export async function compareHoldoutV2() {
  assertFrozenManifest()
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("MathOS demo index missing")
  if (!stored.channels) throw new Error("MathOS demo channel index missing")
  const channels = stored.channels
  const indexPath = `${DEMO}/.mathos/index/declarations.json`
  const indexBytesBefore = statSync(indexPath).size
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY")
  const indexed = new Set(stored.declarations.map((item) => item.name.toLowerCase()))

  const prepared = RETRIEVAL_HOLDOUT_V2_FIXTURES.map((fixture) => {
    const goalProfile = profileGoal(fixture.goal)
    const semanticStart = performance.now()
    const semanticTokens = extractFrozenSemanticV2Evidence(fixture.goal).map((item) => item.token)
    const semanticMs = performance.now() - semanticStart
    const semanticGoal = semanticTokens.length ? `${fixture.goal} semantic_v2 ${semanticTokens.join(" ")}` : fixture.goal
    return { fixture, goalProfile, semanticTokens, semanticGoal, semanticMs }
  })

  const baselineRows = prepared.map((item) => evaluate(item, "BASELINE"))
  const featureRows = prepared.map((item) => evaluate(item, "FROZEN_V2", baselineRows.find((row) => row.id === item.fixture.id)))
  const baseline = summarizePolicy(baselineRows, indexed)
  const feature = summarizePolicy(featureRows, indexed)
  const pairedRows = baselineRows.map((row, index) => classifyPaired(row, featureRows[index]!))
  const improved = pairedRows.filter((row) => row.classification === "IMPROVED")
  const hurt = pairedRows.filter((row) => row.classification === "HURT")
  const completeFixes = pairedRows.filter((row) => row.completeFix)
  const completeRegressions = pairedRows.filter((row) => row.completeRegression)
  const unrelatedImproved = improved.filter((row) => !WEAK.has(row.domain))
  const unrelatedHurt = hurt.filter((row) => !WEAK.has(row.domain))
  const unrelatedComplete = completeRegressions.filter((row) => !WEAK.has(row.domain))
  const domains = domainComparison(baselineRows, featureRows)
  const weakBaseline = aggregate(baselineRows.filter((row) => WEAK.has(row.domain)))
  const weakFeature = aggregate(featureRows.filter((row) => WEAK.has(row.domain)))
  const displacement = displacementMetrics(baselineRows, featureRows)
  const activation = activationMetrics(featureRows)
  const confidenceIntervals95 = {
    top200: bootstrapPaired(stageValues(baselineRows, featureRows, "top200"), 10_000, BOOTSTRAP_SEED + 1),
    final20: bootstrapPaired(stageValues(baselineRows, featureRows, "final20"), 10_000, BOOTSTRAP_SEED + 2),
    hit10: bootstrapPaired(baselineRows.map((row, index) => ({ baseline: Number((row.final20.rank ?? Infinity) <= 10), feature: Number((featureRows[index]!.final20.rank ?? Infinity) <= 10) })), 10_000, BOOTSTRAP_SEED + 3),
    mrr: bootstrapPaired(baselineRows.map((row, index) => ({ baseline: reciprocal(row.final20.rank), feature: reciprocal(featureRows[index]!.final20.rank) })), 10_000, BOOTSTRAP_SEED + 4),
  }
  const delta = numericDelta(baseline.metrics, feature.metrics)
  const reportPerformance = { baseline: performanceSummary(baselineRows), feature: performanceSummary(featureRows), featureOverhead: overhead(performanceSummary(baselineRows), performanceSummary(featureRows)), newLeanInvocations: 0, indexBytesBefore, indexBytesAfter: statSync(indexPath).size, persistentSizeDelta: statSync(indexPath).size - indexBytesBefore }
  const hardReject = delta.final20 < 0 || delta.hit10 < -0.005 || confidenceIntervals95.mrr.low < -0.02 || completeRegressions.length > 0 || unrelatedComplete.length > 0 || displacement.nonGold.promoted20To49 + displacement.nonGold.promoted50To99 + displacement.nonGold.promoted100Plus > 0
  const upstreamPositive = delta.top200 > 0 || delta.union > 0 || delta.inspect30 > 0
  const latencySmall = reportPerformance.feature.fullMedianMs <= reportPerformance.baseline.fullMedianMs * 1.25
  const gates = { final20NonDecreasing: delta.final20 >= 0, hit10NonDecreasing: delta.hit10 >= 0, mrrNotMeaningfullyNegative: confidenceIntervals95.mrr.low >= -0.02, completeRegressionZero: completeRegressions.length === 0, unrelatedCompleteRegressionZero: unrelatedComplete.length === 0, nonGold20PlusZero: displacement.nonGold.promoted20To49 + displacement.nonGold.promoted50To99 + displacement.nonGold.promoted100Plus === 0, upstreamPositive, latencySmall }
  const decision = hardReject ? "REJECT" : upstreamPositive && latencySmall ? "PROMOTE" : "INCONCLUSIVE"
  const report = {
    dataset: RETRIEVAL_HOLDOUT_V2_METADATA, feature: "SEMANTIC_OPERATOR_PROFILE_V2", comparisonOnly: true, productionIntegration: false,
    policies: { baseline: baseline.metrics, frozenV2: feature.metrics, delta },
    paired: { improved: improved.length, unchanged: pairedRows.length - improved.length - hurt.length, hurt: hurt.length, completeFixes: completeFixes.map((row) => row.id), completeRegressions: completeRegressions.map((row) => row.id), fixtures: pairedRows },
    failures: { baseline: baseline.failures, frozenV2: feature.failures },
    weakDomains: { baseline: weakBaseline, frozenV2: weakFeature, delta: numericDelta(weakBaseline, weakFeature), improvements: improved.filter((row) => WEAK.has(row.domain)).length, hurts: hurt.filter((row) => WEAK.has(row.domain)).length },
    unrelatedDomainSafety: { improvements: unrelatedImproved.length, hurts: unrelatedHurt.length, completeRegressions: unrelatedComplete.length, improvedIds: unrelatedImproved.map((row) => row.id), hurtIds: unrelatedHurt.map((row) => row.id) },
    domains, activation, displacement, confidenceIntervals95,
    rankDeltaSummary: rankDeltaSummary(pairedRows), performance: reportPerformance,
    semanticTraces: featureRows.filter((row) => row.activation > 0 || row.trace?.goldAffected).map((row) => row.trace),
    hashGuard: readManifest(), gates, decision,
    trustModel: ["retrieval gain != theorem correctness", "semantic compatibility != confidence", "premise != proof", "Lean inspection != verification", "VerificationGate is the only KERNEL_VERIFIED path"],
    closedAfterCanonicalResult: true,
  }
  writeFileSync(RESULT, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report

  function evaluate(item: any, policy: Policy, baseline?: Row): Row {
    const stageStarted = performance.now()
    const baselineUnion = generateCandidates(stored!.declarations, channels, { goalText: item.fixture.goal, goal: item.goalProfile, formal: true })
    const baselineHeader = retrieveFromDeclarations(stored!.declarations, { query: item.fixture.goal, goal: item.fixture.goal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored!.manifest.revision, channels).candidates
    const baselineStage1Ms = performance.now() - stageStarted
    if (policy === "BASELINE") return finalize(item, baselineUnion, baselineHeader, baselineStage1Ms, 0, 0, undefined)

    const semanticStage = performance.now()
    const semanticUnionRaw = item.semanticGoal === item.fixture.goal ? baselineUnion : generateCandidates(stored!.declarations, channels, { goalText: item.semanticGoal, goal: profileGoal(item.semanticGoal), formal: true })
    const semanticHeader = item.semanticGoal === item.fixture.goal ? baselineHeader : retrieveFromDeclarations(stored!.declarations, { query: item.semanticGoal, goal: item.semanticGoal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored!.manifest.revision, channels).candidates
    const stage1Ms = baselineStage1Ms + (performance.now() - semanticStage)
    const compatibilityStart = performance.now()
    const baseRanks = new Map(baselineHeader.map((candidate, rank) => [candidate.declaration.name, rank + 1]))
    const semanticRanks = new Map(semanticHeader.map((candidate, rank) => [candidate.declaration.name, rank + 1]))
    const baseCandidates = new Map(baselineHeader.map((candidate) => [candidate.declaration.name, candidate]))
    const semanticCandidates = new Map(semanticHeader.map((candidate) => [candidate.declaration.name, candidate]))
    const evaluations: any[] = []
    const top = [...new Set([...baseCandidates.keys(), ...semanticCandidates.keys()])].map((name) => {
      const baseCandidate = baseCandidates.get(name), semanticCandidate = semanticCandidates.get(name), source = baseCandidate ?? semanticCandidate!
      const compatibility = evaluateFrozenSemanticV2Compatibility({ goalProfile: item.goalProfile, goalSemanticTokens: item.semanticTokens, declaration: source.declaration, inspection: cache.file.entries[name]?.inspection })
      const baselineRank = baseRanks.get(name) ?? (baselineHeader.length + 1), semanticRank = semanticRanks.get(name) ?? (semanticHeader.length + 1)
      const boundedRank = applyFrozenSemanticV2RankCap(baselineRank, semanticRank, compatibility.eligibleForSemanticBoost)
      const boosted = boundedRank < baselineRank
      const isGold = item.fixture.expectedAnyOf.some((expected: string) => expected.toLowerCase() === name.toLowerCase())
      evaluations.push({ name, baselineRank, semanticRank, boundedRank, boosted, isGold, compatibility })
      if (!baseCandidate && !boosted) return null
      return { candidate: baseCandidate ?? semanticCandidate!, boundedRank, baselineRank }
    }).filter(Boolean).sort((a: any, b: any) => a.boundedRank - b.boundedRank || a.baselineRank - b.baselineRank || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name)).slice(0, 200).map((row: any) => row.candidate)
    const compatibilityMs = performance.now() - compatibilityStart
    const mergedUnion = [...new Map([...baselineUnion, ...semanticUnionRaw].map((candidate) => [candidate.declaration.name, candidate])).values()]
    return finalize(item, mergedUnion, top, stage1Ms, item.semanticMs, compatibilityMs, { evaluations, baseline })
  }

  function finalize(item: any, union: any[], top: any[], stage1Ms: number, semanticMs: number, compatibilityMs: number, semanticData?: any): Row {
    const fullStarted = performance.now()
    const selection = selector.select(top, item.goalProfile, 30)
    if (selection.selected.length > 30) throw new Error("inspection batch exceeds 30")
    const inspected = selection.selected.map((entry) => entry.candidate)
    const inspections = inspected.flatMap((candidate) => { const inspection = cache.file.entries[candidate.declaration.name]?.inspection; return inspection ? [inspection] : [] })
    const adjusted = enrichForLean(inspected, inspections, item.goalProfile, new Set(inspections.map((inspection) => inspection.name)))
    const final = fuseCandidateRanks(inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: .45, leanWeight: .55 }).candidates.slice(0, 20)
    const expected = item.fixture.expectedAnyOf
    const row: Row = {
      id: item.fixture.id, domain: item.fixture.domain, expected,
      union: goldFound(union.map((candidate) => candidate.declaration.name), expected), top200: goldFound(top.map((candidate) => candidate.declaration.name), expected),
      inspect30: goldFound(inspected.map((candidate) => candidate.declaration.name), expected), final20: goldFound(final.map((candidate) => candidate.declaration.name), expected),
      unionNames: union.map((candidate) => candidate.declaration.name), topNames: top.map((candidate) => candidate.declaration.name), inspectNames: inspected.map((candidate) => candidate.declaration.name), finalNames: final.map((candidate) => candidate.declaration.name),
      cacheMissing: inspected.some((candidate) => expected.some((name: string) => name.toLowerCase() === candidate.declaration.name.toLowerCase()) && !cache.file.entries[candidate.declaration.name]?.inspection.elaborated),
      stage1Ms, semanticMs, compatibilityMs, fullMs: stage1Ms + semanticMs + compatibilityMs + performance.now() - fullStarted,
      activation: semanticData?.evaluations.filter((evaluation: any) => evaluation.boosted).length ?? 0,
    }
    if (semanticData) {
      const affected = semanticData.evaluations.filter((evaluation: any) => evaluation.boosted)
      const expectedSet = new Set(expected.map((name: string) => name.toLowerCase()))
      const gold = semanticData.evaluations.find((evaluation: any) => evaluation.isGold)
      row.trace = { id: row.id, domain: row.domain, semanticTokens: item.semanticTokens, eligibleCandidates: semanticData.evaluations.filter((evaluation: any) => evaluation.compatibility.eligibleForSemanticBoost).length, boostedCandidates: affected.length, goldAffected: Boolean(gold?.boosted), goldRankDelta: gold ? gold.baselineRank - gold.boundedRank : 0, largestNonGoldRankMovements: affected.filter((evaluation: any) => !expectedSet.has(evaluation.name.toLowerCase())).map((evaluation: any) => ({ name: evaluation.name, delta: evaluation.baselineRank - evaluation.boundedRank })).sort((a: any, b: any) => b.delta - a.delta || a.name.localeCompare(b.name)).slice(0, 10) }
    }
    return row
  }
}

function summarizePolicy(rows: Row[], indexed: Set<string>) { return { metrics: aggregate(rows), failures: failures(rows, indexed), rows } }
function aggregate(rows: Row[]) {
  const n = rows.length || 1, finalCount = rows.filter((row) => row.final20.found).length, inspectCount = rows.filter((row) => row.inspect30.found).length, topCount = rows.filter((row) => row.top200.found).length
  const ranked = metricsFor(rows.map((row) => row.finalNames), rows.map((row) => ({ id: row.id, goal: row.id, expected: row.expected })))
  return { union: rows.filter((row) => row.union.found).length / n, top200: topCount / n, inspect30: inspectCount / n, final20: finalCount / n, hit1: ranked.hit1, hit5: ranked.hit5, hit10: ranked.hit10, mrr: ranked.mrr, top200ToInspect30: topCount ? inspectCount / topCount : 0, inspect30ToFinal20: inspectCount ? finalCount / inspectCount : 0 }
}
function failures(rows: Row[], indexed: Set<string>) { const result = { NOT_INDEXED: 0, NOT_GENERATED: 0, OUTSIDE_TOP200: 0, OUTSIDE_INSPECT30: 0, LEAN_INSPECTION_FAILED: 0, OUTSIDE_FINAL20: 0 }; for (const row of rows) { if (row.final20.found) continue; if (!row.expected.some((name) => indexed.has(name.toLowerCase()))) result.NOT_INDEXED++; else if (!row.union.found) result.NOT_GENERATED++; else if (!row.top200.found) result.OUTSIDE_TOP200++; else if (!row.inspect30.found) result.OUTSIDE_INSPECT30++; else if (row.cacheMissing) result.LEAN_INSPECTION_FAILED++; else result.OUTSIDE_FINAL20++ } return result }
function domainComparison(base: Row[], feature: Row[]) { return Object.fromEntries([...new Set(base.map((row) => row.domain))].sort().map((domain) => { const before = aggregate(base.filter((row) => row.domain === domain)), after = aggregate(feature.filter((row) => row.domain === domain)); return [domain, { count: base.filter((row) => row.domain === domain).length, baseline: before, frozenV2: after, delta: numericDelta(before, after) }] })) }
function displacementMetrics(base: Row[], feature: Row[]) { const nonGold = { promoted100Plus: 0, promoted50To99: 0, promoted20To49: 0, promoted1To19: 0 }; let goldPromoted = 0, goldDemoted = 0; base.forEach((row, index) => { const next = feature[index]!, expected = new Set(row.expected.map((name) => name.toLowerCase())), names = new Set([...row.topNames, ...next.topNames]); for (const name of names) { const before = rank(row.topNames, name) ?? row.topNames.length + 1, after = rank(next.topNames, name) ?? next.topNames.length + 1, move = before - after; if (expected.has(name.toLowerCase())) { if (move > 0) goldPromoted++; else if (move < 0) goldDemoted++; } else if (move >= 100) nonGold.promoted100Plus++; else if (move >= 50) nonGold.promoted50To99++; else if (move >= 20) nonGold.promoted20To49++; else if (move >= 1) nonGold.promoted1To19++ } }); return { nonGold, goldPromoted, goldDemoted } }
function activationMetrics(rows: Row[]) { const active = rows.filter((row) => row.activation > 0); return { activeQueries: active.length, activeQueryRate: active.length / (rows.length || 1), median: percentile(rows.map((row) => row.activation), .5), p95: percentile(rows.map((row) => row.activation), .95), max: Math.max(0, ...rows.map((row) => row.activation)) } }
function rankDeltaSummary(rows: any[]) { const stages = ["union", "top200", "inspect30", "final20"]; return Object.fromEntries(stages.map((stage) => { const deltas = rows.map((row) => { const [before, after] = row.ranks[stage]; return (before ?? 201) - (after ?? 201) }); return [stage, { median: percentile(deltas, .5), p95: percentile(deltas, .95), min: Math.min(...deltas), max: Math.max(...deltas) }] })) }
function performanceSummary(rows: Row[]) { return { stage1MedianMs: percentile(rows.map((row) => row.stage1Ms), .5), stage1P95Ms: percentile(rows.map((row) => row.stage1Ms), .95), semanticMedianMs: percentile(rows.map((row) => row.semanticMs), .5), semanticP95Ms: percentile(rows.map((row) => row.semanticMs), .95), compatibilityMedianMs: percentile(rows.map((row) => row.compatibilityMs), .5), compatibilityP95Ms: percentile(rows.map((row) => row.compatibilityMs), .95), fullMedianMs: percentile(rows.map((row) => row.fullMs), .5), fullP95Ms: percentile(rows.map((row) => row.fullMs), .95) } }
function overhead(base: any, feature: any) { return { stage1MedianMs: feature.stage1MedianMs - base.stage1MedianMs, stage1P95Ms: feature.stage1P95Ms - base.stage1P95Ms, fullMedianMs: feature.fullMedianMs - base.fullMedianMs, fullP95Ms: feature.fullP95Ms - base.fullP95Ms } }
function stageValues(base: Row[], feature: Row[], stage: "top200" | "final20") { return base.map((row, index) => ({ baseline: Number(row[stage].found), feature: Number(feature[index]![stage].found) })) }
function numericDelta<T extends Record<string, number>>(before: T, after: T): T { return Object.fromEntries(Object.keys(before).map((key) => [key, Number(((after[key] ?? 0) - (before[key] ?? 0)).toFixed(10))])) as T }
function reciprocal(rankValue: number | null) { return rankValue ? 1 / rankValue : 0 }
function rank(names: string[], target: string) { const index = names.indexOf(target); return index < 0 ? null : index + 1 }
function percentile(values: number[], p: number) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! }
function readManifest() { return JSON.parse(readFileSync(MANIFEST, "utf8")) }
function sha(path: string) { return createHash("sha256").update(readFileSync(path, "utf8").replaceAll("\r\n", "\n")).digest("hex") }
export function assertFrozenManifest() { const manifest = readManifest(); if (sha(`${ROOT}/${manifest.v2Spec.path}`) !== manifest.v2Spec.sha256) throw new Error("V2 spec hash guard failed"); if (sha(`${ROOT}/${manifest.v2Implementation.path}`) !== manifest.v2Implementation.sha256) throw new Error("V2 implementation hash guard failed"); if (sha(`${ROOT}/${manifest.holdoutV2.path}`) !== manifest.holdoutV2.sha256) throw new Error("holdout-v2 dataset hash guard failed"); return true }

if (import.meta.main) {
  if (!process.argv.includes("--compare")) throw new Error("Only --compare is supported for closed holdout-v2")
  const report = await compareHoldoutV2()
  console.log(JSON.stringify(report, null, process.argv.includes("--json") ? 0 : 2))
}
