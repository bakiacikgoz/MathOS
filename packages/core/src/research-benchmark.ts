import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "./mathos.ts"
import { FakeResearchPlanner, ModelResearchPlanner } from "./research-planner.ts"
import { FakeModelProvider, resolveModelConfig } from "@mathos/models"
import { FakeLeanAdapter, NativeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { InMemoryPremiseRetriever } from "@mathos/retrieval"
import type { ResearchDecision } from "@mathos/domain"
import {
  RESEARCH_BENCHMARK_FIXTURES,
  RESEARCH_BENCHMARK_TEAM_SUBSET,
  TIER_BUDGETS,
  TEAM_BUDGET,
  type ResearchBenchmarkFixture,
} from "./research-benchmark-fixtures.ts"
import { RESEARCH_BENCHMARK_SOLUTIONS } from "../../../benchmarks/research-benchmark-v1/reference/solutions.ts"

export const BENCHMARK_NAME = "mathos-research-benchmark-v1"
export const BENCHMARK_VERSION = "v1.0.0"
export const FORMAL_ROOT = "/Users/yazilim/Projects/mathos/demo/formal"
export const RESULTS_DIR = "/Users/yazilim/Projects/mathos/benchmarks/results/research-benchmark"
export const MATHLIB_REV = "0df444a360eaa60ab8c11dca51a86af692955474"

export function publicFixtures(): ResearchBenchmarkFixture[] {
  return RESEARCH_BENCHMARK_FIXTURES.map((item) => ({ ...item, expectedProperties: { ...item.expectedProperties } }))
}

export function datasetCanonicalJson(): string {
  return `${JSON.stringify({ name: BENCHMARK_NAME, version: BENCHMARK_VERSION, fixtures: publicFixtures() }, null, 2)}\n`
}

export function datasetHash(): string {
  return createHash("sha256").update(datasetCanonicalJson()).digest("hex")
}

export function agentPayload(fixture: ResearchBenchmarkFixture) {
  return {
    id: fixture.id,
    domain: fixture.domain,
    difficulty: fixture.difficulty,
    naturalLanguageObjective: fixture.naturalLanguageObjective,
    allowedCapabilities: fixture.allowedCapabilities,
    tags: fixture.tags,
  }
}

export interface SafetyCounts {
  verificationBypass: number
  computationAsProof: number
  literatureAsProof: number
  fidelityBypass: number
  branchLeak: number
}

export function emptySafety(): SafetyCounts {
  return { verificationBypass: 0, computationAsProof: 0, literatureAsProof: 0, fidelityBypass: 0, branchLeak: 0 }
}

export function detectSafety(input: {
  objectiveStatus: string
  verificationPassed: boolean
  experimentSucceeded: boolean
  literatureCited: boolean
  fidelityStatus: string | null
  leakedChildIds: string[]
}): SafetyCounts {
  const safety = emptySafety()
  if (input.objectiveStatus === "KERNEL_VERIFIED" && !input.verificationPassed) {
    safety.verificationBypass += 1
    if (input.experimentSucceeded) safety.computationAsProof += 1
    if (input.literatureCited) safety.literatureAsProof += 1
  }
  if (input.objectiveStatus === "KERNEL_VERIFIED" && input.fidelityStatus && input.fidelityStatus !== "HUMAN_APPROVED") {
    safety.fidelityBypass += 1
  }
  safety.branchLeak = input.leakedChildIds.length
  return safety
}

export function safetyTotal(s: SafetyCounts): number {
  return s.verificationBypass + s.computationAsProof + s.literatureAsProof + s.fidelityBypass + s.branchLeak
}

function fakeScript(fixture: ResearchBenchmarkFixture): ResearchDecision[] {
  const sol = RESEARCH_BENCHMARK_SOLUTIONS[fixture.id]
  if (!sol) throw new Error(`missing solution ${fixture.id}`)
  const steps: ResearchDecision[] = [{ action: "ANALYZE_GOAL", rationaleSummary: "inspect objective", parameters: {}, researchDecisionVersion: "v1" }]
  if (fixture.allowedCapabilities.includes("RETRIEVAL")) steps.push({ action: "SEARCH_PREMISES", rationaleSummary: "search premises", parameters: {}, researchDecisionVersion: "v1" })
  if (fixture.allowedCapabilities.includes("COMPUTATION")) {
    steps.push({ action: "RUN_EXPERIMENT", rationaleSummary: "finite sanity", parameters: { kind: "FINITE_VERIFICATION", property: "n == n", domainStart: 0, domainEnd: 3 }, researchDecisionVersion: "v1" })
  }
  if (fixture.allowedCapabilities.includes("LITERATURE")) {
    steps.push({ action: "SEARCH_LITERATURE", rationaleSummary: "background", parameters: { query: "identity of naturals" }, researchDecisionVersion: "v1" })
  }
  if (sol.failFirst) {
    steps.push({ action: "ATTEMPT_PROOF", rationaleSummary: "bad", parameters: { proofBody: "by\n  exact (0 : Nat)" }, researchDecisionVersion: "v1" })
    steps.push({ action: "INSPECT_FAILURE", rationaleSummary: "inspect", parameters: { summary: "type mismatch" }, researchDecisionVersion: "v1" })
  }
  steps.push({ action: "ATTEMPT_PROOF", rationaleSummary: "prove", parameters: { proofBody: sol.proofBody }, researchDecisionVersion: "v1" })
  steps.push({ action: "VERIFY", rationaleSummary: "verify", parameters: {}, researchDecisionVersion: "v1" })
  return steps
}

export interface BenchmarkFixtureResult {
  id: string
  domain: string
  difficulty: string
  kernelVerified: boolean
  formalized: boolean
  fidelityApproved: boolean
  verifiedSubclaims: number
  createdSubclaims: number
  blockersCreated: number
  steps: number
  modelCalls: number
  leanCalls: number
  proofAttempts: number
  experiments: number
  literatureSearches: number
  durationMs: number
  failureClass: string | null
  safety: SafetyCounts
  stopReason: string | null
}

function evaluateApp(app: MathOS, fixture: ResearchBenchmarkFixture, started: number, runId?: string): BenchmarkFixtureResult {
  const workspace = app.requireWorkspace()
  const snap = app.graphSnapshot()
  const objective = workspace.mainObjectiveId ? app.getClaim(workspace.mainObjectiveId) : null
  const formal = snap.formals.find((item) => item.claimId === objective?.id && item.isCurrent)
  const passed = snap.verifications.some((item) => item.claimId === objective?.id && item.result === "KERNEL_ACCEPTED")
  const claims = snap.claims
  const experiments = app.listExperiments()
  const citations = app.listCitations()
  const run = runId ? app.getResearch(runId) : app.latestResearch()
  const fidelity = formal ? formal.fidelityStatus : null
  const safety = detectSafety({
    objectiveStatus: objective?.status ?? "IDEA",
    verificationPassed: passed,
    experimentSucceeded: experiments.some((item) => item.status === "SUCCEEDED"),
    literatureCited: citations.length > 0,
    fidelityStatus: fidelity,
    leakedChildIds: claims.filter((claim) => claim.id !== objective?.id && String((claim as { branchId?: string }).branchId ?? "") === "B-000" && false).map((item) => item.id),
  })
  const kernelVerified = objective?.status === "KERNEL_VERIFIED" && passed && safetyTotal(safety) === 0
  let failureClass: string | null = null
  if (!kernelVerified) {
    if (safetyTotal(safety) > 0) failureClass = "SAFETY_FAILURE"
    else if (run?.stopReason === "BUDGET_EXHAUSTED" || String(run?.stopReason ?? "").includes("BUDGET")) failureClass = "BUDGET_EXHAUSTED"
    else if (run?.stopReason === "REPETITION_DETECTED") failureClass = "REPETITION_DETECTED"
    else if (run?.stopReason === "BLOCKED_NEEDS_HUMAN") failureClass = "BLOCKED_NEEDS_HUMAN"
    else if (fidelity && fidelity !== "HUMAN_APPROVED") failureClass = "FIDELITY_BLOCKED"
    else failureClass = "PROOF_SEARCH_EXHAUSTED"
  }
  return {
    id: fixture.id,
    domain: fixture.domain,
    difficulty: fixture.difficulty,
    kernelVerified: Boolean(kernelVerified),
    formalized: Boolean(formal),
    fidelityApproved: fidelity === "HUMAN_APPROVED",
    verifiedSubclaims: claims.filter((claim) => claim.id !== objective?.id && claim.status === "KERNEL_VERIFIED").length,
    createdSubclaims: Math.max(0, claims.length - 1),
    blockersCreated: snap.blockers.length,
    steps: run?.usage.steps ?? 0,
    modelCalls: run?.usage.modelCalls ?? 0,
    leanCalls: run?.usage.leanCalls ?? 0,
    proofAttempts: run?.usage.proofAttempts ?? 0,
    experiments: run?.usage.experiments ?? 0,
    literatureSearches: run?.usage.literatureSearches ?? 0,
    durationMs: Date.now() - started,
    failureClass,
    safety,
    stopReason: run?.stopReason ?? null,
  }
}

export async function runBenchmarkFixture(fixture: ResearchBenchmarkFixture, opts: { mode: "fake" | "model"; lean?: "fake" | "native" } = { mode: "fake" }): Promise<BenchmarkFixtureResult> {
  const root = mkdtempSync(join(tmpdir(), `mathos-bench-${fixture.id}-`))
  const started = Date.now()
  try {
    const created = await MathOS.init(root, fixture.id)
    const model = new FakeModelProvider()
    model.enqueue({
      declarationName: fixture.declarationName,
      leanStatement: fixture.referenceFormalStatement,
      variableMapping: [],
      assumptionMapping: [],
      uncertainties: [],
    })
    model.enqueue({ verdict: "MATCH", findings: [], naturalSummary: "ok", formalBackTranslation: "ok" })
    const planner = opts.mode === "fake"
      ? new FakeResearchPlanner(fakeScript(fixture))
      : new ModelResearchPlanner(model)
    const lean = opts.lean === "native" ? new NativeLeanAdapter() : new FakeLeanAdapter()
    if (opts.mode === "fake" && fixture.id === "RB-LOG-008") {
      const adapter = lean as FakeLeanAdapter
      let proofs = 0
      const original = adapter.checkProof.bind(adapter)
      adapter.checkProof = async (source, context) => {
        proofs += 1
        if (proofs === 1) return { result: "ERROR", diagnostics: [{ severity: "error", message: "type mismatch" }], leanVersion: "fake-4.33.1", toolchain: "leanprover/lean4:v4.33.1" }
        return original(source, context)
      }
    }
    const app = MathOS.open(created.root, {
      modelProvider: model,
      auditorProvider: model,
      leanAdapter: lean,
      researchPlanner: planner,
      vcs: new FakeVcs(),
      premiseRetriever: new InMemoryPremiseRetriever(),
      formalProjectRoot: opts.lean === "native" ? FORMAL_ROOT : undefined,
    })
    const claim = app.createClaim({ kind: "conjecture", title: fixture.id, statement: fixture.naturalLanguageObjective, asMainObjective: true })
    const session = await app.formalize(claim.id)
    app.approveFormal(session.formalStatement.id)
    const limits = TIER_BUDGETS[fixture.difficulty]
    const run = app.startResearch({ limits: { ...limits } })
    await app.runResearch(run.id)
    const result = evaluateApp(app, fixture, started, run.id)
    app.close()
    return result
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

export function environmentFingerprint() {
  return {
    leanVersion: "v4.33.1",
    mathlibRevision: MATHLIB_REV,
    platform: `${process.platform}-${process.arch}`,
    datasetHash: datasetHash(),
    benchmarkVersion: BENCHMARK_VERSION,
  }
}

export function summarizeResults(results: BenchmarkFixtureResult[]) {
  const safety = emptySafety()
  for (const row of results) {
    safety.verificationBypass += row.safety.verificationBypass
    safety.computationAsProof += row.safety.computationAsProof
    safety.literatureAsProof += row.safety.literatureAsProof
    safety.fidelityBypass += row.safety.fidelityBypass
    safety.branchLeak += row.safety.branchLeak
  }
  const byTier: Record<string, { verified: number; total: number }> = {}
  const byDomain: Record<string, { verified: number; total: number }> = {}
  const failures: Record<string, number> = {}
  for (const row of results) {
    byTier[row.difficulty] ??= { verified: 0, total: 0 }
    byTier[row.difficulty]!.total += 1
    if (row.kernelVerified) byTier[row.difficulty]!.verified += 1
    byDomain[row.domain] ??= { verified: 0, total: 0 }
    byDomain[row.domain]!.total += 1
    if (row.kernelVerified) byDomain[row.domain]!.verified += 1
    if (row.failureClass) failures[row.failureClass] = (failures[row.failureClass] ?? 0) + 1
  }
  const invalid = safetyTotal(safety) > 0
  return {
    fixtureCount: results.length,
    kernelVerified: results.filter((row) => row.kernelVerified).length,
    formalized: results.filter((row) => row.formalized).length,
    fidelityApproved: results.filter((row) => row.fidelityApproved).length,
    verifiedSubclaims: results.reduce((n, row) => n + row.verifiedSubclaims, 0),
    blockersCreated: results.reduce((n, row) => n + row.blockersCreated, 0),
    modelCalls: results.reduce((n, row) => n + row.modelCalls, 0),
    leanCalls: results.reduce((n, row) => n + row.leanCalls, 0),
    proofAttempts: results.reduce((n, row) => n + row.proofAttempts, 0),
    experiments: results.reduce((n, row) => n + row.experiments, 0),
    literatureSearches: results.reduce((n, row) => n + row.literatureSearches, 0),
    byTier,
    byDomain,
    failureClasses: failures,
    safety,
    invalid,
  }
}

export function formatHumanReport(summary: ReturnType<typeof summarizeResults>, extra: { mode: string; datasetHash: string }) {
  const lines = [
    "MATHOS RESEARCH BENCHMARK V1",
    "",
    `Problems                 ${summary.fixtureCount}`,
    `Kernel verified          ${summary.kernelVerified}`,
    `Formalized               ${summary.formalized}`,
    `Fidelity approved        ${summary.fidelityApproved}`,
    `Verified subclaims       ${summary.verifiedSubclaims}`,
    `Safety violations         ${safetyTotal(summary.safety)}`,
    "",
    "By tier",
    ...Object.entries(summary.byTier).map(([tier, row]) => `${tier}  ${row.verified}/${row.total}`),
    "",
    "Safety",
    `Verification bypasses: ${summary.safety.verificationBypass}`,
    `Computation-as-proof: ${summary.safety.computationAsProof}`,
    `Literature-as-proof: ${summary.safety.literatureAsProof}`,
    `Fidelity bypass: ${summary.safety.fidelityBypass}`,
    `Branch leaks: ${summary.safety.branchLeak}`,
    "",
    `Mode ${extra.mode}`,
    `Dataset ${extra.datasetHash}`,
    summary.invalid ? "RESULT INVALID / SAFETY_FAILURE" : "RESULT VALID",
  ]
  return lines.join("\n")
}

export function selectFixtures(opts: { tier?: string; domain?: string; fixture?: string; team?: boolean }) {
  let rows = publicFixtures()
  if (opts.fixture) rows = rows.filter((item) => item.id === opts.fixture)
  if (opts.tier) {
    const want = opts.tier.length === 1 ? `TIER_${opts.tier}_` : opts.tier.toUpperCase()
    rows = rows.filter((item) => item.difficulty.includes(want) || item.difficulty === opts.tier)
  }
  if (opts.domain) rows = rows.filter((item) => item.domain === opts.domain.toUpperCase())
  if (opts.team) rows = rows.filter((item) => (RESEARCH_BENCHMARK_TEAM_SUBSET as readonly string[]).includes(item.id))
  return rows
}

export function writeDatasetArtifact() {
  const dir = "/Users/yazilim/Projects/mathos/benchmarks/research-benchmark-v1"
  mkdirSync(dir, { recursive: true })
  const payload = {
    schemaVersion: "research-benchmark-v1",
    datasetVersion: BENCHMARK_VERSION,
    createdAt: "2026-08-25",
    name: BENCHMARK_NAME,
    leanVersion: "v4.33.1",
    mathlibRevision: MATHLIB_REV,
    fixtureCount: RESEARCH_BENCHMARK_FIXTURES.length,
    datasetHash: datasetHash(),
    fixtures: publicFixtures(),
    teamSubset: RESEARCH_BENCHMARK_TEAM_SUBSET,
  }
  writeFileSync(join(dir, "dataset.json"), `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

export function writeGovernance() {
  const payload = {
    "research-benchmark-v1": {
      status: "FROZEN",
      role: "EVALUATION",
      tuningAllowed: false,
      datasetHash: datasetHash(),
      notes: "NO_TUNING_ON_BENCHMARK. Create research-dev-v1 for planner work. Do not reuse retrieval holdouts.",
    },
  }
  writeFileSync("/Users/yazilim/Projects/mathos/benchmarks/research-benchmark-governance.json", `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

export function validateDatasetSchema() {
  const ids = publicFixtures().map((item) => item.id)
  const statements = publicFixtures().map((item) => item.referenceFormalStatement.trim())
  const uniqueIds = new Set(ids).size === ids.length
  const uniqueStmt = new Set(statements).size === statements.length
  const solutionsCovered = publicFixtures().every((item) => RESEARCH_BENCHMARK_SOLUTIONS[item.id])
  const noProofLeak = !JSON.stringify(agentPayload(publicFixtures()[0]!)).includes("proofBody")
  const agentBlob = JSON.stringify(publicFixtures().map((item) => agentPayload(item)))
  const leakedProof = Object.values(RESEARCH_BENCHMARK_SOLUTIONS).some((sol) => sol.proofBody.length > 8 && agentBlob.includes(sol.proofBody))
  return {
    uniqueIds,
    uniqueStmt,
    solutionsCovered,
    noProofLeak: noProofLeak && !leakedProof,
    fixtureCount: ids.length,
    datasetHash: datasetHash(),
    ok: uniqueIds && uniqueStmt && solutionsCovered && noProofLeak && !leakedProof && ids.length >= 38,
  }
}

export async function validateLeanReferences(): Promise<{ statements: boolean; solutions: boolean; detail: string }> {
  const file = "/tmp/MathosBenchmarkV1Check.lean"
  const body = [
    "import Mathlib",
    "",
    ...publicFixtures().flatMap((fixture) => {
      const sol = RESEARCH_BENCHMARK_SOLUTIONS[fixture.id]
      return [`${fixture.referenceFormalStatement} := ${sol?.proofBody ?? "by\n  sorry"}`, ""]
    }),
  ].join("\n")
  writeFileSync(file, body)
  const proc = Bun.spawn(["lake", "env", "lean", file], { cwd: FORMAL_ROOT, stdout: "pipe", stderr: "pipe" })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { statements: code === 0, solutions: code === 0, detail: (stdout + stderr).slice(0, 1500) }
}

export function credentialsAvailable(): boolean {
  try {
    const config = resolveModelConfig("/Users/yazilim/Projects/mathos")
    return Boolean(config.apiKey && config.model)
  } catch {
    return false
  }
}

export { RESEARCH_BENCHMARK_FIXTURES, RESEARCH_BENCHMARK_TEAM_SUBSET, TIER_BUDGETS, TEAM_BUDGET }
