import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeComputationalRuntime } from "@mathos/computation"
import { FakeVcs } from "@mathos/vcs"
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
async function boot(runtime = new FakeComputationalRuntime(), planner?: FakeResearchPlanner) {
  const root = mkdtempSync(join(tmpdir(), "mathos-policy-")); roots.push(root)
  const created = await MathOS.init(root, "workspace")
  return MathOS.open(created.root, { computationRuntime: runtime, vcs: new FakeVcs(), researchPlanner: planner })
}
test("unclassified experiment is user authored and origin survives reopening", async () => {
  const app = await boot()
  const exp = await app.createExperiment({ code: "print(1)" })
  expect((exp as any).origin).toBe("USER_AUTHORED")
  const root = app.root; app.close()
  const reopened = MathOS.open(root, { vcs: new FakeVcs() })
  try { expect((reopened.getExperiment(exp.id) as any).origin).toBe("USER_AUTHORED") } finally { reopened.close() }
})
test("blocked execution persists BLOCKED and cannot create supporting evidence", async () => {
  const runtime = new FakeComputationalRuntime()
  runtime.next = { ...runtime.next, exitCode: null, stdout: "", stderr: "", blockedReason: "EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE" } as any
  const app = await boot(runtime)
  try {
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "P" })
    const exp = await app.createExperiment({ claimId: claim.id, code: "print(1)", origin: "MODEL_GENERATED" } as any)
    const result = await app.runExperiment(exp.id)
    expect(app.getExperiment(exp.id).status).toBe("BLOCKED")
    expect(result.outcome).toBe("INCONCLUSIVE")
    expect(result.summary).toBe("EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE")
    expect(app.getClaim(claim.id).status).toBe("CONJECTURE")
  } finally { app.close() }
})
test("planner cannot label its code trusted", async () => {
  const planner = new FakeResearchPlanner([
    { action: "RUN_EXPERIMENT", rationaleSummary: "check", parameters: { code: "print(1)", origin: "TRUSTED_BUILTIN" }, researchDecisionVersion: "v1" },
    { action: "STOP", rationaleSummary: "done", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
  ])
  const app = await boot(new FakeComputationalRuntime(), planner)
  try {
    app.createClaim({ kind: "conjecture", title: "T", statement: "P", asMainObjective: true })
    const run = app.startResearch(); await app.runResearch(run.id)
    expect((app.listExperiments()[0] as any)?.origin).toBe("MODEL_GENERATED")
  } finally { app.close() }
})
test("unrecognized structured output is inconclusive", async () => {
  const runtime = new FakeComputationalRuntime()
  runtime.next.stdout = '{"outcome":"KERNEL_VERIFIED"}\n'
  const app = await boot(runtime)
  try {
    const exp = await app.createExperiment({ code: "print(1)" })
    expect((await app.runExperiment(exp.id)).outcome).toBe("INCONCLUSIVE")
  } finally { app.close() }
})
test("runtime launch failure records a blocked experiment", async () => {
  class CrashedRuntime extends FakeComputationalRuntime {
    override async execute(): Promise<never> { throw new Error("launch failed") }
  }
  const app = await boot(new CrashedRuntime())
  try {
    const exp = await app.createExperiment({ code: "print(1)" })
    const result = await app.runExperiment(exp.id)
    expect(app.getExperiment(exp.id).status).toBe("BLOCKED")
    expect(result.summary).toBe("EXPERIMENT_BLOCKED_SANDBOX_FAILURE")
  } finally { app.close() }
})
