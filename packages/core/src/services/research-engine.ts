import { AsyncLocalStorage } from "node:async_hooks"
import {
  DEFAULT_COMPUTATIONAL_BUDGET,
  DEFAULT_RESEARCH_BUDGET,
  emptyResearchUsage,
  normalizeResearchUsage,
  nextPrefixedId,
  deterministicResearchSummary,
  classifyLeanFailure,
  type Claim,
  type FormalStatement,
  type ResearchBlockerType,
  type ResearchBudget,
  type ResearchDecision,
  type ResearchPlannerDescriptor,
  type ResearchRun,
  type ResearchStep,
  type ResearchStopReason,
} from "@mathos/domain"
import {
  ResearchRunRepository,
  ResearchStepRepository,
  ResearchBlockerRepository,
  ResearchDecisionRepository,
  RunPlannerRepository,
  type ResearchAgentRepository,
} from "@mathos/storage"
import type { ModelProvider } from "@mathos/models"
import { nowIso } from "@mathos/shared"
import { buildResearchContext } from "../research-context.ts"
import type { ResearchContextView } from "../research-planner.ts"
import { FakeResearchPlanner, ModelResearchPlanner, type ResearchPlanner } from "../research-planner.ts"
import { createPlannerFromDescriptor, plannerDescriptorFrom, PersistentScriptedPlanner } from "../planner-factory.ts"
import type { MutationRecorder } from "../mutation-recorder.ts"

type ActionResult = { artifacts: string[]; proofAttempts: number; failed: boolean; failureClass: import("@mathos/domain").FailureClass | null; summary: string }

export interface ResearchEngineDependencies {
  runs: ResearchRunRepository
  steps: ResearchStepRepository
  blockers: ResearchBlockerRepository
  decisions: ResearchDecisionRepository
  planners: RunPlannerRepository
  agents: ResearchAgentRepository
  modelProvider: ModelProvider
  defaultPlanner: ResearchPlanner | null
  requireWorkspace: () => { id: string; mainObjectiveId: string | null }
  requireCurrentBranch: () => { id: string }
  switchBranch: (id: string) => unknown
  getBranchName: (id: string) => string
  getClaim: (id: string) => Claim
  listVisibleClaims: (branchId: string) => Claim[]
  currentFormal: (claimId: string) => FormalStatement | null
  graphContext: (run: ResearchRun, worker: ReturnType<ResearchAgentRepository["getByRun"]>) => ResearchContextView["graph"]
  digestVerifiedFindings: (worker: NonNullable<ReturnType<ResearchAgentRepository["getByRun"]>>) => Array<{ claimId: string; branchId: string; title: string }>
  consumeModelBudget: (kind: "planner" | "proof" | "formalization") => boolean
  consumeProofBudget: () => boolean
  recorder: MutationRecorder
  crashHook: ((point: "before_mutation" | "after_mutation" | "after_event", action: string) => void) | null
  searchPremises: (claimId: string) => Promise<{ candidates: Array<{ declaration: { name: string } }> }>
  createSubclaim: (input: { title: string; statement: string }) => Claim
  addDependency: (from: string, to: string) => unknown
  attemptProof: (claimId: string, proofBody?: string) => Promise<{ accepted: { id: string } | null; attempts: Array<{ diagnostics: Array<{ message: string }> }> }>
  verify: (claimId: string) => Promise<{ passed: boolean }>
  createExperiment: (input: Record<string, unknown>) => Promise<{ id: string }>
  runExperiment: (id: string, options: { stepId: string; timeoutMs: number }) => Promise<{ id: string; outcome: string }>
  searchLiterature: (query: string, options: Record<string, unknown>) => Promise<{ id: string; resultCount: number }>
  inspectSource: (sourceId: string) => unknown
}

export class ResearchEngine {
  private accounting: ResearchRun | null = null
  private readonly runAccounting = new AsyncLocalStorage<ResearchRun>()
  private readonly abortStorage = new AsyncLocalStorage<AbortSignal>()
  private readonly runPlanners = new Map<string, ResearchPlanner>()
  readonly lastPlannerContextByRun = new Map<string, ResearchContextView>()

  constructor(private readonly d: ResearchEngineDependencies) {}

  currentAccounting(): ResearchRun | null { return this.runAccounting.getStore() ?? this.accounting }
  currentAbortSignal(): AbortSignal | undefined { return this.abortStorage.getStore() }
  withAbortSignal<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> { return this.abortStorage.run(signal, operation) }

  start(input: { objectiveClaimId?: string; limits?: Partial<ResearchBudget> } = {}): ResearchRun {
    const workspace = this.d.requireWorkspace()
    const branch = this.d.requireCurrentBranch()
    const objectiveId = input.objectiveClaimId ?? workspace.mainObjectiveId
    if (!objectiveId) throw new Error("Research requires an objective claim.")
    const existing = this.d.runs.activeOnBranch(workspace.id, branch.id, objectiveId)
    if (existing && (existing.status === "RUNNING" || existing.status === "READY")) throw new Error("ACTIVE_RESEARCH_RUN_EXISTS")
    const timestamp = nowIso()
    const run: ResearchRun = {
      id: nextPrefixedId(this.d.runs.ids(workspace.id), "R"), workspaceId: workspace.id, branchId: branch.id,
      objectiveClaimId: objectiveId, status: "READY", startedAt: null, stoppedAt: null, currentStep: 0,
      limits: { ...DEFAULT_RESEARCH_BUDGET, ...input.limits }, usage: emptyResearchUsage(), stopReason: null,
      strategy: { focusClaimId: objectiveId, exhaustedApproaches: [], activeBlockerIds: [] }, agentId: null,
      createdAt: timestamp, updatedAt: timestamp,
    }
    this.d.recorder.mutate("research_run_created", { target: run.id, metadata: { runId: run.id, branchId: branch.id, objectiveClaimId: objectiveId } }, () => this.d.runs.insert(run))
    return run
  }

  get(id: string): ResearchRun {
    const run = this.d.runs.get(id.toUpperCase())
    if (!run) throw new Error(`Research run ${id} was not found.`)
    return run
  }
  history(id: string): ResearchStep[] { return this.d.steps.list(this.get(id).id) }
  summary(id: string): string {
    const run = this.get(id); const claims = this.d.listVisibleClaims(run.branchId)
    return deterministicResearchSummary({ run, createdClaims: claims.filter(c => c.createdAt >= run.createdAt).length,
      verifiedLemmas: claims.filter(c => c.status === "KERNEL_VERIFIED").length,
      openBlockers: this.d.blockers.open(run.branchId).length, currentApproach: run.strategy.currentApproach })
  }
  trace(id: string): string {
    const run = this.get(id)
    return [run.id, "", ...this.history(id).map(s => `${s.id} ${s.action.padEnd(18)} ${s.status}`), "", "STOP", run.stopReason ?? run.status].join("\n")
  }
  answer(runId: string, blockerId: string, text: string) {
    const run = this.get(runId); const blocker = this.d.blockers.get(blockerId.toUpperCase())
    if (!blocker) throw new Error(`Blocker ${blockerId} was not found.`)
    this.d.recorder.mutate("research_blocker_resolved", { target: blocker.id, metadata: { runId: run.id, branchId: run.branchId, human: true } }, () => this.d.blockers.answer(blocker.id, text, nowIso()))
    return this.d.blockers.get(blocker.id)
  }
  latest(): ResearchRun | null { const last = this.d.runs.ids(this.d.requireWorkspace().id).at(-1); return last ? this.get(last) : null }
  pause(id: string): ResearchRun {
    const run = this.get(id); run.status = "PAUSED"; run.stopReason = "USER_PAUSED"; run.stoppedAt = nowIso(); run.updatedAt = run.stoppedAt
    this.d.recorder.mutate("research_run_paused", { target: run.id, metadata: { runId: run.id, branchId: run.branchId } }, () => this.d.runs.update(run)); return run
  }
  resume(id: string): ResearchRun {
    const run = this.get(id)
    this.d.recorder.mutate("research_run_resumed", { target: run.id, metadata: { runId: run.id, branchId: run.branchId } }, () => {
      for (const step of this.d.steps.interrupted(run.id)) { step.status = "INTERRUPTED"; step.finishedAt = nowIso(); this.d.steps.update(step) }
      run.status = "READY"; run.stopReason = null; run.stoppedAt = null; run.updatedAt = nowIso(); this.d.runs.update(run)
    }); return run
  }

  async step(id: string): Promise<ResearchRun> {
    const run = this.get(id)
    if (run.status === "COMPLETED" || run.status === "CANCELLED") return run
    if (run.usage.steps >= run.limits.maxSteps) return this.stop(run, "STEP_BUDGET_EXHAUSTED")
    const worker = this.d.agents.getByRun(run.id)
    if (run.usage.modelCalls >= run.limits.maxModelCalls) return this.stop(run, worker ? "LOCAL_MODEL_BUDGET_EXHAUSTED" : "MODEL_CALL_BUDGET_EXHAUSTED")
    if (run.usage.proofAttempts >= run.limits.maxProofAttempts) return this.stop(run, worker ? "LOCAL_PROOF_BUDGET_EXHAUSTED" : "PROOF_ATTEMPT_BUDGET_EXHAUSTED")
    if (run.usage.leanCalls >= run.limits.maxLeanCalls) return this.stop(run, worker ? "LOCAL_LEAN_BUDGET_EXHAUSTED" : "LEAN_CALL_BUDGET_EXHAUSTED")
    const previous = this.d.requireCurrentBranch()
    if (previous.id !== run.branchId) this.d.switchBranch(run.branchId)
    this.accounting = run
    try {
      return await this.runAccounting.run(run, async () => {
        try {
          const objective = run.objectiveClaimId ? this.d.getClaim(run.objectiveClaimId) : null
          if (objective?.status === "KERNEL_VERIFIED") return this.stop(run, "OBJECTIVE_KERNEL_VERIFIED", "COMPLETED")
          const formal = objective ? this.d.currentFormal(objective.id) : null
          const steps = this.d.steps.list(run.id)
          const context = buildResearchContext({ run, objective, branchName: this.d.getBranchName(run.branchId), claims: this.d.listVisibleClaims(run.branchId),
            blockers: this.d.blockers.open(run.branchId).map(b => ({ id: b.id, summary: b.summary, type: b.type })), steps,
            lastFailure: steps.filter(s => s.status === "FAILED").at(-1)?.summary ?? undefined,
            fidelityBlocked: formal?.fidelityStatus === "REJECTED" || String(formal?.fidelityStatus) === "MISMATCH",
            digestVerifiedFindings: worker ? this.d.digestVerifiedFindings(worker) : [], graph: this.d.graphContext(run, worker) })
          this.lastPlannerContextByRun.set(run.id, context)
          if (!this.d.consumeModelBudget("planner")) return this.stop(run, worker ? "LOCAL_MODEL_BUDGET_EXHAUSTED" : "MODEL_CALL_BUDGET_EXHAUSTED")
          let decision: ResearchDecision
          try {
            const stored = this.d.planners.get(run.id)
            if (stored && !this.runPlanners.has(run.id)) this.restoreOnePlanner(run.id, stored.descriptor, stored.cursor)
            const active = this.runPlanners.get(run.id) ?? this.defaultPlanner()
            if (stored && !this.runPlanners.has(run.id)) return this.stop(run, "PLANNER_UNAVAILABLE")
            decision = await active.decideNextAction(context)
            decision.parameters = { ...decision.parameters, graphRevision: context.graph?.graphRevision, graphContextHash: context.graph?.graphContextHash }
          } catch (error) {
            if (error instanceof Error && error.message === "INVALID_PLANNER_DECISION") return this.stop(run, "INVALID_PLANNER_DECISION")
            throw error
          }
          if (decision.stop?.shouldStop) {
            const reason = (decision.stop.reason as ResearchStopReason) ?? "NO_PRODUCTIVE_ACTION"
            if (reason === "OBJECTIVE_KERNEL_VERIFIED" && (!run.objectiveClaimId || this.d.getClaim(run.objectiveClaimId).status !== "KERNEL_VERIFIED")) return this.stop(run, "NO_PRODUCTIVE_ACTION")
            return this.stop(run, reason)
          }
          const target = decision.targetClaimId ?? run.strategy.focusClaimId ?? run.objectiveClaimId ?? ""
          if (steps.filter(s => s.action === decision.action && s.status === "FAILED" && (s.inputArtifactIds[0] ?? "") === target).length >= 3) {
            this.createBlocker(run, "REPETITION", "REPETITION_DETECTED", decision.targetClaimId ?? run.objectiveClaimId); return this.stop(run, "REPETITION_DETECTED")
          }
          return await this.executeDecision(run, decision)
        } catch (error) {
          const message = error instanceof Error ? error.message : ""
          if (message === "LEAN_CALL_BUDGET_EXHAUSTED") return this.stop(run, worker ? "LOCAL_LEAN_BUDGET_EXHAUSTED" : "LEAN_CALL_BUDGET_EXHAUSTED")
          if (message === "PROOF_ATTEMPT_BUDGET_EXHAUSTED") return this.stop(run, worker ? "LOCAL_PROOF_BUDGET_EXHAUSTED" : "PROOF_ATTEMPT_BUDGET_EXHAUSTED")
          if (["GLOBAL_PROOF_BUDGET_EXHAUSTED", "GLOBAL_LEAN_BUDGET_EXHAUSTED", "GLOBAL_MODEL_BUDGET_EXHAUSTED"].includes(message)) return run
          throw error
        }
      })
    } finally { this.accounting = null; if (previous.id !== this.d.requireCurrentBranch().id) this.d.switchBranch(previous.id) }
  }

  async run(id: string): Promise<ResearchRun> {
    let run = this.get(id); run.status = "RUNNING"; run.startedAt = run.startedAt ?? nowIso()
    this.d.recorder.mutate("research_run_started", { target: id, metadata: { runId: id } }, () => this.d.runs.update(run))
    while (["READY", "RUNNING"].includes(this.get(id).status)) { run = await this.step(id); if (!['RUNNING','READY'].includes(run.status)) break }
    return this.get(id)
  }

  stop(run: ResearchRun, reason: ResearchStopReason, status: ResearchRun["status"] = "BLOCKED"): ResearchRun {
    run.status = reason === "OBJECTIVE_KERNEL_VERIFIED" ? "COMPLETED" : status; run.stopReason = reason; run.stoppedAt = nowIso(); run.updatedAt = run.stoppedAt
    this.d.recorder.mutate(run.status === "COMPLETED" ? "research_run_completed" : "research_run_blocked", { target: run.id, metadata: { runId: run.id, branchId: run.branchId, reason } }, () => this.d.runs.update(run)); return run
  }
  private createBlocker(run: ResearchRun, type: ResearchBlockerType, summary: string, claimId: string | null, stepId?: string) {
    const blocker = { id: nextPrefixedId(this.d.blockers.ids(), "BL"), workspaceId: run.workspaceId, branchId: run.branchId, claimId, type, status: "OPEN" as const,
      summary, createdByStepId: stepId ?? null, resolvedByStepId: null, humanResponse: null, resolvedByHumanAt: null, createdAt: nowIso() }
    this.d.recorder.mutate("research_blocker_created", { target: blocker.id, metadata: { runId: run.id, branchId: run.branchId } }, () => this.d.blockers.insert(blocker)); return blocker
  }

  private async executeDecision(run: ResearchRun, decision: ResearchDecision): Promise<ResearchRun> {
    const sequence = run.currentStep + 1, key = `${run.id}:${sequence}`, existing = this.d.steps.getByKey(key)
    if (existing && existing.status !== "RUNNING" && existing.status !== "INTERRUPTED") return run
    const timestamp = nowIso(); const step: ResearchStep = existing ?? { id: nextPrefixedId(this.d.steps.ids(), "RS"), runId: run.id, branchId: run.branchId, sequence,
      action: decision.action, inputArtifactIds: [decision.targetClaimId ?? run.objectiveClaimId ?? ""], resultArtifactIds: [], status: "RUNNING", idempotencyKey: key,
      startedAt: timestamp, finishedAt: null, summary: decision.rationaleSummary, failureClass: null, createdAt: timestamp }
    if (!existing) this.d.recorder.mutate("research_step_started", { target: step.id, metadata: { runId: run.id, branchId: run.branchId, action: step.action } }, () => this.d.steps.insert(step))
    else if (existing.status === "INTERRUPTED" && existing.resultArtifactIds.length) { existing.status = "SUCCEEDED"; this.d.steps.update(existing); run.currentStep = sequence; this.d.runs.update(run); return run }
    else this.d.recorder.record("research_step_started", { target: step.id, metadata: { runId: run.id, branchId: run.branchId, action: step.action } })
    this.d.crashHook?.("after_event", decision.action)
    const focus = decision.targetClaimId ?? run.strategy.focusClaimId ?? run.objectiveClaimId
    if (focus && focus !== run.strategy.focusClaimId) { run.strategy.focusClaimId = focus; this.d.recorder.record("research_focus_changed", { target: run.id, metadata: { runId: run.id, branchId: run.branchId, focus } }) }
    try {
      this.d.crashHook?.("before_mutation", decision.action); const result = await this.dispatchAction(run, step, decision); step.resultArtifactIds = result.artifacts
      step.status = result.failed ? "FAILED" : "SUCCEEDED"; step.summary = result.summary; step.failureClass = result.failureClass; step.finishedAt = nowIso()
      run.currentStep = sequence; run.usage = normalizeResearchUsage(run.usage); run.usage.steps += 1; run.usage.proofAttempts += result.proofAttempts; run.updatedAt = nowIso()
      run.status = "RUNNING"
      this.d.recorder.mutate("research_step_completed", { target: step.id, metadata: { runId: run.id, branchId: run.branchId } }, () => {
        this.d.steps.update(step)
        if (decision.rationaleSummary && /abandon|switch/i.test(decision.rationaleSummary)) this.d.decisions.insert({ id: nextPrefixedId(this.d.decisions.ids(), "DEC"), runId: run.id, branchId: run.branchId, summary: decision.rationaleSummary, createdAt: nowIso() })
        this.d.runs.update(run)
      })
      this.d.crashHook?.("after_mutation", decision.action)
      if (run.objectiveClaimId && this.d.getClaim(run.objectiveClaimId).status === "KERNEL_VERIFIED") return this.stop(run, "OBJECTIVE_KERNEL_VERIFIED", "COMPLETED")
      if (decision.action === "STOP" || decision.action === "REQUEST_HUMAN") return this.stop(run, decision.action === "REQUEST_HUMAN" ? "BLOCKED_NEEDS_HUMAN" : "NO_PRODUCTIVE_ACTION")
      return run
    } catch (error) {
      if (error instanceof Error && error.message === "crash") { this.d.steps.update(step); throw error }
      step.status = "FAILED"; step.summary = error instanceof Error ? error.message : "execution failure"; step.finishedAt = nowIso(); run.currentStep = sequence; run.usage.steps += 1
      this.d.recorder.mutate("research_step_failed", { target: step.id, metadata: { runId: run.id, branchId: run.branchId } }, () => this.d.steps.update(step)); return this.stop(run, "EXECUTION_FAILURE", "FAILED")
    }
  }

  private async dispatchAction(run: ResearchRun, step: ResearchStep, decision: ResearchDecision): Promise<ActionResult> {
    const target = decision.targetClaimId ?? run.strategy.focusClaimId ?? run.objectiveClaimId; const artifacts: string[] = []; let proofAttempts = 0; let failed = false
    let failureClass: import("@mathos/domain").FailureClass | null = null; let summary = decision.rationaleSummary
    if (decision.action === "ANALYZE_GOAL") summary = target ? `Analyzed ${target}` : "Analyzed objective"
    else if (decision.action === "SEARCH_PREMISES" && target) { const result = await this.d.searchPremises(target); artifacts.push(...result.candidates.slice(0, 8).map(i => i.declaration.name)); summary = `Retrieved ${result.candidates.length} premises` }
    else if (decision.action === "DECOMPOSE_GOAL") summary = `Decompose ${target}`
    else if (decision.action === "CREATE_SUBCLAIM") { this.d.crashHook?.("before_mutation", "CREATE_SUBCLAIM"); const created = this.d.createSubclaim({ title: String(decision.parameters.title ?? "Auxiliary lemma"), statement: String(decision.parameters.statement ?? "Auxiliary obligation.") }); if (run.objectiveClaimId) this.d.addDependency(created.id, run.objectiveClaimId); artifacts.push(created.id); run.strategy.focusClaimId = created.id; summary = `Created ${created.id}` }
    else if (decision.action === "ATTEMPT_PROOF" && target) { if (!this.d.consumeProofBudget()) throw new Error("PROOF_ATTEMPT_BUDGET_EXHAUSTED"); if (!decision.parameters.proofBody && !this.d.consumeModelBudget("proof")) throw new Error("MODEL_CALL_BUDGET_EXHAUSTED"); const session = await this.d.attemptProof(target, decision.parameters.proofBody ? String(decision.parameters.proofBody) : undefined); proofAttempts += session.attempts.length; const last = session.attempts.at(-1); if (!session.accepted) { failed = true; failureClass = classifyLeanFailure(last?.diagnostics.map(i => i.message) ?? []); summary = `Proof failed (${failureClass})` } else { artifacts.push(session.accepted.id); summary = "Proof kernel accepted" } }
    else if (decision.action === "VERIFY" && target) { const report = await this.d.verify(target); summary = report.passed ? "Verification PASS" : "Verification FAIL"; failed = !report.passed }
    else if (decision.action === "INSPECT_FAILURE") { const b = this.createBlocker(run, "LEAN_ERROR", String(decision.parameters.summary ?? "Inspected proof failure"), target ?? null, step.id); artifacts.push(b.id); summary = `Blocker ${b.id}` }
    else if (decision.action === "RECORD_BLOCKER") { const b = this.createBlocker(run, "UNKNOWN", String(decision.parameters.summary ?? "Recorded blocker"), target ?? null, step.id); artifacts.push(b.id) }
    else if (decision.action === "REQUEST_HUMAN") { this.createBlocker(run, "NEEDS_HUMAN_JUDGMENT", decision.rationaleSummary || "Needs human judgment", target ?? null, step.id); summary = "REQUEST_HUMAN" }
    else if (decision.action === "RUN_EXPERIMENT") { const created = await this.d.createExperiment({ origin: "MODEL_GENERATED", kind: String(decision.parameters.kind ?? "FINITE_VERIFICATION"), claimId: target ?? run.objectiveClaimId ?? undefined, hypothesis: String(decision.parameters.hypothesis ?? decision.rationaleSummary ?? ""), code: decision.parameters.code ? String(decision.parameters.code) : undefined, parameters: decision.parameters, runId: run.id, agentId: run.agentId ?? undefined }); const er = await this.d.runExperiment(created.id, { stepId: step.id, timeoutMs: Number(decision.parameters.timeoutMs ?? DEFAULT_COMPUTATIONAL_BUDGET.maxWallClockMsPerExperiment) }); artifacts.push(created.id, er.id); run.usage.experiments += 1; run.usage.computationCalls += 1; summary = `RUN_EXPERIMENT ${created.id} ${er.outcome}`; failed = er.outcome === "EXECUTION_FAILED" }
    else if (decision.action === "SEARCH_LITERATURE") { const query = String(decision.parameters.query ?? decision.parameters.text ?? ""); if (!query.trim()) throw new Error("LITERATURE_QUERY_REQUIRED"); const search = await this.d.searchLiterature(query, { claimId: target ?? run.objectiveClaimId ?? undefined, runId: run.id, stepId: step.id, agentId: run.agentId ?? undefined }); artifacts.push(search.id); run.usage.literatureSearches += 1; summary = `SEARCH_LITERATURE ${search.id} ${search.resultCount} hits` }
    else if (decision.action === "INSPECT_SOURCE") { const sourceId = String(decision.parameters.sourceId ?? ""); this.d.inspectSource(sourceId); run.usage.sourceInspections += 1; artifacts.push(sourceId); summary = `INSPECT_SOURCE ${sourceId}` }
    else if (decision.action === "STOP") summary = "STOP"
    return { artifacts, proofAttempts, failed, failureClass, summary }
  }

  registerPlanner(runId: string, planner: ResearchPlanner): void {
    const remaining = planner instanceof FakeResearchPlanner || planner instanceof PersistentScriptedPlanner ? planner.remaining() : []
    const descriptor = plannerDescriptorFrom(planner); if (descriptor.kind === "SCRIPTED") descriptor.config.steps = remaining; descriptor.config.cursor = 0
    this.d.planners.upsert(runId, descriptor, 0, nowIso()); this.restoreOnePlanner(runId, descriptor, 0)
  }
  restorePersistentPlanners(): void { try { for (const row of this.d.planners.list()) this.restoreOnePlanner(row.runId, row.descriptor, row.cursor) } catch {} }
  private defaultPlanner(): ResearchPlanner { return this.d.defaultPlanner ?? new ModelResearchPlanner(this.d.modelProvider) }
  private restoreOnePlanner(runId: string, descriptor: ResearchPlannerDescriptor, cursor: number) {
    try { const persist = (next: number) => { const copy = { ...descriptor, config: { ...descriptor.config, cursor: next } }; this.d.planners.upsert(runId, copy, next, nowIso()) }; this.runPlanners.set(runId, createPlannerFromDescriptor({ ...descriptor, config: { ...descriptor.config, cursor } }, { modelProvider: this.d.modelProvider, persist })) }
    catch { this.runPlanners.delete(runId) }
  }
}
