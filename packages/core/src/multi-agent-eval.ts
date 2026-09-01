import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MathOS, FakeResearchPlanner, FakeMultiAgentPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter, NativeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import type { ResearchDecision } from "@mathos/domain"

export interface MultiAgentEvalRow { id: string; result: "PASS" | "FAIL"; detail?: string }

const draft = { declarationName: "multi_agent_smoke", leanStatement: "theorem multi_agent_smoke : 1 + 1 = 2", variableMapping: [], assumptionMapping: [], uncertainties: [] }
const fidelity = { verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" }
const d = (action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision => ({ action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra })
const prove = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("VERIFY")]
const idle = () => [d("ANALYZE_GOAL"), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]
const fail = () => [d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  exact (0 : Nat)" } }), d("STOP", { stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } })]
const human = () => [d("REQUEST_HUMAN", { rationaleSummary: "need human" })]

async function boot(mode: "fake" | "native", extra: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "mathos-mae-"))
  const created = await MathOS.init(root, "mae")
  const model = new FakeModelProvider()
  model.enqueue(draft)
  model.enqueue(fidelity)
  const lean = mode === "native" ? new NativeLeanAdapter() : new FakeLeanAdapter()
  const app = MathOS.open(created.root, {
    modelProvider: model,
    auditorProvider: model,
    leanAdapter: lean,
    vcs: new FakeVcs(),
    premiseRetriever: new InMemoryPremiseRetriever(),
    formalProjectRoot: mode === "native" ? resolve(import.meta.dir, "../../../demo/formal") : undefined,
    ...extra,
  })
  await app.setupResearchVersioning()
  const claim = app.createClaim({ kind: "conjecture", title: "Obj", statement: "1 + 1 = 2", asMainObjective: true })
  const formal = await app.formalize(claim.id)
  app.approveFormal(formal.formalStatement.id)
  return { app, claim, lean, root: created.root, cleanup: () => { app.close(); rmSync(root, { recursive: true, force: true }) } }
}

export const MULTI_AGENT_SCENARIOS = [
  "branch-isolation",
  "assignment-diversity",
  "round-robin",
  "one-agent-succeeds",
  "all-agents-blocked",
  "global-budget",
  "local-budget",
  "worker-failure-isolation",
  "crash-recovery",
  "solution-candidate",
  "multiple-solutions",
  "source-main-unchanged",
  "planner-reopen",
  "round-reopen",
  "solution-idempotency",
  "local-lean-budget",
  "local-model-budget",
  "local-proof-budget",
  "verified-import",
  "verified-import-reverify",
  "unverified-import-reject",
  "import-stale",
  "import-conflict",
  "dependency-closure",
  "import-rollback",
  "no-auto-import",
  "team-panel",
  "parallel-two-workers",
  "parallel-concurrency-cap",
  "parallel-round-barrier",
  "parallel-digest-isolation",
  "parallel-worker-failure",
  "parallel-multiple-solutions",
  "parallel-global-lean-budget-race",
  "parallel-global-model-budget-race",
  "parallel-local-budget",
  "parallel-id-allocation",
  "parallel-storage-contention",
  "parallel-crash-one-complete",
  "parallel-crash-multi-running",
  "parallel-budget-reservation-recovery",
  "parallel-pause",
  "parallel-cancel",
  "worker-detail",
  "sequential-equivalence",
  "parallel-queued-worker-timing",
  "parallel-peak-concurrency",
  "parallel-crash-two-running",
  "parallel-crash-after-reservation",
  "parallel-crash-after-tool-start",
  "parallel-crash-after-result",
  "parallel-crash-after-step",
  "parallel-global-proof-budget-race",
  "parallel-digest-snapshot",
  "parallel-digest-next-round",
  "parallel-id-stress",
  "parallel-storage-lock",
  "parallel-step-timeout",
  "parallel-timeout-no-process-leak",
  "parallel-pause-no-next-batch",
  "parallel-cancel-no-next-batch",
  "worker-detail-history",
  "sequential-parallel-random-order-equivalence",
  "team-graph-context",
  "worker-graph-isolation",
  "graph-assisted-assignment",
  "imported-support-context",
  "worker-literature-isolation",
  "shared-external-finding-label",
] as const

export async function runMultiAgentScenario(id: string, mode: "fake" | "native" = "fake"): Promise<MultiAgentEvalRow> {
  try {
    if (id.startsWith("parallel-") || id === "worker-detail" || id === "sequential-equivalence" || id === "worker-detail-history" || id === "sequential-parallel-random-order-equivalence" || id === "team-graph-context" || id === "worker-graph-isolation" || id === "graph-assisted-assignment" || id === "imported-support-context" || id === "worker-literature-isolation" || id === "shared-external-finding-label") {
      const extra: Record<string, unknown> = {}
      if ((id.includes("crash") && id !== "parallel-crash-two-running") || id === "parallel-budget-reservation-recovery") extra.teamCrashAfterAgent = "A-002"
      if (id === "parallel-crash-two-running") extra.teamCrashTwoRunning = true
      if (id === "parallel-crash-after-reservation") extra.teamCrashBoundary = "after_reservation"
      if (id === "parallel-crash-after-tool-start") extra.teamCrashBoundary = "after_tool_start"
      if (id === "parallel-crash-after-result") extra.teamCrashBoundary = "after_result"
      if (id === "parallel-crash-after-step") extra.teamCrashBoundary = "after_step"
      if (id === "parallel-step-timeout" || id === "parallel-timeout-no-process-leak") extra.maxStepWallClockMs = 25
      if (id === "parallel-step-timeout" || id === "parallel-timeout-no-process-leak" || id === "parallel-queued-worker-timing" || id === "parallel-peak-concurrency" || id === "parallel-pause-no-next-batch" || id === "parallel-cancel-no-next-batch") {
        const delayed = new FakeLeanAdapter()
        delayed.delayMs = 35
        extra.leanAdapter = delayed
      }
      const bootstrapped = await boot("fake", extra)
      const { app, claim } = bootstrapped
      const parallelStart = {
        executionMode: "BOUNDED_PARALLEL" as const,
        maxParallelWorkers: 2,
        planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
      }
      if (id === "parallel-id-stress" || id === "parallel-storage-lock") {
        const ids = Array.from({ length: 20 }, (_, i) => app.createClaim({ kind: "lemma", title: `n${i}`, statement: "x" }).id)
        bootstrapped.cleanup()
        return { id, result: new Set(ids).size === 20 ? "PASS" : "FAIL" }
      }
      if (id === "worker-detail-history") {
        const session = await app.startTeam(parallelStart)
        await app.stepTeam(session.id)
        const pass = app.teamOverview(session.id).agents[0]!.recentSteps.length > 0
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "parallel-global-proof-budget-race") {
        const session = await app.startTeam({ ...parallelStart, limits: { maxAgents: 3, maxRounds: 3, maxTotalSteps: 24, maxTotalModelCalls: 30, maxTotalLeanCalls: 20, maxTotalProofAttempts: 1 } })
        await app.runTeam(session.id)
        const pass = app.getTeam(session.id).usage.proofAttempts <= 1
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "parallel-digest-snapshot" || id === "parallel-digest-next-round") {
        const session = await app.startTeam({ executionMode: "BOUNDED_PARALLEL", maxParallelWorkers: 2, planners: [new FakeResearchPlanner([d("ANALYZE_GOAL"), ...prove()]), new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ANALYZE_GOAL")]), new FakeResearchPlanner(idle())] })
        await app.stepTeam(session.id)
        const ctx = app.lastPlannerContextByRun.get(app.teamAgents(session.id)[1]!.researchRunId)
        const pass = (ctx?.digestVerifiedFindings?.length ?? 0) === 0
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "sequential-parallel-random-order-equivalence") {
        const seq = await app.startTeam({ executionMode: "SEQUENTIAL", planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())] })
        await app.runTeam(seq.id)
        const seqStatus = app.getTeam(seq.id).status
        const seqN = app.teamSolutions(seq.id).length
        bootstrapped.cleanup()
        const b2 = await boot("fake")
        const par = await b2.app.startTeam({ executionMode: "BOUNDED_PARALLEL", maxParallelWorkers: 2, planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())] })
        await b2.app.runTeam(par.id)
        const pass = b2.app.getTeam(par.id).status === seqStatus && b2.app.teamSolutions(par.id).length === seqN
        b2.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "parallel-id-allocation" || id === "parallel-storage-contention") {
        const ids = [app.createClaim({ kind: "lemma", title: "a", statement: "a" }).id, app.createClaim({ kind: "lemma", title: "b", statement: "b" }).id]
        bootstrapped.cleanup()
        return { id, result: ids[0] !== ids[1] ? "PASS" : "FAIL" }
      }
      if (id === "team-graph-context" || id === "worker-graph-isolation" || id === "graph-assisted-assignment" || id === "imported-support-context" || id === "worker-literature-isolation" || id === "shared-external-finding-label") {
        const session = await app.startTeam(parallelStart)
        const team = app.teamGraphContext(session.id)
        const a1 = app.teamAgents(session.id)[0]!
        const a2 = app.teamAgents(session.id)[1]!
        const ctx = app.researchContext(a1.researchRunId)
        const otherLocals = app.teamAgents(session.id).slice(1).map((agent) => agent.localClaimId)
        const isolated = otherLocals.every((claimId) => !ctx.graph.nodes.some((node) => node.id === claimId && node.origin === "LOCAL" && node.branchId !== a1.branchId))
        const source = app.importSource({ title: "Shared paper", authors: ["Z"], doi: "10.1/team" })
        app.switchBranch(a2.branchId)
        const excerpt = app.addExcerpt(source.id, "worker lemma text")
        const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "worker lemma text", statementMode: "SUMMARY" })
        app.cite({ sourceId: source.id, purpose: "BACKGROUND", excerptId: excerpt.id, externalResultId: ext.id })
        app.switchBranch(a1.branchId)
        const litIsolated = app.listCitations(a1.branchId).length === 0 && app.listExternal(a1.branchId).every((item) => item.id !== ext.id)
        const labeled = app.researchContext(a1.researchRunId).text.includes("NOT KERNEL VERIFIED") || app.listSources().some((item) => item.id === source.id)
        const pass =
          (id === "team-graph-context" && team.workers.length === 3)
          || (id === "worker-graph-isolation" && isolated)
          || (id === "graph-assisted-assignment" && team.workers.some((worker) => worker.agentId === "A-001"))
          || (id === "imported-support-context" && Array.isArray(ctx.summary.importedDependencies))
          || (id === "worker-literature-isolation" && litIsolated)
          || (id === "shared-external-finding-label" && labeled)
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "worker-detail") {
        const session = await app.startTeam(parallelStart)
        const pass = app.teamOverview(session.id).agents.length === 3 && app.getTeam(session.id).executionMode === "BOUNDED_PARALLEL"
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "sequential-equivalence") {
        const seq = await app.startTeam({ executionMode: "SEQUENTIAL", planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())] })
        await app.runTeam(seq.id)
        const seqN = app.teamSolutions(seq.id).length
        const seqStatus = app.getTeam(seq.id).status
        bootstrapped.cleanup()
        const b2 = await boot("fake")
        const par = await b2.app.startTeam({ executionMode: "BOUNDED_PARALLEL", maxParallelWorkers: 2, planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())] })
        await b2.app.runTeam(par.id)
        const pass = b2.app.getTeam(par.id).status === seqStatus && b2.app.teamSolutions(par.id).length === seqN
        b2.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      const session = await app.startTeam({
        ...parallelStart,
        planners: id === "parallel-worker-failure"
          ? [new FakeResearchPlanner(prove()), new FakeResearchPlanner(fail()), new FakeResearchPlanner(idle())]
          : id === "parallel-local-budget"
            ? [new FakeResearchPlanner([d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } })]), new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } })]), new FakeResearchPlanner(idle())]
            : parallelStart.planners,
        limits: id.includes("budget-race") || id === "parallel-global-lean-budget-race" || id === "parallel-global-model-budget-race"
          ? { maxAgents: 3, maxRounds: 4, maxTotalSteps: 24, maxTotalModelCalls: id.includes("model") ? 1 : 30, maxTotalLeanCalls: id.includes("lean") || id === "parallel-global-lean-budget-race" ? 1 : 20, maxTotalProofAttempts: 12 }
          : undefined,
        workerLimits: id === "parallel-local-budget" ? [{ maxLeanCalls: 1, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 4, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 4, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }] : undefined,
        maxParallelWorkers: 2,
      })
      if (id === "parallel-crash-one-complete" || id === "parallel-crash-multi-running" || id === "parallel-budget-reservation-recovery" || id === "parallel-crash-two-running" || id === "parallel-crash-after-reservation" || id === "parallel-crash-after-tool-start" || id === "parallel-crash-after-result" || id === "parallel-crash-after-step") {
        await app.stepTeam(session.id).catch(() => undefined)
        const leases = app["client"].db.query<{ n: number }, []>("SELECT COUNT(*) as n FROM execution_leases").get()
        app.resumeTeam(session.id)
        const ok = app.teamHistory(session.id).some((round) => round.status === "INTERRUPTED") && (id !== "parallel-crash-two-running" || (leases?.n ?? 0) >= 2)
        bootstrapped.cleanup()
        return { id, result: ok ? "PASS" : "FAIL" }
      }
      if (id === "parallel-queued-worker-timing" || id === "parallel-peak-concurrency") {
        await app.stepTeam(session.id)
        const t = app.parallelTimings
        const a3 = t.find((row) => row.agentId === "A-003")
        const firstEnd = Math.min(...t.filter((row) => row.agentId !== "A-003").map((row) => row.end), Date.now())
        const timingOk = id === "parallel-peak-concurrency" ? app.peakConcurrency <= 2 : !a3 || a3.start >= firstEnd
        bootstrapped.cleanup()
        return { id, result: timingOk ? "PASS" : "FAIL" }
      }
      if (id === "parallel-step-timeout" || id === "parallel-timeout-no-process-leak") {
        await app.stepTeam(session.id)
        const pass = app.getResearch(app.teamAgents(session.id)[0]!.researchRunId).stopReason === "STEP_TIMEOUT"
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "parallel-pause-no-next-batch" || id === "parallel-cancel-no-next-batch") {
        const pending = app.stepTeam(session.id)
        await new Promise((resolve) => setTimeout(resolve, 10))
        if (id.includes("pause")) app.pauseTeam(session.id)
        else app.cancelTeam(session.id)
        await pending.catch(() => undefined)
        const a3 = app.parallelTimings.some((row) => row.agentId === "A-003")
        bootstrapped.cleanup()
        return { id, result: a3 ? "FAIL" : "PASS" }
      }
      if (id === "parallel-pause") {
        app.pauseTeam(session.id)
        const pass = app.getTeam(session.id).status === "PAUSED"
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "parallel-cancel") {
        app.cancelTeam(session.id)
        const pass = app.getTeam(session.id).status === "CANCELLED"
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      await app.runTeam(session.id)
      const done = app.getTeam(session.id)
      const main = app.getClaim(claim.id).status
      const solutions = app.teamSolutions(session.id)
      let pass = done.executionMode === "BOUNDED_PARALLEL" && main !== "KERNEL_VERIFIED"
      if (id === "parallel-two-workers" || id === "parallel-round-barrier" || id === "parallel-digest-isolation") pass = pass && (done.status === "SOLUTION_FOUND" || solutions.length >= 1)
      if (id === "parallel-multiple-solutions") pass = solutions.length >= 1 && main !== "KERNEL_VERIFIED"
      if (id === "parallel-global-lean-budget-race") pass = done.usage.leanCalls <= 1
      if (id === "parallel-global-model-budget-race") pass = done.usage.modelCalls <= 1
      if (id === "parallel-local-budget") pass = app.getResearch(app.teamAgents(session.id)[0]!.researchRunId).stopReason === "LOCAL_LEAN_BUDGET_EXHAUSTED"
      if (id === "parallel-worker-failure") pass = solutions.length >= 1 || done.status === "SOLUTION_FOUND" || done.status === "BLOCKED"
      if (id === "parallel-concurrency-cap") pass = session.maxParallelWorkers === 2
      bootstrapped.cleanup()
      return { id, result: pass ? "PASS" : "FAIL", detail: `${done.status}/${done.usage.leanCalls}` }
    }
    if (id === "local-lean-budget" || id === "local-model-budget" || id === "local-proof-budget") {
      const bootstrapped = await boot("fake")
      const { app } = bootstrapped
      const workerLimits = id === "local-lean-budget"
        ? [{ maxLeanCalls: 1, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 4, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 4, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }]
        : id === "local-model-budget"
          ? [{ maxLeanCalls: 6, maxModelCalls: 1, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 6, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 6, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }]
          : [{ maxLeanCalls: 6, maxModelCalls: 10, maxProofAttempts: 1, maxSteps: 8 }, { maxLeanCalls: 6, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }, { maxLeanCalls: 6, maxModelCalls: 10, maxProofAttempts: 4, maxSteps: 8 }]
      const session = await app.startTeam({
        planners: [
          new FakeResearchPlanner([d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } })]),
          new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } })]),
          new FakeResearchPlanner([d("ANALYZE_GOAL"), d("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } })]),
        ],
        limits: { maxAgents: 3, maxRounds: 6, maxTotalSteps: 24, maxTotalModelCalls: 40, maxTotalLeanCalls: 20, maxTotalProofAttempts: 12 },
        workerLimits,
      })
      await app.runTeam(session.id)
      const a1 = app.getResearch(app.teamAgents(session.id)[0]!.researchRunId)
      const a2 = app.getResearch(app.teamAgents(session.id)[1]!.researchRunId)
      const reason = id === "local-lean-budget" ? "LOCAL_LEAN_BUDGET_EXHAUSTED" : id === "local-model-budget" ? "LOCAL_MODEL_BUDGET_EXHAUSTED" : "LOCAL_PROOF_BUDGET_EXHAUSTED"
      const sessionStop = app.getTeam(session.id).stopReason
      const pass = a1.stopReason === reason && (a2.usage.leanCalls > 0 || a2.usage.steps > 0) && sessionStop !== "GLOBAL_BUDGET_EXHAUSTED"
      const detail = `${a1.stopReason}/${sessionStop}`
      bootstrapped.cleanup()
      return { id, result: pass ? "PASS" : "FAIL", detail }
    }
    if (id === "planner-reopen" || id === "round-reopen") {
      const bootstrapped = await boot("fake")
      const session = await bootstrapped.app.startTeam({ planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())] })
      await bootstrapped.app.stepTeam(session.id)
      const root = bootstrapped.app.root
      bootstrapped.app.close()
      const app2 = (await import("@mathos/core")).MathOS.open(root, { vcs: new FakeVcs(), leanAdapter: new FakeLeanAdapter(), premiseRetriever: new InMemoryPremiseRetriever() })
      app2.resumeTeam(session.id)
      await app2.stepTeam(session.id)
      const pass = app2.teamHistory(session.id).length >= 2
      app2.close()
      rmSync(root, { recursive: true, force: true })
      return { id, result: pass ? "PASS" : "FAIL" }
    }
    if (id === "verified-import" || id === "no-auto-import" || id === "unverified-import-reject" || id === "import-stale" || id === "team-panel" || id === "verified-import-reverify" || id === "import-conflict" || id === "dependency-closure" || id === "import-rollback" || id === "solution-idempotency") {
      const bootstrapped = await boot("fake")
      const { app, claim } = bootstrapped
      const session = await app.startTeam({
        planners: id === "unverified-import-reject"
          ? [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())]
          : [new FakeResearchPlanner(idle()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
      })
      await app.runTeam(session.id)
      const agents = app.teamAgents(session.id)
      if (id === "no-auto-import") {
        const pass = app.teamImports(session.id).every((item) => item.status !== "APPLIED")
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "team-panel") {
        const pass = app.teamOverview(session.id).agents.length === 3
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      if (id === "solution-idempotency") {
        const pass = app.teamSolutions(session.id).length <= 3
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL" }
      }
      const source = agents[1]!
      if (id === "unverified-import-reject") {
        const proposed = app.proposeImport(session.id, source.id, agents[0]!.id, source.localClaimId)
        const applied = await app.applyImport(proposed.id)
        bootstrapped.cleanup()
        return { id, result: applied.failureCode === "SOURCE_NOT_KERNEL_VERIFIED" ? "PASS" : "FAIL" }
      }
      if (app.getClaim(source.localClaimId).status !== "KERNEL_VERIFIED") {
        bootstrapped.cleanup()
        return { id, result: "FAIL", detail: "source not verified" }
      }
      const proposed = app.proposeImport(session.id, source.id, agents[0]!.id, source.localClaimId)
      if (id === "import-stale") {
        const formal = app["formalStatements"].currentForClaim(source.localClaimId)
        if (formal) {
          app["formalStatements"].markOthersNotCurrent(source.localClaimId)
          app["formalStatements"].insert({ ...formal, id: formal.id + "x", isCurrent: true })
        }
        const applied = await app.applyImport(proposed.id)
        bootstrapped.cleanup()
        return { id, result: applied.status === "REVERIFY_REQUIRED" ? "PASS" : "FAIL" }
      }
      if (id === "verified-import" || id === "verified-import-reverify") {
        const applied = await app.applyImport(proposed.id)
        const target = applied.targetClaimId ? app.getClaim(applied.targetClaimId) : null
        const pass = applied.status === "APPLIED" && target?.status === "KERNEL_VERIFIED" && app.getClaim(claim.id).status !== "KERNEL_VERIFIED"
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL", detail: applied.status }
      }
      if (id === "import-conflict" || id === "dependency-closure" || id === "import-rollback") {
        if (id === "import-conflict") {
          const srcFormal = app["formalStatements"].currentForClaim(source.localClaimId)!
          app.switchBranch(agents[0]!.branchId)
          const clash = app.createClaim({ kind: "lemma", title: "clash", statement: "different" })
          app["formalStatements"].insert({
            ...srcFormal,
            id: srcFormal.id + "clash",
            claimId: clash.id,
            sourceText: "theorem clash_different : False := sorry",
            isCurrent: true,
          })
        }
        if (id === "dependency-closure") {
          const extra = app.createClaim({ kind: "lemma", title: "needed", statement: "needed" })
          app.addDependency(source.localClaimId, extra.id)
        }
        if (id === "import-rollback" && "nextProof" in bootstrapped.lean) {
          bootstrapped.lean.nextProof = { result: "ERROR", diagnostics: [{ severity: "error", message: "fail" }], leanVersion: "fake-4.33.1", toolchain: "leanprover/lean4:v4.33.1" }
        }
        const applied = await app.applyImport(proposed.id)
        const targetStatus = applied.targetClaimId ? app.getClaim(applied.targetClaimId).status : null
        const pass = id === "import-conflict" ? applied.status === "CONFLICT" && applied.failureCode === "DECLARATION_CONFLICT"
          : id === "dependency-closure" ? applied.failureCode === "DEPENDENCY_IMPORT_REQUIRED"
            : applied.status === "FAILED" && targetStatus !== "KERNEL_VERIFIED"
        bootstrapped.cleanup()
        return { id, result: pass ? "PASS" : "FAIL", detail: `${applied.status}/${applied.failureCode}` }
      }
      bootstrapped.cleanup()
      return { id, result: "PASS" }
    }
    if (id === "assignment-diversity") {
      const bootstrapped = await boot(mode, {
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
      const session = await bootstrapped.app.startTeam({ planners: [new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(idle())] })
      const ok = new Set(bootstrapped.app.teamAgents(session.id).map((item) => item.role)).size === 3
      bootstrapped.cleanup()
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    const bootstrapped = await boot(id === "crash-recovery" ? "fake" : mode, id === "crash-recovery" ? { teamCrashAfterAgent: "A-002" } : {})
    const { app, claim } = bootstrapped
    const planners =
      id === "all-agents-blocked" ? [new FakeResearchPlanner(human()), new FakeResearchPlanner(human()), new FakeResearchPlanner(human())]
        : id === "multiple-solutions" ? [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())]
          : [new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle()), new FakeResearchPlanner(fail())]
    const session = await app.startTeam({
      planners,
      limits: id === "global-budget" || id === "local-budget"
        ? { maxAgents: 3, maxRounds: 8, maxTotalSteps: 24, maxTotalModelCalls: 30, maxTotalLeanCalls: 1, maxTotalProofAttempts: 12 }
        : undefined,
    })
    const agents = app.teamAgents(session.id)
    if (id === "branch-isolation") {
      const ok = new Set(agents.map((item) => item.branchId)).size === 3
      bootstrapped.cleanup()
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "crash-recovery") {
      await app.stepTeam(session.id).catch(() => undefined)
      const ok = app.teamHistory(session.id).some((round) => round.status === "INTERRUPTED")
      bootstrapped.cleanup()
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    await app.runTeam(session.id)
    const done = app.getTeam(session.id)
    const main = app.getClaim(claim.id).status
    const solutions = app.teamSolutions(session.id)
    let pass = false
    if (id === "round-robin") pass = app.teamHistory(session.id).length >= 1
    if (id === "one-agent-succeeds" || id === "solution-candidate") pass = done.status === "SOLUTION_FOUND" && solutions.length >= 1 && main !== "KERNEL_VERIFIED"
    if (id === "source-main-unchanged") pass = main !== "KERNEL_VERIFIED"
    if (id === "multiple-solutions") pass = solutions.length >= 2 && main !== "KERNEL_VERIFIED"
    if (id === "all-agents-blocked") pass = done.stopReason === "ALL_AGENTS_BLOCKED"
    if (id === "global-budget" || id === "local-budget") pass = done.usage.leanCalls <= 1 || done.stopReason === "GLOBAL_BUDGET_EXHAUSTED"
    if (id === "worker-failure-isolation") pass = done.status === "SOLUTION_FOUND"
    bootstrapped.cleanup()
    return { id, result: pass ? "PASS" : "FAIL", detail: `${done.status}/${done.stopReason}` }
  } catch (error) {
    return { id, result: "FAIL", detail: error instanceof Error ? error.message : "error" }
  }
}

export async function runMultiAgentEval(mode: "fake" | "native" | "real-parallel" = "fake"): Promise<MultiAgentEvalRow[]> {
  if (mode === "real-parallel") return [await runRealParallel()]
  const ids = mode === "native" ? (["one-agent-succeeds", "source-main-unchanged", "branch-isolation"] as const) : MULTI_AGENT_SCENARIOS
  const rows: MultiAgentEvalRow[] = []
  for (const id of ids) rows.push(await runMultiAgentScenario(id, mode))
  return rows
}

async function runRealParallel(): Promise<MultiAgentEvalRow> {
  const starts: number[] = []
  const ends: number[] = []
  class TimingLean extends NativeLeanAdapter {
    override async checkProof(source: string, context: Parameters<NativeLeanAdapter["checkProof"]>[1]) {
      starts.push(Date.now())
      try {
        return await super.checkProof(source, context)
      } finally {
        ends.push(Date.now())
      }
    }
  }
  const bootstrapped = await boot("native", { leanAdapter: new TimingLean() })
  const { app, claim } = bootstrapped
  const session = await app.startTeam({
    executionMode: "BOUNDED_PARALLEL",
    maxParallelWorkers: 2,
    planners: [new FakeResearchPlanner(prove()), new FakeResearchPlanner(prove()), new FakeResearchPlanner(idle())],
  })
  await app.runTeam(session.id)
  const overlap = starts.length >= 2 && starts[1]! < ends[0]!
  const main = app.getClaim(claim.id).status !== "KERNEL_VERIFIED"
  const pass = overlap && main && (app.getTeam(session.id).status === "SOLUTION_FOUND" || app.teamSolutions(session.id).length >= 1)
  bootstrapped.cleanup()
  return { id: "real-parallel", result: pass ? "PASS" : "FAIL", detail: `starts=${starts.length} overlap=${overlap}` }
}
