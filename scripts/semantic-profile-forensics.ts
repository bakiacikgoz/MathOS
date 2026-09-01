import { resolve } from "node:path"
import { readFileSync, writeFileSync } from "node:fs"
import {
  StratifiedInspectSelector,
  enrichForLean,
  extractSemanticOperatorProfile,
  fuseCandidateRanks,
  generateCandidates,
  goldFound,
  profileGoal,
  readIndex,
  readInspectionCache,
  retrieveFromDeclarations,
} from "@mathos/retrieval"
import { RETRIEVAL_HOLDOUT_FIXTURES } from "../packages/retrieval/src/holdout-fixtures.ts"

const ROOT = resolve(import.meta.dir, "..")
const DEMO = `${ROOT}/demo`
const RESULT = JSON.parse(readFileSync(`${ROOT}/benchmarks/retrieval-holdout-v1-results.json`, "utf8"))
const HURT = new Set(RESULT.paired.fixtures.filter((row: any) => row.classification === "HURT").map((row: any) => row.id))
const ALL_TOKENS = ["add", "sub", "mul", "div", "pow", "inv", "neg", "le", "lt", "union", "inter", "subset", "mem", "card", "comp", "relation_comp", "zero", "one", "assoc", "comm", "self"]

type Candidate = any
interface Trace { fixture: any; tokens: string[]; baseline: PolicyTrace; feature: PolicyTrace }
interface PolicyTrace { unionNames: string[]; top: Candidate[]; inspected: Candidate[]; final: Candidate[]; selector: any }

export async function runV1Forensics() {
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("index missing")
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY")
  const traces: Trace[] = []
  for (const fixture of RETRIEVAL_HOLDOUT_FIXTURES) {
    const semantic = extractSemanticOperatorProfile(fixture.goal)
    const tokens = [...semantic.sequence, ...semantic.morphologyTokens, ...(semantic.relation?.hasComposition ? ["relation_comp"] : []), ...(semantic.relation?.property ? [semantic.relation.property.toLowerCase()] : [])]
    traces.push({ fixture, tokens: [...new Set(tokens)], baseline: evaluate(fixture.goal), feature: evaluate(tokens.length ? `${fixture.goal} semantic_operator_profile ${tokens.join(" ")}` : fixture.goal) })
  }

  function evaluate(goalText: string): PolicyTrace {
    const goal = profileGoal(goalText)
    const union = generateCandidates(stored!.declarations, stored!.channels, { goalText, goal, formal: true })
    const header = retrieveFromDeclarations(stored!.declarations, { query: goalText, goal: goalText, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored!.manifest.revision, stored!.channels)
    const selection = selector.select(header.candidates, goal, 30)
    const inspected = selection.selected.map((row) => row.candidate)
    const inspections = inspected.map((candidate) => cache.file.entries[candidate.declaration.name]?.inspection).filter(Boolean)
    const adjusted = enrichForLean(inspected, inspections, goal, new Set(inspections.map((row) => row.name)))
    const final = fuseCandidateRanks(inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates.slice(0, 20)
    return { unionNames: union.map((row) => row.declaration.name), top: header.candidates, inspected, final, selector: selection }
  }

  const corpus = traces.filter((trace) => HURT.has(trace.fixture.id)).map(buildRegressionCase)
  const attribution = Object.fromEntries(ALL_TOKENS.map((token) => [token, tokenAttribution(token, traces)]))
  const histogram = displacementHistogram(traces)
  const exactTokens = new Set(["add", "sub", "mul", "div", "pow", "inv", "neg", "le", "lt", "union", "inter", "subset", "mem", "card", "comp", "relation_comp"])
  const exactActivated = traces.filter((trace) => trace.tokens.some((token) => exactTokens.has(token)))
  const morphologyActivated = traces.filter((trace) => trace.tokens.some((token) => ["zero", "one", "assoc", "comm", "self"].includes(token)))
  const report = {
    featureVersion: "SEMANTIC_OPERATOR_PROFILE_V1",
    holdoutStatus: "CLOSED_FORENSICS_ONLY",
    formula: { materialPromotion: "non-gold candidate moves upward by >=20 Top200 rank positions (absent=201)", usefulPromotion: "gold Final20 reciprocal rank improves on an activated fixture", utilityPrecision: "usefulPromotions / (usefulPromotions + falsePositiveMaterialPromotions); retrieval utility only, not confidence" },
    corpus,
    tokenAttribution: attribution,
    exactVsMorphology: { exact: activationSummary(exactActivated), morphology: activationSummary(morphologyActivated) },
    displacementHistogram: histogram,
  }
  writeFileSync(`${ROOT}/benchmarks/retrieval-experiments/semantic-v1-regressions.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report

  function buildRegressionCase(trace: Trace) {
    const expected = new Set(trace.fixture.expectedAnyOf.map((name: string) => name.toLowerCase()))
    const baseGold = findGold(trace.baseline, expected)
    const featureGold = findGold(trace.feature, expected)
    const featureGoldTopRank = rank(trace.feature.top, expected) ?? 201
    const featureGoldFinalRank = rank(trace.feature.final, expected) ?? 21
    const affectedCandidates = [...new Set([...trace.baseline.top.map(name), ...trace.feature.top.map(name), ...trace.baseline.final.map(name), ...trace.feature.final.map(name)])].map((candidateName) => {
      const baseRank = rankName(trace.baseline.top, candidateName) ?? 201
      const featureRank = rankName(trace.feature.top, candidateName) ?? 201
      const baselineFinalRank = rankName(trace.baseline.final, candidateName) ?? 21
      const featureFinalRank = rankName(trace.feature.final, candidateName) ?? 21
      const candidate = trace.feature.top.find((row) => name(row) === candidateName) ?? trace.baseline.top.find((row) => name(row) === candidateName)
      const matches = trace.tokens.filter((token) => candidateTokens(candidate).has(token))
      return { name: candidateName, baselineRank: baseRank, featureRank, rankDelta: baseRank - featureRank, baselineFinalRank, featureFinalRank, finalRankDelta: baselineFinalRank - featureFinalRank, semanticMatches: matches, promotedAboveGold: featureRank < featureGoldTopRank && baseRank >= featureGoldTopRank, promotedAboveGoldFinal: featureFinalRank < featureGoldFinalRank && baselineFinalRank >= featureGoldFinalRank }
    }).filter((row) => row.rankDelta > 0 && (row.promotedAboveGold || row.promotedAboveGoldFinal || row.rankDelta >= 20)).sort((a, b) => Number(b.promotedAboveGoldFinal) - Number(a.promotedAboveGoldFinal) || b.rankDelta - a.rankDelta).slice(0, 50)
    const causeCounts = new Map<string, number>()
    for (const row of affectedCandidates) for (const token of row.semanticMatches) causeCounts.set(token, (causeCounts.get(token) ?? 0) + 1)
    const likelyToken = [...causeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    return {
      fixtureId: trace.fixture.id,
      domain: trace.fixture.domain,
      baselineRank: rank(trace.baseline.final, expected),
      featureRank: rank(trace.feature.final, expected),
      baselineStage: stage(trace.baseline, expected),
      featureStage: stage(trace.feature, expected),
      addedSemanticTokens: trace.tokens,
      baseline: summarizeGold(trace.baseline, baseGold, expected),
      feature: summarizeGold(trace.feature, featureGold, expected),
      affectedCandidates,
      likelyCause: likelyToken ? `semantic token collision dominated by ${likelyToken}` : "rank normalization/selector displacement without a single material token-matching promoter",
    }
  }
}

function tokenAttribution(token: string, traces: Trace[]) {
  const active = traces.filter((trace) => trace.tokens.includes(token))
  let improvements = 0, hurts = 0, neutral = 0, falsePositivePromotions = 0
  for (const trace of active) {
    const expected = new Set(trace.fixture.expectedAnyOf.map((name: string) => name.toLowerCase()))
    const before = rr(rank(trace.baseline.final, expected)); const after = rr(rank(trace.feature.final, expected))
    if (after > before) improvements += 1; else if (after < before) hurts += 1; else neutral += 1
    const golds = expected
    const names = new Set([...trace.baseline.top.map(name), ...trace.feature.top.map(name)])
    for (const candidateName of names) {
      if (golds.has(candidateName.toLowerCase())) continue
      const candidate = trace.feature.top.find((row) => name(row) === candidateName) ?? trace.baseline.top.find((row) => name(row) === candidateName)
      if (!candidateTokens(candidate).has(token)) continue
      const movement = (rankName(trace.baseline.top, candidateName) ?? 201) - (rankName(trace.feature.top, candidateName) ?? 201)
      if (movement >= 20) falsePositivePromotions += 1
    }
  }
  const total = improvements + falsePositivePromotions
  return { fixturesActivated: active.length, improvements, hurts, neutral, goldPromotions: improvements, falsePositivePromotions, utilityPrecision: total ? improvements / total : null }
}
function activationSummary(traces: Trace[]) { let improved = 0, hurt = 0, unchanged = 0; for (const trace of traces) { const expected = new Set(trace.fixture.expectedAnyOf.map((name: string) => name.toLowerCase())); const delta = rr(rank(trace.feature.final, expected)) - rr(rank(trace.baseline.final, expected)); if (delta > 0) improved += 1; else if (delta < 0) hurt += 1; else unchanged += 1 } return { fixturesActivated: traces.length, improved, hurt, unchanged } }
function displacementHistogram(traces: Trace[]) {
  const buckets = () => ({ promoted100Plus: 0, promoted50To99: 0, promoted20To49: 0, promoted1To19: 0, unchanged: 0, demoted: 0 })
  const gold = buckets(), nonGold = buckets()
  for (const trace of traces) {
    const expected = new Set(trace.fixture.expectedAnyOf.map((name: string) => name.toLowerCase()))
    const names = new Set([...trace.baseline.top.map(name), ...trace.feature.top.map(name)])
    for (const candidateName of names) {
      const movement = (rankName(trace.baseline.top, candidateName) ?? 201) - (rankName(trace.feature.top, candidateName) ?? 201)
      const target = expected.has(candidateName.toLowerCase()) ? gold : nonGold
      if (movement >= 100) target.promoted100Plus += 1; else if (movement >= 50) target.promoted50To99 += 1; else if (movement >= 20) target.promoted20To49 += 1; else if (movement >= 1) target.promoted1To19 += 1; else if (movement === 0) target.unchanged += 1; else target.demoted += 1
    }
  }
  return { gold, nonGold }
}
function summarizeGold(trace: PolicyTrace, gold: Candidate | undefined, expected: Set<string>) { const diagnostic = gold ? trace.selector.diagnostics[name(gold)] : undefined; return { unionRank: rankNames(trace.unionNames, expected), top200Rank: rank(trace.top, expected), goldChannels: gold?.generation?.channels ?? [], goldScore: gold?.score ?? null, top200Cutoff: trace.top.at(-1)?.score ?? null, inspectSelected: Boolean(trace.inspected.find((row) => expected.has(name(row).toLowerCase()))), inspectReason: gold?.selectionReason ?? null, selectorDiagnostic: diagnostic ?? null, finalRank: rank(trace.final, expected) } }
function findGold(trace: PolicyTrace, expected: Set<string>) { return [...trace.top, ...trace.inspected, ...trace.final].find((row) => expected.has(name(row).toLowerCase())) }
function stage(trace: PolicyTrace, expected: Set<string>) { if (rank(trace.final, expected)) return "FINAL20"; if (rank(trace.inspected, expected)) return "INSPECT30"; if (rank(trace.top, expected)) return "TOP200"; if (rankNames(trace.unionNames, expected)) return "UNION"; return "FAILED" }
function candidateTokens(candidate: Candidate) { return new Set(`${candidate?.declaration?.name ?? ""} ${candidate?.declaration?.signature ?? ""}`.toLowerCase().split(/[^\p{L}\p{N}_]+/u).flatMap((part) => part.split(/[._]/)).filter(Boolean)) }
function name(candidate: Candidate) { return candidate.declaration.name }
function rank(candidates: Candidate[], expected: Set<string>) { const index = candidates.findIndex((row) => expected.has(name(row).toLowerCase())); return index >= 0 ? index + 1 : null }
function rankNames(names: string[], expected: Set<string>) { const index = names.findIndex((value) => expected.has(value.toLowerCase())); return index >= 0 ? index + 1 : null }
function rankName(candidates: Candidate[], target: string) { const index = candidates.findIndex((row) => name(row) === target); return index >= 0 ? index + 1 : null }
function rr(value: number | null) { return value ? 1 / value : 0 }

if (import.meta.main) console.log(JSON.stringify(await runV1Forensics(), null, process.argv.includes("--json") ? 0 : 2))
