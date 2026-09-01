import { resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"
import {
  MATHLIB_FIXTURES,
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
import { RETRIEVAL_VALIDATION_FIXTURES } from "../packages/retrieval/src/validation-fixtures.ts"
import { boundedSemanticRank, evaluateSemanticCandidateCompatibility, type SemanticCompatibilityStrategy } from "../packages/retrieval/src/semantic-operator-profile-v2-stability.ts"

const ROOT = resolve(import.meta.dir, "..")
const DEMO = `${ROOT}/demo`
const CAPS = [4, 6, 8, 10, 12, 16, 20]
const STRATEGIES: SemanticCompatibilityStrategy[] = ["COMP-A", "COMP-B", "COMP-C", "COMP-D"]
const ACTIVE = new Set(["add", "sub", "neg", "mul", "div", "pow", "inv", "le", "lt", "union", "inter", "subset", "mem", "card", "comp"])

type Fixture = { id: string; goal: string; expected: string[]; domain: string }
type RelationPolicy = "REL-OFF" | "REL-EXACT"
type Prepared = ReturnType<typeof prepareFixture>
type Config = { strategy: SemanticCompatibilityStrategy; cap: number; relation: RelationPolicy }

export function assertStabilityDataset(set: string) {
  if (set.toLowerCase().includes("holdout")) throw new Error("V2 stability evaluation on retrieval-holdout-v1 is forbidden")
  if (set !== "development" && set !== "validation") throw new Error(`unsupported stability dataset: ${set}`)
}

export async function runStabilityAnalysis() {
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("index missing")
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY")
  const datasets = {
    development: MATHLIB_FIXTURES.map((fixture) => ({ id: fixture.id, goal: fixture.goal, expected: fixture.expected, domain: fixture.domain })) as Fixture[],
    validation: RETRIEVAL_VALIDATION_FIXTURES.map((fixture) => ({ id: fixture.id, goal: fixture.goal, expected: fixture.expectedAnyOf, domain: fixture.domain })) as Fixture[],
  }
  const prepared = {
    development: datasets.development.map(prepareFixture),
    validation: datasets.validation.map(prepareFixture),
  }
  const baseline = {
    development: evaluateBaseline(prepared.development),
    validation: evaluateBaseline(prepared.validation),
  }

  const compatibility: Record<string, any> = {}
  for (const strategy of STRATEGIES) compatibility[strategy] = {
    development: evaluateConfig(prepared.development, baseline.development, { strategy, cap: 12, relation: "REL-OFF" }),
    validation: evaluateConfig(prepared.validation, baseline.validation, { strategy, cap: 12, relation: "REL-OFF" }),
  }
  const selectedCompatibility = selectCompatibility(compatibility)

  const capSensitivity: Record<string, any> = {}
  for (const cap of CAPS) capSensitivity[cap] = {
    development: evaluateConfig(prepared.development, baseline.development, { strategy: selectedCompatibility, cap, relation: "REL-OFF" }),
    validation: evaluateConfig(prepared.validation, baseline.validation, { strategy: selectedCompatibility, cap, relation: "REL-OFF" }),
  }
  const selectedCap = selectCap(capSensitivity)

  const relation = {
    "REL-OFF": {
      development: evaluateConfig(prepared.development, baseline.development, { strategy: selectedCompatibility, cap: selectedCap, relation: "REL-OFF" }),
      validation: evaluateConfig(prepared.validation, baseline.validation, { strategy: selectedCompatibility, cap: selectedCap, relation: "REL-OFF" }),
    },
    "REL-EXACT": {
      development: evaluateConfig(prepared.development, baseline.development, { strategy: selectedCompatibility, cap: selectedCap, relation: "REL-EXACT" }),
      validation: evaluateConfig(prepared.validation, baseline.validation, { strategy: selectedCompatibility, cap: selectedCap, relation: "REL-EXACT" }),
    },
  }
  const selectedRelation: RelationPolicy = acceptRelation(relation) ? "REL-EXACT" : "REL-OFF"
  const finalConfig = { strategy: selectedCompatibility, cap: selectedCap, relation: selectedRelation }
  const final = {
    development: evaluateConfig(prepared.development, baseline.development, finalConfig),
    validation: evaluateConfig(prepared.validation, baseline.validation, finalConfig),
  }
  const freeze = freezeEligible(baseline, final)
  const report = {
    version: "SEMANTIC_OPERATOR_PROFILE_V2_STABILITY_V1",
    datasets: { development: 20, validation: 60, holdoutUsed: false },
    baseline: compactBaseline(baseline),
    compatibility: mapCompact(compatibility),
    selectedCompatibility,
    capSensitivity: mapCompact(capSensitivity),
    selectedCap,
    capSemantics: "For an eligible candidate: boundedRank = baselineRank - min(cap, baselineRank - semanticRank). Ineligible or non-improving candidates keep baselineRank. The cap is rank positions, not score and not confidence.",
    relation: mapCompact(relation),
    selectedRelation,
    finalConfig,
    final: mapCompact(final),
    domainContribution: domainContributions(baseline.validation.rows, final.validation.rows),
    leaveOneDomainOut: leaveOneDomainOut(baseline.validation.rows, final.validation.rows),
    conjunctionCoverage: conjunctionCoverage(final.validation.rows),
    promotionUtility: final.validation.utility,
    performance: final.validation.performance,
    freezeEligible: freeze,
  }
  writeFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-operator-profile-v2-stability.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report

  function prepareFixture(fixture: Fixture) {
    const started = performance.now()
    const semanticStarted = performance.now()
    const semantic = extractSemanticOperatorProfile(fixture.goal)
    const semanticMs = performance.now() - semanticStarted
    const goalProfile = profileGoal(fixture.goal)
    const exact = [...new Set(semantic.sequence.filter((token) => ACTIVE.has(token)))]
    const relationTokens = [...new Set([
      ...semantic.sequence.filter((token) => token === "relation_comp"),
      ...(semantic.relation?.property ? [semantic.relation.property.toLowerCase()] : []),
    ])]
    const offGoal = exact.length ? `${fixture.goal} semantic_v2 ${exact.join(" ")}` : fixture.goal
    const relationGoalTokens = [...exact, ...relationTokens]
    const relGoal = relationGoalTokens.length ? `${fixture.goal} semantic_v2 ${relationGoalTokens.join(" ")}` : fixture.goal
    const baselineStageStarted = performance.now()
    const baselineUnion = generateCandidates(stored!.declarations, stored!.channels, { goalText: fixture.goal, goal: goalProfile, formal: true })
    const baselineHeader = retrieveFromDeclarations(stored!.declarations, { query: fixture.goal, goal: fixture.goal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored!.manifest.revision, stored!.channels)
    const baselineStage1Ms = performance.now() - baselineStageStarted
    const offStageStarted = performance.now()
    const offUnionRaw = offGoal === fixture.goal ? baselineUnion : generateCandidates(stored!.declarations, stored!.channels, { goalText: offGoal, goal: profileGoal(offGoal), formal: true })
    const offHeader = offGoal === fixture.goal ? baselineHeader : retrieveFromDeclarations(stored!.declarations, { query: offGoal, goal: offGoal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored!.manifest.revision, stored!.channels)
    const offStage1Ms = performance.now() - offStageStarted + baselineStage1Ms
    const relStageStarted = performance.now()
    const relUnionRaw = relGoal === offGoal ? offUnionRaw : generateCandidates(stored!.declarations, stored!.channels, { goalText: relGoal, goal: profileGoal(relGoal), formal: true })
    const relHeader = relGoal === offGoal ? offHeader : retrieveFromDeclarations(stored!.declarations, { query: relGoal, goal: relGoal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored!.manifest.revision, stored!.channels)
    const relStage1Ms = performance.now() - relStageStarted + baselineStage1Ms
    const mergeUnion = (left: any[], right: any[]) => [...new Map([...left, ...right].map((row: any) => [row.declaration.name, row])).values()]
    const offUnion = mergeUnion(baselineUnion, offUnionRaw)
    const relUnion = mergeUnion(baselineUnion, relUnionRaw)
    return { fixture, semantic, semanticMs, goalProfile, exact, relationTokens, baselineUnion, baselineHeader: baselineHeader.candidates, offUnion, offHeader: offHeader.candidates, relUnion, relHeader: relHeader.candidates, prepareMs: performance.now() - started, baselineStage1Ms, offStage1Ms, relStage1Ms }
  }

  function evaluateBaseline(items: Prepared[]) {
    const rows = items.map((item) => finalize(item, item.baselineHeader, item.baselineUnion, [], 0, [], 0, item.baselineStage1Ms))
    return aggregate(rows)
  }

  function evaluateConfig(items: Prepared[], base: ReturnType<typeof aggregate>, config: Config) {
    const rows = items.map((item, index) => {
      const enriched = config.relation === "REL-EXACT" ? item.relHeader : item.offHeader
      const union = config.relation === "REL-EXACT" ? item.relUnion : item.offUnion
      const tokens = config.relation === "REL-EXACT" ? [...item.exact, ...item.relationTokens] : item.exact
      const compatibilityStarted = performance.now()
      const baseRanks = new Map(item.baselineHeader.map((candidate: any, rank: number) => [candidate.declaration.name, rank + 1]))
      const semanticRanks = new Map(enriched.map((candidate: any, rank: number) => [candidate.declaration.name, rank + 1]))
      const baselineCandidates = new Map(item.baselineHeader.map((candidate: any) => [candidate.declaration.name, candidate]))
      const semanticCandidates = new Map(enriched.map((candidate: any) => [candidate.declaration.name, candidate]))
      const candidateNames = new Set([...baselineCandidates.keys(), ...semanticCandidates.keys()])
      const evaluations: any[] = []
      const ranked = [...candidateNames].map((candidateName: string) => {
        const baselineCandidate: any = baselineCandidates.get(candidateName)
        const semanticCandidate: any = semanticCandidates.get(candidateName)
        const sourceCandidate = baselineCandidate ?? semanticCandidate
        const inspection = cache.file.entries[sourceCandidate.declaration.name]?.inspection
        const compatibility = evaluateSemanticCandidateCompatibility({ strategy: config.strategy, goalProfile: item.goalProfile, goalSemanticTokens: tokens, declaration: sourceCandidate.declaration, inspection })
        const baselineRank = baseRanks.get(candidateName) ?? (item.baselineHeader.length + 1)
        const semanticRank = semanticRanks.get(candidateName) ?? (enriched.length + 1)
        const boundedRank = boundedSemanticRank(baselineRank, semanticRank, config.cap, compatibility.eligibleForSemanticBoost)
        const boosted = compatibility.eligibleForSemanticBoost && boundedRank < baselineRank
        const candidate = baselineCandidate ?? semanticCandidate ?? sourceCandidate
        evaluations.push({ name: candidateName, baselineRank, semanticRank, boundedRank, boosted, compatibility, isGold: item.fixture.expected.some((name) => name.toLowerCase() === candidateName.toLowerCase()) })
        if (!baselineCandidate && !boosted) return null
        return { candidate, boundedRank, baselineRank }
      }).filter(Boolean).sort((a: any, b: any) => a.boundedRank - b.boundedRank || a.baselineRank - b.baselineRank || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name)).slice(0, 200).map((row: any) => row.candidate)
      const compatibilityMs = performance.now() - compatibilityStarted
      const stage1Ms = config.relation === "REL-EXACT" ? item.relStage1Ms : item.offStage1Ms
      return finalize(item, ranked, union, evaluations, compatibilityMs, base.rows[index].finalNames, config.cap, stage1Ms)
    })
    return aggregate(rows, base.rows)
  }

  function finalize(item: Prepared, top: any[], union: any[], evaluations: any[], compatibilityMs: number, baselineFinalNames: string[], cap: number, stage1Ms: number) {
    const fullStarted = performance.now()
    const selection = selector.select(top, item.goalProfile, 30)
    const inspected = selection.selected.map((row) => row.candidate)
    const inspections = inspected.map((candidate) => cache.file.entries[candidate.declaration.name]?.inspection).filter(Boolean)
    const adjusted = enrichForLean(inspected, inspections, item.goalProfile, new Set(inspections.map((row) => row.name)))
    const final = fuseCandidateRanks(inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates.slice(0, 20)
    const expected = item.fixture.expected
    return {
      id: item.fixture.id, domain: item.fixture.domain, expected,
      union: goldFound(union.map((row: any) => row.declaration.name), expected),
      top200: goldFound(top.map((row) => row.declaration.name), expected),
      inspect30: goldFound(inspected.map((row) => row.declaration.name), expected),
      final20: goldFound(final.map((row) => row.declaration.name), expected),
      topNames: top.map((row) => row.declaration.name), finalNames: final.map((row) => row.declaration.name), baselineFinalNames,
      evaluations, activated: evaluations.filter((row) => row.boosted).length, semanticMs: item.semanticMs, compatibilityMs,
      stage1Ms, fullMs: stage1Ms + item.semanticMs + compatibilityMs + (performance.now() - fullStarted), cap,
    }
  }
}

function aggregate(rows: any[], baselineRows?: any[]) {
  const fixtures = rows.map((row) => ({ id: row.id, expected: row.expected }))
  const ranked = metricsFor(rows.map((row) => row.finalNames), fixtures)
  const n = rows.length || 1
  const metrics = { union: count(rows, "union") / n, top200: count(rows, "top200") / n, inspect30: count(rows, "inspect30") / n, final20: count(rows, "final20") / n, hit5: ranked.hit5, hit10: ranked.hit10, mrr: ranked.mrr }
  let improved = 0, hurt = 0, unchanged = 0, completeRegressions = 0
  if (baselineRows) rows.forEach((row, index) => { const before = rr(baselineRows[index].final20.rank); const after = rr(row.final20.rank); if (after > before) improved += 1; else if (after < before) { hurt += 1; if (baselineRows[index].final20.found && !row.final20.found) completeRegressions += 1 } else unchanged += 1 })
  const activation = stats(rows.map((row) => row.activated))
  const displacement = displacementMetrics(rows, baselineRows)
  const utility = promotionUtility(rows)
  const performanceMetrics = { stage1MedianMs: percentile(rows.map((row) => row.stage1Ms), .5), stage1P95Ms: percentile(rows.map((row) => row.stage1Ms), .95), semanticProfilingMedianMs: percentile(rows.map((row) => row.semanticMs), .5), compatibilityMedianMs: percentile(rows.map((row) => row.compatibilityMs), .5), fullWarmMedianMs: percentile(rows.map((row) => row.fullMs), .5), fullWarmP95Ms: percentile(rows.map((row) => row.fullMs), .95), newLeanInvocations: 0 }
  return { metrics, paired: baselineRows ? { improved, unchanged, hurt, completeRegressions } : null, activation, displacement, utility, performance: performanceMetrics, rows }
}

function displacementMetrics(rows: any[], baselineRows?: any[]) {
  const buckets = { promoted100Plus: 0, promoted50To99: 0, promoted20To49: 0, promoted1To19: 0 }
  let goldPromoted = 0, goldDemoted = 0
  const movements: number[] = []
  if (!baselineRows) return { nonGold: buckets, goldPromoted, goldDemoted, meanAbsoluteRankMovement: 0, p95RankMovement: 0, maxRankMovement: 0 }
  rows.forEach((row, index) => {
    const base = baselineRows[index]
    const expected = new Set(row.expected.map((name: string) => name.toLowerCase()))
    const names = new Set([...base.topNames, ...row.topNames])
    for (const name of names) {
      const before = rankName(base.topNames, name) ?? (base.topNames.length + 1); const after = rankName(row.topNames, name) ?? (row.topNames.length + 1); const move = before - after
      movements.push(Math.abs(move))
      if (expected.has(name.toLowerCase())) { if (move > 0) goldPromoted += 1; else if (move < 0) goldDemoted += 1; continue }
      if (move >= 100) buckets.promoted100Plus += 1; else if (move >= 50) buckets.promoted50To99 += 1; else if (move >= 20) buckets.promoted20To49 += 1; else if (move >= 1) buckets.promoted1To19 += 1
    }
  })
  return { nonGold: buckets, goldPromoted, goldDemoted, meanAbsoluteRankMovement: mean(movements), p95RankMovement: percentile(movements, .95), maxRankMovement: Math.max(0, ...movements) }
}

function promotionUtility(rows: any[]) {
  let eligibleUseful = 0, eligibleFalsePositive = 0, ineligibleWouldHaveHelped = 0, ineligibleCorrectlyBlocked = 0
  for (const row of rows) for (const evaluation of row.evaluations) {
    const semanticWouldPromote = evaluation.semanticRank < evaluation.baselineRank
    if (!semanticWouldPromote) continue
    if (evaluation.compatibility.eligibleForSemanticBoost) {
      if (evaluation.isGold) eligibleUseful += 1; else eligibleFalsePositive += 1
    } else {
      if (evaluation.isGold) ineligibleWouldHaveHelped += 1; else ineligibleCorrectlyBlocked += 1
    }
  }
  const precisionDenominator = eligibleUseful + eligibleFalsePositive
  const recallDenominator = eligibleUseful + ineligibleWouldHaveHelped
  return { eligibleUseful, eligibleFalsePositive, ineligibleWouldHaveHelped, ineligibleCorrectlyBlocked, semanticPromotionPrecision: precisionDenominator ? eligibleUseful / precisionDenominator : null, semanticOpportunityRecall: recallDenominator ? eligibleUseful / recallDenominator : null, definition: "retrieval-feature utility only: precision=eligible useful gold promotions/(eligible useful + eligible non-gold promotions); opportunity recall=eligible useful/(eligible useful + ineligible gold candidates that semantic ranking would have promoted). Not probability or theorem confidence." }
}

function selectCompatibility(results: Record<string, any>): SemanticCompatibilityStrategy {
  const safe = STRATEGIES.filter((strategy) => isSafe(results[strategy].development, results[strategy].validation) && results[strategy].development.paired.improved + results[strategy].validation.paired.improved > 0)
  const pool = safe.length ? safe : [...STRATEGIES]
  return pool.sort((a, b) => {
    const aa = results[a], bb = results[b]
    const completeA = aa.development.paired.completeRegressions + aa.validation.paired.completeRegressions
    const completeB = bb.development.paired.completeRegressions + bb.validation.paired.completeRegressions
    if (completeA !== completeB) return completeA - completeB
    const hurtA = aa.development.paired.hurt + aa.validation.paired.hurt; const hurtB = bb.development.paired.hurt + bb.validation.paired.hurt
    if (hurtA !== hurtB) return hurtA - hurtB
    const perturbA = aa.validation.displacement.meanAbsoluteRankMovement + aa.development.displacement.meanAbsoluteRankMovement
    const perturbB = bb.validation.displacement.meanAbsoluteRankMovement + bb.development.displacement.meanAbsoluteRankMovement
    if (perturbA !== perturbB) return perturbA - perturbB
    return bb.validation.metrics.mrr - aa.validation.metrics.mrr
  })[0]!
}
function selectCap(results: Record<string, any>): number {
  const safe = CAPS.filter((cap) => isSafe(results[cap].development, results[cap].validation))
  const pool = safe.length ? safe : [...CAPS]
  return pool.sort((a, b) => {
    const aa = results[a], bb = results[b]
    const completeA = aa.development.paired.completeRegressions + aa.validation.paired.completeRegressions
    const completeB = bb.development.paired.completeRegressions + bb.validation.paired.completeRegressions
    if (completeA !== completeB) return completeA - completeB
    const hurtA = aa.development.paired.hurt + aa.validation.paired.hurt; const hurtB = bb.development.paired.hurt + bb.validation.paired.hurt
    if (hurtA !== hurtB) return hurtA - hurtB
    const perturbA = aa.validation.displacement.meanAbsoluteRankMovement + aa.development.displacement.meanAbsoluteRankMovement
    const perturbB = bb.validation.displacement.meanAbsoluteRankMovement + bb.development.displacement.meanAbsoluteRankMovement
    if (perturbA !== perturbB) return perturbA - perturbB
    return a - b
  })[0]!
}
function isSafe(dev: any, val: any) { return dev.paired.completeRegressions === 0 && val.paired.completeRegressions === 0 && dev.paired.hurt === 0 && val.paired.hurt === 0 && dev.metrics.final20 >= .65 && dev.metrics.hit10 >= .40 && dev.metrics.mrr >= .119406789031402 && val.metrics.final20 >= .6166666666666667 && val.metrics.hit10 >= .5666666666666667 && val.metrics.mrr >= .2420941241993873 }
function acceptRelation(result: any) {
  const off = result["REL-OFF"].validation, exact = result["REL-EXACT"].validation
  const relationOff = domainMetric(off.rows, "relations"), relationExact = domainMetric(exact.rows, "relations")
  return exact.paired.hurt === 0 && exact.paired.completeRegressions === 0 && exact.metrics.final20 >= off.metrics.final20 && exact.metrics.hit10 >= off.metrics.hit10 && exact.metrics.mrr >= off.metrics.mrr && (relationExact.final20 > relationOff.final20 || relationExact.mrr > relationOff.mrr)
}
function freezeEligible(base: any, final: any) { return final.development.paired.completeRegressions === 0 && final.validation.paired.completeRegressions === 0 && final.validation.paired.hurt === 0 && final.development.metrics.final20 >= base.development.metrics.final20 && final.development.metrics.hit10 >= base.development.metrics.hit10 && final.development.metrics.mrr >= base.development.metrics.mrr && final.validation.metrics.final20 >= base.validation.metrics.final20 && final.validation.metrics.hit10 >= base.validation.metrics.hit10 && final.validation.metrics.mrr >= base.validation.metrics.mrr && final.validation.displacement.nonGold.promoted100Plus < 870 }
function domainContributions(baseRows: any[], finalRows: any[]) { const domains = [...new Set(baseRows.map((row) => row.domain))].sort(); return Object.fromEntries(domains.map((domain) => { const before = domainMetric(baseRows, domain), after = domainMetric(finalRows, domain); return [domain, { count: before.count, final20Delta: after.final20 - before.final20, mrrDelta: after.mrr - before.mrr, improved: pairedSubset(baseRows, finalRows, domain).improved, hurt: pairedSubset(baseRows, finalRows, domain).hurt }] })) }
function leaveOneDomainOut(baseRows: any[], finalRows: any[]) { const domains = [...new Set(baseRows.map((row) => row.domain))].sort(); return Object.fromEntries(domains.map((domain) => { const base = aggregateSubset(baseRows.filter((row) => row.domain !== domain)); const next = aggregateSubset(finalRows.filter((row) => row.domain !== domain)); return [domain, { fixtureCount: base.count, final20Delta: next.final20 - base.final20, hit10Delta: next.hit10 - base.hit10, mrrDelta: next.mrr - base.mrr }] })) }
function conjunctionCoverage(rows: any[]) { return rows.filter((row) => row.evaluations.some((evaluation: any) => evaluation.isGold && evaluation.boosted)).map((row) => { const gold = row.evaluations.find((evaluation: any) => evaluation.isGold && evaluation.boosted); return { fixtureId: row.id, domain: row.domain, exactSemanticMatches: gold.compatibility.exactSemanticMatches, typeCompatible: gold.compatibility.typeCompatible, conclusionCompatible: gold.compatibility.conclusionCompatible, signatureCompatible: gold.compatibility.signatureCompatible, authority: gold.compatibility.authority } }) }
function domainMetric(rows: any[], domain: string) { return aggregateSubset(rows.filter((row) => row.domain === domain)) }
function pairedSubset(base: any[], final: any[], domain: string) { let improved = 0, hurt = 0; base.forEach((row, i) => { if (row.domain !== domain) return; const delta = rr(final[i].final20.rank) - rr(row.final20.rank); if (delta > 0) improved += 1; else if (delta < 0) hurt += 1 }); return { improved, hurt } }
function aggregateSubset(rows: any[]) { const n = rows.length || 1; const ranks = rows.map((row) => row.final20.rank); return { count: rows.length, final20: ranks.filter(Boolean).length / n, hit10: ranks.filter((rank) => rank && rank <= 10).length / n, mrr: ranks.reduce((sum, rank) => sum + rr(rank), 0) / n } }
function compact(result: any) { const { rows, ...rest } = result; return rest }
function compactBaseline(base: any) { return { development: compact(base.development), validation: compact(base.validation) } }
function mapCompact(value: any): any { if (value?.metrics && value?.rows) return compact(value); if (Array.isArray(value)) return value.map(mapCompact); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapCompact(item)])); return value }
function count(rows: any[], key: string) { return rows.filter((row) => row[key].found).length }
function rankName(names: string[], target: string) { const index = names.indexOf(target); return index < 0 ? null : index + 1 }
function rr(rank: number | null) { return rank ? 1 / rank : 0 }
function mean(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 }
function percentile(values: number[], p: number) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! }
function stats(values: number[]) { return { medianBoostedCandidates: percentile(values, .5), p95BoostedCandidates: percentile(values, .95), meanBoostedCandidates: mean(values), maxBoostedCandidates: Math.max(0, ...values) } }

if (import.meta.main) console.log(JSON.stringify(await runStabilityAnalysis(), null, process.argv.includes("--json") ? 0 : 2))
