import { aggregateMetrics, measureCase, metricsByDomain, type AggregateMetrics, type CaseMetrics, type EvaluationFixture } from "./metrics.ts"

export type Ranker = (fixture: EvaluationFixture) => string[]
export interface EvaluationRun { aggregate: AggregateMetrics; domains: Record<string, AggregateMetrics>; rows: CaseMetrics[] }
export interface PairedAnalysis { baseline: EvaluationRun; candidate: EvaluationRun; deltas: Record<string, number>; completenessRegressions: string[]; domainHit10Deltas: Record<string, number> }

export const baselineRanker: Ranker = (fixture) => [...fixture.candidates].sort((a, b) => b.baselineScore - a.baselineScore || a.name.localeCompare(b.name)).map((item) => item.name)
const tokens = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1))
export const lexicalNameCandidateRanker: Ranker = (fixture) => {
  const goal = tokens(fixture.goal)
  return [...fixture.candidates].sort((a, b) => {
    const bonus = (name: string) => [...tokens(name.replaceAll(".", " "))].filter((token) => goal.has(token)).length * 0.25
    return (b.baselineScore + bonus(b.name)) - (a.baselineScore + bonus(a.name)) || a.name.localeCompare(b.name)
  }).map((item) => item.name)
}

function run(fixtures: EvaluationFixture[], ranker: Ranker): EvaluationRun {
  const rows = fixtures.map((fixture) => {
    const started = performance.now(); const ranked = ranker(fixture); const elapsed = performance.now() - started
    return measureCase(fixture, ranked, elapsed)
  })
  return { rows, aggregate: aggregateMetrics(rows), domains: metricsByDomain(rows) }
}
export function pairedAnalysis(fixtures: EvaluationFixture[], candidate: Ranker = lexicalNameCandidateRanker): PairedAnalysis {
  const baseline = run(fixtures, baselineRanker), next = run(fixtures, candidate)
  const keys = ["candidateRecall", "top200", "inspect30", "final20", "hit1", "hit5", "hit10", "mrr", "latencyMs"] as const
  return { baseline, candidate: next, deltas: Object.fromEntries(keys.map((key) => [key, next.aggregate[key] - baseline.aggregate[key]])),
    completenessRegressions: next.rows.filter((row, index) => baseline.rows[index]!.complete && !row.complete).map((row) => row.id),
    domainHit10Deltas: Object.fromEntries(Object.keys(baseline.domains).map((domain) => [domain, (next.domains[domain]?.hit10 ?? 0) - baseline.domains[domain]!.hit10])) }
}
