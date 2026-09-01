import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner, FakeMultiAgentPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import type { ResearchDecision } from "@mathos/domain"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-ma-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const draft = { declarationName: "multi_agent_smoke", leanStatement: "theorem multi_agent_smoke : 1 + 1 = 2", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" }
const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })
const prove = [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("VERIFY")]
const idle = [d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]
const fail = [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  exact (0 : Nat)" } }), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]
const human = [d("REQUEST_HUMAN", { rationaleSummary: "need human" })]

async function ready(dir: string, extra: Record<string, unknown> = {}) {
  const created = await MathOS.init(dir, "ma")
  const model = new FakeModelProvider()
  model.enqueue(draft)
  model.enqueue(fidelity)
  const vcs = new FakeVcs()
  const app = MathOS.open(created.root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: new FakeLeanAdapter(),
    vcs,
    premiseRetriever: new InMemoryPremiseRetriever(),
    ...extra,
  })
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Obj", statement: "1 + 1 = 2", asMainObjective: true })
  const formal = await app.formalize(claim.id)
  app.approveFormal(formal.formalStatement.id)
  return { app, claim, root: created.root }
}

describe("multi-agent orchestration", () => {
  test("IDs, isolation, diversity fallback, round-robin, solution, MAIN unchanged", async () => {
    const { app, claim } = await ready(tempDir())
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner([...prove]), new FakeResearchPlanner([...idle]), new FakeResearchPlanner([...fail])],
    })
    expect(session.id).toBe("MR-001")
    const agents = app.teamAgents(session.id)
    expect(agents.map((item) => item.id)).toEqual(["A-001", "A-002", "A-003"])
    expect(new Set(agents.map((item) => item.branchId)).size).toBe(3)
    expect(new Set(agents.map((item) => item.role)).size).toBe(3)
    expect(new Set(agents.map((item) => item.researchRunId)).size).toBe(3)
    await app.runTeam(session.id)
    const done = app.getTeam(session.id)
    expect(done.status).toBe("SOLUTION_FOUND")
    expect(app.teamSolutions(session.id).length).toBeGreaterThanOrEqual(1)
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    expect(app.teamHistory(session.id)[0]?.sequence).toBe(1)
    const digest = app.teamDigest(session.id)
    expect(digest?.verifiedFindings.length).toBeGreaterThanOrEqual(1)
    expect(digest?.unverifiedFindings.length).toBeGreaterThanOrEqual(1)
    app.close()
  })

  test("low diversity uses fallback roles", async () => {
    const { app } = await ready(tempDir(), {
      multiAgentPlanner: new FakeMultiAgentPlanner({
        version: "v1",
        rationaleSummary: "same",
        assignments: [
          { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "a" },
          { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "b" },
          { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "c" },
        ],
      }),
    })
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(idle), new FakeResearchPlanner(idle), new FakeResearchPlanner(idle)] })
    expect(new Set(app.teamAgents(session.id).map((item) => item.role)).size).toBe(3)
    app.close()
  })

  test("all agents blocked", async () => {
    const { app } = await ready(tempDir())
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(human), new FakeResearchPlanner(human), new FakeResearchPlanner(human)] })
    await app.runTeam(session.id)
    expect(["BLOCKED", "SOLUTION_FOUND"]).toContain(app.getTeam(session.id).status)
    expect(app.getTeam(session.id).stopReason).toBe("ALL_AGENTS_BLOCKED")
    app.close()
  })

  test("global lean budget", async () => {
    const { app } = await ready(tempDir())
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner([...prove]), new FakeResearchPlanner([...prove]), new FakeResearchPlanner([...prove])],
      limits: { maxAgents: 3, maxRounds: 8, maxTotalSteps: 24, maxTotalModelCalls: 30, maxTotalLeanCalls: 1, maxTotalProofAttempts: 12 },
    })
    await app.runTeam(session.id)
    expect(app.getTeam(session.id).usage.leanCalls).toBeLessThanOrEqual(1)
    expect(["GLOBAL_BUDGET_EXHAUSTED", "SOLUTION_FOUND", "BLOCKED"]).toContain(app.getTeam(session.id).status)
    app.close()
  })

  test("multiple solutions do not verify MAIN", async () => {
    const { app, claim } = await ready(tempDir())
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner([...prove]), new FakeResearchPlanner([...prove]), new FakeResearchPlanner([...idle])],
    })
    await app.runTeam(session.id)
    expect(app.teamSolutions(session.id).length).toBeGreaterThanOrEqual(2)
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    app.close()
  })

  test("crash recovery does not duplicate first agent", async () => {
    const dir = tempDir()
    const { app, root } = await ready(dir, { teamCrashAfterAgent: "A-002" })
    const session = await app.startTeam({
      planners: [new FakeResearchPlanner([...idle]), new FakeResearchPlanner([...idle]), new FakeResearchPlanner([...idle])],
    })
    await app.stepTeam(session.id).catch(() => undefined)
    expect(app.teamHistory(session.id).some((round) => round.status === "INTERRUPTED")).toBe(true)
    const steps = app.researchHistory(app.teamAgents(session.id)[0]!.researchRunId).length
    app.close()
    const app2 = MathOS.open(root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter(), premiseRetriever: new InMemoryPremiseRetriever() })
    app2.resumeTeam(session.id)
    expect(app2.getTeam(session.id).status).toBe("READY")
    expect(app2.researchHistory(app2.teamAgents(session.id)[0]!.researchRunId).length).toBe(steps)
    app2.close()
  })

  test("worker files isolated from MAIN", async () => {
    const { app } = await ready(tempDir())
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(idle), new FakeResearchPlanner(idle), new FakeResearchPlanner(idle)] })
    const agents = app.teamAgents(session.id)
    for (const agent of agents) {
      const branch = app.getBranch(agent.branchId)
      expect(readFileSync(join(branch.worktreePath!, `${agent.id}.lean`), "utf8")).toContain(agent.id)
    }
    expect(() => readFileSync(join(app["root"], `${agents[0]!.id}.lean`), "utf8")).toThrow()
    app.close()
  })
})
