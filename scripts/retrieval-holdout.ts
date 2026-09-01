import { resolve } from "node:path"
import { writeFileSync } from "node:fs"
import {
  StratifiedInspectSelector,
  enrichForLean,
  extractSemanticOperatorProfile,
  fuseCandidateRanks,
  generateCandidates,
  goldFound,
  metricsFor,
  profileGoal,
  readIndex,
  readInspectionCache,
  retrieveFromDeclarations,
} from "@mathos/retrieval"
import { RETRIEVAL_HOLDOUT_FIXTURES, RETRIEVAL_HOLDOUT_METADATA } from "../packages/retrieval/src/holdout-fixtures.ts"

const ROOT = resolve(import.meta.dir, "..")
const DEMO = `${ROOT}/demo`
const RESULT_PATH = `${ROOT}/benchmarks/retrieval-holdout-v1-results.json`
const WEAK = new Set(["Algebra", "Nat", "Int", "Relations"])

type Policy = "BASELINE" | "SEMANTIC_OPERATOR_PROFILE_V1"
type Found = { found: boolean; rank: number | null }
interface EvaluationRow { id: string; domain: string; expected: string[]; union: Found; top200: Found; inspect30: Found; final20: Found; finalNames: string[]; cacheMissing: boolean; stage1Ms: number; fullMs: number }

export function bootstrapPaired(values: Array<{ baseline: number; feature: number }>, iterations = 10_000, seed = 0x5e6d4a1) {
  if (!values.length) return { estimate: 0, low: 0, high: 0, iterations, seed }
  let state = seed >>> 0
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
  const samples: number[] = []
  for (let run = 0; run < iterations; run += 1) {
    let delta = 0
    for (let index = 0; index < values.length; index += 1) {
      const row = values[Math.floor(random() * values.length)]!
      delta += row.feature - row.baseline
    }
    samples.push(delta / values.length)
  }
  samples.sort((a, b) => a - b)
  const estimate = values.reduce((sum, row) => sum + row.feature - row.baseline, 0) / values.length
  return { estimate, low: samples[Math.floor(iterations * 0.025)]!, high: samples[Math.floor(iterations * 0.975)]!, iterations, seed }
}

export function classifyPairedRanks(baselineRank: number | null, featureRank: number | null) {
  const baselineRR = baselineRank ? 1 / baselineRank : 0
  const featureRR = featureRank ? 1 / featureRank : 0
  return featureRR > baselineRR ? "IMPROVED" : featureRR < baselineRR ? "HURT" : "UNCHANGED"
}

export async function evaluateHoldoutPolicy(policy: Policy) {
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("MathOS demo index missing")
  if (!stored.channels) throw new Error("MathOS demo channel index missing")
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY")
  const rows: EvaluationRow[] = []
  const rssBefore = process.memoryUsage.rss()
  for (const fixture of RETRIEVAL_HOLDOUT_FIXTURES) {
    const baseGoal = fixture.goal
    const semantic = extractSemanticOperatorProfile(baseGoal)
    const semanticTokens = [...semantic.sequence, ...semantic.morphologyTokens, ...(semantic.relation?.hasComposition ? ["relation_comp"] : []), ...(semantic.relation?.property ? [semantic.relation.property.toLowerCase()] : [])]
    const effectiveGoal = policy === "BASELINE" || semanticTokens.length === 0 ? baseGoal : `${baseGoal} semantic_operator_profile ${semanticTokens.join(" ")}`
    const goal = profileGoal(effectiveGoal)
    const stageStart = performance.now()
    const union = generateCandidates(stored.declarations, stored.channels, { goalText: effectiveGoal, goal, formal: true })
    const header = retrieveFromDeclarations(stored.declarations, { query: effectiveGoal, goal: effectiveGoal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored.manifest.revision, stored.channels)
    const stage1Ms = performance.now() - stageStart
    const selection = selector.select(header.candidates, goal, 30)
    const inspected = selection.selected.map((item) => item.candidate)
    const inspections = inspected.flatMap((candidate) => { const inspection = cache.file.entries[candidate.declaration.name]?.inspection; return inspection ? [inspection] : [] })
    const cacheHits = new Set(inspections.map((item) => item.name))
    const adjusted = enrichForLean(inspected, inspections, goal, cacheHits)
    const final = fuseCandidateRanks(inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates.slice(0, 20)
    const expectedSet = new Set(fixture.expectedAnyOf.map((name) => name.toLowerCase()))
    const selectedGold = inspected.find((candidate) => expectedSet.has(candidate.declaration.name.toLowerCase()))
    const cacheMissing = Boolean(selectedGold && !cache.file.entries[selectedGold.declaration.name]?.inspection.elaborated)
    rows.push({
      id: fixture.id,
      domain: fixture.domain,
      expected: fixture.expectedAnyOf,
      union: goldFound(union.map((item) => item.declaration.name), fixture.expectedAnyOf),
      top200: goldFound(header.candidates.map((item) => item.declaration.name), fixture.expectedAnyOf),
      inspect30: goldFound(inspected.map((item) => item.declaration.name), fixture.expectedAnyOf),
      final20: goldFound(final.map((item) => item.declaration.name), fixture.expectedAnyOf),
      finalNames: final.map((item) => item.declaration.name),
      cacheMissing,
      stage1Ms,
      fullMs: performance.now() - stageStart,
    })
  }
  return { policy, rows, metrics: aggregate(rows), failureBreakdown: failures(rows), domains: domainResults(rows), performance: performanceSummary(rows), rssDelta: process.memoryUsage.rss() - rssBefore, indexFormatVersion: stored.manifest.formatVersion, indexBytesDelta: 0 }
}

export async function compareHoldout() {
  const baseline = await evaluateHoldoutPolicy("BASELINE")
  const feature = await evaluateHoldoutPolicy("SEMANTIC_OPERATOR_PROFILE_V1")
  const paired = baseline.rows.map((row, index) => {
    const next = feature.rows[index]!
    const classification = classifyPairedRanks(row.final20.rank, next.final20.rank)
    return { id: row.id, domain: row.domain, classification, baselineRank: row.final20.rank, featureRank: next.final20.rank }
  })
  const improved = paired.filter((row) => row.classification === "IMPROVED")
  const hurt = paired.filter((row) => row.classification === "HURT")
  const finalValues = baseline.rows.map((row, index) => ({ baseline: Number(row.final20.found), feature: Number(feature.rows[index]!.final20.found) }))
  const hit10Values = baseline.rows.map((row, index) => ({ baseline: Number((row.final20.rank ?? Infinity) <= 10), feature: Number((feature.rows[index]!.final20.rank ?? Infinity) <= 10) }))
  const rrValues = baseline.rows.map((row, index) => ({ baseline: row.final20.rank ? 1 / row.final20.rank : 0, feature: feature.rows[index]!.final20.rank ? 1 / feature.rows[index]!.final20.rank! : 0 }))
  const weakBaseline = aggregate(baseline.rows.filter((row) => WEAK.has(row.domain)))
  const weakFeature = aggregate(feature.rows.filter((row) => WEAK.has(row.domain)))
  const deltas = numericDelta(baseline.metrics, feature.metrics)
  const ci = { final20: bootstrapPaired(finalValues), hit10: bootstrapPaired(hit10Values), mrr: bootstrapPaired(rrValues) }
  const unrelatedRegressions = hurt.filter((row) => !WEAK.has(row.domain))
  const upstreamImproved = weakFeature.union > weakBaseline.union || weakFeature.top200 > weakBaseline.top200 || weakFeature.inspect30 > weakBaseline.inspect30
  const promote = deltas.final20 >= 0 && deltas.hit10 >= 0 && ci.mrr.low > -0.02 && unrelatedRegressions.length < 2 && upstreamImproved && feature.performance.medianFullMs <= baseline.performance.medianFullMs * 1.25
  return {
    dataset: RETRIEVAL_HOLDOUT_METADATA,
    fixtureCount: RETRIEVAL_HOLDOUT_FIXTURES.length,
    featureVersion: "SEMANTIC_OPERATOR_PROFILE_V1",
    policies: { baseline: baseline.metrics, feature: feature.metrics, delta: deltas },
    failureBreakdown: { baseline: baseline.failureBreakdown, feature: feature.failureBreakdown },
    domains: { baseline: baseline.domains, feature: feature.domains },
    weakDomains: { baseline: weakBaseline, feature: weakFeature },
    paired: { improved: improved.length, unchanged: paired.length - improved.length - hurt.length, hurt: hurt.length, net: improved.length - hurt.length, fixedFailures: improved.filter((row) => row.baselineRank == null && row.featureRank != null).map((row) => row.id), newRegressions: hurt.filter((row) => row.baselineRank != null && row.featureRank == null).map((row) => row.id), unrelatedRegressions: unrelatedRegressions.map((row) => row.id), fixtures: paired },
    confidenceIntervals95: ci,
    performance: { baseline: baseline.performance, feature: feature.performance, rssDeltaBaseline: baseline.rssDelta, rssDeltaFeature: feature.rssDelta, indexBytesDelta: 0, indexFormatBaseline: baseline.indexFormatVersion, indexFormatFeature: feature.indexFormatVersion, leanInvocations: 0 },
    decision: promote ? "PROMOTE" : "REJECT",
    promotionChecks: { globalFinal20NonDecreasing: deltas.final20 >= 0, globalHit10NonDecreasing: deltas.hit10 >= 0, mrrNotMeaningfullyNegative: ci.mrr.low > -0.02, seriousCrossDomainRegressionsAbsent: unrelatedRegressions.length < 2, weakDomainUpstreamImproved: upstreamImproved, latencySmall: feature.performance.medianFullMs <= baseline.performance.medianFullMs * 1.25 },
  }
}

function aggregate(rows: EvaluationRow[]) {
  const n = rows.length || 1
  const ranked = metricsFor(rows.map((row) => row.finalNames), rows.map((row) => ({ id: row.id, goal: row.id, expected: row.expected })))
  const top = rows.filter((row) => row.top200.found).length
  const inspect = rows.filter((row) => row.inspect30.found).length
  return { union: rows.filter((row) => row.union.found).length / n, top200: top / n, inspect30: inspect / n, final20: rows.filter((row) => row.final20.found).length / n, hit1: ranked.hit1, hit5: ranked.hit5, hit10: ranked.hit10, mrr: ranked.mrr, top200ToInspect30: top ? inspect / top : 0, inspect30ToFinal20: inspect ? rows.filter((row) => row.final20.found).length / inspect : 0 }
}
function failures(rows: EvaluationRow[]) {
  const result = { NOT_INDEXED: 0, NOT_GENERATED: 0, OUTSIDE_TOP200: 0, OUTSIDE_INSPECT30: 0, LEAN_INSPECTION_FAILED: 0, OUTSIDE_FINAL20: 0 }
  for (const row of rows) {
    if (row.final20.found) continue
    if (!row.union.found) result.NOT_GENERATED += 1
    else if (!row.top200.found) result.OUTSIDE_TOP200 += 1
    else if (!row.inspect30.found) result.OUTSIDE_INSPECT30 += 1
    else if (row.cacheMissing) result.LEAN_INSPECTION_FAILED += 1
    else result.OUTSIDE_FINAL20 += 1
  }
  return result
}
function domainResults(rows: EvaluationRow[]) { return Object.fromEntries([...new Set(rows.map((row) => row.domain))].sort().map((domain) => { const subset = rows.filter((row) => row.domain === domain); return [domain, { count: subset.length, ...aggregate(subset) }] })) }
function percentile(values: number[], fraction: number) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0 }
function performanceSummary(rows: EvaluationRow[]) { return { medianStage1Ms: percentile(rows.map((row) => row.stage1Ms), 0.5), p95Stage1Ms: percentile(rows.map((row) => row.stage1Ms), 0.95), medianFullMs: percentile(rows.map((row) => row.fullMs), 0.5), p95FullMs: percentile(rows.map((row) => row.fullMs), 0.95) } }
function numericDelta<T extends Record<string, number>>(before: T, after: T): T { return Object.fromEntries(Object.keys(before).map((key) => [key, Number((after[key]! - before[key]!).toFixed(8))])) as T }

if (import.meta.main) {
  const compare = process.argv.includes("--compare")
  const feature = process.argv.includes("--feature")
  const report = compare ? await compareHoldout() : await evaluateHoldoutPolicy(feature ? "SEMANTIC_OPERATOR_PROFILE_V1" : "BASELINE")
  if (compare) writeFileSync(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(report, null, process.argv.includes("--json") ? 0 : 2))
}
