import type { ModelProvider } from "@mathos/models"
import {
  parseResearchDecision,
  type ResearchActionType,
  type ResearchDecision,
} from "@mathos/domain"
import { formatPlannerGraphPrompt, type GraphContextSummary } from "@mathos/graph"

export interface ResearchContextView {
  objective: { id: string; title: string; status: string; statement: string }
  branch: { id: string; name: string }
  activeClaims: Array<{ id: string; title: string; status: string }>
  verifiedClaims: Array<{ id: string; title: string }>
  blockers: Array<{ id: string; summary: string; type: string }>
  recentSteps: Array<{ sequence: number; action: string; status: string; summary: string | null }>
  proofState?: { claimId: string; lastFailure?: string }
  budget: { steps: string; proofs: string; model: string; lean: string }
  fidelityBlocked?: boolean
  digestVerifiedFindings?: Array<{ claimId: string; branchId: string; title: string }>
  graph?: GraphContextSummary
  agenda?: Array<{ id: string; title: string; status: string }>
}

export interface ResearchPlanner {
  decideNextAction(context: ResearchContextView): Promise<ResearchDecision>
}

export class FakeResearchPlanner implements ResearchPlanner {
  constructor(private readonly script: ResearchDecision[], private cursor = 0) {}

  remaining(): ResearchDecision[] {
    return this.script.slice(this.cursor)
  }

  async decideNextAction(): Promise<ResearchDecision> {
    const next = this.script[this.cursor]
    this.cursor += 1
    if (!next) return { action: "STOP", rationaleSummary: "script exhausted", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } }
    return next
  }
}

export class ModelResearchPlanner implements ResearchPlanner {
  constructor(private readonly provider: ModelProvider) {}

  async decideNextAction(context: ResearchContextView): Promise<ResearchDecision> {
    const graphSection = context.graph ? formatPlannerGraphPrompt(context.graph) : ""
    return this.provider.generateStructured({
      schemaName: "research_decision",
      messages: [
        {
          role: "system",
          content: `Choose one typed MathOS research action. Never set claim or verification status. Never spawn agents, merge, or apply imports. Verified prerequisites do not imply the objective is verified. Dependency path is research structure, not mathematical proof. Frontier items are structural candidates, not mandatory next steps.

Return JSON only with this shape:
{"researchDecisionVersion":"v1","action":"ANALYZE_GOAL","targetClaimId":"C-001","rationaleSummary":"short reason","expectedInformationGain":"optional","parameters":{}}

Allowed action values: ANALYZE_GOAL, SEARCH_PREMISES, DECOMPOSE_GOAL, CREATE_SUBCLAIM, ATTEMPT_PROOF, VERIFY, INSPECT_FAILURE, RECORD_BLOCKER, REQUEST_HUMAN, STOP, RUN_EXPERIMENT, SEARCH_LITERATURE, INSPECT_SOURCE. Omit targetClaimId or optional fields when they do not apply. Do not add authority or status fields.`,
        },
        { role: "user", content: `${graphSection}\n\nOBJECTIVE ${context.objective.id} ${context.objective.status}\nFOCUS ${context.proofState?.claimId ?? context.objective.id}\nBUDGET ${JSON.stringify(context.budget)}\nFIDELITY_BLOCKED ${context.fidelityBlocked === true}` },
      ],
      parse: (value) => parseResearchDecision(value),
    })
  }
}

export function actionKey(action: ResearchActionType, target: string | undefined, params: Record<string, unknown>): string {
  return `${action}:${target ?? ""}:${JSON.stringify(params)}`
}
