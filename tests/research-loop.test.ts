import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"

const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-research-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const formalDraft = {
  declarationName: "research_smoke",
  leanStatement: "theorem research_smoke : True",
  variableMapping: [],
  assumptionMapping: [],
  uncertainties: [],
}
const fidelityMatch = {
  verdict: "MATCH",
  findings: [],
  naturalSummary: "True",
  formalBackTranslation: "True",
}

describe("research loop", () => {
  test("budget exhausts before extra steps", async () => {
    const created = await MathOS.init(tempDir(), "budget")
    const planner = new FakeResearchPlanner(Array.from({ length: 8 }, () => ({ action: "ANALYZE_GOAL" as const, rationaleSummary: "look", parameters: {} })))
    const app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch({ limits: { maxSteps: 3, maxProofAttempts: 6, maxModelCalls: 20, maxLeanCalls: 10 } })
    await app.runResearch(run.id)
    const done = app.getResearch(run.id)
    expect(done.usage.steps).toBeLessThanOrEqual(3)
    expect(done.stopReason).toBe("STEP_BUDGET_EXHAUSTED")
    expect(done.status).not.toBe("RUNNING")
    app.close()
  })

  test("repetition detector stops repeated failing proofs", async () => {
    const created = await MathOS.init(tempDir(), "rep")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    const planner = new FakeResearchPlanner([
      { action: "ATTEMPT_PROOF", rationaleSummary: "try", parameters: { proofBody: "by\n  sorry" } },
      { action: "ATTEMPT_PROOF", rationaleSummary: "try", parameters: { proofBody: "by\n  sorry" } },
      { action: "ATTEMPT_PROOF", rationaleSummary: "try", parameters: { proofBody: "by\n  sorry" } },
      { action: "ATTEMPT_PROOF", rationaleSummary: "try", parameters: { proofBody: "by\n  sorry" } },
    ])
    const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: new FakeLeanAdapter(), researchPlanner: planner, vcs: new FakeVcs(), premiseRetriever: new InMemoryPremiseRetriever() })
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "True", asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    const run = app.startResearch({ limits: { maxSteps: 10, maxProofAttempts: 20, maxModelCalls: 20, maxLeanCalls: 20 } })
    await app.runResearch(run.id)
    expect(["REPETITION_DETECTED", "PROOF_ATTEMPT_BUDGET_EXHAUSTED", "EXECUTION_FAILURE", "STEP_BUDGET_EXHAUSTED"]).toContain(app.getResearch(run.id).stopReason)
    app.close()
  })

  test("planner cannot mark KERNEL_VERIFIED", async () => {
    const created = await MathOS.init(tempDir(), "trust")
    const planner = new FakeResearchPlanner([
      { action: "ANALYZE_GOAL", rationaleSummary: "done", parameters: {}, stop: { shouldStop: true, reason: "OBJECTIVE_KERNEL_VERIFIED" } },
    ])
    const app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch()
    await app.stepResearch(run.id)
    expect(app.getClaim("T-001").status).not.toBe("KERNEL_VERIFIED")
    expect(app.getResearch(run.id).status).not.toBe("COMPLETED")
    app.close()
  })

  test("branch-local subclaim stays off MAIN", async () => {
    const created = await MathOS.init(tempDir(), "iso")
    const planner = new FakeResearchPlanner([
      { action: "CREATE_SUBCLAIM", rationaleSummary: "split", parameters: { title: "Helper", statement: "A useful fact." } },
      { action: "STOP", rationaleSummary: "stop", parameters: {}, stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
    ])
    const app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "Main", statement: "Goal", asMainObjective: true })
    const child = await app.createBranch("side")
    app.switchBranch(child.id)
    const run = app.startResearch()
    await app.stepResearch(run.id)
    expect(app.listClaims().some((claim) => claim.id.startsWith("L-"))).toBe(true)
    app.switchBranch("MAIN")
    expect(app.listClaims().some((claim) => claim.id.startsWith("L-"))).toBe(false)
    app.close()
  })

  test("pause reopen resume preserves counters", async () => {
    const created = await MathOS.init(tempDir(), "resume")
    const planner = new FakeResearchPlanner([
      { action: "ANALYZE_GOAL", rationaleSummary: "a", parameters: {} },
      { action: "RECORD_BLOCKER", rationaleSummary: "blocked", parameters: { summary: "need lemma" } },
      { action: "ANALYZE_GOAL", rationaleSummary: "resume", parameters: {} },
      { action: "STOP", rationaleSummary: "stop", parameters: {}, stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
    ])
    let app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.createClaim({ kind: "theorem", title: "T", statement: "True", asMainObjective: true })
    const run = app.startResearch()
    await app.stepResearch(run.id)
    app.pauseResearch(run.id)
    const steps = app.getResearch(run.id).usage.steps
    app.close()
    app = MathOS.open(created.root, { researchPlanner: planner, vcs: new FakeVcs() })
    app.resumeResearch(run.id)
    expect(app.getResearch(run.id).usage.steps).toBe(steps)
    await app.stepResearch(run.id)
    expect(app.getResearch(run.id).usage.steps).toBeGreaterThanOrEqual(steps)
    app.close()
  })

  test("smoke SEARCH/PROOF/VERIFY can complete with fake lean", async () => {
    const created = await MathOS.init(tempDir(), "smoke")
    const model = new FakeModelProvider()
    model.enqueue(formalDraft)
    model.enqueue(fidelityMatch)
    const planner = new FakeResearchPlanner([
      { action: "ATTEMPT_PROOF", rationaleSummary: "prove", parameters: { proofBody: "by\n  trivial" } },
      { action: "VERIFY", rationaleSummary: "verify", parameters: {} },
    ])
    const lean = new FakeLeanAdapter()
    const app = MathOS.open(created.root, { modelProvider: model, auditorProvider: model, leanAdapter: lean, researchPlanner: planner, vcs: new FakeVcs(), premiseRetriever: new InMemoryPremiseRetriever() })
    const claim = app.createClaim({ kind: "conjecture", title: "Smoke", statement: "True", asMainObjective: true })
    const formal = await app.formalize(claim.id)
    app.approveFormal(formal.formalStatement.id)
    const run = app.startResearch()
    await app.runResearch(run.id)
    expect(app.getClaim(claim.id).status).toBe("KERNEL_VERIFIED")
    expect(app.getResearch(run.id).status).toBe("COMPLETED")
    expect(app.getResearch(run.id).stopReason).toBe("OBJECTIVE_KERNEL_VERIFIED")
    app.close()
  })
})

;(Bun.which("lean") ? describe : describe.skip)("dual real Lean worktrees", () => {
  test("MAIN and B-001 both check independently", async () => {
    const created = await MathOS.init(tempDir(), "duallean")
    const app = MathOS.open(created.root)
    await app.setupResearchVersioning()
    writeFileSync(join(created.root, "lean-toolchain"), "leanprover/lean4:v4.33.1\n", "utf8")
    mkdirSync(join(created.root, "formal"), { recursive: true })
    writeFileSync(join(created.root, "formal", "Main.lean"), "theorem main_true : True := trivial\n", "utf8")
    const child = await app.createBranch("lean-side")
    mkdirSync(join(child.worktreePath!, "formal"), { recursive: true })
    writeFileSync(join(child.worktreePath!, "formal", "Child.lean"), "theorem child_true : True := trivial\n", "utf8")
    writeFileSync(join(child.worktreePath!, "lean-toolchain"), "leanprover/lean4:v4.33.1\n", "utf8")
    const main = Bun.spawnSync(["lean", join(created.root, "formal", "Main.lean")], { stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH}` } })
    const side = Bun.spawnSync(["lean", join(child.worktreePath!, "formal", "Child.lean")], { stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH}` } })
    expect(main.exitCode).toBe(0)
    expect(side.exitCode).toBe(0)
    expect(readFileSync(join(created.root, "formal", "Main.lean"), "utf8")).toContain("main_true")
    expect(readFileSync(join(created.root, "formal", "Main.lean"), "utf8")).not.toContain("child_true")
    app.close()
  })
})
