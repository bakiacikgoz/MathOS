import {
  MATHLIB_FIXTURES,
  StratifiedInspectSelector,
  enrichForLean,
  fuseCandidateRanks,
  generateCandidates,
  goldFound,
  metricsFor,
  profileGoal,
  readIndex,
  readInspectionCache,
  retrieveFromDeclarations,
  storeInspection,
  writeInspectionCache,
} from "@mathos/retrieval"
import type { BenchmarkCase, FusionMethod, PremiseCandidate } from "@mathos/retrieval"
import { NativeLeanAdapter } from "@mathos/lean"
import type { LeanDeclarationInspection } from "@mathos/lean"
import { RETRIEVAL_VALIDATION_FIXTURES, RETRIEVAL_VALIDATION_METADATA } from "../packages/retrieval/src/validation-fixtures.ts"

const DEMO = "/Users/yazilim/Projects/mathos/demo"
const FUSION_WEIGHTS = [[0.30, 0.70], [0.40, 0.60], [0.45, 0.55], [0.50, 0.50], [0.60, 0.40], [0.70, 0.30]] as const

export type RetrievalFailureReason = "NOT_INDEXED" | "NOT_GENERATED" | "OUTSIDE_TOP200" | "OUTSIDE_INSPECT30" | "LEAN_INSPECTION_FAILED" | "OUTSIDE_FINAL20"

export interface EvaluationFixture extends BenchmarkCase {
  domain: string
}

export interface EvaluationOptions {
  set: "development" | "validation"
  populateCache?: boolean
}

interface PreparedFixture {
  fixture: EvaluationFixture
  unionNames: string[]
  top200: PremiseCandidate[]
  inspected: PremiseCandidate[]
  selector: ReturnType<StratifiedInspectSelector["select"]>
  stage1Ms: number
  selectorMs: number
}

export function fixtureSet(name: EvaluationOptions["set"]): EvaluationFixture[] {
  if (name === "development") return MATHLIB_FIXTURES.map((fixture) => ({ ...fixture, domain: developmentDomain(fixture.expected[0] ?? "Root") }))
  return RETRIEVAL_VALIDATION_FIXTURES.map((fixture) => ({ id: fixture.id, goal: fixture.goal, expected: fixture.expectedAnyOf, domain: fixture.domain }))
}

export async function evaluateRetrieval(options: EvaluationOptions) {
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("demo index missing; run mathos index build")
  const fixtures = fixtureSet(options.set)
  const indexedNames = new Set(stored.declarations.map((row) => row.name.toLowerCase()))
  const prepared: PreparedFixture[] = []
  const queryStarts: number[] = []

  for (const fixture of fixtures) {
    const fullStart = performance.now()
    const stageStart = performance.now()
    const goal = profileGoal(fixture.goal)
    const generated = generateCandidates(stored.declarations, stored.channels, { goalText: fixture.goal, goal, formal: true })
    const header = retrieveFromDeclarations(stored.declarations, { query: fixture.goal, goal: fixture.goal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored.manifest.revision, stored.channels)
    const stage1Ms = performance.now() - stageStart
    const selectorStart = performance.now()
    const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY").select(header.candidates, goal, 30)
    const selectorMs = performance.now() - selectorStart
    prepared.push({ fixture, unionNames: generated.map((row) => row.declaration.name), top200: header.candidates, inspected: selector.selected.map((row) => ({ ...row.candidate, selectionReason: row.selectionReason })), selector, stage1Ms, selectorMs })
    queryStarts.push(performance.now() - fullStart)
  }

  const cacheBefore = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  let coldInspectionMs: number | null = null
  let populated = 0
  if (options.populateCache) {
    const names = [...new Set(prepared.flatMap((row) => row.inspected.map((candidate) => candidate.declaration.name)))]
    const missing = names.filter((name) => !cacheBefore.file.entries[name]?.inspection.elaborated)
    if (missing.length > 0) {
      const start = performance.now()
      const adapter = new NativeLeanAdapter()
      const chunkSize = 30
      for (let offset = 0; offset < missing.length; offset += chunkSize) {
        const chunk = missing.slice(offset, offset + chunkSize)
        const result = await adapter.inspectDeclarations(chunk, { workspaceRoot: DEMO, formalProjectRoot: `${DEMO}/formal` }, { timeoutMs: 180_000 })
        if (result.failed || result.timedOut) throw new Error(`validation cache population failed at chunk ${offset / chunkSize + 1}: ${result.detail ?? "unknown"}`)
        for (const inspection of result.inspections) storeInspection(cacheBefore.file, inspection.name, inspection, null)
        populated += result.inspections.length
        writeInspectionCache(DEMO, cacheBefore.file)
      }
      coldInspectionMs = performance.now() - start
    } else coldInspectionMs = 0
  }

  const warmStart = performance.now()
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  let cacheHits = 0
  let cacheMisses = 0
  const rows = []
  const productionLists: string[][] = []
  const headerLists: string[][] = []
  const fusionLists = new Map<string, string[][]>()
  for (const [stage, lean] of FUSION_WEIGHTS) fusionLists.set(`${stage.toFixed(2)}/${lean.toFixed(2)}`, [])
  fusionLists.set("RRF", [])
  fusionLists.set("stage1-only", [])
  fusionLists.set("lean-only", [])

  for (const item of prepared) {
    const inspections: LeanDeclarationInspection[] = []
    const hitNames = new Set<string>()
    for (const candidate of item.inspected) {
      const found = cache.file.entries[candidate.declaration.name]?.inspection
      if (found) {
        cacheHits += 1
        hitNames.add(candidate.declaration.name)
        inspections.push(found)
      } else cacheMisses += 1
    }
    const goal = profileGoal(item.fixture.goal)
    const adjusted = enrichForLean(item.inspected, inspections, goal, hitNames)
    const production = fuseCandidateRanks(item.inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates
    const headerAdjusted = enrichForLean(item.inspected, [], goal)
    const headerFinal = fuseCandidateRanks(item.inspected, headerAdjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates
    const productionNames = production.slice(0, 20).map((row) => row.declaration.name)
    const headerNames = headerFinal.slice(0, 20).map((row) => row.declaration.name)
    productionLists.push(productionNames)
    headerLists.push(headerNames)

    for (const [stage, lean] of FUSION_WEIGHTS) {
      const key = `${stage.toFixed(2)}/${lean.toFixed(2)}`
      fusionLists.get(key)!.push(fuseCandidateRanks(item.inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: stage, leanWeight: lean }).candidates.slice(0, 20).map((row) => row.declaration.name))
    }
    fusionLists.get("RRF")!.push(fuseCandidateRanks(item.inspected, adjusted, { method: "RRF" }).candidates.slice(0, 20).map((row) => row.declaration.name))
    fusionLists.get("stage1-only")!.push(fuseCandidateRanks(item.inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 1, leanWeight: 0 }).candidates.slice(0, 20).map((row) => row.declaration.name))
    fusionLists.get("lean-only")!.push(fuseCandidateRanks(item.inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 0, leanWeight: 1 }).candidates.slice(0, 20).map((row) => row.declaration.name))

    const indexed = item.fixture.expected.some((name) => indexedNames.has(name.toLowerCase()))
    const union = goldFound(item.unionNames, item.fixture.expected)
    const top200 = goldFound(item.top200.map((row) => row.declaration.name), item.fixture.expected)
    const inspect30 = goldFound(item.inspected.map((row) => row.declaration.name), item.fixture.expected)
    const final20 = goldFound(productionNames, item.fixture.expected)
    const expectedInspection = inspections.find((inspection) => item.fixture.expected.some((name) => name.toLowerCase() === inspection.name.toLowerCase()))
    const failureReason: RetrievalFailureReason | null = !indexed ? "NOT_INDEXED" : !union.found ? "NOT_GENERATED" : !top200.found ? "OUTSIDE_TOP200" : !inspect30.found ? "OUTSIDE_INSPECT30" : !expectedInspection?.elaborated ? "LEAN_INSPECTION_FAILED" : !final20.found ? "OUTSIDE_FINAL20" : null
    const goldCandidate = production.find((candidate) => item.fixture.expected.some((name) => name.toLowerCase() === candidate.declaration.name.toLowerCase()))
    const cutoff = production[19]?.score ?? null
    rows.push({
      id: item.fixture.id,
      domain: item.fixture.domain,
      expected: item.fixture.expected,
      union,
      top200,
      inspect30,
      final20,
      failureReason,
      finalDiagnosis: goldCandidate ? {
        name: goldCandidate.declaration.name,
        stage1Rank: goldCandidate.stage1Rank ?? null,
        leanRank: goldCandidate.leanRank ?? null,
        stage1Normalized: goldCandidate.stage1Normalized ?? null,
        leanNormalized: goldCandidate.leanNormalized ?? null,
        fusedScore: goldCandidate.score,
        final20Cutoff: cutoff,
        scoreDelta: cutoff === null ? null : Number((goldCandidate.score - cutoff).toFixed(8)),
      } : null,
    })
  }
  const warmMs = performance.now() - warmStart
  const stageMetrics = stageAggregate(rows)
  const quality = metricsFor(productionLists, fixtures)
  const domainResults = domainAggregate(rows, productionLists, fixtures)
  const failureBreakdown = failureAggregate(rows)
  const sensitivity = Object.fromEntries([...fusionLists.entries()].map(([name, lists]) => [name, { final20Recall: recallOf(lists, fixtures), ...metricsFor(lists, fixtures) }]))
  const usefulness = enrichmentUsefulness(headerLists, productionLists, fixtures)
  const finalDrops = rows.filter((row) => row.inspect30.found && !row.final20.found)
  const queryTimes = prepared.map((row) => row.stage1Ms + row.selectorMs)

  return {
    dataset: options.set === "validation" ? RETRIEVAL_VALIDATION_METADATA : { datasetVersion: "development-v1", fixtureCount: fixtures.length },
    set: options.set,
    fixtureCount: fixtures.length,
    metrics: { ...stageMetrics, ...quality, top200ToInspect30: ratio(stageMetrics.inspect30, stageMetrics.top200), inspect30ToFinal20: ratio(stageMetrics.final20, stageMetrics.inspect30) },
    failureBreakdown,
    domainResults,
    sensitivity,
    headerVsLean: usefulness,
    performance: {
      stage1Ms: sum(prepared.map((row) => row.stage1Ms)),
      selectorMs: sum(prepared.map((row) => row.selectorMs)),
      coldInspectionMs,
      warmAnalysisMs: warmMs,
      fullWarmMs: sum(queryTimes) + warmMs,
      medianQueryMs: percentile(queryTimes, 0.5),
      p95QueryMs: percentile(queryTimes, 0.95),
      cacheHits,
      cacheMisses,
      populated,
    },
    finalDrops,
    rows,
    diagnostics: options.set === "development" ? {
      functionCompId: selectorBoundary(prepared, "Function.comp_id"),
      functionCompApply: rows.find((row) => row.expected.includes("Function.comp_apply")) ?? null,
    } : undefined,
  }
}

function selectorBoundary(prepared: PreparedFixture[], name: string) {
  const item = prepared.find((row) => row.fixture.expected.some((expected) => expected.toLowerCase() === name.toLowerCase()))
  if (!item) return null
  const diagnostic = item.selector.diagnostics[name]
  const selected = item.selector.selected.map((row) => ({ name: row.candidate.declaration.name, selectionReason: row.selectionReason, marginalValue: row.diagnostic.marginalValue, redundancyPenalty: row.diagnostic.redundancyPenalty })).filter((row) => Number.isFinite(row.marginalValue))
  const marginallySelected = selected.filter((row) => row.selectionReason === "MARGINAL")
  const thresholdPool = marginallySelected.length ? marginallySelected : selected
  const threshold = thresholdPool.length ? Math.min(...thresholdPool.map((row) => row.marginalValue)) : null
  const nearest = diagnostic ? [...selected].sort((a, b) => Math.abs(a.marginalValue - diagnostic.marginalValue) - Math.abs(b.marginalValue - diagnostic.marginalValue) || a.name.localeCompare(b.name))[0] ?? null : null
  return {
    top200Rank: diagnostic?.ranks.overallRank ?? null,
    channelRanks: diagnostic?.ranks ?? null,
    marginalValue: diagnostic?.marginalValue ?? null,
    redundancyPenalty: diagnostic?.redundancyPenalty ?? null,
    selectionThreshold: threshold,
    scoreDelta: threshold === null || !diagnostic ? null : Number((diagnostic.marginalValue - threshold).toFixed(8)),
    nearestSelectedCandidate: nearest,
    exclusionReason: diagnostic?.exclusionReason ?? null,
  }
}

export function stageAggregate(rows: Array<{ union: { found: boolean }; top200: { found: boolean }; inspect30: { found: boolean }; final20: { found: boolean } }>) {
  const n = rows.length || 1
  return { union: rows.filter((row) => row.union.found).length / n, top200: rows.filter((row) => row.top200.found).length / n, inspect30: rows.filter((row) => row.inspect30.found).length / n, final20: rows.filter((row) => row.final20.found).length / n }
}

function domainAggregate(rows: any[], lists: string[][], fixtures: EvaluationFixture[]) {
  const domains = [...new Set(fixtures.map((fixture) => fixture.domain))].sort()
  return Object.fromEntries(domains.map((domain) => {
    const indices = fixtures.map((fixture, index) => fixture.domain === domain ? index : -1).filter((index) => index >= 0)
    const subsetRows = indices.map((index) => rows[index])
    const subsetFixtures = indices.map((index) => fixtures[index]!)
    const subsetLists = indices.map((index) => lists[index]!)
    return [domain, { fixtureCount: indices.length, ...stageAggregate(subsetRows), hit10: metricsFor(subsetLists, subsetFixtures).hit10 }]
  }))
}

export function failureAggregate(rows: Array<{ failureReason: RetrievalFailureReason | null }>) {
  const result: Record<RetrievalFailureReason, number> = { NOT_INDEXED: 0, NOT_GENERATED: 0, OUTSIDE_TOP200: 0, OUTSIDE_INSPECT30: 0, LEAN_INSPECTION_FAILED: 0, OUTSIDE_FINAL20: 0 }
  for (const row of rows) if (row.failureReason) result[row.failureReason] += 1
  return result
}

function enrichmentUsefulness(header: string[][], lean: string[][], fixtures: EvaluationFixture[]) {
  let improved = 0, unchanged = 0, hurt = 0
  fixtures.forEach((fixture, index) => {
    const before = goldFound(header[index]!, fixture.expected).rank
    const after = goldFound(lean[index]!, fixture.expected).rank
    const beforeValue = before ?? 1e9
    const afterValue = after ?? 1e9
    if (afterValue < beforeValue) improved += 1
    else if (afterValue > beforeValue) hurt += 1
    else unchanged += 1
  })
  return { improved, unchanged, hurt, headerFinal20Recall: recallOf(header, fixtures), leanEnrichedFinal20Recall: recallOf(lean, fixtures) }
}

function recallOf(lists: string[][], fixtures: EvaluationFixture[]) { return lists.filter((list, index) => goldFound(list, fixtures[index]!.expected).found).length / (fixtures.length || 1) }
function ratio(value: number, denominator: number) { return denominator ? value / denominator : 0 }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0) }
function percentile(values: number[], q: number) { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)]! : 0 }
function developmentDomain(name: string) { return name.includes(".") ? name.split(".")[0]! : "Eq/logical" }

if (import.meta.main) {
  const setArg = process.argv[process.argv.indexOf("--set") + 1]
  const requested = setArg === "development" || setArg === "validation" ? [setArg] : ["development", "validation"] as const
  const populateCache = process.argv.includes("--populate-cache")
  const reports = []
  for (const set of requested) reports.push(await evaluateRetrieval({ set, populateCache }))
  const output = reports.length === 1 ? reports[0] : { development: reports[0], validation: reports[1] }
  console.log(JSON.stringify(output, null, process.argv.includes("--json") ? 0 : 2))
}
