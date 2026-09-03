import { expect, test } from "bun:test"
import type { ModelProvider, StructuredModelRequest } from "@mathos/models"
import { ModelResearchPlanner } from "@mathos/core"

test("planner prompt supplies the complete structured decision contract", async () => {
  const provider = {
    id: "contract-aware",
    model: "test",
    capabilities: { structuredOutput: false, toolCalling: false, reasoning: true, streaming: false, vision: false },
    async generate() { throw new Error("not used") },
    async generateStructured<T>(request: StructuredModelRequest<T>): Promise<T> {
      const prompt = request.messages.map((message) => message.content).join("\n")
      expect(prompt).toContain('"researchDecisionVersion":"v1"')
      expect(prompt).toContain("ANALYZE_GOAL")
      expect(prompt).toContain("SEARCH_LITERATURE")
      return request.parse({ action: "ANALYZE_GOAL", rationaleSummary: "Inspect the identity.", parameters: {}, researchDecisionVersion: "v1" })
    },
  } satisfies ModelProvider
  const planner = new ModelResearchPlanner(provider)
  const decision = await planner.decideNextAction({
    objective: { id: "C-001", title: "Sum of odd numbers", status: "CONJECTURE", statement: "For every natural n..." },
    branch: { id: "B-000", name: "MAIN" },
    activeClaims: [], verifiedClaims: [], blockers: [], recentSteps: [],
    budget: { steps: "0/20", proofs: "0/6", model: "0/15", lean: "0/10" },
  })
  expect(decision.action).toBe("ANALYZE_GOAL")
})
