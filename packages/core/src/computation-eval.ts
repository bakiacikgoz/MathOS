import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { FakeVcs } from "@mathos/vcs"
import { allowedEnv, PythonRuntime } from "@mathos/computation"

export const COMPUTATION_EVAL_SCENARIOS = [
  "python-smoke",
  "finite-verification",
  "counterexample-found",
  "no-counterexample-found",
  "python-failure",
  "timeout",
  "output-limit",
  "reproducible-rerun",
  "branch-isolation",
  "secret-env-isolation",
  "research-status-safety",
  "graph-projection",
] as const

export async function runComputationScenario(id: string): Promise<{ id: string; result: "PASS" | "FAIL" | "SKIPPED_OPTIONAL_SYMPY"; detail?: string }> {
  const root = mkdtempSync(join(tmpdir(), `mathos-comp-${id}-`))
  try {
    const created = await MathOS.init(root, "comp")
    const app = MathOS.open(created.root, { vcs: new FakeVcs() })
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "P", asMainObjective: true })
    let pass = false
    if (id === "python-smoke") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "SANITY_CHECK", code: "print(sum(range(101)))\nassert sum(range(101)) == 5050\n" })
      const result = await app.runExperiment(exp.id)
      pass = result.outcome !== "EXECUTION_FAILED" && app.getClaim(claim.id).status !== "KERNEL_VERIFIED"
    } else if (id === "finite-verification" || id === "no-counterexample-found") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "FINITE_VERIFICATION", parameters: { property: "n + 0 == n", domainStart: 0, domainEnd: 10 } })
      const result = await app.runExperiment(exp.id)
      pass = result.outcome === "NO_COUNTEREXAMPLE_FOUND" && app.getClaim(claim.id).status !== "KERNEL_VERIFIED"
    } else if (id === "counterexample-found") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "COUNTEREXAMPLE_SEARCH", parameters: { property: "n > 0", domainStart: -2, domainEnd: 2 } })
      const result = await app.runExperiment(exp.id)
      pass = result.outcome === "COUNTEREXAMPLE_FOUND" && app.getClaim(claim.id).status !== "DISPROVED"
    } else if (id === "python-failure") {
      const exp = await app.createExperiment({ kind: "GENERAL", code: "raise RuntimeError('boom')\n" })
      const result = await app.runExperiment(exp.id)
      pass = result.outcome === "EXECUTION_FAILED" && app.getExperiment(exp.id).status === "FAILED"
    } else if (id === "timeout") {
      const exp = await app.createExperiment({ kind: "GENERAL", code: "import time\ntime.sleep(20)\n" })
      const result = await app.runExperiment(exp.id, { timeoutMs: 300 })
      let dead = true
      if (app.lastExperimentPid && app.lastExperimentPid > 0) {
        dead = Bun.spawnSync(["ps", "-p", String(app.lastExperimentPid)]).exitCode !== 0
      }
      pass = app.getExperiment(exp.id).status === "TIMED_OUT" && result.summary === "EXPERIMENT_TIMEOUT" && dead
    } else if (id === "output-limit") {
      const exp = await app.createExperiment({ kind: "GENERAL", code: "print('x'*200000)\n" })
      const result = await app.runExperiment(exp.id)
      pass = result.stdoutTruncated === true
    } else if (id === "reproducible-rerun") {
      const exp = await app.createExperiment({ kind: "FINITE_VERIFICATION", parameters: { property: "n == n", domainStart: 0, domainEnd: 3 } })
      const a = await app.runExperiment(exp.id)
      const b = await app.rerunExperiment(exp.id)
      writeFileSync(exp.codeArtifactId, "print('mutated')\n")
      let mutatedBlocked = false
      try { await app.runExperiment(exp.id) } catch (error) { mutatedBlocked = error instanceof Error && error.message === "EXPERIMENT_CODE_MUTATED" }
      pass = a.id !== b.id && a.codeHash === b.codeHash && a.runtimeFingerprint === b.runtimeFingerprint && mutatedBlocked && app.experimentResults(exp.id)[0]!.codeHash === a.codeHash
    } else if (id === "branch-isolation") {
      const child = await app.createBranch("side")
      app.switchBranch(child.id)
      const local = await app.createExperiment({ claimId: claim.id, kind: "SANITY_CHECK", code: "print(1)\n" })
      app.switchBranch("B-000")
      pass = !app.listExperiments("B-000").some((item) => item.id === local.id) && app.listExperiments(child.id).some((item) => item.id === local.id)
    } else if (id === "secret-env-isolation") {
      pass = allowedEnv({ MATHOS_API_KEY: "secret-value" }).MATHOS_API_KEY === undefined
    } else if (id === "research-status-safety") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "FINITE_VERIFICATION", parameters: { property: "n == n", domainStart: 0, domainEnd: 4 } })
      await app.runExperiment(exp.id)
      pass = app.getClaim(claim.id).status !== "KERNEL_VERIFIED" && app.getClaim(claim.id).status !== "FORMALIZED_UNVERIFIED" && app.getClaim(claim.id).status !== "INDEPENDENTLY_CHECKED"
    } else if (id === "graph-projection") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "FINITE_VERIFICATION", parameters: { property: "n == n", domainStart: 0, domainEnd: 2 } })
      await app.runExperiment(exp.id)
      const graph = app.buildGraph({ includeComputation: true })
      const proof = app.buildGraph({ proofOnly: true })
      pass = graph.nodes.some((node) => node.id === exp.id) && !proof.nodes.some((node) => node.kind === "EXPERIMENT")
    }
    app.close()
    return { id, result: pass ? "PASS" : "FAIL" }
  } catch (error) {
    return { id, result: "FAIL", detail: error instanceof Error ? error.message : String(error) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export async function runComputationEval() {
  const rows = []
  for (const id of COMPUTATION_EVAL_SCENARIOS) rows.push(await runComputationScenario(id))
  const env = await new PythonRuntime().inspectEnvironment()
  if (env.sympyAvailable) {
    const probe = Bun.spawnSync(["python3", "-c", "import sympy as sp; print(sp.expand((sp.Symbol('x')+1)**3))"], { stdout: "pipe", stderr: "pipe" })
    const out = new TextDecoder().decode(probe.stdout)
    rows.push({ id: "sympy-smoke", result: probe.exitCode === 0 && out.includes("x**3") ? "PASS" as const : "FAIL" as const })
  } else {
    rows.push({ id: "sympy-smoke", result: "SKIPPED_OPTIONAL_SYMPY" as const })
  }
  return rows
}

if (import.meta.main) {
  const rows = await runComputationEval()
  console.log("Scenario                    Result")
  for (const row of rows) console.log(`${row.id.padEnd(27)} ${row.result}`)
  if (rows.some((row) => row.result === "FAIL")) process.exitCode = 1
}
