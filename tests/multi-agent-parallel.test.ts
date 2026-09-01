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
  const dir = mkdtempSync(join(tmpdir(), "mathos-par-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const draft = { declarationName: "par_smoke", leanStatement: "theorem par_smoke : 1 + 1 = 2", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" }
const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })
const prove = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("VERIFY")]
const idle = () => [d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]

async function ready() {
  const created = await MathOS.init(tempDir(), "p")
  const model = new FakeModelProvider()
  model.enqueue(draft)
  model.enqueue(fidelity)
  const app = MathOS.open(created.root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: new FakeLeanAdapter(),
    vcs: new FakeVcs(),
    premiseRetriever: new InMemoryPremiseRetriever(),
  })
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Obj", statement: "1 + 1 = 2", asMainObjective: true })
  const formal = await app.formalize(claim.id)
  app.approveFormal(formal.formalStatement.id)
  return { app, claim }
}

describe("bounded parallel multi-agent", () => {
  test("default execution is sequential", async () => {
    const { app } = await ready()
    const session = await app.startTeam({ planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())] })
    expect(session.executionMode).toBe("SEQUENTIAL")
    expect(session.maxParallelWorkers).toBe(2)
    app.close()
  })

  test("rejects invalid parallel width", async () => {
    const { app } = await ready()
    await expect(app.startTeam({ executionMode: "BOUNDED_PARALLEL", maxParallelWorkers: 6 })).rejects.toThrow("INVALID_PARALLEL_WORKERS")
    app.close()
  })

  test("parallel two workers find solution without changing MAIN", async () => {
    const { app, claim } = await ready()
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())],
    })
    await app.runTeam(session.id)
    expect(app.getTeam(session.id).status).toBe("SOLUTION_FOUND")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    expect(app.getTeam(session.id).executionMode).toBe("BOUNDED_PARALLEL")
    app.close()
  })

  test("global lean reservation cannot overspend in parallel", async () => {
    const { app } = await ready()
    const session = await app.startTeam({
      executionMode: "BOUNDED_PARALLEL",
      maxParallelWorkers: 2,
      planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
      limits: { maxAgents: 3, maxRounds: 4, maxTotalSteps: 24, maxTotalModelCalls: 30, maxTotalLeanCalls: 1, maxTotalProofAttempts: 12 },
    })
    await app.runTeam(session.id)
    expect(app.getTeam(session.id).usage.leanCalls).toBeLessThanOrEqual(1)
    app.close()
  })

  test("atomic ids under parallel claim creation", async () => {
    const { app } = await ready()
    const ids = await Promise.all([0, 1, 2, 3].map(async () => app.createClaim({ kind: "lemma", title: "L", statement: "x" }).id))
    expect(new Set(ids).size).toBe(4)
    app.close()
  })

  test("sequential vs parallel same terminal solution count", async () => {
    const run = async (mode: "SEQUENTIAL" | "BOUNDED_PARALLEL") => {
      const { app } = await ready()
      const session = await app.startTeam({
        executionMode: mode,
        maxParallelWorkers: 2,
        planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
      })
      await app.runTeam(session.id)
      const out = { status: app.getTeam(session.id).status, n: app.teamSolutions(session.id).length }
      app.close()
      return out
    }
    const seq = await run("SEQUENTIAL")
    const par = await run("BOUNDED_PARALLEL")
    expect(seq.status).toBe(par.status)
    expect(seq.n).toBe(par.n)
  })
})
