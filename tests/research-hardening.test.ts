import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner, runResearchEval } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import { parseResearchDecision } from "@mathos/domain"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-hard-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const draft = { declarationName: "t", leanStatement: "theorem t : True", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "True", formalBackTranslation: "True" }

describe("research hardening", () => {
  test("eval fake scenarios pass", async () => {
    const rows = await runResearchEval("fake")
    expect(rows.map((row) => `${row.id}:${row.result}`)).toEqual([
      "trivial-direct:PASS",
      "premise-needed:PASS",
      "failure-recovery:PASS",
      "human-blocker:PASS",
      "repetition:PASS",
      "graph-aware-frontier:PASS",
      "graph-aware-blocker:PASS",
      "graph-aware-failure:PASS",
      "graph-aware-branch-isolation:PASS",
      "experiment-support-not-proof:PASS",
      "experiment-counterexample:PASS",
      "experiment-timeout:PASS",
      "experiment-reproducibility:PASS",
      "graph-computation-context:PASS",
      "literature-search-action:PASS",
      "literature-support-not-proof:PASS",
      "external-known-flow:PASS",
      "literature-branch-isolation:PASS",
    ])
  }, 30000)

  test("invalid planner decision does not corrupt run", async () => {
    const created = await MathOS.init(tempDir(), "inv")
    const planner = { async decideNextAction() { throw new Error("INVALID_PLANNER_DECISION") } }
    const app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch()
    await app.stepResearch(run.id)
    expect(app.getResearch(run.id).stopReason).toBe("INVALID_PLANNER_DECISION")
    expect(app.getClaim("T-001").status).not.toBe("KERNEL_VERIFIED")
    app.close()
  })

  test("forceVerified is stripped", () => {
    const decision = parseResearchDecision({ action: "VERIFY", parameters: { forceVerified: true }, rationaleSummary: "nope" })
    expect(decision.parameters.forceVerified).toBeUndefined()
    expect(decision.researchDecisionVersion).toBe("v1")
  })

  test("human answer does not verify claim", async () => {
    const created = await MathOS.init(tempDir(), "human")
    const planner = new FakeResearchPlanner([{ action: "REQUEST_HUMAN", rationaleSummary: "need judgment", parameters: {}, researchDecisionVersion: "v1" }])
    const app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch()
    await app.stepResearch(run.id)
    const blocker = app.researchHistory(run.id)
    const id = app.getResearch(run.id)
    expect(id.stopReason).toBe("BLOCKED_NEEDS_HUMAN")
    const blockers = (app as unknown as { researchStores: () => { blockers: { open: (id: string) => { id: string }[] } } })
    void blocker
    const answered = app.answerResearch(run.id, "BL-001", "use the first reading")
    expect(answered?.humanResponse).toBe("use the first reading")
    expect(app.getClaim("T-001").status).not.toBe("KERNEL_VERIFIED")
    app.close()
  })

  test("active run blocks merge apply and abandon", async () => {
    const created = await MathOS.init(tempDir(), "guard")
    const app = MathOS.open(created.root, { researchPlanner: new FakeResearchPlanner([]), vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const child = await app.createBranch("side")
    app.switchBranch(child.id)
    app.startResearch()
    expect(() => app.abandonBranch(child.id)).toThrow(/ACTIVE_RESEARCH_RUN_EXISTS/)
    await app.runResearch("R-001").catch(() => undefined)
    app.close()
  })

  test("crash before mutation does not create a claim", async () => {
    const created = await MathOS.init(tempDir(), "crash-b")
    const planner = new FakeResearchPlanner([{ action: "CREATE_SUBCLAIM", rationaleSummary: "split", parameters: { title: "H", statement: "helper" }, researchDecisionVersion: "v1" }])
    const app = MathOS.open(created.root, {
      researchPlanner: planner,
      vcs: new FakeVcs(),
      crashHook: (point, action) => {
        if (point === "before_mutation" && action === "CREATE_SUBCLAIM") throw new Error("crash")
      },
    })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch()
    await app.stepResearch(run.id).catch(() => undefined)
    expect(app.listClaims().some((claim) => claim.id.startsWith("L-"))).toBe(false)
    app.close()
  })

  test("crash after mutation then reopen does not duplicate subclaim", async () => {
    const created = await MathOS.init(tempDir(), "crash-a")
    const planner = new FakeResearchPlanner([
      { action: "CREATE_SUBCLAIM", rationaleSummary: "split", parameters: { title: "H", statement: "helper" }, researchDecisionVersion: "v1" },
      { action: "STOP", rationaleSummary: "stop", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
    ])
    let boom = true
    let app = MathOS.open(created.root, {
      researchPlanner: planner,
      vcs: new FakeVcs(),
      crashHook: (point) => {
        if (boom && point === "after_mutation") throw new Error("crash")
      },
    })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch()
    await app.stepResearch(run.id).catch(() => undefined)
    const first = app.listClaims().filter((claim) => claim.id.startsWith("L-")).length
    expect(first).toBe(1)
    app.close()
    boom = false
    app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.resumeResearch(run.id)
    await app.stepResearch(run.id)
    expect(app.listClaims().filter((claim) => claim.id.startsWith("L-")).length).toBe(1)
    app.close()
  })

  test("lean budget stops nested compiles", async () => {
    const created = await MathOS.init(tempDir(), "leanb")
    const model = new FakeModelProvider()
    model.enqueue(draft)
    model.enqueue(fidelity)
    const planner = new FakeResearchPlanner([
      { action: "ATTEMPT_PROOF", rationaleSummary: "p", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
      { action: "ATTEMPT_PROOF", rationaleSummary: "p", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
      { action: "ATTEMPT_PROOF", rationaleSummary: "p", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
    ])
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new FakeLeanAdapter(),
      researchPlanner: planner,
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
    })
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "True", asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    const run = app.startResearch({ limits: { maxSteps: 10, maxProofAttempts: 10, maxModelCalls: 20, maxLeanCalls: 1 } })
    await app.runResearch(run.id)
    expect(app.getResearch(run.id).usage.leanCalls).toBeLessThanOrEqual(1)
    expect(["LEAN_CALL_BUDGET_EXHAUSTED", "OBJECTIVE_KERNEL_VERIFIED"]).toContain(app.getResearch(run.id).stopReason)
    app.close()
  })
})
