import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { NativeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"

const DEMO_FORMAL = resolve(resolve(import.meta.dir, ".."), "demo/formal")
const temps: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-native-"))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const lakeEnv = (file: string) =>
  Bun.spawnSync(["lake", "env", "lean", file], {
    cwd: DEMO_FORMAL,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH}` },
  })

describe("native research loop", () => {
  test("real Lean smoke KERNEL_VERIFIED", async () => {
    const created = await MathOS.init(tempDir(), "native-smoke")
    const model = new FakeModelProvider()
    model.enqueue({
      declarationName: "research_smoke",
      leanStatement: "theorem research_smoke : 1 + 1 = 2",
      variableMapping: [],
      assumptionMapping: [],
      uncertainties: [],
    })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "1+1=2", formalBackTranslation: "1 + 1 = 2" })
    const planner = new FakeResearchPlanner([
      { action: "ANALYZE_GOAL", rationaleSummary: "look", parameters: {}, researchDecisionVersion: "v1" },
      { action: "SEARCH_PREMISES", rationaleSummary: "prem", parameters: {}, researchDecisionVersion: "v1" },
      { action: "ATTEMPT_PROOF", rationaleSummary: "prove", parameters: { proofBody: "by\n  rfl" }, researchDecisionVersion: "v1" },
      { action: "VERIFY", rationaleSummary: "gate", parameters: {}, researchDecisionVersion: "v1" },
    ])
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new NativeLeanAdapter(),
      researchPlanner: planner,
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
      formalProjectRoot: DEMO_FORMAL,
    })
    const claim = app.createClaim({ kind: "conjecture", title: "Smoke", statement: "1 + 1 = 2", asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    const run = app.startResearch()
    await app.runResearch(run.id)
    expect(app.getClaim(claim.id).status).toBe("KERNEL_VERIFIED")
    expect(app.getResearch(run.id).status).toBe("COMPLETED")
    expect(app.getResearch(run.id).stopReason).toBe("OBJECTIVE_KERNEL_VERIFIED")
    app.close()
  }, 180000)

  test("real Lean failure then recovery", async () => {
    const created = await MathOS.init(tempDir(), "native-fail")
    const model = new FakeModelProvider()
    model.enqueue({
      declarationName: "research_true",
      leanStatement: "theorem research_true : True",
      variableMapping: [],
      assumptionMapping: [],
      uncertainties: [],
    })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "True", formalBackTranslation: "True" })
    const planner = new FakeResearchPlanner([
      { action: "ATTEMPT_PROOF", rationaleSummary: "bad", parameters: { proofBody: "by\n  exact (0 : Nat)" }, researchDecisionVersion: "v1" },
      { action: "INSPECT_FAILURE", rationaleSummary: "inspect", parameters: { summary: "type mismatch" }, researchDecisionVersion: "v1" },
      { action: "ATTEMPT_PROOF", rationaleSummary: "good", parameters: { proofBody: "by\n  trivial" }, researchDecisionVersion: "v1" },
      { action: "VERIFY", rationaleSummary: "gate", parameters: {}, researchDecisionVersion: "v1" },
    ])
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: new NativeLeanAdapter(),
      researchPlanner: planner,
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
      formalProjectRoot: DEMO_FORMAL,
    })
    const claim = app.createClaim({ kind: "conjecture", title: "True", statement: "True", asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    const run = app.startResearch()
    await app.stepResearch(run.id)
    expect(app.getResearch(run.id).status).not.toBe("COMPLETED")
    await app.runResearch(run.id)
    expect(app.getClaim(claim.id).status).toBe("KERNEL_VERIFIED")
    app.close()
  }, 180000)

  test("dual lake env lean MAIN vs B-001", async () => {
    const created = await MathOS.init(tempDir(), "dual-lake")
    const app = MathOS.open(created.root, { formalProjectRoot: DEMO_FORMAL })
    await app.setupResearchVersioning()
    const mainFile = join(created.root, "formal", "MainCheck.lean")
    mkdirSync(join(created.root, "formal"), { recursive: true })
    writeFileSync(mainFile, "theorem main_lake : True := trivial\n", "utf8")
    const child = await app.createBranch("lake-side")
    mkdirSync(join(child.worktreePath!, "formal"), { recursive: true })
    const childFile = join(child.worktreePath!, "formal", "ChildCheck.lean")
    writeFileSync(childFile, "theorem child_lake : True := trivial\n", "utf8")
    const main = lakeEnv(mainFile)
    const side = lakeEnv(childFile)
    expect(main.exitCode).toBe(0)
    expect(side.exitCode).toBe(0)
    expect(readFileSync(mainFile, "utf8")).not.toContain("child_lake")
    app.close()
  }, 180000)
})
