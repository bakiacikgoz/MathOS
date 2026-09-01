import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import type { ResearchDecision } from "@mathos/domain"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-lpr-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const draft = { declarationName: "lpr", leanStatement: "theorem lpr : 1 + 1 = 2", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" }
const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })
const prove = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("VERIFY")]
const idle = () => [d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]

async function ready(extra: Record<string, unknown> = {}, lean = new FakeLeanAdapter()) {
  const created = await MathOS.init(tempDir(), "lpr")
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
  const claim = app.createClaim({ kind: "conjecture", title: "Obj", statement: "1 + 1 = 2", asMainObjective: true })
  const formal = await app.formalize(claim.id)
  app.approveFormal(formal.formalStatement.id)
  return { app, claim, lean, root: created.root }
}

describe("local parallel runtime hardening", () => {
  test("queued worker starts only after a slot frees", async () => {
    const lean = new FakeLeanAdapter()
    lean.delayMs = 40
    const { app } = await ready({ executionMode: "BOUNDED_PARALLEL" }, lean)
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove())],
    })
    await app.stepTeam(session.id)
    const t = app.parallelTimings
    const a3 = t.find((row) => row.agentId === "A-003")
    const firstEnd = Math.min(...t.filter((row) => row.agentId !== "A-003").map((row) => row.end))
    expect(a3).toBeTruthy()
    expect(a3!.start).toBeGreaterThanOrEqual(firstEnd)
    expect(app.peakConcurrency).toBeLessThanOrEqual(2)
    app.close()
  })

  test("two running leases exist at crash", async () => {
    const { app, root } = await ready({ teamCrashTwoRunning: true })
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
    })
    await app.stepTeam(session.id).catch(() => undefined)
    const leases = app["client"].db.query<{ n: number }, []>("SELECT COUNT(*) as n FROM execution_leases").get()
    expect((leases?.n ?? 0)).toBeGreaterThanOrEqual(2)
    app.close()
    const app2 = MathOS.open(root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter(), premiseRetriever: new InMemoryPremiseRetriever() })
    app2.resumeTeam(session.id)
    expect(app2.teamHistory(session.id).some((round) => round.status === "INTERRUPTED")).toBe(true)
    const actions = app2["client"].db.query<{ action: string }, []>("SELECT action FROM events").all().map((row) => row.action)
    expect(actions).toContain("multi_agent_round_interrupted")
    expect(actions).toContain("agent_round_step_started")
    expect(actions).toContain("multi_agent_session_resumed")
    app2.close()
  })

  test("global proof reservation allows only one concurrent attempt", async () => {
    const lean = new FakeLeanAdapter()
    const { app } = await ready({}, lean)
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
      limits: { maxAgents: 3, maxRounds: 3, maxTotalSteps: 24, maxTotalModelCalls: 30, maxTotalLeanCalls: 20, maxTotalProofAttempts: 1 },
    })
    await app.runTeam(session.id)
    expect(app.getTeam(session.id).usage.proofAttempts).toBeLessThanOrEqual(1)
    app.close()
  })

  test("digest snapshot hides in-round findings", async () => {
    const { app } = await ready()
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner([d("ANALYZE_GOAL"), ...prove()]), new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ANALYZE_GOAL")]), new FakeResearchPlanner(idle())],
    })
    await app.stepTeam(session.id)
    const ctx = app.lastPlannerContextByRun.get(app.teamAgents(session.id)[1]!.researchRunId)
    expect(ctx?.digestVerifiedFindings?.length ?? 0).toBe(0)
    await app.stepTeam(session.id)
    const later = app.lastPlannerContextByRun.get(app.teamAgents(session.id)[1]!.researchRunId)
    const a1 = app.teamAgents(session.id)[0]!
    const leaked = (later?.digestVerifiedFindings ?? []).some((item) => item.claimId === a1.localClaimId)
    expect(leaked).toBe(false)
    app.close()
  })

  test("step timeout blocks only that worker", async () => {
    const lean = new FakeLeanAdapter()
    lean.delayMs = 80
    const { app } = await ready({ maxStepWallClockMs: 20 }, lean)
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())],
    })
    await app.stepTeam(session.id)
    expect(app.getResearch(app.teamAgents(session.id)[0]!.researchRunId).stopReason).toBe("STEP_TIMEOUT")
    expect(app.getTeam(session.id).status).not.toBe("FAILED")
    app.close()
  })

  test("worker detail history is hydrated", async () => {
    const { app } = await ready()
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())] })
    await app.stepTeam(session.id)
    const overview = app.teamOverview(session.id)
    expect(overview.agents[0]!.recentSteps.length).toBeGreaterThan(0)
    app.close()
  })

  test("20 unique claim ids", async () => {
    const { app } = await ready()
    const ids = Array.from({ length: 20 }, (_, i) => app.createClaim({ kind: "lemma", title: `n${i}`, statement: "x" }).id)
    expect(new Set(ids).size).toBe(20)
    app.close()
  })
})
