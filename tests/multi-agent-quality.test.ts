import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { approachFingerprint, approachSimilarity, assignmentDiversity, type AgentAssignmentPlan, type ResearchDecision } from "@mathos/domain"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"

const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })
const prove = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } }), d("VERIFY")]
const idle = () => [d("ANALYZE_GOAL"), d("ANALYZE_GOAL")]
const plan: AgentAssignmentPlan = { version: "v1", rationaleSummary: "checker flow", assignments: [
  { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "prove directly" },
  { role: "INDEPENDENT_CHECKER", approach: "ORDER_REASONING", goalSummary: "critique candidate verification" },
  { role: "DECOMPOSER", approach: "DECOMPOSITION", goalSummary: "decompose objective" },
] }

async function ready(assignmentPlan: AgentAssignmentPlan = plan) {
  const root = mkdtempSync(join(tmpdir(), "mathos-quality-"))
  const model = new FakeModelProvider()
  model.enqueue({ declarationName: "q", leanStatement: "theorem q : True", variableMapping: [], assumptionMapping: [], uncertainties: [] })
  model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "True", formalBackTranslation: "True" })
  const created = await MathOS.init(root, "quality")
  const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs(), premiseRetriever: new InMemoryPremiseRetriever(), multiAgentPlanner: { async planAssignments() { return assignmentPlan } } })
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Q", statement: "True", asMainObjective: true })
  const formal = await app.formalize(claim.id); app.approveFormal(formal.formalStatement.id)
  return { app, root }
}

describe("multi-agent research quality", () => {
  test("independent checker critiques candidates without producing proofs and its verdict gates success", async () => {
    const { app, root } = await ready()
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())] })
    const checkerBefore = app.teamAgents(session.id).find((agent) => agent.role === "INDEPENDENT_CHECKER")!
    await expect(app.stepResearch(checkerBefore.researchRunId)).rejects.toThrow("INDEPENDENT_CHECKER_CANNOT_EXECUTE_RESEARCH")
    await expect(app.runResearch(checkerBefore.researchRunId)).rejects.toThrow("INDEPENDENT_CHECKER_CANNOT_EXECUTE_RESEARCH")
    await app.runTeam(session.id)
    const checker = app.teamAgents(session.id).find((agent) => agent.role === "INDEPENDENT_CHECKER")!
    expect(app.researchHistory(checker.researchRunId)).toHaveLength(0)
    const digest = app.teamDigest(session.id)!
    expect(digest.checkerReviews.some((review) => review.verdict === "ACCEPT")).toBe(true)
    expect(app.teamSolutions(session.id).some((candidate) => candidate.agentId === checker.id)).toBe(false)
    expect(digest.checkerReviews.some((review) => app.teamSolutions(session.id).find((candidate) => candidate.id === review.candidateId)?.agentId === checker.id)).toBe(false)
    expect(app.getTeam(session.id).status).toBe("SOLUTION_FOUND")
    expect(digest.verifiedFindings.every((item) => !digest.unverifiedFindings.some((other) => other.claimId === item.claimId))).toBe(true)
    app.close(); rmSync(root, { recursive: true, force: true })
  })

  test("semantic approach similarity canonicalizes math operators and paraphrases without merging distinct methods", () => {
    const target = "T-001"
    expect(approachSimilarity(
      { approach: "DIRECT", targetClaimId: target, goalSummary: "Prove ∀ x, x + 0 = x" },
      { approach: "DIRECT", targetClaimId: target, goalSummary: "Show forall x: x add zero equals x" },
    )).toBeGreaterThanOrEqual(0.8)
    expect(approachSimilarity(
      { approach: "DIRECT", targetClaimId: target, goalSummary: "prove equality by normalization" },
      { approach: "INDUCTION", targetClaimId: target, goalSummary: "prove equality by induction" },
    )).toBe(0)
  })

  test("runtime digest stops semantically duplicated paraphrase approaches on the shared objective", async () => {
    const duplicated: AgentAssignmentPlan = { version: "v1", rationaleSummary: "semantic duplicate", assignments: [
      { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "Prove ∀ x, x + 0 = x" },
      { role: "PROOF_REPAIRER", approach: "DIRECT", goalSummary: "Show forall x: x add zero equals x identity" },
      { role: "DECOMPOSER", approach: "DECOMPOSITION", goalSummary: "split the goal" },
    ] }
    const { app, root } = await ready(duplicated)
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())] })
    const stopped = await app.stepTeam(session.id)
    expect(stopped.stopReason).toBe("LOW_ASSIGNMENT_DIVERSITY")
    expect(app.teamDigest(session.id)!.duplicateApproachFingerprints.length).toBeGreaterThan(0)
    app.close(); rmSync(root, { recursive: true, force: true })
  })

  test("normalized duplicate approaches are rejected as low diversity", () => {
    const duplicate: AgentAssignmentPlan = { version: "v1", rationaleSummary: "duplicate", assignments: [
      { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "Prove goal directly" },
      { role: "PROOF_REPAIRER", approach: "DIRECT", goalSummary: "directly prove goal" },
    ] }
    expect(approachFingerprint(duplicate.assignments[0]!)).toBe(approachFingerprint(duplicate.assignments[1]!))
    expect(assignmentDiversity(duplicate)).toEqual({ ok: false, warning: "LOW_ASSIGNMENT_DIVERSITY" })
  })
})
