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

const ROOT = "/Users/yazilim/Projects/mathos"
const DEMO = `${ROOT}/demo`
const MODES = ["BASELINE", "EXACT_ONLY", "EXACT_MULTIPLICITY", "EXACT_SEQUENCE", "MORPHOLOGY_ONLY", "OPERATORS_MORPHOLOGY", "RELATION_ONLY", "ARITHMETIC_ONLY", "V2_CANDIDATE"] as const
type Mode = typeof MODES[number]
const ARITHMETIC = new Set(["add", "sub", "neg", "mul", "div", "pow", "inv"])
const RELATION = new Set(["relation_comp", "reflexive", "symmetric", "transitive", "antisymmetric", "irreflexive", "total", "equivalence"])
const V2_EXACT = new Set(["add", "sub", "neg", "mul", "div", "pow", "inv", "le", "lt", "union", "inter", "subset", "mem", "card", "comp"])

export function assertV2SetAllowed(set: string) {
  if (set === "holdout" || set.includes("holdout-v1")) throw new Error("V2 candidate evaluation on retrieval-holdout-v1 is forbidden")
  if (set !== "development" && set !== "validation") throw new Error(`unsupported V2 evaluation set: ${set}`)
}

export async function runSemanticV2(set: "development" | "validation") {
  assertV2SetAllowed(set)
  const fixtures = set === "development"
    ? MATHLIB_FIXTURES.map((fixture) => ({ id: fixture.id, goal: fixture.goal, expected: fixture.expected, domain: fixture.domain }))
    : RETRIEVAL_VALIDATION_FIXTURES.map((fixture) => ({ id: fixture.id, goal: fixture.goal, expected: fixture.expectedAnyOf, domain: fixture.domain }))
  const stored = readIndex(DEMO)
  if (!stored) throw new Error("index missing")
  const cache = readInspectionCache(DEMO, stored.manifest.leanVersion, stored.manifest.mathlibRevision)
  const selector = new StratifiedInspectSelector("SOFT_CONSENSUS_REDUNDANCY")
  const results: Record<string, any> = {}
  for (const mode of MODES) {
    const rows = []
    for (const fixture of fixtures) {
      const semantic = extractSemanticOperatorProfile(fixture.goal)
      const tokens = tokensFor(mode, semantic)
      const effectiveGoal = mode === "BASELINE" || tokens.length === 0 ? fixture.goal : `${fixture.goal} semantic_profile_ablation ${tokens.join(" ")}`
      const baselineGoal = profileGoal(fixture.goal)
      const effectiveProfile = profileGoal(effectiveGoal)
      const baselineUnion = generateCandidates(stored.declarations, stored.channels, { goalText: fixture.goal, goal: baselineGoal, formal: true })
      const enrichedUnion = mode === "BASELINE" ? baselineUnion : generateCandidates(stored.declarations, stored.channels, { goalText: effectiveGoal, goal: effectiveProfile, formal: true })
      const baselineHeader = retrieveFromDeclarations(stored.declarations, { query: fixture.goal, goal: fixture.goal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored.manifest.revision, stored.channels)
      const enrichedHeader = mode === "BASELINE" ? baselineHeader : retrieveFromDeclarations(stored.declarations, { query: effectiveGoal, goal: effectiveGoal, maxPremises: 200, candidatePool: 200, skipInspect: true }, stored.manifest.revision, stored.channels)
      const top = mode === "V2_CANDIDATE" ? rankProtectedV2(baselineHeader.candidates, enrichedHeader.candidates, semantic, fixture.goal, 12) : enrichedHeader.candidates
      const goal = profileGoal(mode === "V2_CANDIDATE" ? fixture.goal : effectiveGoal)
      const selection = selector.select(top, goal, 30)
      const inspected = selection.selected.map((row) => row.candidate)
      const inspections = inspected.map((candidate) => cache.file.entries[candidate.declaration.name]?.inspection).filter(Boolean)
      const adjusted = enrichForLean(inspected, inspections, goal, new Set(inspections.map((row) => row.name)))
      const final = fuseCandidateRanks(inspected, adjusted, { method: "SCORE_FUSION", stage1Weight: 0.45, leanWeight: 0.55 }).candidates.slice(0, 20)
      rows.push({ id: fixture.id, domain: fixture.domain, expected: fixture.expected, union: goldFound(enrichedUnion.map((row) => row.declaration.name), fixture.expected), top200: goldFound(top.map((row) => row.declaration.name), fixture.expected), inspect30: goldFound(inspected.map((row) => row.declaration.name), fixture.expected), final20: goldFound(final.map((row) => row.declaration.name), fixture.expected), finalNames: final.map((row) => row.declaration.name) })
    }
    results[mode] = summarize(rows, fixtures)
  }
  const baseline = results.BASELINE
  for (const mode of MODES.filter((mode) => mode !== "BASELINE")) results[mode].delta = numericDelta(baseline.metrics, results[mode].metrics)
  return { set, fixtureCount: fixtures.length, holdoutEvaluation: false, modes: results }
}

function tokensFor(mode: Mode, semantic: ReturnType<typeof extractSemanticOperatorProfile>) {
  const exact = semantic.sequence
  if (mode === "BASELINE") return []
  if (mode === "EXACT_ONLY") return [...new Set(exact)]
  if (mode === "EXACT_MULTIPLICITY") return [...exact].sort()
  if (mode === "EXACT_SEQUENCE") return exact
  if (mode === "MORPHOLOGY_ONLY") return semantic.morphologyTokens
  if (mode === "OPERATORS_MORPHOLOGY") return [...exact, ...semantic.morphologyTokens]
  if (mode === "RELATION_ONLY") return [...exact.filter((token) => RELATION.has(token)), ...(semantic.relation?.property ? [semantic.relation.property.toLowerCase()] : [])]
  if (mode === "ARITHMETIC_ONLY") return exact.filter((token) => ARITHMETIC.has(token))
  if (mode === "V2_CANDIDATE") return exact.filter((token) => V2_EXACT.has(token))
  return []
}

function rankProtectedV2(baseline: any[], enriched: any[], semantic: ReturnType<typeof extractSemanticOperatorProfile>, goalText: string, cap: number) {
  const exact = [...new Set(semantic.sequence.filter((token) => V2_EXACT.has(token)))]
  if (!exact.length) return baseline
  const goalTypes = profileGoal(goalText).typeConstructors.map((value) => value.toLowerCase())
  const baseRank = new Map(baseline.map((row, index) => [row.declaration.name, index + 1]))
  const featureRank = new Map(enriched.map((row, index) => [row.declaration.name, index + 1]))
  const candidates = new Map([...baseline, ...enriched].map((row) => [row.declaration.name, row]))
  return [...candidates.values()].map((candidate) => {
    const text = `${candidate.declaration.name} ${candidate.declaration.signature}`.toLowerCase()
    const matches = exact.filter((token) => tokenMatch(text, token))
    const typeCompatible = goalTypes.length > 0 && goalTypes.some((type) => text.includes(type))
    const eligible = matches.length >= 2 || (matches.length >= 1 && typeCompatible)
    const before = baseRank.get(candidate.declaration.name) ?? 201
    const after = featureRank.get(candidate.declaration.name) ?? 201
    const bounded = eligible && after < before ? before - Math.min(cap, before - after) : before
    return { candidate, bounded, before }
  }).sort((a, b) => a.bounded - b.bounded || a.before - b.before || a.candidate.declaration.name.localeCompare(b.candidate.declaration.name)).slice(0, 200).map((row) => row.candidate)
}
function tokenMatch(text: string, token: string) { return new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text) }
function summarize(rows: any[], fixtures: any[]) {
  const n = rows.length || 1
  const ranked = metricsFor(rows.map((row) => row.finalNames), fixtures)
  const metrics = { union: rows.filter((row) => row.union.found).length / n, top200: rows.filter((row) => row.top200.found).length / n, inspect30: rows.filter((row) => row.inspect30.found).length / n, final20: rows.filter((row) => row.final20.found).length / n, hit5: ranked.hit5, hit10: ranked.hit10, mrr: ranked.mrr }
  return { metrics, paired: null as any, rows }
}
function numericDelta(before: Record<string, number>, after: Record<string, number>) { return Object.fromEntries(Object.keys(before).map((key) => [key, Number((after[key]! - before[key]!).toFixed(8))])) }
function addPaired(report: any) {
  const baseline = report.modes.BASELINE.rows
  for (const [mode, item] of Object.entries<any>(report.modes)) {
    if (mode === "BASELINE") continue
    let improved = 0, hurt = 0, unchanged = 0, completeRegressions = 0
    item.rows.forEach((row: any, index: number) => { const before = baseline[index].final20.rank ? 1 / baseline[index].final20.rank : 0; const after = row.final20.rank ? 1 / row.final20.rank : 0; if (after > before) improved += 1; else if (after < before) { hurt += 1; if (baseline[index].final20.found && !row.final20.found) completeRegressions += 1 } else unchanged += 1 })
    item.paired = { improved, unchanged, hurt, completeRegressions }
    delete item.rows
  }
  delete report.modes.BASELINE.rows
  return report
}

if (import.meta.main) {
  const setArg = process.argv[process.argv.indexOf("--set") + 1] ?? "validation"
  assertV2SetAllowed(setArg)
  const report = addPaired(await runSemanticV2(setArg as "development" | "validation"))
  console.log(JSON.stringify(report, null, process.argv.includes("--json") ? 0 : 2))
}
