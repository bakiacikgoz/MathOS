import type { ModelProvider } from "@mathos/models"
import {
  parsePlannerDescriptor,
  parseResearchDecision,
  type ResearchDecision,
  type ResearchPlannerDescriptor,
} from "@mathos/domain"
import { FakeResearchPlanner, ModelResearchPlanner, type ResearchPlanner } from "./research-planner.ts"

export class PersistentScriptedPlanner implements ResearchPlanner {
  constructor(
    private readonly steps: ResearchDecision[],
    private cursor: number,
    private readonly persist?: (cursor: number) => void,
  ) {}

  remaining(): ResearchDecision[] {
    return this.steps.slice(this.cursor)
  }

  async decideNextAction(): Promise<ResearchDecision> {
    const next = this.steps[this.cursor]
    this.cursor += 1
    this.persist?.(this.cursor)
    if (!next) {
      return { action: "STOP", rationaleSummary: "script exhausted", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } }
    }
    return next
  }
}

export class FallbackPlanner implements ResearchPlanner {
  async decideNextAction(): Promise<ResearchDecision> {
    return { action: "STOP", rationaleSummary: "deterministic fallback", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } }
  }
}

export function plannerDescriptorFrom(planner: ResearchPlanner, cursor = 0): ResearchPlannerDescriptor {
  if (planner instanceof PersistentScriptedPlanner || planner instanceof FakeResearchPlanner) {
    const remaining = "remaining" in planner && typeof planner.remaining === "function" ? planner.remaining() : []
    return { version: "v1", kind: "SCRIPTED", config: { scriptId: "inline", cursor, steps: remaining } }
  }
  if (planner instanceof ModelResearchPlanner) {
    return { version: "v1", kind: "MODEL", config: { provider: "openai-compatible" } }
  }
  return { version: "v1", kind: "DETERMINISTIC_FALLBACK", config: {} }
}

export function createPlannerFromDescriptor(
  descriptor: ResearchPlannerDescriptor,
  options: { modelProvider: ModelProvider; persist?: (cursor: number) => void },
): ResearchPlanner {
  const parsed = parsePlannerDescriptor(descriptor)
  if (parsed.kind === "SCRIPTED") {
    const steps = Array.isArray(parsed.config.steps) ? parsed.config.steps.map((item) => parseResearchDecision(item)) : []
    const cursor = Number(parsed.config.cursor ?? 0)
    return new PersistentScriptedPlanner(steps, cursor, options.persist)
  }
  if (parsed.kind === "MODEL") return new ModelResearchPlanner(options.modelProvider)
  if (parsed.kind === "DETERMINISTIC_FALLBACK") return new FallbackPlanner()
  throw new Error("PLANNER_UNAVAILABLE")
}
