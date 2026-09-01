import { resolve } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import {
  StratifiedInspectSelector,
  applyGoalAwareRerank,
  enrichForLean,
  fuseCandidateRanks,
  generateCandidates,
  goldFound,
  metricsFor,
  nameAwareRank,
  profileCandidate,
  profileGoal,
  rankDeclarations,
  readIndex,
  readInspectionCache,
  retrieveFromDeclarations,
  scoreExperiment,
  selectorExperiment,
} from "@mathos/retrieval"
import type { ExperimentalRetrievalContext, GoalProfile, PremiseCandidate, RetrievalExperiment } from "@mathos/retrieval"
import { RETRIEVAL_VALIDATION_FIXTURES } from "../packages/retrieval/src/validation-fixtures.ts"

const DEMO = resolve(resolve(import.meta.dir, ".."), "demo")
const OUT = resolve(import.meta.dir, "../benchmarks/retrieval-experiments")
const TARGET_DOMAINS = new Set(["algebra", "Nat/Int", "relations"])
const ALGEBRA_CLASSES = ["monoid", "group", "ring", "semiring", "addgroup", "linearorderedring", "module", "field"]
const GENERIC = new Set(["theorem", "validation", "a", "b", "c", "x", "y", "n", "m", "α", "β", "prop", "type", "eq"])

export interface RetrievalFailureCase {
  fixtureId: string
  domain: string
  expectedAnyOf: string[]
  stage: "NOT_GENERATED" | "OUTSIDE_TOP200" | "OUTSIDE_INSPECT30"
  goal: string
  diagnostics: {
    unionRank?: number
    top200Rank?: number
    inspectRank?: number
    channelRanks?: Record<string, number | null>
    matchedTokens?: string[]
    missingTokens?: string[]
    goalProfile?: GoalProfile
    goldNameTokens?: string[]
    goldSignatureTokens?: string[]
    goldNamespace?: string
    goldConclusionShape?: string | null
    goalGoldOverlap?: number
    goldCheapScore?: number
    top200Cutoff?: number
    scoreDelta?: number
    higherRankedCandidateCount?: number
    falsePositiveGroups?: Record<string, number>
    consensus?: string
    informationScore?: number
    marginalValue?: number
    selectionCutoff?: number
    primaryCluster?: string
    secondaryClusters?: string[]
  }
}

interface Prepared {
  fixture: { id: string; goal: string; expected: string[]; domain: string }
  goalProfile: GoalProfile
  union: PremiseCandidate[]
  rankedUnion: PremiseCandidate[]
  productionTop200: PremiseCandidate[]
  productionInspect: PremiseCandidate[]
  productionSelector: ReturnType<StratifiedInspectSelector["select"]>
}

export const EXPERIMENTS: RetrievalExperiment[] = [
  scoreExperiment("ALG-A", "Typeclass-aware token overlap", "algebra", (candidate, context) => overlapCount(tokens(context.goal), ALGEBRA_CLASSES) * overlapCount(tokens(candidate.declaration.signature), ALGEBRA_CLASSES) * 0.12),
  scoreExperiment("ALG-B", "Operator plus type-constructor interaction", "algebra", (candidate, context) => rawOperatorOverlap(candidate, context.goal) > 0 && typeOverlap(candidate, context.goalProfile) > 0 ? 0.16 : 0),
  scoreExperiment("ALG-C", "Goal type to declaration namespace affinity", "algebra", (candidate, context) => context.goalProfile.typeConstructors.some((type) => namespaceOf(candidate).toLowerCase() === type.toLowerCase()) ? 0.14 : 0),
  scoreExperiment("ALG-D", "Compound lemma-name morphology", "algebra", (candidate, context) => inferredMorphologyOverlap(candidate, context.goal) * 0.10),
  scoreExperiment("NAT-A", "Conclusion-shape compatibility", "Nat/Int", (candidate, context) => profileCandidate(candidate.declaration).conclusionHead === context.goalProfile.propositionHead ? 0.14 : 0),
  scoreExperiment("NAT-B", "Operator sequence and multiplicity", "Nat/Int", (candidate, context) => rawOperatorOverlap(candidate, context.goal) * 0.08),
  scoreExperiment("NAT-C", "Exact Nat/Int type evidence", "Nat/Int", (candidate, context) => {
    const goalTypes = new Set(context.goalProfile.typeConstructors.map((type) => type.toLowerCase()))
    if (!goalTypes.has("nat") && !goalTypes.has("int")) return 0
    const signature = tokens(candidate.declaration.signature)
    const exact = [...goalTypes].some((type) => signature.includes(type))
    const wrongTwin = (goalTypes.has("nat") && signature.includes("int")) || (goalTypes.has("int") && signature.includes("nat"))
    return exact ? 0.16 : wrongTwin ? -0.08 : 0
  }),
  scoreExperiment("NAT-D", "Rare compound name signal", "Nat/Int", (candidate, context) => inferredMorphologyOverlap(candidate, context.goal) * 0.12),
  scoreExperiment("REL-A", "Relation-property structural vocabulary", "relations", (candidate, context) => relationStructureOverlap(candidate, context.goal) * 0.40),
  scoreExperiment("REL-B", "Signature argument-role overlap", "relations", (candidate, context) => isRelationGoal(context.goal) ? roleOverlap(candidate.declaration.signature, context.goal) * 0.40 : 0),
  selectorExperiment("REL-C", "Increased selector structural authority", "relations", 50),
]

export async function runExperimentLaboratory(selectedIds?: string[]) {
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("demo index missing")
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  const fixtures = RETRIEVAL_VALIDATION_FIXTURES.map((fixture) => ({ id: fixture.id, goal: fixture.goal, expected: fixture.expectedAnyOf, domain: fixture.domain }))
  const declarationByName = new Map(stored.declarations.map((row) => [row.name.toLowerCase(), row]))
  const prepared: Prepared[] = []
  const prepStart = performance.now()

  for (const fixture of fixtures) {
    const goalProfile = profileGoal(fixture.goal)
    const generated = generateCandidates(stored.declarations, stored.channels, { goalText: fixture.goal, goal: goalProfile, formal: true })
    const evidence = new Map(generated.map((row) => [row.declaration.name, row.evidence]))
    const lexical = rankDeclarations(generated.map((row) => row.declaration), { query: fixture.goal, goal: fixture.goal, maxPremises: 800, candidatePool: 800 })
    const named = nameAwareRank(lexical, goalProfile, { query: fixture.goal, goal: fixture.goal, maxPremises: 800, candidatePool: 800 }, stored.channels)
    const attached = named.map((candidate) => {
      const item = evidence.get(candidate.declaration.name)
      return item ? { ...candidate, generation: { channels: item.channels, matchedTokens: item.matchedTokens, channelRanks: item.channelRanks as Record<string, number> } } : candidate
    })
    const rankedUnion = applyGoalAwareRerank(attached, goalProfile, { query: fixture.goal, goal: fixture.goal, maxPremises: 800, candidatePool: 800 })
    const production = retrieveFromDeclarations(stored.declarations, { query: fixture.goal, goal: fixture.goal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored.manifest.revision, stored.channels)
    const productionSelector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select(production.candidates, goalProfile, 30)
    prepared.push({ fixture, goalProfile, union: generated.map((row) => ({ ...row, generation: { channels: row.evidence.channels, matchedTokens: row.evidence.matchedTokens, channelRanks: row.evidence.channelRanks as Record<string, number> } })), rankedUnion, productionTop200: production.candidates, productionInspect: productionSelector.selected.map((row) => row.candidate), productionSelector })
  }

  const baseline = evaluatePrepared(prepared, cache.file.entries)
  const failures = buildFailureCorpus(prepared, baseline.rows, declarationByName)
  const experiments = EXPERIMENTS.filter((experiment) => !selectedIds || selectedIds.includes(experiment.id))
  const results = []
  for (const experiment of experiments) {
    const experimentalPrepared = prepared.map((item) => applyExperiment(item, experiment))
    const evaluated = evaluatePrepared(experimentalPrepared, cache.file.entries)
    const targetBase = domainMetrics(baseline.rows, baseline.finalLists, fixtures, experiment.affectedDomain)
    const targetExperiment = domainMetrics(evaluated.rows, evaluated.finalLists, fixtures, experiment.affectedDomain)
    const result = {
      experimentId: experiment.id,
      description: experiment.description,
      affectedDomain: experiment.affectedDomain,
      baseline: baseline.metrics,
      experiment: evaluated.metrics,
      delta: metricDelta(baseline.metrics, evaluated.metrics),
      targetBaseline: targetBase,
      targetExperiment,
      targetDelta: metricDelta(targetBase, targetExperiment),
      failuresFixed: evaluated.rows.filter((row, index) => !baseline.rows[index]!.final20.found && row.final20.found).map((row) => row.id),
      regressionsIntroduced: evaluated.rows.filter((row, index) => baseline.rows[index]!.final20.found && !row.final20.found).map((row) => row.id),
      classification: "NEUTRAL",
      runtimeMs: evaluated.runtimeMs,
    }
    result.classification = classify(result)
    results.push(result)
  }

  const clusters = clusterSummary(failures)
  return { baseline: baseline.metrics, fixtureCount: fixtures.length, preparationMs: performance.now() - prepStart, failures, clusters, experiments: results }
}

function applyExperiment(item: Prepared, experiment: RetrievalExperiment): Prepared {
  const context: ExperimentalRetrievalContext = {
    fixtureId: item.fixture.id,
    domain: item.fixture.domain,
    goal: item.fixture.goal,
    goalProfile: item.goalProfile,
    union: item.union,
    rankedUnion: item.rankedUnion,
    productionTop200: item.productionTop200,
    scoreAdjustments: new Map(),
    structureAuthorityMultiplier: 1,
    annotations: [],
  }
  const applied = experiment.apply(context)
  let top200 = item.productionTop200
  if (applied.scoreAdjustments.size > 0) {
    const productionRank = new Map(item.productionTop200.map((candidate, index) => [candidate.declaration.name, index + 1]))
    const unionRank = new Map(item.rankedUnion.map((candidate, index) => [candidate.declaration.name, index + 1]))
    const length = Math.max(200, item.rankedUnion.length)
    top200 = [...item.rankedUnion].sort((a, b) => {
      const ar = productionRank.get(a.declaration.name) ?? unionRank.get(a.declaration.name) ?? length
      const br = productionRank.get(b.declaration.name) ?? unionRank.get(b.declaration.name) ?? length
      const av = 1 - (ar - 1) / length + (applied.scoreAdjustments.get(a.declaration.name) ?? 0)
      const bv = 1 - (br - 1) / length + (applied.scoreAdjustments.get(b.declaration.name) ?? 0)
      return bv - av || ar - br || a.declaration.name.localeCompare(b.declaration.name)
    }).slice(0, 200)
  }
  const selection = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select(top200, item.goalProfile, 30)
  let inspected = selection.selected.map((row) => row.candidate)
  if (applied.structureAuthorityMultiplier > 1 && isRelationGoal(item.fixture.goal)) {
    const selectedNames = new Set(inspected.map((row) => row.declaration.name))
    const structural = top200.filter((candidate) => !selectedNames.has(candidate.declaration.name)).map((candidate) => ({ candidate, diagnostic: selection.diagnostics[candidate.declaration.name] })).filter((row) => row.diagnostic?.ranks.structureRank != null).sort((a, b) => (a.diagnostic!.ranks.structureRank! - b.diagnostic!.ranks.structureRank!) || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name))
    const replaceable = inspected.map((candidate, index) => ({ candidate, index, value: selection.diagnostics[candidate.declaration.name]?.marginalValue ?? Infinity })).sort((a, b) => a.value - b.value)
    let replacements = 0
    for (const challenger of structural) {
      if (replacements >= 3) break
      const current = replaceable[replacements]
      if (!current) break
      const rank = challenger.diagnostic!.ranks.structureRank!
      const structuralValue = challenger.diagnostic!.marginalValue + applied.structureAuthorityMultiplier / rank
      if (structuralValue > current.value) {
        inspected[current.index] = challenger.candidate
        replacements += 1
      }
    }
  }
  return { ...item, productionTop200: top200, productionInspect: inspected, productionSelector: selection }
}

function evaluatePrepared(prepared: Prepared[], entries: Record<string, { inspection: any }>) {
  const start = performance.now()
  const finalLists: string[][] = []
  const rows = []
  for (const item of prepared) {
    const inspections = item.productionInspect.map((candidate) => entries[candidate.declaration.name]?.inspection).filter(Boolean)
    const adjusted = enrichForLean(item.productionInspect, inspections, item.goalProfile, new Set(inspections.map((row) => row.name)))
    const final = fuseCandidateRanks(item.productionInspect, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates.slice(0, 20)
    const names = final.map((row) => row.declaration.name)
    finalLists.push(names)
    rows.push({ id: item.fixture.id, domain: item.fixture.domain, expected: item.fixture.expected, union: goldFound(item.union.map((row) => row.declaration.name), item.fixture.expected), top200: goldFound(item.productionTop200.map((row) => row.declaration.name), item.fixture.expected), inspect30: goldFound(item.productionInspect.map((row) => row.declaration.name), item.fixture.expected), final20: goldFound(names, item.fixture.expected) })
  }
  const n = prepared.length
  const rank = metricsFor(finalLists, prepared.map((item) => ({ id: item.fixture.id, goal: item.fixture.goal, expected: item.fixture.expected })))
  return { rows, finalLists, metrics: { union: rows.filter((row) => row.union.found).length / n, top200: rows.filter((row) => row.top200.found).length / n, inspect30: rows.filter((row) => row.inspect30.found).length / n, final20: rows.filter((row) => row.final20.found).length / n, hit10: rank.hit10, mrr: rank.mrr }, runtimeMs: performance.now() - start }
}

function buildFailureCorpus(prepared: Prepared[], rows: any[], declarationByName: Map<string, any>): RetrievalFailureCase[] {
  const failures: RetrievalFailureCase[] = []
  prepared.forEach((item, index) => {
    const baseline = rows[index]!
    if (baseline.final20.found) return
    const stage = !baseline.union.found ? "NOT_GENERATED" : !baseline.top200.found ? "OUTSIDE_TOP200" : "OUTSIDE_INSPECT30"
    const goldName = item.fixture.expected.find((name) => declarationByName.has(name.toLowerCase())) ?? item.fixture.expected[0]!
    const gold = declarationByName.get(goldName.toLowerCase())
    const unionRank = rankOf(item.union, item.fixture.expected)
    const topRank = rankOf(item.productionTop200, item.fixture.expected)
    const inspectRank = rankOf(item.productionInspect, item.fixture.expected)
    const rankedGold = item.rankedUnion.find((candidate) => item.fixture.expected.some((name) => name.toLowerCase() === candidate.declaration.name.toLowerCase()))
    const diagnostic = item.productionSelector.diagnostics[goldName]
    const goalTokens = tokens(item.fixture.goal).filter((token) => !GENERIC.has(token))
    const nameTokens = tokens(goldName)
    const signatureTokens = tokens(gold?.signature ?? "")
    const goldAll = new Set([...nameTokens, ...signatureTokens])
    const matched = goalTokens.filter((token) => goldAll.has(token))
    const directGold = gold ? rankDeclarations([gold], { query: item.fixture.goal, goal: item.fixture.goal, maxPremises: 1, candidatePool: 1 })[0] : undefined
    const goldCheapScore = rankedGold?.score ?? directGold?.score
    const cutoff = item.productionTop200.at(-1)?.score
    const falsePositiveGroups = stage === "OUTSIDE_TOP200" ? classifyFalsePositives(item.productionTop200.slice(0, 50), item.goalProfile, gold) : undefined
    const clusters = deterministicClusters(stage, diagnostic, item.goalProfile, gold, falsePositiveGroups)
    failures.push({ fixtureId: item.fixture.id, domain: item.fixture.domain, expectedAnyOf: item.fixture.expected, stage, goal: item.fixture.goal, diagnostics: {
      unionRank: unionRank ?? undefined,
      top200Rank: topRank ?? undefined,
      inspectRank: inspectRank ?? undefined,
      channelRanks: diagnostic?.ranks,
      matchedTokens: matched,
      missingTokens: goalTokens.filter((token) => !goldAll.has(token)),
      goalProfile: item.goalProfile,
      goldNameTokens: nameTokens,
      goldSignatureTokens: signatureTokens,
      goldNamespace: goldName.includes(".") ? goldName.split(".")[0] : "Root",
      goldConclusionShape: gold ? profileCandidate(gold).conclusionHead : null,
      goalGoldOverlap: goalTokens.length ? matched.length / goalTokens.length : 0,
      goldCheapScore,
      top200Cutoff: cutoff,
      scoreDelta: goldCheapScore != null && cutoff != null ? goldCheapScore - cutoff : undefined,
      higherRankedCandidateCount: rankedGold ? item.rankedUnion.findIndex((candidate) => candidate.declaration.name === rankedGold.declaration.name) : item.productionTop200.length,
      falsePositiveGroups,
      consensus: diagnostic?.consensus,
      informationScore: diagnostic?.informationScore,
      marginalValue: diagnostic?.marginalValue,
      selectionCutoff: selectionCutoff(item.productionSelector),
      primaryCluster: clusters[0],
      secondaryClusters: clusters.slice(1),
    } })
  })
  return failures
}

function classifyFalsePositives(candidates: PremiseCandidate[], goal: GoalProfile, gold: any) {
  const result = { genericNatDeclarations: 0, sameOperatorWrongConclusion: 0, sameSuffixWrongType: 0, namespaceOnlyMatches: 0, commonTokenNoise: 0 }
  const goldSuffix = tokens(gold?.name ?? "").at(-1)
  for (const candidate of candidates) {
    const profile = profileCandidate(candidate.declaration)
    const ops = operatorOverlap(candidate, goal)
    const types = typeOverlap(candidate, goal)
    const name = tokens(candidate.declaration.name)
    if (namespaceOf(candidate) === "Nat" && ops === 0) result.genericNatDeclarations += 1
    if (ops > 0 && profile.conclusionHead !== goal.propositionHead) result.sameOperatorWrongConclusion += 1
    if (goldSuffix && name.includes(goldSuffix) && types === 0) result.sameSuffixWrongType += 1
    if (goal.namespaces.some((ns) => namespaceOf(candidate).toLowerCase() === ns.toLowerCase()) && ops === 0 && types === 0) result.namespaceOnlyMatches += 1
    if ((candidate.generation?.matchedTokens.length ?? 0) <= 2) result.commonTokenNoise += 1
  }
  return result
}

function deterministicClusters(stage: string, diagnostic: any, goal: GoalProfile, gold: any, falsePositives?: Record<string, number>) {
  const clusters: string[] = []
  if (stage === "NOT_GENERATED") clusters.push("missing generator vocabulary")
  if (stage === "OUTSIDE_TOP200") clusters.push((falsePositives?.commonTokenNoise ?? 0) >= 20 ? "generic-token flooding" : "wrong conclusion structure")
  if (stage === "OUTSIDE_INSPECT30") clusters.push("selector quota pressure")
  if (goal.typeConstructors.length && !tokens(gold?.signature ?? "").some((token) => goal.typeConstructors.map((type) => type.toLowerCase()).includes(token))) clusters.push("missing type evidence")
  if (!diagnostic?.ranks?.structureRank) clusters.push("missing structure evidence")
  if (diagnostic?.consensus === "LOW") clusters.push("low cross-channel consensus")
  if (!gold?.signature || tokens(gold.signature).length < 4) clusters.push("index metadata too shallow")
  return [...new Set(clusters)]
}

function clusterSummary(failures: RetrievalFailureCase[]) {
  const counts: Record<string, { primary: number; secondary: number }> = {}
  for (const failure of failures) {
    const primary = failure.diagnostics.primaryCluster
    if (primary) (counts[primary] ??= { primary: 0, secondary: 0 }).primary += 1
    for (const secondary of failure.diagnostics.secondaryClusters ?? []) (counts[secondary] ??= { primary: 0, secondary: 0 }).secondary += 1
  }
  return counts
}

function domainMetrics(rows: any[], lists: string[][], fixtures: any[], domain: string) {
  const indices = fixtures.map((fixture, index) => fixture.domain === domain ? index : -1).filter((index) => index >= 0)
  const n = indices.length || 1
  const cases = indices.map((index) => ({ id: fixtures[index].id, goal: fixtures[index].goal, expected: fixtures[index].expected }))
  const ranked = indices.map((index) => lists[index])
  const metrics = metricsFor(ranked, cases)
  return { union: indices.filter((index) => rows[index].union.found).length / n, top200: indices.filter((index) => rows[index].top200.found).length / n, inspect30: indices.filter((index) => rows[index].inspect30.found).length / n, final20: indices.filter((index) => rows[index].final20.found).length / n, hit10: metrics.hit10, mrr: metrics.mrr }
}

function metricDelta(before: any, after: any) { return Object.fromEntries(Object.keys(before).filter((key) => typeof before[key] === "number" && typeof after[key] === "number").map((key) => [key, Number((after[key] - before[key]).toFixed(8))])) }
function classify(result: any) { const target = result.targetDelta.inspect30 || result.targetDelta.top200 || result.targetDelta.union || 0; return result.regressionsIntroduced.length ? "REJECTED" : target > 0 ? "PROMISING" : "NEUTRAL" }
function tokens(value: string) { return value.toLowerCase().replace(/[⁻₁₂₃]/g, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean) }
function namespaceOf(candidate: PremiseCandidate) { return candidate.declaration.name.includes(".") ? candidate.declaration.name.split(".")[0]! : "Root" }
function overlapCount(values: string[], allowed: string[]) { const set = new Set(values); return allowed.filter((token) => set.has(token)).length }
function operatorOverlap(candidate: PremiseCandidate, goal: GoalProfile) { const haystack = new Set(tokens(`${candidate.declaration.name} ${candidate.declaration.signature}`)); return [...new Set([...goal.operators, ...Object.entries(goal.operatorMultiplicity ?? {}).filter(([, count]) => count > 0).map(([operator]) => operator)])].filter((operator) => haystack.has(operator.toLowerCase())).length }
function rawOperators(goal: string) { const result: string[] = []; const patterns: Array<[RegExp, string]> = [[/>>>/g, "shiftright"], [/∘r/g, "comp"], [/\^/g, "pow"], [/\*/g, "mul"], [/\+/g, "add"], [/(?<![→])-\s*(?!>)/g, "sub"], [/\//g, "div"], [/⁻¹/g, "inv"], [/≤/g, "le"], [/(?<![←<])<(?![=>])/g, "lt"]]; for (const [pattern, name] of patterns) for (const _ of goal.matchAll(pattern)) result.push(name); return result }
function rawOperatorOverlap(candidate: PremiseCandidate, goal: string) { const haystack = new Set(tokens(`${candidate.declaration.name} ${candidate.declaration.signature}`)); return rawOperators(goal).filter((operator) => haystack.has(operator)).length }
function typeOverlap(candidate: PremiseCandidate, goal: GoalProfile) { const haystack = new Set(tokens(candidate.declaration.signature)); return goal.typeConstructors.filter((type) => haystack.has(type.toLowerCase())).length }
function compoundMorphology(candidate: PremiseCandidate, goal: string) { const goalTokens = tokens(goal).filter((token) => !GENERIC.has(token)); const name = tokens(candidate.declaration.name); let hits = 0; for (let i = 0; i < goalTokens.length - 1; i += 1) if (name.join("_").includes(`${goalTokens[i]}_${goalTokens[i + 1]}`)) hits += 1; return hits }
function inferredMorphology(goal: string) { const result = [...rawOperators(goal)]; const target = goal.split(":").at(-1) ?? goal; if (/\b0\b/.test(target)) result.push("zero"); if (/\b1\b/.test(target)) result.push("one"); const operators = rawOperators(target); if (operators.some((op) => operators.filter((other) => other === op).length >= 3)) result.push("assoc"); if (/([a-z])\s*[-+]\s*\1\s*=\s*0/i.test(target)) result.push("self"); return [...new Set(result)] }
function inferredMorphologyOverlap(candidate: PremiseCandidate, goal: string) { const name = new Set(tokens(candidate.declaration.name)); return inferredMorphology(goal).filter((token) => name.has(token)).length }
function isRelationGoal(goal: string) { return /∘r|\bReflexive\b|\bSymmetric\b|\bTransitive\b|\bAntisymmetric\b|\bIrreflexive\b|\bTotal\b|\bPreorder\b|\bPartialOrder\b|\bEquivalence\b/.test(goal) }
function relationStructureOverlap(candidate: PremiseCandidate, goal: string) { const vocabulary = ["refl", "symm", "trans", "antisymm", "irrefl", "total", "preorder", "partialorder", "equiv", "comp", "flip"]; const a = tokens(candidate.declaration.name + " " + candidate.declaration.signature); const b = new Set([...tokens(goal), ...(/∘r/.test(goal) ? ["comp"] : [])]); return vocabulary.filter((word) => a.includes(word) && b.has(word)).length }
function roleOverlap(signature: string, goal: string) { const arrowsA = (signature.match(/→/g) ?? []).length; const arrowsB = (goal.match(/→/g) ?? []).length; const relationsA = (signature.match(/\b[a-zA-Z]\s+[a-zA-Z]\s+[a-zA-Z]\b/g) ?? []).length; const relationsB = (goal.match(/\b[a-zA-Z]\s+[a-zA-Z]\s+[a-zA-Z]\b/g) ?? []).length; return arrowsA === arrowsB && relationsA === relationsB ? 1 : 0 }
function rankOf(candidates: PremiseCandidate[], expected: string[]) { const index = candidates.findIndex((candidate) => expected.some((name) => name.toLowerCase() === candidate.declaration.name.toLowerCase())); return index >= 0 ? index + 1 : null }
function selectionCutoff(selection: ReturnType<StratifiedInspectSelector["select"]>) { const values = selection.selected.map((row) => row.diagnostic.marginalValue).filter(Number.isFinite); return values.length ? Math.min(...values) : undefined }

function writeFailureArtifacts(failures: RetrievalFailureCase[]) {
  mkdirSync(OUT, { recursive: true })
  const files = [["algebra-failures.json", "algebra"], ["nat-int-failures.json", "Nat/Int"], ["relations-failures.json", "relations"]] as const
  for (const [file, domain] of files) writeFileSync(`${OUT}/${file}`, `${JSON.stringify(failures.filter((failure) => failure.domain === domain), null, 2)}\n`, "utf8")
}

if (import.meta.main) {
  if (process.argv.includes("--list")) {
    console.log(JSON.stringify(EXPERIMENTS.map(({ id, description, affectedDomain }) => ({ id, description, affectedDomain })), null, 2))
  } else {
    const runIndex = process.argv.indexOf("--run")
    const ids = runIndex >= 0 ? [process.argv[runIndex + 1]!].filter(Boolean) : undefined
    const report = await runExperimentLaboratory(ids)
    writeFailureArtifacts(report.failures)
    mkdirSync(OUT, { recursive: true })
    writeFileSync(`${OUT}/latest-results.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(JSON.stringify(report, null, process.argv.includes("--json") ? 0 : 2))
  }
}
