import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter, NativeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import type { ResearchDecision } from "@mathos/domain"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-hard2-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const draft = { declarationName: "imported_helper", leanStatement: "theorem imported_helper : True", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "True", formalBackTranslation: "True" }
const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })
const prove = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } }), d("VERIFY")]
const prove2 = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } }), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } }), d("VERIFY")]
const idle = () => [d("ANALYZE_GOAL"), d("ANALYZE_GOAL"), d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]

async function ready(extra: Record<string, unknown> = {}, lean: FakeLeanAdapter | NativeLeanAdapter = new FakeLeanAdapter()) {
  const created = await MathOS.init(tempDir(), "h")
  const model = new FakeModelProvider()
  model.enqueue(draft)
  model.enqueue(fidelity)
  const app = MathOS.open(created.root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: lean,
    vcs: new FakeVcs(),
    premiseRetriever: new InMemoryPremiseRetriever(),
    ...extra,
  })
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Obj", statement: "True", asMainObjective: true })
  const formal = await app.formalize(claim.id)
  app.approveFormal(formal.formalStatement.id)
  return { app, claim, root: created.root }
}

describe("multi-agent hardening", () => {
  test("planner reopen restores script cursor without registerRunPlanner", async () => {
    const { app, root } = await ready()
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())],
    })
    await app.stepTeam(session.id)
    app.close()
    const app2 = MathOS.open(root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter(), premiseRetriever: new InMemoryPremiseRetriever() })
    app2.resumeTeam(session.id)
    await app2.stepTeam(session.id)
    expect(app2.teamHistory(session.id).length).toBeGreaterThanOrEqual(2)
    app2.close()
  })

  test("true local lean budget does not stop other workers", async () => {
    const { app } = await ready()
    const session = await app.startTeam({
      planners: [
        new FakeResearchPlanner(prove2()),
        new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } })]),
        new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } })]),
      ],
      limits: { maxAgents: 3, maxRounds: 6, maxTotalSteps: 24, maxTotalModelCalls: 40, maxTotalLeanCalls: 20, maxTotalProofAttempts: 12 },
      workerLimits: [
        { maxLeanCalls: 1, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 },
        { maxLeanCalls: 4, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 },
        { maxLeanCalls: 4, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 },
      ],
    })
    await app.runTeam(session.id)
    const agents = app.teamAgents(session.id)
    const a1 = app.getResearch(agents[0]!.researchRunId)
    const a2 = app.getResearch(agents[1]!.researchRunId)
    expect(a1.stopReason).toBe("LOCAL_LEAN_BUDGET_EXHAUSTED")
    expect(a1.usage.leanCalls).toBeLessThanOrEqual(1)
    expect(a2.usage.leanCalls).toBeGreaterThan(0)
    expect(app.getTeam(session.id).stopReason).not.toBe("GLOBAL_BUDGET_EXHAUSTED")
    app.close()
  })

  test("import requires explicit apply and re-verifies target", async () => {
    const { app, claim } = await ready()
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
    })
    await app.runTeam(session.id)
    const agents = app.teamAgents(session.id)
    const source = agents[1]!
    expect(app.getClaim(source.localClaimId).status).toBe("KERNEL_VERIFIED")
    expect(app.teamImports(session.id).every((item) => item.status !== "APPLIED")).toBe(true)
    const proposed = app.proposeImport(session.id, source.id, agents[0]!.id, source.localClaimId)
    expect(proposed.status).toBe("PROPOSED")
    const applied = await app.applyImport(proposed.id)
    expect(applied.status).toBe("APPLIED")
    expect(applied.targetClaimId).toBeTruthy()
    expect(app.getClaim(applied.targetClaimId!).status).toBe("KERNEL_VERIFIED")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    app.close()
  })

  test("unverified source apply rejected", async () => {
    const { app } = await ready()
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())],
    })
    const agents = app.teamAgents(session.id)
    const proposed = app.proposeImport(session.id, agents[1]!.id, agents[0]!.id, agents[1]!.localClaimId)
    const applied = await app.applyImport(proposed.id)
    expect(applied.status).toBe("FAILED")
    expect(applied.failureCode).toBe("SOURCE_NOT_KERNEL_VERIFIED")
    app.close()
  })

  test("stale formal revision requires reverify", async () => {
    const { app } = await ready()
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
    })
    await app.runTeam(session.id)
    const agents = app.teamAgents(session.id)
    const source = agents[1]!
    const proposed = app.proposeImport(session.id, source.id, agents[0]!.id, source.localClaimId)
    const formal = app["formalStatements"].currentForClaim(source.localClaimId)!
    app["formalStatements"].markOthersNotCurrent(source.localClaimId)
    app["formalStatements"].insert({ ...formal, id: formal.id + "x", isCurrent: true })
    const applied = await app.applyImport(proposed.id)
    expect(applied.status).toBe("REVERIFY_REQUIRED")
    app.close()
  })

  test("teamOverview exists for panel", async () => {
    const { app } = await ready()
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())] })
    const overview = app.teamOverview(session.id)
    expect(overview.agents).toHaveLength(3)
    expect(overview.session.id).toBe("MR-001")
    app.close()
  })
})
