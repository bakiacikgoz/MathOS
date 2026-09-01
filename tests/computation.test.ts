import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"
import { allowedEnv } from "@mathos/computation"

const dirs: string[] = []
function temp() {
  const dir = mkdtempSync(join(tmpdir(), "mathos-exp-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function boot() {
  const created = await MathOS.init(temp(), "exp")
  const app = MathOS.open(created.root, { vcs: new FakeVcs() })
  const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "P", asMainObjective: true })
  return { app, claim }
}

describe("computational experiments", () => {
  test("python smoke does not verify", async () => {
    const { app, claim } = await boot()
    const exp = await app.createExperiment({
      claimId: claim.id,
      kind: "SANITY_CHECK",
      code: "print(sum(range(101)))\nassert sum(range(101)) == 5050\n",
    })
    const result = await app.runExperiment(exp.id)
    expect(result.outcome).not.toBe("EXECUTION_FAILED")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    expect(app.formatExperiment(exp.id)).toContain("NOT PROOF")
    app.close()
  })

  test("finite verification is not proof", async () => {
    const { app, claim } = await boot()
    const exp = await app.createExperiment({
      claimId: claim.id,
      kind: "FINITE_VERIFICATION",
      parameters: { property: "n + 0 == n", domainStart: 0, domainEnd: 20 },
    })
    const result = await app.runExperiment(exp.id)
    expect(result.outcome).toBe("NO_COUNTEREXAMPLE_FOUND")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    expect(["HEURISTIC_SUPPORT", "COMPUTATIONALLY_SUPPORTED", "CONJECTURE"]).toContain(app.getClaim(claim.id).status)
    app.close()
  })

  test("counterexample does not auto-disprove", async () => {
    const { app, claim } = await boot()
    const exp = await app.createExperiment({
      claimId: claim.id,
      kind: "COUNTEREXAMPLE_SEARCH",
      parameters: { property: "n > 0", domainStart: -2, domainEnd: 2 },
    })
    const result = await app.runExperiment(exp.id)
    expect(result.outcome).toBe("COUNTEREXAMPLE_FOUND")
    expect(app.getClaim(claim.id).status).not.toBe("DISPROVED")
    expect(app.getClaim(claim.id).status).not.toBe("KERNEL_VERIFIED")
    app.close()
  })

  test("python failure and timeout cleanup", async () => {
    const { app } = await boot()
    const fail = await app.createExperiment({ kind: "GENERAL", code: "raise RuntimeError('boom')\n" })
    const failed = await app.runExperiment(fail.id)
    expect(failed.outcome).toBe("EXECUTION_FAILED")
    const sleeper = await app.createExperiment({ kind: "GENERAL", code: "import time\ntime.sleep(30)\n" })
    const timed = await app.runExperiment(sleeper.id, { timeoutMs: 400 })
    expect(app.getExperiment(sleeper.id).status).toBe("TIMED_OUT")
    expect(timed.summary).toBe("EXPERIMENT_TIMEOUT")
    if (app.lastExperimentPid && app.lastExperimentPid > 0) {
      const alive = Bun.spawnSync(["ps", "-p", String(app.lastExperimentPid)], { stdout: "pipe", stderr: "pipe" })
      expect(alive.exitCode === 0).toBe(false)
    }
    app.close()
  })

  test("output bound, secret isolation, reproducible rerun", async () => {
    expect(allowedEnv({ MATHOS_API_KEY: "secret-value" }).MATHOS_API_KEY).toBeUndefined()
    const { app, claim } = await boot()
    const huge = await app.createExperiment({ kind: "GENERAL", code: "print('x'*200000)\n" })
    const hugeResult = await app.runExperiment(huge.id)
    expect(hugeResult.stdoutTruncated).toBe(true)
    const exp = await app.createExperiment({
      claimId: claim.id,
      kind: "FINITE_VERIFICATION",
      parameters: { property: "n == n", domainStart: 0, domainEnd: 3, randomSeed: 1 },
    })
    const first = await app.runExperiment(exp.id)
    const second = await app.rerunExperiment(exp.id)
    expect(second.id).not.toBe(first.id)
    expect(second.codeHash).toBe(first.codeHash)
    expect(second.inputHash).toBe(first.inputHash)
    expect(second.runtimeFingerprint).toBe(first.runtimeFingerprint)
    writeFileSync(exp.codeArtifactId, "print('mutated')\n", "utf8")
    await expect(app.runExperiment(exp.id)).rejects.toThrow("EXPERIMENT_CODE_MUTATED")
    expect(app.experimentResults(exp.id)[0]!.codeHash).toBe(first.codeHash)
    app.close()
  })

  test("branch isolation and research loop safety", async () => {
    const { app, claim } = await boot()
    const child = await app.createBranch("exp-branch")
    app.switchBranch(child.id)
    const local = await app.createExperiment({ claimId: claim.id, kind: "SANITY_CHECK", code: "print(1)\n" })
    app.switchBranch("B-000")
    expect(app.listExperiments("B-000").some((item) => item.id === local.id)).toBe(false)
    expect(app.listExperiments(child.id).some((item) => item.id === local.id)).toBe(true)
    const planner = new FakeResearchPlanner([
      { action: "RUN_EXPERIMENT", rationaleSummary: "finite", parameters: { kind: "FINITE_VERIFICATION", property: "n == n", domainStart: 0, domainEnd: 5 }, researchDecisionVersion: "v1" },
      { action: "STOP", rationaleSummary: "done", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
    ])
    const app2root = temp()
    const created = await MathOS.init(app2root, "loop")
    const loop = MathOS.open(created.root, { vcs: new FakeVcs(), researchPlanner: planner })
    const objective = loop.createClaim({ kind: "conjecture", title: "Obj", statement: "n=n", asMainObjective: true })
    const run = loop.startResearch()
    await loop.runResearch(run.id)
    expect(loop.getClaim(objective.id).status).not.toBe("KERNEL_VERIFIED")
    const graph = loop.buildGraph({ includeComputation: true })
    expect(graph.nodes.some((node) => node.kind === "EXPERIMENT")).toBe(true)
    const ctx = loop.researchContext(run.id)
    expect(ctx.text).toContain("NOT PROOF")
    loop.close()
    app.close()
  })
})
