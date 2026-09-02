import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MathOS, FakeResearchPlanner } from "@mathos/core"
import { FakeModelProvider } from "@mathos/models"
import { FakeLeanAdapter, NativeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import { FakeComputationalRuntime } from "@mathos/computation"
import type { ResearchDecision, ResearchStopReason } from "@mathos/domain"

export interface ResearchEvalScenario {
  id: string
  objective: string
  formalStatement: string
  proofBody: string
  expectedOutcome: "KERNEL_VERIFIED" | "BLOCKED" | "BUDGET_EXHAUSTED" | "REPETITION_DETECTED"
  plannerScript: ResearchDecision[]
  maxSteps?: number
  maxLeanCalls?: number
  tags: string[]
}

const formalDraft = (name: string, statement: string) => ({
  declarationName: name,
  leanStatement: statement,
  variableMapping: [],
  assumptionMapping: [],
  uncertainties: [],
})
const fidelityMatch = { verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" }

function decision(action: ResearchDecision["action"], extra: Partial<ResearchDecision> = {}): ResearchDecision {
  return { action, rationaleSummary: action, parameters: {}, researchDecisionVersion: "v1", ...extra }
}

export const RESEARCH_EVAL_SCENARIOS: ResearchEvalScenario[] = [
  {
    id: "trivial-direct",
    objective: "1 + 1 = 2",
    formalStatement: "theorem research_smoke : 1 + 1 = 2",
    proofBody: "by\n  rfl",
    expectedOutcome: "KERNEL_VERIFIED",
    plannerScript: [
      decision("ANALYZE_GOAL"),
      decision("SEARCH_PREMISES"),
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }),
      decision("VERIFY"),
    ],
    tags: ["A", "trivial-direct"],
  },
  {
    id: "premise-needed",
    objective: "n = n",
    formalStatement: "theorem research_id (n : Nat) : n = n",
    proofBody: "by\n  rfl",
    expectedOutcome: "KERNEL_VERIFIED",
    plannerScript: [
      decision("SEARCH_PREMISES"),
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  rfl" } }),
      decision("VERIFY"),
    ],
    tags: ["B", "premise-needed"],
  },
  {
    id: "failure-recovery",
    objective: "True",
    formalStatement: "theorem research_true : True",
    proofBody: "by\n  trivial",
    expectedOutcome: "KERNEL_VERIFIED",
    plannerScript: [
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  exact (0 : Nat)" } }),
      decision("INSPECT_FAILURE", { parameters: { summary: "type mismatch" } }),
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  trivial" } }),
      decision("VERIFY"),
    ],
    tags: ["C", "failure-recovery"],
  },
  {
    id: "human-blocker",
    objective: "ambiguous",
    formalStatement: "theorem research_human : True",
    proofBody: "by\n  trivial",
    expectedOutcome: "BLOCKED",
    plannerScript: [decision("REQUEST_HUMAN", { rationaleSummary: "Choose intended statement." })],
    tags: ["D", "human-blocker"],
  },
  {
    id: "repetition",
    objective: "fail loop",
    formalStatement: "theorem research_rep : True",
    proofBody: "by\n  sorry",
    expectedOutcome: "REPETITION_DETECTED",
    plannerScript: [
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  sorry" } }),
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  sorry" } }),
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  sorry" } }),
      decision("ATTEMPT_PROOF", { parameters: { proofBody: "by\n  sorry" } }),
    ],
    maxSteps: 10,
    maxLeanCalls: 20,
    tags: ["E", "repetition"],
  },
]

export interface ResearchEvalRow {
  id: string
  result: "PASS" | "FAIL"
  status: string
  stopReason: string | null
  steps: number
  proofAttempts: number
  modelCalls: number
  leanCalls: number
  durationMs: number
  detail?: string
}

export async function runResearchScenario(scenario: ResearchEvalScenario, mode: "fake" | "native" = "fake"): Promise<ResearchEvalRow> {
  const root = mkdtempSync(join(tmpdir(), `mathos-eval-${scenario.id}-`))
  const started = Date.now()
  try {
    const created = await MathOS.init(root, "eval")
    const model = new FakeModelProvider()
    const name = scenario.formalStatement.split(" ")[1] ?? "research_smoke"
    model.enqueue(formalDraft(name, scenario.formalStatement))
    model.enqueue(fidelityMatch)
    const planner = new FakeResearchPlanner(scenario.plannerScript.map((item) => ({ ...item })))
    const lean = mode === "native" ? new NativeLeanAdapter() : new FakeLeanAdapter()
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: lean,
      researchPlanner: planner,
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
      formalProjectRoot: mode === "native" ? resolve(import.meta.dir, "../../../demo/formal") : undefined,
    })
    const claim = app.createClaim({ kind: "conjecture", title: scenario.id, statement: scenario.objective, asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    if (mode === "fake" && scenario.id === "failure-recovery") {
      const adapter = lean as FakeLeanAdapter
      let proofs = 0
      const original = adapter.checkProof.bind(adapter)
      adapter.checkProof = async (source, context) => {
        proofs += 1
        if (proofs === 1) return { result: "ERROR", diagnostics: [{ severity: "error", message: "type mismatch" }], leanVersion: "fake-4.33.1", toolchain: "leanprover/lean4:v4.33.1" }
        return original(source, context)
      }
    }
    const run = app.startResearch({
      limits: {
        maxSteps: scenario.maxSteps ?? 12,
        maxProofAttempts: 8,
        maxModelCalls: 20,
        maxLeanCalls: scenario.maxLeanCalls ?? 12,
      },
    })
    await app.runResearch(run.id)
    const done = app.getResearch(run.id)
    const claimStatus = app.getClaim(claim.id).status
    app.close()
    const expectedStop: ResearchStopReason | "OBJECTIVE_KERNEL_VERIFIED" =
      scenario.expectedOutcome === "KERNEL_VERIFIED" ? "OBJECTIVE_KERNEL_VERIFIED"
        : scenario.expectedOutcome === "BLOCKED" ? "BLOCKED_NEEDS_HUMAN"
          : scenario.expectedOutcome === "BUDGET_EXHAUSTED" ? "STEP_BUDGET_EXHAUSTED"
            : "REPETITION_DETECTED"
    const pass = scenario.expectedOutcome === "KERNEL_VERIFIED"
      ? claimStatus === "KERNEL_VERIFIED" && done.status === "COMPLETED"
      : done.stopReason === expectedStop
    return {
      id: scenario.id,
      result: pass ? "PASS" : "FAIL",
      status: done.status,
      stopReason: done.stopReason,
      steps: done.usage.steps,
      proofAttempts: done.usage.proofAttempts,
      modelCalls: done.usage.modelCalls,
      leanCalls: done.usage.leanCalls,
      durationMs: Date.now() - started,
      detail: pass ? undefined : `status=${done.status} stop=${done.stopReason} claim=${claimStatus}`,
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export async function runResearchEval(mode: "fake" | "native" = "fake"): Promise<ResearchEvalRow[]> {
  const rows: ResearchEvalRow[] = []
  for (const scenario of RESEARCH_EVAL_SCENARIOS) {
    rows.push(await runResearchScenario(scenario, mode))
  }
  if (mode === "fake") {
    rows.push(await runGraphAwareResearchCase("graph-aware-frontier"))
    rows.push(await runGraphAwareResearchCase("graph-aware-blocker"))
    rows.push(await runGraphAwareResearchCase("graph-aware-failure"))
    rows.push(await runGraphAwareResearchCase("graph-aware-branch-isolation"))
    rows.push(await runExperimentResearchCase("experiment-support-not-proof"))
    rows.push(await runExperimentResearchCase("experiment-counterexample"))
    rows.push(await runExperimentResearchCase("experiment-timeout"))
    rows.push(await runExperimentResearchCase("experiment-reproducibility"))
    rows.push(await runExperimentResearchCase("graph-computation-context"))
    rows.push(await runLiteratureResearchCase("literature-search-action"))
    rows.push(await runLiteratureResearchCase("literature-support-not-proof"))
    rows.push(await runLiteratureResearchCase("external-known-flow"))
    rows.push(await runLiteratureResearchCase("literature-branch-isolation"))
  }
  return rows
}

async function runGraphAwareResearchCase(id: string): Promise<ResearchEvalRow> {
  const root = mkdtempSync(join(tmpdir(), `mathos-eval-${id}-`))
  const started = Date.now()
  try {
    const created = await MathOS.init(root, "eval")
    const app = MathOS.open(created.root, { vcs: new FakeVcs() })
    const t = app.createClaim({ kind: "theorem", title: "T", statement: "P", asMainObjective: true, status: "FORMALIZED_UNVERIFIED" })
    // Fake graph harness input: externally checked support without forging a VerificationGate result.
    const l1 = app.createClaim({ kind: "lemma", title: "L1", statement: "Q", status: "INDEPENDENTLY_CHECKED" })
    const l2 = app.createClaim({ kind: "lemma", title: "L2", statement: "R", status: id === "graph-aware-blocker" ? "BLOCKED" : "FORMALIZED_UNVERIFIED" })
    app.addDependency(t.id, l1.id)
    app.addDependency(t.id, l2.id)
    let pass = false
    if (id === "graph-aware-frontier") {
      const summary = app.researchContext().summary
      pass = summary.unverifiedFrontier.some((item) => item.id === l2.id) && summary.verifiedPrerequisites.some((item) => item.id === l1.id)
    } else if (id === "graph-aware-blocker") {
      pass = app.researchContext().summary.unverifiedFrontier.some((item) => item.id === l2.id)
    } else if (id === "graph-aware-failure") {
      pass = app.researchContext().text.includes("FAILED ROUTES")
    } else {
      const child = await app.createBranch("side")
      app.switchBranch(child.id)
      const local = app.createClaim({ kind: "lemma", title: "hidden", statement: "S" })
      app.switchBranch("B-000")
      pass = !app.researchContext().graph.nodes.some((node) => node.id === local.id)
    }
    app.close()
    return { id, result: pass ? "PASS" : "FAIL", status: "READY", stopReason: null, steps: 0, proofAttempts: 0, modelCalls: 0, leanCalls: 0, durationMs: Date.now() - started }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function runExperimentResearchCase(id: string): Promise<ResearchEvalRow> {
  const root = mkdtempSync(join(tmpdir(), `mathos-eval-${id}-`))
  const started = Date.now()
  try {
    const created = await MathOS.init(root, "eval")
    const computationRuntime = new FakeComputationalRuntime()
    computationRuntime.next = id === "experiment-counterexample"
      ? { ...computationRuntime.next, stdout: '{"ok":true,"outcome":"COUNTEREXAMPLE_FOUND","witness":{"n":-2},"exact":true}\n' }
      : id === "experiment-timeout"
        ? { ...computationRuntime.next, exitCode: null, timedOut: true, stdout: "", durationMs: 300 }
        : { ...computationRuntime.next, stdout: '{"ok":true,"outcome":"NO_COUNTEREXAMPLE_FOUND","exact":true}\n' }
    const app = MathOS.open(created.root, { vcs: new FakeVcs(), computationRuntime })
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "P", asMainObjective: true })
    let pass = false
    if (id === "experiment-support-not-proof") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "FINITE_VERIFICATION", parameters: { property: "n == n", domainStart: 0, domainEnd: 5 } })
      const result = await app.runExperiment(exp.id, { allowUserAuthored: true })
      pass = result.outcome === "NO_COUNTEREXAMPLE_FOUND" && app.getClaim(claim.id).status !== "KERNEL_VERIFIED"
    } else if (id === "experiment-counterexample") {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "COUNTEREXAMPLE_SEARCH", parameters: { property: "n > 0", domainStart: -2, domainEnd: 2 } })
      const result = await app.runExperiment(exp.id, { allowUserAuthored: true })
      pass = result.outcome === "COUNTEREXAMPLE_FOUND" && app.getClaim(claim.id).status !== "DISPROVED"
    } else if (id === "experiment-timeout") {
      const exp = await app.createExperiment({ kind: "GENERAL", code: "import time\ntime.sleep(20)\n" })
      const result = await app.runExperiment(exp.id, { timeoutMs: 300, allowUserAuthored: true })
      pass = app.getExperiment(exp.id).status === "TIMED_OUT" && result.summary === "EXPERIMENT_TIMEOUT"
    } else if (id === "experiment-reproducibility") {
      const exp = await app.createExperiment({ kind: "FINITE_VERIFICATION", parameters: { property: "n == n", domainStart: 0, domainEnd: 2 } })
      const a = await app.runExperiment(exp.id)
      const b = await app.rerunExperiment(exp.id)
      pass = a.id !== b.id && a.codeHash === b.codeHash && a.inputHash === b.inputHash && a.runtimeFingerprint === b.runtimeFingerprint
    } else {
      const exp = await app.createExperiment({ claimId: claim.id, kind: "FINITE_VERIFICATION", parameters: { property: "n == n", domainStart: 0, domainEnd: 3 } })
      await app.runExperiment(exp.id)
      const ctx = app.researchContext()
      pass = ctx.summary.computationalEvidence.some((item) => item.experimentId === exp.id) && ctx.text.includes("NOT PROOF")
    }
    app.close()
    return { id, result: pass ? "PASS" : "FAIL", status: "READY", stopReason: null, steps: 0, proofAttempts: 0, modelCalls: 0, leanCalls: 0, durationMs: Date.now() - started }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function runLiteratureResearchCase(id: string): Promise<ResearchEvalRow> {
  const root = mkdtempSync(join(tmpdir(), `mathos-eval-${id}-`))
  const started = Date.now()
  try {
    const created = await MathOS.init(root, "eval")
    const app = MathOS.open(created.root, { vcs: new FakeVcs() })
    const claim = app.createClaim({ kind: "conjecture", title: "T", statement: "P", asMainObjective: true })
    let pass = false
    if (id === "literature-search-action") {
      const planner = new FakeResearchPlanner([
        { action: "SEARCH_LITERATURE", rationaleSummary: "find theorem", parameters: { query: "fixed point" }, researchDecisionVersion: "v1" },
        { action: "STOP", rationaleSummary: "stop", parameters: {}, researchDecisionVersion: "v1", stop: { shouldStop: true, reason: "NO_PRODUCTIVE_ACTION" } },
      ])
      app.close()
      const loop = MathOS.open(created.root, { vcs: new FakeVcs(), researchPlanner: planner })
      loop.createClaim({ kind: "conjecture", title: "Obj", statement: "P", asMainObjective: true })
      const run = loop.startResearch()
      await loop.runResearch(run.id)
      pass = loop.getResearch(run.id).usage.literatureSearches >= 1 && loop.getClaim(loop.requireWorkspace().mainObjectiveId!).status !== "KERNEL_VERIFIED"
      loop.close()
      return { id, result: pass ? "PASS" : "FAIL", status: "READY", stopReason: null, steps: 0, proofAttempts: 0, modelCalls: 0, leanCalls: 0, durationMs: Date.now() - started }
    } else if (id === "literature-support-not-proof") {
      const search = await app.searchLiterature("fixed point")
      const source = await app.importSearchResult(search.id, 0)
      const excerpt = app.addExcerpt(source.id, "A contraction mapping on a complete metric space has a unique fixed point.")
      app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "A contraction mapping on a complete metric space has a unique fixed point." })
      app.cite({ sourceId: source.id, claimId: claim.id, purpose: "SUPPORT", excerptId: excerpt.id })
      pass = app.getClaim(claim.id).status !== "KERNEL_VERIFIED" && app.getClaim(claim.id).status !== "EXTERNAL_KNOWN"
    } else if (id === "external-known-flow") {
      const source = app.importSource({ title: "Book", authors: ["X"], doi: "10.999/test" })
      const excerpt = app.addExcerpt(source.id, "Theorem 2.3 known uniqueness.")
      const ext = app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "Theorem 2.3 known uniqueness." })
      app.reviewExternalResult(ext.id)
      const linked = app.linkExternalKnown(claim.id, ext.id)
      pass = linked.status === "EXTERNAL_KNOWN"
    } else {
      const source = app.importSource({ title: "Shared", authors: ["Y"], isbn: "1234567890" })
      const child = await app.createBranch("lit")
      app.switchBranch(child.id)
      const excerpt = app.addExcerpt(source.id, "local lemma")
      app.extractExternalResult({ sourceId: source.id, excerptId: excerpt.id, statementSummary: "local lemma", statementMode: "SUMMARY" })
      app.cite({ sourceId: source.id, purpose: "BACKGROUND", excerptId: excerpt.id })
      app.switchBranch("B-000")
      pass = app.listCitations("B-000").length === 0 && app.listCitations(child.id).length === 1
    }
    app.close()
    return { id, result: pass ? "PASS" : "FAIL", status: "READY", stopReason: null, steps: 0, proofAttempts: 0, modelCalls: 0, leanCalls: 0, durationMs: Date.now() - started }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
