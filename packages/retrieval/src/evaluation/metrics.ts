export interface EvaluationCandidate { name: string; baselineScore: number; proofSucceeds?: boolean }
export interface EvaluationFixture { id: string; domain: string; goal: string; candidates: EvaluationCandidate[]; gold: string[] }
export interface CaseMetrics {
  id: string; domain: string; candidateRecall: number; top200: number; inspect30: number; final20: number
  hit1: number; hit5: number; hit10: number; mrr: number; complete: boolean; latencyMs: number
}
export interface AggregateMetrics extends Omit<CaseMetrics, "id" | "domain" | "complete"> { cases: number; completeCases: number }

const recall = (names: string[], gold: string[]) => gold.length ? gold.filter((name) => names.includes(name)).length / gold.length : 1
export function measureCase(fixture: EvaluationFixture, ranked: string[], latencyMs: number): CaseMetrics {
  const first = ranked.findIndex((name) => fixture.gold.includes(name))
  return {
    id: fixture.id, domain: fixture.domain,
    candidateRecall: recall(fixture.candidates.map((item) => item.name), fixture.gold),
    top200: recall(ranked.slice(0, 200), fixture.gold), inspect30: recall(ranked.slice(0, 30), fixture.gold), final20: recall(ranked.slice(0, 20), fixture.gold),
    hit1: first >= 0 && first < 1 ? 1 : 0, hit5: first >= 0 && first < 5 ? 1 : 0, hit10: first >= 0 && first < 10 ? 1 : 0,
    mrr: first < 0 ? 0 : 1 / (first + 1), complete: fixture.gold.every((name) => ranked.slice(0, 20).includes(name)), latencyMs,
  }
}

export function aggregateMetrics(rows: CaseMetrics[]): AggregateMetrics {
  const n = rows.length || 1
  const avg = (key: keyof Pick<CaseMetrics, "candidateRecall" | "top200" | "inspect30" | "final20" | "hit1" | "hit5" | "hit10" | "mrr" | "latencyMs">) => rows.reduce((sum, row) => sum + row[key], 0) / n
  return { cases: rows.length, completeCases: rows.filter((row) => row.complete).length,
    candidateRecall: avg("candidateRecall"), top200: avg("top200"), inspect30: avg("inspect30"), final20: avg("final20"),
    hit1: avg("hit1"), hit5: avg("hit5"), hit10: avg("hit10"), mrr: avg("mrr"), latencyMs: avg("latencyMs") }
}

export function metricsByDomain(rows: CaseMetrics[]): Record<string, AggregateMetrics> {
  return Object.fromEntries([...new Set(rows.map((row) => row.domain))].sort().map((domain) => [domain, aggregateMetrics(rows.filter((row) => row.domain === domain))]))
}
