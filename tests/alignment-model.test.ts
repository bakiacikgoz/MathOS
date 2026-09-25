import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS } from "@mathos/core"
import type { ModelProvider, StructuredModelRequest } from "@mathos/models"

// A stand-in for a configured model: records what it was asked and answers with a fixed review.
function reviewer(answer: unknown | Error) {
  const seen: StructuredModelRequest<unknown>[] = []
  const provider: ModelProvider = {
    id: "fake-auditor", model: "fake-1", capabilities: { structuredOutput: true, toolCalling: false, reasoning: false, streaming: false, vision: false },
    generate: async () => { throw new Error("not used") },
    generateStructured: async <T,>(request: StructuredModelRequest<T>) => { seen.push(request as StructuredModelRequest<unknown>); if (answer instanceof Error) throw answer; return request.parse(answer) },
  }
  return { provider, seen }
}

async function workspaceWithStatements() {
  const root = mkdtempSync(join(tmpdir(), "mathos-align-model-"))
  await MathOS.init(root)
  const app = MathOS.open(root)
  const claim = app.createClaim({ kind: "lemma", title: "Odd sum", statement: "The sum of the first n odd numbers is n squared." })
  const context = app.services.mathematicalContext.resolveSnapshot({ workspaceId: claim.workspaceId, branchId: app.currentBranch().id, claimId: claim.id })
  app.services.statementRevisions.capture({ claimId: claim.id, kind: "FORMAL", sourceEntityId: "FS-X", text: "theorem odd_sum (n : ℕ) : ∑ i ∈ Finset.range n, (2 * i + 1) = n ^ 2", contextRevisionId: context.revisionId, createdBy: "model" })
  app.close()
  return { root, claimId: claim.id }
}

async function runAlignment(root: string, claimId: string, provider: ModelProvider) {
  const app = MathOS.open(root, { auditorProvider: provider })
  try {
    const natural = app.services.repositories.statementRevisions.latest(claimId, "NATURAL")!, formal = app.services.repositories.statementRevisions.latest(claimId, "FORMAL")!
    return await app.services.alignment.run({ claimId, naturalRevisionId: natural.id, formalRevisionId: formal.id, contextRevisionId: natural.contextRevisionId })
  } finally { app.close() }
}

describe("align run uses the configured auditor model", () => {
  test("a model review is recorded with its verdict, back-translation and provider", async () => {
    const { root, claimId } = await workspaceWithStatements()
    const { provider, seen } = reviewer({ verdict: "MATCH", backTranslation: "For every natural n, the sum of 2i+1 for i < n equals n².", symbolMapping: [{ natural: "n", formal: "n : ℕ", status: "MATCH" }], findings: [] })
    const { alignment, findings } = await runAlignment(root, claimId, provider)
    expect(alignment.status).toBe("REVIEWED")
    expect(alignment.verdict).toBe("MATCH")
    expect(alignment.auditorProvider).toBe("fake-auditor")
    expect(alignment.auditorModel).toBe("fake-1")
    expect(findings).toHaveLength(0)
    // The model saw both statements and the exact output shape.
    const prompt = seen[0]!.messages.map((message) => message.content).join("\n")
    expect(prompt).toContain("sum of the first n odd numbers")
    expect(prompt).toContain("Finset.range")
    expect(prompt).toContain("\"verdict\"")
  })

  test("when the model fails, review stays manual and says why", async () => {
    const { root, claimId } = await workspaceWithStatements()
    const { provider } = reviewer(new Error("MODEL_ROUTE_BLOCKED: alignment"))
    const { alignment, findings } = await runAlignment(root, claimId, provider)
    expect(alignment.status).toBe("PENDING")
    expect(findings[0]!.message).toBe("MANUAL_REVIEW_REQUIRED: alignment model unavailable or invalid (MODEL_ROUTE_BLOCKED)")
  })
})
