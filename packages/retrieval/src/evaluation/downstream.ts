import type { EvaluationFixture } from "./metrics.ts"
import type { Ranker } from "./paired-analysis.ts"
export interface DownstreamMetrics { k: number; attempted: number; successes: number; rate: number }
export function downstreamProofSuccess(fixtures: EvaluationFixture[], ranker: Ranker, k: number): DownstreamMetrics {
  let successes = 0
  for (const fixture of fixtures) {
    const successful = new Set(fixture.candidates.filter((item) => item.proofSucceeds).map((item) => item.name))
    if (ranker(fixture).slice(0, k).some((name) => successful.has(name))) successes += 1
  }
  return { k, attempted: fixtures.length, successes, rate: fixtures.length ? successes / fixtures.length : 0 }
}
