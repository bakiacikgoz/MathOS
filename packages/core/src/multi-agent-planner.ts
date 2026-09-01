import type { ModelProvider } from "@mathos/models"
import {
  assignmentDiversity,
  fallbackAssignmentPlan,
  parseAssignmentPlan,
  type AgentAssignmentPlan,
  type MultiAgentResearchSession,
  type ResearchAgentWorker,
} from "@mathos/domain"

export interface MultiAgentPlanner {
  planAssignments(objectiveClaimId: string): Promise<AgentAssignmentPlan>
}

export class FakeMultiAgentPlanner implements MultiAgentPlanner {
  constructor(private readonly plan?: AgentAssignmentPlan) {}
  async planAssignments(objectiveClaimId: string): Promise<AgentAssignmentPlan> {
    return this.plan ?? fallbackAssignmentPlan(objectiveClaimId)
  }
}

export class ModelMultiAgentPlanner implements MultiAgentPlanner {
  constructor(private readonly provider: ModelProvider) {}
  async planAssignments(objectiveClaimId: string): Promise<AgentAssignmentPlan> {
    try {
      const first = await this.provider.generateStructured({
        schemaName: "agent_assignment_plan",
        messages: [
          { role: "system", content: "Return a diverse v1 AgentAssignmentPlan JSON. Never set verification or merge flags." },
          { role: "user", content: JSON.stringify({ objectiveClaimId }) },
        ],
        parse: parseAssignmentPlan,
      })
      const check = assignmentDiversity(first)
      if (check.ok) return first
      return { ...fallbackAssignmentPlan(objectiveClaimId), warning: "LOW_ASSIGNMENT_DIVERSITY" }
    } catch {
      return fallbackAssignmentPlan(objectiveClaimId)
    }
  }
}

export function reviewRound(session: MultiAgentResearchSession, agents: ResearchAgentWorker[], solutions: number): "CONTINUE" | "STOP_SESSION" | "REQUEST_HUMAN" {
  if (solutions > 0) return "STOP_SESSION"
  if (agents.every((agent) => agent.status === "BLOCKED" || agent.status === "FAILED")) return "STOP_SESSION"
  if (session.usage.rounds >= session.limits.maxRounds) return "STOP_SESSION"
  return "CONTINUE"
}
