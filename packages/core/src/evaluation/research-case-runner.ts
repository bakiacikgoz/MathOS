import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NativeLeanAdapter } from "@mathos/lean"
import { createModelProvider, isModelReady, resolveModelConfig, type ModelProvider, type ModelRequest, type ModelResponse, type StructuredModelRequest } from "@mathos/models"
import { HybridPremiseRetriever } from "@mathos/retrieval"
import { MathOS } from "../mathos.ts"
import { ModelResearchPlanner } from "../research-planner.ts"
import type { RealResearchCase } from "./real-research-eval.ts"

export const REAL_RESEARCH_BUDGET = { maxSteps: 24, maxProofAttempts: 8, maxModelCalls: 18, maxLeanCalls: 16, maxWallClockMinutes: 15 } as const

export type RealCaseStatus = "COMPLETED" | "BLOCKED_CONFIGURATION" | "BLOCKED" | "TIMED_OUT" | "FAILED"
export interface RealResearchCaseResult {
  id: string; domain: string; difficulty: string; status: RealCaseStatus; reason: string | null
  kernelVerified: boolean; formalizationSucceeded: boolean; fidelityApprovalRequired: boolean; proofCompiled: boolean
  proofAttempts: number; modelCalls: number; leanCalls: number; wallClockMs: number
  environment: { realModel: boolean; realLean: boolean; realRetrieval: boolean; model: string | null; leanVersion: string | null }
}

class CountingProvider implements ModelProvider {
  calls = 0
  constructor(private readonly inner: ModelProvider) {}
  get id() { return this.inner.id }
  get model() { return this.inner.model }
  get capabilities() { return this.inner.capabilities }
  generate(request: ModelRequest): Promise<ModelResponse> { this.calls += 1; return this.inner.generate(request) }
  generateStructured<T>(request: StructuredModelRequest<T>): Promise<T> { this.calls += 1; return this.inner.generateStructured(request) }
}

const blocked = (item: RealResearchCase, reason: string, model: string | null, leanVersion: string | null): RealResearchCaseResult => ({
  id: item.id, domain: item.domain, difficulty: item.difficulty, status: "BLOCKED_CONFIGURATION", reason,
  kernelVerified: false, formalizationSucceeded: false, fidelityApprovalRequired: false, proofCompiled: false,
  proofAttempts: 0, modelCalls: 0, leanCalls: 0, wallClockMs: 0,
  environment: { realModel: false, realLean: false, realRetrieval: false, model, leanVersion },
})

export async function runRealResearchCase(item: RealResearchCase, options: { keepWorkspace?: boolean } = {}): Promise<RealResearchCaseResult> {
  const config = resolveModelConfig()
  if (!isModelReady(config)) return blocked(item, "MODEL_CONFIGURATION_MISSING", config.model || null, null)
  const lean = new NativeLeanAdapter()
  const detected = await lean.detect(process.cwd())
  if (!detected.leanAvailable || !detected.lakeAvailable) return blocked(item, "REAL_LEAN_UNAVAILABLE", config.model, detected.leanVersion)

  const container = mkdtempSync(join(tmpdir(), `mathos-real-${item.id}-`))
  const started = Date.now()
  let app: MathOS | null = null
  try {
    const created = await MathOS.init(container, "workspace")
    const setup = await lean.setupProject(created.root)
    if (setup.build === "FAIL") return blocked(item, `LEAN_PROJECT_SETUP_FAILED: ${setup.detail}`, config.model, detected.leanVersion)
    const retrieval = new HybridPremiseRetriever(created.root, () => [], lean)
    retrieval.build(detected.leanVersion)
    const provider = new CountingProvider(createModelProvider(config))
    app = MathOS.open(created.root, { modelProvider: provider, auditorProvider: provider, leanAdapter: lean, premiseRetriever: retrieval, researchPlanner: new ModelResearchPlanner(provider) })
    const claim = app.createClaim({ kind: "conjecture", title: item.id, statement: item.naturalStatement, asMainObjective: true })
    const formal = await app.formalize(claim.id)
    const fidelityApprovalRequired = formal.formalStatement.fidelityStatus !== "HUMAN_APPROVED"
    app.approveFormal(formal.formalStatement.id)
    const run = app.startResearch({ objectiveClaimId: claim.id, limits: { ...REAL_RESEARCH_BUDGET } })
    await app.runResearch(run.id)
    const finished = app.getResearch(run.id)
    const attempts = app.listProofs(claim.id)
    const verified = app.getClaim(claim.id).status === "KERNEL_VERIFIED"
    return {
      id: item.id, domain: item.domain, difficulty: item.difficulty,
      status: verified ? "COMPLETED" : finished.stopReason === "STEP_TIMEOUT" ? "TIMED_OUT" : finished.status === "BLOCKED" ? "BLOCKED" : "FAILED",
      reason: verified ? null : finished.stopReason,
      kernelVerified: verified, formalizationSucceeded: true, fidelityApprovalRequired,
      proofCompiled: attempts.some((attempt) => attempt.status === "KERNEL_ACCEPTED"),
      proofAttempts: attempts.length, modelCalls: provider.calls, leanCalls: finished.usage.leanCalls,
      wallClockMs: Date.now() - started,
      environment: { realModel: true, realLean: true, realRetrieval: true, model: provider.model, leanVersion: detected.leanVersion },
    }
  } catch (error) {
    return { ...blocked(item, error instanceof Error ? error.message : String(error), config.model, detected.leanVersion), status: "FAILED", wallClockMs: Date.now() - started, environment: { realModel: true, realLean: true, realRetrieval: true, model: config.model, leanVersion: detected.leanVersion } }
  } finally {
    app?.close()
    if (!options.keepWorkspace) rmSync(container, { recursive: true, force: true })
  }
}
