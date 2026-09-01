import { join } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import {
  DEFAULT_MULTI_AGENT_BUDGET,
  DEFAULT_MAX_PARALLEL_WORKERS,
  HARD_MAX_PARALLEL_WORKERS,
  assignmentDiversity,
  fallbackAssignmentPlan,
  nextPrefixedId,
  nextRoundId,
  nextSequentialId,
  type MultiAgentBudget,
  type MultiAgentExecutionMode,
  type MultiAgentResearchSession,
  type ResearchAgentWorker,
  type SharedResearchDigest,
  type Claim,
  type MultiAgentRound,
  type SolutionCandidate,
  type VerifiedArtifactImport,
  type ImportPreview,
  type ResearchRun,
  type ResearchStep,
  type ResearchBranch,
  type MergePreview,
  type ProofAttempt,
  type VerificationReport,
} from "@mathos/domain"
import { createId, nowIso } from "@mathos/shared"
import {
  ArtifactImportRepository,
  MultiAgentRoundRepository,
  MultiAgentSessionRepository,
  ResearchAgentRepository,
  SharedDigestRepository,
  SolutionCandidateRepository,
  DatabaseClient,
  ClaimRepository,
  DependencyRepository,
  FormalStatementRepository,
  VerificationRunRepository,
  ProofAttemptRepository,
  ResearchBlockerRepository,
} from "@mathos/storage"
import { FakeMultiAgentPlanner } from "../multi-agent-planner.ts"
import type { MultiAgentPlanner } from "../multi-agent-planner.ts"
import type { ResearchPlanner } from "../research-planner.ts"
import type { ResearchEngine } from "./research-engine.ts"
import type { MutationRecorder } from "../mutation-recorder.ts"

export interface TeamResearchStores {
  sessions: MultiAgentSessionRepository
  agents: ResearchAgentRepository
  rounds: MultiAgentRoundRepository
  solutions: SolutionCandidateRepository
  digests: SharedDigestRepository
  imports: ArtifactImportRepository
}

/** Explicit capability boundary between team orchestration and the MathOS facade. */
export interface TeamResearchCoordinatorDependencies {
  root: string
  client: DatabaseClient
  claims: ClaimRepository
  dependencies: DependencyRepository
  formalStatements: FormalStatementRepository
  verificationRuns: VerificationRunRepository
  proofs: ProofAttemptRepository
  researchEngine: ResearchEngine
  multiAgentPlanner: MultiAgentPlanner | null
  maxStepWallClockMs: number
  teamCrashAfterAgent: string | null
  teamCrashAt: string | null
  teamCrashBoundary: string | null
  teamCrashTwoRunning: boolean
  abandonBranch: (id: string) => unknown
  allocateId: (prefix: string) => string
  createBranch: (name: string, goal?: string) => Promise<ResearchBranch>
  createClaim: (input: { kind: string; title: string; naturalStatement?: string; statement?: string; status?: string; asMainObjective?: boolean }) => Claim
  getBranch: (id: string) => ResearchBranch
  getClaim: (id: string) => Claim
  getResearch: (id: string) => ResearchRun
  previewMerge: (id: string) => MergePreview
  recorder: MutationRecorder
  registerRunPlanner: (runId: string, planner: ResearchPlanner) => unknown
  requireCurrentBranch: () => ResearchBranch
  requireWorkspace: () => { id: string; mainObjectiveId: string | null }
  researchHistory: (id: string) => ResearchStep[]
  researchStores: () => { blockers: ResearchBlockerRepository }
  startResearch: (input: { objectiveClaimId?: string; limits?: Partial<import("@mathos/domain").ResearchBudget> }) => ResearchRun
  stepResearch: (id: string) => Promise<ResearchRun>
  stopRun: (run: ResearchRun, reason: import("@mathos/domain").ResearchStopReason, status?: ResearchRun["status"]) => ResearchRun
  storeAttempt: (workspaceId: string, claimId: string, formalId: string, attemptNumber: number, proofSource: string, status: ProofAttempt["status"], leanVersion: string | null, diagnostics: ProofAttempt["diagnostics"]) => ProofAttempt
  switchBranch: (id: string) => unknown
  verify: (claimId: string) => Promise<VerificationReport>
}

export interface TeamResearchOverview {
  session: MultiAgentResearchSession
  agents: Array<{
    agent: ResearchAgentWorker
    run: ResearchRun
    localStatus: Claim["status"]
    verified: boolean
    recentSteps: ResearchStep[]
  }>
  imports: VerifiedArtifactImport[]
  solutions: SolutionCandidate[]
  digest: SharedResearchDigest | null
}

export class TeamResearchCoordinator {
  private readonly teamPauseRequested = new Set<string>()
  private readonly teamCancelRequested = new Set<string>()
  readonly parallelTimings: Array<{ agentId: string; start: number; end: number }> = []
  peakConcurrency = 0
  private liveLeases = 0
  private readonly frozenDigestBySession = new Map<string, SharedResearchDigest | null>()

  constructor(private readonly d: TeamResearchCoordinatorDependencies) {}

  digestForSession(sessionId: string): SharedResearchDigest | null {
    return this.frozenDigestBySession.get(sessionId) ?? null
  }

  private teamStores(): TeamResearchStores {
    return {
      sessions: new MultiAgentSessionRepository(this.d.client.db),
      agents: new ResearchAgentRepository(this.d.client.db),
      rounds: new MultiAgentRoundRepository(this.d.client.db),
      solutions: new SolutionCandidateRepository(this.d.client.db),
      digests: new SharedDigestRepository(this.d.client.db),
      imports: new ArtifactImportRepository(this.d.client.db),
    }
  }

  stores(): TeamResearchStores { return this.teamStores() }

  getTeam(id: string): MultiAgentResearchSession {
    const session = this.teamStores().sessions.get(id.toUpperCase())
    if (!session) throw new Error(`Team session ${id} was not found.`)
    return session
  }

  listTeamSessions(): MultiAgentResearchSession[] {
    return this.teamStores().sessions.ids(this.d.requireWorkspace().id).map((id) => this.getTeam(id))
  }

  teamAgents(sessionId: string): ResearchAgentWorker[] {
    return this.teamStores().agents.list(this.getTeam(sessionId).id)
  }

  teamSolutions(sessionId: string): SolutionCandidate[] {
    return this.teamStores().solutions.list(this.getTeam(sessionId).id)
  }

  teamHistory(sessionId: string): MultiAgentRound[] {
    return this.teamStores().rounds.list(this.getTeam(sessionId).id)
  }

  teamDigest(sessionId: string, round?: number): SharedResearchDigest | null {
    const session = this.getTeam(sessionId)
    return this.teamStores().digests.get(session.id, round ?? session.currentRound)
  }

  async startTeam(input: { planners?: ResearchPlanner[]; limits?: Partial<MultiAgentBudget>; workerLimits?: Array<Partial<import("@mathos/domain").ResearchBudget>>; executionMode?: MultiAgentExecutionMode; maxParallelWorkers?: number } = {}): Promise<MultiAgentResearchSession> {
    const workspace = this.d.requireWorkspace()
    const source = this.d.requireCurrentBranch()
    const mode = input.executionMode ?? "SEQUENTIAL"
    if (mode !== "SEQUENTIAL" && mode !== "BOUNDED_PARALLEL") throw new Error("INVALID_EXECUTION_MODE")
    const parallel = input.maxParallelWorkers ?? DEFAULT_MAX_PARALLEL_WORKERS
    if (!Number.isInteger(parallel) || parallel < 1 || parallel > HARD_MAX_PARALLEL_WORKERS) throw new Error("INVALID_PARALLEL_WORKERS")
    const objectiveId = workspace.mainObjectiveId
    if (!objectiveId) throw new Error("Team research requires an objective claim.")
    const stores = this.teamStores()
    const timestamp = nowIso()
    const sessionId = nextPrefixedId(stores.sessions.ids(workspace.id), "MR")
    const planner = this.d.multiAgentPlanner ?? new FakeMultiAgentPlanner()
    let plan = await planner.planAssignments(objectiveId)
    const diversity = assignmentDiversity(plan)
    if (!diversity.ok) plan = { ...fallbackAssignmentPlan(objectiveId), warning: "LOW_ASSIGNMENT_DIVERSITY" }
    const created: ResearchAgentWorker[] = []
    try {
      for (const assignment of plan.assignments.slice(0, input.limits?.maxAgents ?? DEFAULT_MULTI_AGENT_BUDGET.maxAgents)) {
        this.d.switchBranch(source.id)
        const agentId = nextPrefixedId(stores.agents.ids(), "A")
        const branch = await this.d.createBranch(`${sessionId.toLowerCase()}-${assignment.approach.toLowerCase()}`, assignment.goalSummary)
        this.d.switchBranch(branch.id)
        const local = this.cloneObjectiveForWorker(objectiveId, agentId)
        const localLimits = input.workerLimits?.[created.length] ?? {}
        const run = this.d.startResearch({
          objectiveClaimId: local.id,
          limits: { maxSteps: localLimits.maxSteps ?? 8, maxProofAttempts: localLimits.maxProofAttempts ?? 4, maxModelCalls: localLimits.maxModelCalls ?? 10, maxLeanCalls: localLimits.maxLeanCalls ?? 6 },
        })
        const workerPlanner = input.planners?.[created.length]
        if (workerPlanner) this.d.registerRunPlanner(run.id, workerPlanner)
        const note = join(branch.worktreePath ?? join(this.d.root, "research"), `${agentId}.lean`)
        mkdirSync(join(note, ".."), { recursive: true })
        writeFileSync(note, `-- ${agentId} ${assignment.role}\ntheorem ${agentId.replace("-", "").toLowerCase()}_note : True := trivial\n`, "utf8")
        const worker: ResearchAgentWorker = {
          id: agentId,
          sessionId,
          role: assignment.role,
          branchId: branch.id,
          researchRunId: run.id,
          localClaimId: local.id,
          status: "READY",
          assignment: {
            objectiveClaimId: objectiveId,
            targetClaimId: local.id,
            role: assignment.role,
            goalSummary: assignment.goalSummary,
            approach: assignment.approach,
            sourceArtifactIds: [objectiveId],
          },
          createdAt: timestamp,
        }
        this.d.recorder.mutate("agent_created", { target: agentId, metadata: { sessionId, agentId, branchId: branch.id } }, () => stores.agents.insert(worker))
        created.push(worker)
      }
    } catch (error) {
      for (const worker of created) {
        try { this.d.abandonBranch(worker.branchId) } catch { /* ignore */ }
      }
      throw error
    }
    this.d.switchBranch(source.id)
    const session: MultiAgentResearchSession = {
      id: sessionId,
      workspaceId: workspace.id,
      sourceBranchId: source.id,
      sourceRevision: null,
      objectiveClaimId: objectiveId,
      status: "READY",
      strategy: "DIVERSE_BRANCHES",
      limits: { ...DEFAULT_MULTI_AGENT_BUDGET, ...input.limits, maxAgents: Math.min(5, input.limits?.maxAgents ?? DEFAULT_MULTI_AGENT_BUDGET.maxAgents) },
      usage: { rounds: 0, steps: 0, modelCalls: 0, leanCalls: 0, proofAttempts: 0 },
      currentRound: 0,
      sourceStale: false,
      executionMode: mode,
      maxParallelWorkers: parallel,
      createdAt: timestamp,
      startedAt: null,
      stoppedAt: null,
      stopReason: null,
    }
    this.d.recorder.mutate("multi_agent_session_created", { target: session.id, metadata: { sessionId: session.id, branchId: source.id } }, () => stores.sessions.insert(session))
    return session
  }

  private async executeAgentRoundStep(session: MultiAgentResearchSession, sequence: number, agent: ResearchAgentWorker) {
    const stores = this.teamStores()
    const before = this.d.getResearch(agent.researchRunId)
    const active = this.d.client.db.query<{ lease_id: string }, [string]>("SELECT lease_id FROM execution_leases WHERE run_id = ? AND status IN ('RESERVED','RUNNING')").get(agent.researchRunId)
    if (active) throw new Error("WORKER_ALREADY_EXECUTING")
    const leaseId = createId("lease")
    this.d.recorder.mutate("agent_round_step_started", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId, leaseId } }, () => {
      this.d.client.db.query(
        "INSERT INTO execution_leases (lease_id, session_id, agent_id, run_id, branch_id, round_sequence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(leaseId, session.id, agent.id, agent.researchRunId, agent.branchId, sequence, "RUNNING", nowIso())
    })
    this.liveLeases += 1
    this.peakConcurrency = Math.max(this.peakConcurrency, this.liveLeases)
    const start = Date.now()
    if (this.d.teamCrashAfterAgent === agent.id) throw new Error("crash")
    if (this.d.teamCrashTwoRunning) {
      const n = this.d.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE session_id = ? AND status = 'RUNNING'").get(session.id)
      if (n && n.n >= 2) throw new Error("crash")
    }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.d.maxStepWallClockMs)
    try {
      const after = await this.d.researchEngine.withAbortSignal(ac.signal, async () => {
        let done = false
        try {
          return await Promise.race([
            this.d.stepResearch(agent.researchRunId).finally(() => { done = true }),
            new Promise<never>((_, reject) => {
              ac.signal.addEventListener("abort", () => { if (!done) reject(new Error("STEP_TIMEOUT")) })
            }),
          ])
        } finally {
          done = true
        }
      })
      const fresh = this.getTeam(session.id)
      fresh.usage.steps += Math.max(0, after.usage.steps - before.usage.steps)
      agent.status = after.status === "BLOCKED" || after.status === "FAILED" ? "BLOCKED" : "RUNNING"
      if (after.stopReason === "BLOCKED_NEEDS_HUMAN" || after.stopReason === "STEP_TIMEOUT") agent.status = "BLOCKED"
      this.d.recorder.mutate("agent_round_step_completed", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId } }, () => {
        this.d.client.db.query("INSERT OR IGNORE INTO agent_round_progress (session_id, sequence, agent_id) VALUES (?, ?, ?)").run(session.id, sequence, agent.id)
        stores.sessions.update(fresh)
        stores.agents.update(agent)
      })
      const local = this.d.getClaim(agent.localClaimId)
      if (local.status === "KERNEL_VERIFIED" && !stores.solutions.list(session.id).some((item) => item.agentId === agent.id)) {
        if (this.d.teamCrashAt === "before_sc") throw new Error("crash")
        try {
          this.d.recorder.mutate("solution_candidate_found", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId } }, () => stores.solutions.insert({
            id: this.d.allocateId("SC"),
            sessionId: session.id,
            agentId: agent.id,
            branchId: agent.branchId,
            claimId: local.id,
            verificationRunId: this.d.verificationRuns.latestForFormal(this.d.formalStatements.currentForClaim(local.id)?.id ?? "")?.id ?? null,
            formalRevision: this.d.formalStatements.currentForClaim(local.id)?.id ?? null,
            discoveredAt: nowIso(),
          }))
        } catch { /* unique */ }
        if (this.d.teamCrashAt === "after_sc") throw new Error("crash")
      }
      if (this.d.teamCrashBoundary === "after_step") throw new Error("crash")
    } catch (error) {
      if (error instanceof Error && error.message === "STEP_TIMEOUT") {
        this.d.stopRun(this.d.getResearch(agent.researchRunId), "STEP_TIMEOUT")
        agent.status = "BLOCKED"
        this.d.recorder.mutate("agent_round_step_failed", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId, reason: "STEP_TIMEOUT" } }, () => stores.agents.update(agent))
      } else {
        throw error
      }
    } finally {
      clearTimeout(timer)
      this.liveLeases = Math.max(0, this.liveLeases - 1)
      this.parallelTimings.push({ agentId: agent.id, start, end: Date.now() })
      this.d.recorder.mutate("execution_lease_released", { target: leaseId, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId } }, () => {
        this.d.client.db.query("UPDATE execution_leases SET status = 'RELEASED' WHERE lease_id = ?").run(leaseId)
      })
    }
  }

  private cloneObjectiveForWorker(sourceId: string, agentId: string) {
    const source = this.d.getClaim(sourceId)
    const formal = this.d.formalStatements.currentForClaim(source.id)
    const clone = this.d.createClaim({
      kind: source.kind === "theorem" ? "conjecture" : source.kind,
      title: `${source.title} · ${agentId}`,
      statement: source.naturalStatement,
    })
    if (formal) {
      const declarationName = `${formal.declarationName}_${agentId.replaceAll("-", "").toLowerCase()}`
      this.d.recorder.mutate("agent_objective_formal_cloned", { target: clone.id, metadata: { agentId, sourceClaimId: source.id } }, () => {
        this.d.formalStatements.markOthersNotCurrent(clone.id)
        this.d.formalStatements.insert({
          ...formal,
          id: nextSequentialId(this.d.formalStatements.ids(this.d.requireWorkspace().id), "FS"),
          claimId: clone.id,
          declarationName,
          sourceText: formal.sourceText.replace(formal.declarationName, declarationName),
          isCurrent: true,
          fidelityStatus: formal.fidelityStatus === "REJECTED" ? "AI_REVIEWED" : formal.fidelityStatus,
        })
      })
    }
    return clone
  }

  pauseTeam(id: string): MultiAgentResearchSession {
    const session = this.getTeam(id)
    this.teamPauseRequested.add(session.id)
    const busy = this.d.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").get(session.id)
    if (busy && busy.n > 0) return session
    session.status = "PAUSED"
    session.stopReason = "USER_PAUSED"
    session.stoppedAt = nowIso()
    this.d.recorder.mutate("multi_agent_session_paused", { target: session.id, metadata: { sessionId: session.id } }, () => this.teamStores().sessions.update(session))
    return session
  }

  resumeTeam(id: string): MultiAgentResearchSession {
    const session = this.getTeam(id)
    const interrupted = this.teamStores().rounds.list(session.id).filter((item) => item.status === "RUNNING")
    this.teamPauseRequested.delete(session.id)
    session.status = "READY"
    session.stopReason = null
    session.stoppedAt = null
    this.d.recorder.mutate("multi_agent_session_resumed", { target: session.id, metadata: { sessionId: session.id } }, () => {
      for (const round of interrupted) { round.status = "INTERRUPTED"; round.finishedAt = nowIso(); this.teamStores().rounds.update(round) }
      this.d.client.db.query("UPDATE execution_leases SET status = 'INTERRUPTED' WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").run(session.id)
      this.teamStores().sessions.update(session)
    })
    return session
  }

  cancelTeam(id: string): MultiAgentResearchSession {
    const session = this.getTeam(id)
    this.teamCancelRequested.add(session.id)
    const busy = this.d.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").get(session.id)
    if (busy && busy.n > 0) return session
    session.status = "CANCELLED"
    session.stopReason = "USER_CANCELLED"
    session.stoppedAt = nowIso()
    this.d.recorder.mutate("multi_agent_session_cancelled", { target: session.id, metadata: { sessionId: session.id } }, () => this.teamStores().sessions.update(session))
    return session
  }

  async stepTeam(id: string): Promise<MultiAgentResearchSession> {
    const stores = this.teamStores()
    let session = this.getTeam(id)
    if (["SOLUTION_FOUND", "COMPLETED", "CANCELLED", "FAILED"].includes(session.status)) return session
    if (session.usage.rounds >= session.limits.maxRounds) return this.stopTeam(session, "MAX_ROUNDS")
    if (session.usage.leanCalls >= session.limits.maxTotalLeanCalls || session.usage.modelCalls >= session.limits.maxTotalModelCalls || session.usage.steps >= session.limits.maxTotalSteps) {
      return this.stopTeam(session, "GLOBAL_BUDGET_EXHAUSTED")
    }
    const sequence = session.currentRound + 1
    const existing = stores.rounds.getByKey(session.id, sequence)
    if (existing && existing.status === "COMPLETED") return session
    const round = existing ?? { id: nextRoundId(session.id, sequence), sessionId: session.id, sequence, status: "RUNNING" as const, startedAt: nowIso(), finishedAt: null }
    if (!existing) this.d.recorder.mutate("multi_agent_round_started", { target: round.id, metadata: { sessionId: session.id } }, () => stores.rounds.insert(round))
    else {
      round.status = "RUNNING"
      this.d.recorder.mutate("multi_agent_round_started", { target: round.id, metadata: { sessionId: session.id } }, () => stores.rounds.update(round))
    }
    const source = this.d.requireCurrentBranch()
    const agents = stores.agents.list(session.id)
    const eligible: ResearchAgentWorker[] = []
    const localStop = ["LOCAL_LEAN_BUDGET_EXHAUSTED", "LOCAL_MODEL_BUDGET_EXHAUSTED", "LOCAL_PROOF_BUDGET_EXHAUSTED", "LEAN_CALL_BUDGET_EXHAUSTED", "MODEL_CALL_BUDGET_EXHAUSTED", "PROOF_ATTEMPT_BUDGET_EXHAUSTED"]
    for (const agent of agents) {
      if (!["READY", "RUNNING"].includes(agent.status)) continue
      const before = this.d.getResearch(agent.researchRunId)
      if (before.status === "COMPLETED" || before.stopReason === "OBJECTIVE_KERNEL_VERIFIED") continue
      if (before.status === "BLOCKED" || localStop.includes(before.stopReason ?? "")) {
        agent.status = "BLOCKED"
        this.d.recorder.mutate("research_agent_blocked", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId, reason: before.stopReason } }, () => stores.agents.update(agent))
        continue
      }
      const done = this.d.client.db.query<{ agent_id: string }, [string, number, string]>("SELECT agent_id FROM agent_round_progress WHERE session_id = ? AND sequence = ? AND agent_id = ?").get(session.id, sequence, agent.id)
      if (done) continue
      eligible.push(agent)
    }
    this.frozenDigestBySession.set(session.id, stores.digests.get(session.id, session.currentRound))
    const planJson = JSON.stringify({
      sessionId: session.id,
      roundSequence: sequence,
      workers: eligible.map((agent, plannedIndex) => ({ agentId: agent.id, runId: agent.researchRunId, branchId: agent.branchId, plannedIndex })),
      executionMode: session.executionMode,
      maxParallelWorkers: session.maxParallelWorkers,
    })
    this.d.recorder.mutate("multi_agent_round_planned", { target: round.id, metadata: { sessionId: session.id, workerCount: eligible.length } }, () => {
      this.d.client.db.query("INSERT OR REPLACE INTO round_plans (session_id, sequence, plan_json) VALUES (?, ?, ?)").run(session.id, sequence, planJson)
    })
    try {
      const runOne = async (agent: ResearchAgentWorker) => this.executeAgentRoundStep(session, sequence, agent)
      if (session.executionMode === "BOUNDED_PARALLEL") {
        const width = Math.min(session.maxParallelWorkers || DEFAULT_MAX_PARALLEL_WORKERS, HARD_MAX_PARALLEL_WORKERS)
        for (let i = 0; i < eligible.length; i += width) {
          if (this.teamPauseRequested.has(session.id) || this.teamCancelRequested.has(session.id)) break
          await Promise.all(eligible.slice(i, i + width).map((agent) => runOne(agent)))
        }
      } else {
        for (const agent of eligible) {
          if (this.teamPauseRequested.has(session.id) || this.teamCancelRequested.has(session.id)) break
          await runOne(agent)
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === "crash") {
        round.status = "INTERRUPTED"
        this.d.recorder.mutate("multi_agent_round_interrupted", { target: round.id, metadata: { sessionId: session.id } }, () => {
          stores.rounds.update(round)
          this.d.client.db.query("UPDATE execution_leases SET status = 'INTERRUPTED' WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").run(session.id)
        })
        throw error
      }
      round.status = "FAILED"
      this.d.recorder.mutate("multi_agent_round_failed", { target: round.id, metadata: { sessionId: session.id } }, () => stores.rounds.update(round))
      return this.stopTeam(session, "FATAL_EXECUTION_ERROR")
    } finally {
      if (source.id !== this.d.requireCurrentBranch().id) this.d.switchBranch(source.id)
    }
    session = this.getTeam(session.id)
    round.status = "COMPLETED"
    round.finishedAt = nowIso()
    session.currentRound = sequence
    session.usage.rounds = sequence
    session.status = "RUNNING"
    session.startedAt = session.startedAt ?? nowIso()
    const digest = this.buildDigest(session, agents)
    this.d.recorder.mutate("shared_digest_updated", { target: session.id, metadata: { sessionId: session.id } }, () => {
      stores.rounds.update(round)
      stores.sessions.update(session)
      stores.digests.upsert(digest)
    })
    const solutions = stores.solutions.list(session.id)
    const live = stores.agents.list(session.id)
    if (this.teamPauseRequested.has(session.id)) return this.pauseTeam(session.id)
    if (this.teamCancelRequested.has(session.id)) return this.cancelTeam(session.id)
    if (solutions.length) {
      if (this.d.teamCrashAt === "before_solution_found") throw new Error("crash")
      const stopped = this.stopTeam(session, "SOLUTION_FOUND", "SOLUTION_FOUND")
      if (this.d.teamCrashAt === "after_solution_found") throw new Error("crash")
      return stopped
    }
    if (live.every((agent) => agent.status === "BLOCKED" || agent.status === "FAILED")) return this.stopTeam(session, "ALL_AGENTS_BLOCKED")
    return session
  }

  async runTeam(id: string): Promise<MultiAgentResearchSession> {
    let session = this.getTeam(id)
    session.status = "RUNNING"
    session.startedAt = session.startedAt ?? nowIso()
    this.d.recorder.mutate("multi_agent_session_started", { target: id, metadata: { sessionId: id } }, () => this.teamStores().sessions.update(session))
    while (!["SOLUTION_FOUND", "COMPLETED", "CANCELLED", "FAILED", "BLOCKED", "PAUSED"].includes(this.getTeam(id).status)) {
      session = await this.stepTeam(id)
      if (["SOLUTION_FOUND", "BLOCKED", "FAILED", "CANCELLED", "COMPLETED"].includes(session.status)) break
      if (session.currentRound >= session.limits.maxRounds) return this.stopTeam(session, "MAX_ROUNDS")
    }
    return this.getTeam(id)
  }

  teamMergePreview(sessionId: string, agentId: string): MergePreview {
    const agent = this.teamStores().agents.get(agentId.toUpperCase())
    if (!agent || agent.sessionId !== this.getTeam(sessionId).id) throw new Error(`Agent ${agentId} was not found.`)
    const run = this.d.getResearch(agent.researchRunId)
    if (run.status === "RUNNING") throw new Error(`ACTIVE_RESEARCH_RUN_EXISTS:${run.id}`)
    return this.d.previewMerge(agent.branchId)
  }

  private stopTeam(session: MultiAgentResearchSession, reason: import("@mathos/domain").MultiAgentStopReason, status: MultiAgentResearchSession["status"] = "BLOCKED"): MultiAgentResearchSession {
    session.status = reason === "SOLUTION_FOUND" ? "SOLUTION_FOUND" : status
    session.stopReason = reason
    session.stoppedAt = nowIso()
    this.d.recorder.mutate(reason === "SOLUTION_FOUND" ? "multi_agent_solution_found" : "multi_agent_session_blocked", { target: session.id, metadata: { sessionId: session.id, reason } }, () => this.teamStores().sessions.update(session))
    return session
  }

  private buildDigest(session: MultiAgentResearchSession, agents: ResearchAgentWorker[]): SharedResearchDigest {
    const verified: SharedResearchDigest["verifiedFindings"] = []
    const unverified: SharedResearchDigest["unverifiedFindings"] = []
    const approachesTried: SharedResearchDigest["approachesTried"] = []
    const failedApproaches: SharedResearchDigest["failedApproaches"] = []
    for (const agent of agents) {
      const claim = this.d.getClaim(agent.localClaimId)
      if (claim.status === "KERNEL_VERIFIED") verified.push({ claimId: claim.id, branchId: agent.branchId, title: claim.title })
      else unverified.push({ claimId: claim.id, branchId: agent.branchId, status: claim.status })
      approachesTried.push({ agentId: agent.id, approach: agent.assignment.approach, summary: agent.assignment.goalSummary })
      const last = this.d.researchHistory(agent.researchRunId).at(-1)
      if (last?.status === "FAILED") failedApproaches.push({ agentId: agent.id, approach: agent.assignment.approach, summary: last.summary ?? last.action })
    }
    return {
      sessionId: session.id,
      round: session.currentRound,
      verifiedFindings: verified,
      unverifiedFindings: unverified,
      openBlockers: this.d.researchStores().blockers.open(session.sourceBranchId).map((item) => ({ id: item.id, summary: item.summary })),
      approachesTried,
      failedApproaches,
      solutionCandidates: this.teamStores().solutions.list(session.id).map((item) => ({ id: item.id, agentId: item.agentId, claimId: item.claimId })),
    }
  }

  teamOverview(sessionId: string): TeamResearchOverview {
    const session = this.getTeam(sessionId)
    const agents = this.teamAgents(session.id)
    return {
      session,
      agents: agents.map((agent) => {
        const run = this.d.getResearch(agent.researchRunId)
        const local = this.d.getClaim(agent.localClaimId)
        return { agent, run, localStatus: local.status, verified: local.status === "KERNEL_VERIFIED", recentSteps: this.d.researchHistory(agent.researchRunId).slice(-5) }
      }),
      imports: this.teamStores().imports.list(session.id),
      solutions: this.teamSolutions(session.id),
      digest: this.teamDigest(session.id),
    }
  }

  teamImports(sessionId: string): VerifiedArtifactImport[] {
    return this.teamStores().imports.list(this.getTeam(sessionId).id)
  }

  getImport(id: string): VerifiedArtifactImport {
    const row = this.teamStores().imports.get(id.toUpperCase())
    if (!row) throw new Error(`Import ${id} was not found.`)
    return row
  }

  previewImport(id: string): ImportPreview {
    const item = this.getImport(id)
    const deps = this.dependencyClosure(item.sourceClaimId)
    return {
      importId: item.id,
      sourceAgentId: item.sourceAgentId,
      sourceBranchId: item.sourceBranchId,
      targetAgentId: item.targetAgentId,
      targetBranchId: item.targetBranchId,
      requestedClaimId: item.sourceClaimId,
      requiredDependencies: deps,
      files: 1 + deps.length,
      allVerified: [item.sourceClaimId, ...deps].every((claimId) => this.d.getClaim(claimId).status === "KERNEL_VERIFIED"),
      conflicts: this.declarationConflicts(item.targetBranchId, item.sourceClaimId),
    }
  }

  proposeImport(sessionId: string, sourceAgentId: string, targetAgentId: string, sourceClaimId: string): VerifiedArtifactImport {
    const session = this.getTeam(sessionId)
    const sourceAgent = this.teamStores().agents.get(sourceAgentId.toUpperCase())
    const targetAgent = this.teamStores().agents.get(targetAgentId.toUpperCase())
    if (!sourceAgent || !targetAgent || sourceAgent.sessionId !== session.id || targetAgent.sessionId !== session.id) throw new Error("Agent not in session")
    const claim = this.d.getClaim(sourceClaimId)
    const formal = this.d.formalStatements.currentForClaim(claim.id)
    const item: import("@mathos/domain").VerifiedArtifactImport = {
      id: nextPrefixedId(this.teamStores().imports.ids(), "IMP"),
      sessionId: session.id,
      sourceAgentId: sourceAgent.id,
      sourceBranchId: sourceAgent.branchId,
      targetAgentId: targetAgent.id,
      targetBranchId: targetAgent.branchId,
      sourceClaimId: claim.id,
      targetClaimId: null,
      sourceVerificationRunId: formal ? this.d.verificationRuns.latestForFormal(formal.id)?.id ?? null : null,
      sourceFormalRevision: formal?.id ?? "missing",
      status: "PROPOSED",
      failureCode: null,
      createdAt: nowIso(),
      approvedAt: null,
      appliedAt: null,
    }
    this.d.recorder.mutate("artifact_import_proposed", { target: item.id, metadata: { sessionId: session.id, agentId: sourceAgent.id, branchId: sourceAgent.branchId } }, () => {
      this.teamStores().imports.insert(item)
      for (const dep of this.dependencyClosure(claim.id)) this.teamStores().imports.addDependency(item.id, dep)
    })
    return item
  }

  rejectImport(id: string): VerifiedArtifactImport {
    const item = this.getImport(id)
    item.status = "REJECTED"
    this.d.recorder.mutate("artifact_import_rejected", { target: item.id, metadata: { sessionId: item.sessionId } }, () => this.teamStores().imports.update(item))
    return item
  }

  async applyImport(id: string): Promise<VerifiedArtifactImport> {
    const item = this.getImport(id)
    if (item.status === "APPLIED") return item
    const busy = this.d.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE agent_id = ? AND status IN ('RESERVED','RUNNING')").get(item.targetAgentId)
    if (busy && busy.n > 0) throw new Error("TARGET_WORKER_BUSY")
    const source = this.d.getClaim(item.sourceClaimId)
    if (source.status !== "KERNEL_VERIFIED") {
      item.status = "FAILED"
      item.failureCode = "SOURCE_NOT_KERNEL_VERIFIED"
      this.d.recorder.mutate("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: item.failureCode } }, () => this.teamStores().imports.update(item))
      return item
    }
    const formal = this.d.formalStatements.currentForClaim(source.id)
    if (!formal || formal.id !== item.sourceFormalRevision) {
      item.status = "REVERIFY_REQUIRED"
      item.failureCode = "REVERIFY_REQUIRED"
      this.d.recorder.mutate("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: "REVERIFY_REQUIRED" } }, () => this.teamStores().imports.update(item))
      return item
    }
    let deps: string[]
    try {
      deps = this.dependencyClosure(source.id)
    } catch (error) {
      if (error instanceof Error && error.message === "IMPORT_DEPENDENCY_CYCLE") {
        item.status = "FAILED"
        item.failureCode = "IMPORT_DEPENDENCY_CYCLE"
        this.d.recorder.mutate("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: item.failureCode } }, () => this.teamStores().imports.update(item))
        return item
      }
      throw error
    }
    if (deps.some((dep) => this.d.getClaim(dep).status !== "KERNEL_VERIFIED")) {
      item.status = "FAILED"
      item.failureCode = "DEPENDENCY_IMPORT_REQUIRED"
      this.d.recorder.mutate("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: item.failureCode } }, () => this.teamStores().imports.update(item))
      return item
    }
    const conflicts = this.declarationConflicts(item.targetBranchId, source.id)
    if (conflicts.length) {
      item.status = "CONFLICT"
      item.failureCode = "DECLARATION_CONFLICT"
      this.d.recorder.mutate("artifact_import_conflict", { target: item.id, metadata: { sessionId: item.sessionId } }, () => this.teamStores().imports.update(item))
      return item
    }
    item.status = "APPLYING"
    item.approvedAt = nowIso()
    this.d.recorder.mutate("artifact_import_started", { target: item.id, metadata: { sessionId: item.sessionId } }, () => this.teamStores().imports.update(item))
    const previous = this.d.requireCurrentBranch()
    try {
      this.d.switchBranch(item.targetBranchId)
      const clone = this.d.createClaim({ kind: "conjecture", title: `${source.title} (imported)`, statement: source.naturalStatement })
      const declarationName = formal.declarationName
      const proof = this.d.proofs.latestAccepted(source.id)
      this.d.recorder.mutate("artifact_import_reverify_started", { target: item.id, metadata: { sessionId: item.sessionId, targetClaimId: clone.id } }, () => {
        this.d.claims.updateStatus(clone.id, "FORMALIZED_UNVERIFIED", nowIso())
        this.d.formalStatements.insert({
          ...formal,
          id: nextSequentialId(this.d.formalStatements.ids(this.d.requireWorkspace().id), "FS"),
          claimId: clone.id,
          declarationName,
          isCurrent: true,
          fidelityStatus: "HUMAN_APPROVED",
          verificationStatus: "ELABORATES",
        })
        if (proof) this.d.storeAttempt(this.d.requireWorkspace().id, clone.id, this.d.formalStatements.currentForClaim(clone.id)!.id, 1, proof.proofSource, "KERNEL_ACCEPTED", proof.leanVersion, [])
      })
      const targetFormal = this.d.formalStatements.currentForClaim(clone.id)!
      const worktree = this.d.getBranch(item.targetBranchId).worktreePath
      if (worktree) writeFileSync(join(worktree, `${clone.id}.lean`), `${targetFormal.sourceText}\n`, "utf8")
      const report = await this.d.verify(clone.id)
      if (!report.passed) {
        item.status = "FAILED"
        item.failureCode = "TARGET_VERIFICATION_FAILED"
        item.targetClaimId = clone.id
        this.d.recorder.mutate("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: item.failureCode } }, () => this.teamStores().imports.update(item))
        return item
      }
      item.status = "APPLIED"
      item.targetClaimId = clone.id
      item.appliedAt = nowIso()
      this.d.recorder.mutate("artifact_import_applied", { target: item.id, metadata: { sessionId: item.sessionId, agentId: item.targetAgentId, branchId: item.targetBranchId } }, () => this.teamStores().imports.update(item))
      return item
    } finally {
      if (previous.id !== this.d.requireCurrentBranch().id) this.d.switchBranch(previous.id)
    }
  }

  private dependencyClosure(claimId: string): string[] {
    const seen = new Set<string>()
    const stack = new Set<string>()
    const walk = (id: string) => {
      if (stack.has(id)) throw new Error("IMPORT_DEPENDENCY_CYCLE")
      stack.add(id)
      for (const dep of this.d.dependencies.listForClaim(this.d.requireWorkspace().id, id)) {
        if (dep.fromClaimId !== id) continue
        if (seen.has(dep.toClaimId)) continue
        seen.add(dep.toClaimId)
        walk(dep.toClaimId)
      }
      stack.delete(id)
    }
    walk(claimId)
    return [...seen]
  }

  private declarationConflicts(targetBranchId: string, sourceClaimId: string): string[] {
    const sourceFormal = this.d.formalStatements.currentForClaim(sourceClaimId)
    if (!sourceFormal) return []
    const conflicts: string[] = []
    for (const claim of this.d.claims.listVisible(targetBranchId)) {
      const formal = this.d.formalStatements.currentForClaim(claim.id)
      if (!formal) continue
      if (formal.declarationName === sourceFormal.declarationName && formal.sourceText !== sourceFormal.sourceText) conflicts.push(formal.declarationName)
    }
    return conflicts
  }

}
