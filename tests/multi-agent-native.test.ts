import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { NativeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { HybridPremiseRetriever, InMemoryPremiseRetriever } from "@mathos/retrieval"
import type { ResearchDecision } from "@mathos/domain"

const DEMO = "/Users/yazilim/Projects/mathos/demo"
const DEMO_FORMAL = `${DEMO}/formal`
const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-man-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })

describe("native multi-agent + hybrid retrieval", () => {
  test("real team smoke SOLUTION_FOUND and MAIN unverified", async () => {
    const created = await MathOS.init(tempDir(), "nat")
    const model = new FakeModelProvider()
    model.enqueue({ declarationName: "multi_agent_smoke", leanStatement: "theorem multi_agent_smoke : 1 + 1 = 2", variableMapping: [], assumptionMapping: [], uncertainties: [] })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" })
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new NativeLeanAdapter(),
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
      formalProjectRoot: DEMO_FORMAL,
    })
    await app.setupResearchVersioning()
    const claim = app.createClaim({ kind: "conjecture", title: "Smoke", statement: "1 + 1 = 2", asMainObjective: true })
    const formal = await app.formalize(claim.id)
    app.approveFormal(formal.formalStatement.id)
    const session = await app.startTeam({
      planners: [
        new FakeResearchPlanner([d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("VERIFY")]),
        new FakeResearchPlanner([d("CREATE_SUBCLAIM", { parameters: { title: "Helper", statement: "True" } }), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]),
        new FakeResearchPlanner([d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  exact (0 : Nat)" } }), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]),
      ],
    })
    await app.runTeam(session.id)
    expect(app.getTeam(session.id).status).toBe("SOLUTION_FOUND")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    expect(app.teamSolutions(session.id).length).toBeGreaterThanOrEqual(1)
    const lake = (file: string) => Bun.spawnSync(["lake", "env", "lean", file], { cwd: DEMO_FORMAL, stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH}` } })
    for (const agent of app.teamAgents(session.id)) {
      const branch = app.getBranch(agent.branchId)
      const file = join(branch.worktreePath!, `${agent.id}.lean`)
      expect(lake(file).exitCode).toBe(0)
    }
    app.close()
  }, 180000)

  test("real cross-agent verified import", async () => {
    const created = await MathOS.init(tempDir(), "imp")
    const model = new FakeModelProvider()
    model.enqueue({ declarationName: "imported_helper", leanStatement: "theorem imported_helper : True", variableMapping: [], assumptionMapping: [], uncertainties: [] })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "True", formalBackTranslation: "True" })
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new NativeLeanAdapter(),
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
      formalProjectRoot: DEMO_FORMAL,
    })
    await app.setupResearchVersioning()
    const claim = app.createClaim({ kind: "conjecture", title: "Obj", statement: "True", asMainObjective: true })
    const formal = await app.formalize(claim.id)
    app.approveFormal(formal.formalStatement.id)
    const session = await app.startTeam({
      planners: [
        new FakeResearchPlanner([d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]),
        new FakeResearchPlanner([d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } }), d("VERIFY")]),
        new FakeResearchPlanner([d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]),
      ],
    })
    await app.runTeam(session.id)
    const agents = app.teamAgents(session.id)
    const source = agents[1]!
    expect(app.getClaim(source.localClaimId).status).toBe("KERNEL_VERIFIED")
    const proposed = app.proposeImport(session.id, source.id, agents[0]!.id, source.localClaimId)
    const applied = await app.applyImport(proposed.id)
    expect(applied.status).toBe("APPLIED")
    expect(app.getClaim(applied.targetClaimId!).status).toBe("KERNEL_VERIFIED")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    app.close()
  }, 180000)

  test("full-stack single-agent HybridPremiseRetriever", async () => {
    const created = await MathOS.init(tempDir(), "hyb")
    const model = new FakeModelProvider()
    model.enqueue({ declarationName: "research_id", leanStatement: "theorem research_id (n : Nat) : n = n", variableMapping: [], assumptionMapping: [], uncertainties: [] })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "n=n", formalBackTranslation: "n = n" })
    const lean = new NativeLeanAdapter()
    const hybrid = new HybridPremiseRetriever(DEMO, () => [], lean)
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: lean,
      vcs: new FakeVcs(),
      premiseRetriever: hybrid,
      formalProjectRoot: DEMO_FORMAL,
    })
    const claim = app.createClaim({ kind: "conjecture", title: "Id", statement: "n = n", asMainObjective: true })
    const formal = await app.formalize(claim.id)
    app.approveFormal(formal.formalStatement.id)
    const retrieved = await app.premisesForClaim(claim.id, { skipInspect: true })
    expect(hybrid.constructor.name).toBe("HybridPremiseRetriever")
    expect(retrieved.candidates.length).toBeGreaterThan(0)
    const planner = new FakeResearchPlanner([
      d("SEARCH_PREMISES"),
      d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }),
      d("VERIFY"),
    ])
    const run = app.startResearch()
    app.registerRunPlanner(run.id, planner)
    await app.runResearch(run.id)
    expect(app.getClaim(claim.id).status).toBe("KERNEL_VERIFIED")
    expect(retrieved.mode).toBeTruthy()
    app.close()
  }, 180000)
})
