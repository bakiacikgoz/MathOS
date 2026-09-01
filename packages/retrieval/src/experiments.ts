import type { GoalProfile, PremiseCandidate } from "./types.ts"

export interface ExperimentalRetrievalContext {
  fixtureId: string
  domain: string
  goal: string
  goalProfile: GoalProfile
  union: PremiseCandidate[]
  rankedUnion: PremiseCandidate[]
  productionTop200: PremiseCandidate[]
  scoreAdjustments: Map<string, number>
  structureAuthorityMultiplier: number
  annotations: string[]
}

export interface RetrievalExperiment {
  id: string
  description: string
  affectedDomain: string
  apply(context: ExperimentalRetrievalContext): ExperimentalRetrievalContext
}

export type ExperimentalScore = (candidate: PremiseCandidate, context: ExperimentalRetrievalContext) => number

export function scoreExperiment(id: string, description: string, affectedDomain: string, score: ExperimentalScore): RetrievalExperiment {
  return {
    id,
    description,
    affectedDomain,
    apply(context) {
      const adjustments = new Map(context.scoreAdjustments)
      for (const candidate of context.rankedUnion) {
        const delta = score(candidate, context)
        if (delta !== 0) adjustments.set(candidate.declaration.name, (adjustments.get(candidate.declaration.name) ?? 0) + delta)
      }
      return { ...context, scoreAdjustments: adjustments, annotations: [...context.annotations, id] }
    },
  }
}

export function selectorExperiment(id: string, description: string, affectedDomain: string, structureAuthorityMultiplier: number): RetrievalExperiment {
  return {
    id,
    description,
    affectedDomain,
    apply(context) {
      return { ...context, structureAuthorityMultiplier, annotations: [...context.annotations, id] }
    },
  }
}
