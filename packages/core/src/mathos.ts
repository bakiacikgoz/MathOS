import { basename, join, resolve } from "node:path"
import { existsSync, writeFileSync } from "node:fs"
import {
  type Blocker,
  type Claim,
  type ClaimDetail,
  type Dependency,
  type DependencyRelation,
  type Evidence,
  type StatusProjection,
  nextClaimId,
  statusFamily,
  type ResearchDraft,
  type FormalizationSession,
  type FormalStatement,
  type FidelityReview,
  type ProofAttempt,
  type ProofSession,
  type VerificationReport,
  nextSequentialId,
  MAIN_BRANCH_ID,
  MAIN_BRANCH_NAME,
  MAIN_BRANCH_SLUG,
  type ResearchBranch,
  type BranchDetail,
  type MergePreview,
  type ArtifactRelation,
  DEFAULT_RESEARCH_BUDGET,
  emptyResearchUsage,
  normalizeResearchUsage,
  nextPrefixedId,
  classifyLeanFailure,
  deterministicResearchSummary,
  type ResearchRun,
  type ResearchDecision,
  type ResearchBudget,
  type ResearchStopReason,
  DEFAULT_MULTI_AGENT_BUDGET,
  DEFAULT_MAX_PARALLEL_WORKERS,
  HARD_MAX_PARALLEL_WORKERS,
  assignmentDiversity,
  fallbackAssignmentPlan,
  nextRoundId,
  type MultiAgentBudget,
  type MultiAgentExecutionMode,
  type MultiAgentResearchSession,
  type ResearchAgentWorker,
  type SharedResearchDigest,
  type SolutionCandidate,
  type MultiAgentRound,
  type VerifiedArtifactImport,
  type ImportPreview,
} from "@mathos/domain"
import { EventLog, makeEvent } from "@mathos/events"
import {
  createDefaultModelProvider,
  modelDoctorChecks,
  resolveModelConfig,
  type ModelProvider,
} from "@mathos/models"
import { NativeLeanAdapter, type LeanAdapter } from "@mathos/lean"
import { type PremiseRetriever } from "@mathos/retrieval"
import { FormalizationService } from "./services/formalization-service.ts"
import { ClaimService, type AddBlockerInput, type AddEvidenceInput, type CreateClaimInput } from "./services/claim-service.ts"
import { ProofService, type ProveOptions } from "./services/proof-service.ts"
import { RetrievalService } from "./services/retrieval-service.ts"
import { VerificationService } from "./services/verification-service.ts"
import { ExperimentService } from "./services/experiment-service.ts"
import { LiteratureService } from "./services/literature-service.ts"
import { ResearchEngine } from "./services/research-engine.ts"
import { BranchService } from "./services/branch-service.ts"
import { ResearchQueryService } from "./services/research-query-service.ts"
import { TeamResearchCoordinator, type TeamResearchCoordinatorDependencies, type TeamResearchOverview, type TeamResearchStores } from "./services/team-research-coordinator.ts"
import {
  buildGraphContextSummary,
  validateResearchGraph,
  type ResearchGraph,
  type ResearchGraphBuildOptions,
  type ResearchGraphSnapshot,
} from "@mathos/graph"
import {
  createId,
  createLogger,
  databasePath,
  debugLogPath,
  eventLogPath,
  nowIso,
  padSeq,
  formatMathosVersion,
  mathosVersion,
  type Logger,
} from "@mathos/shared"
import { GitResearchVcs, type ResearchVcs } from "@mathos/vcs"
import {
  BlockerRepository,
  BranchRepository,
  ClaimRepository,
  DatabaseClient,
  DependencyRepository,
  EventRepository,
  EvidenceRepository,
  FidelityReviewRepository,
  FormalStatementRepository,
  ProofAttemptRepository,
  VerificationRunRepository,
  WorkspaceRepository,
  ClaimVisibilityRepository,
} from "@mathos/storage"
import {
  ResearchRunRepository,
  ResearchStepRepository,
  ResearchBlockerRepository,
  ResearchDecisionRepository,
  MultiAgentSessionRepository,
  ResearchAgentRepository,
  MultiAgentRoundRepository,
  SolutionCandidateRepository,
  SharedDigestRepository,
  RunPlannerRepository,
  ArtifactImportRepository,
  ExperimentRepository,
  ExperimentResultRepository,
  SourceRepository,
  SourceExcerptRepository,
  ExternalResultRepository,
  CitationRepository,
  LiteratureSearchRepository,
} from "@mathos/storage"
import { createWorkspaceLayout, findWorkspaceRoot, tryFindWorkspaceRoot } from "@mathos/workspace"
import { buildDoctorReport } from "./doctor.ts"
import {
  writeReport,
} from "./product-ux.ts"
import { backupWorkspace, restoreWorkspace, eventLogHealth, exportDiagnostics } from "./release.ts"
import { SCHEMA_EPOCH } from "@mathos/storage"
import { FakeResearchPlanner, ModelResearchPlanner, type ResearchPlanner } from "./research-planner.ts"
import { buildResearchContext } from "./research-context.ts"
import { FakeMultiAgentPlanner, type MultiAgentPlanner } from "./multi-agent-planner.ts"
import { createPlannerFromDescriptor, plannerDescriptorFrom, PersistentScriptedPlanner } from "./planner-factory.ts"
import { PythonRuntime, sha256Text, type ComputationalRuntime } from "@mathos/computation"
import { FakeLiteratureProvider, type LiteratureProvider } from "@mathos/literature"
import { DEFAULT_COMPUTATIONAL_BUDGET, type Experiment, type ExperimentResult, type CitationPurpose, type SourceLocator, type Source, type SourceExcerpt, type ExternalResult } from "@mathos/domain"

export interface MathOSOptions {
  logger?: Logger
  modelProvider?: ModelProvider
  auditorProvider?: ModelProvider
  leanAdapter?: LeanAdapter
  premiseRetriever?: PremiseRetriever
  vcs?: ResearchVcs
  researchPlanner?: import("./research-planner.ts").ResearchPlanner
  probeModel?: boolean
  formalProjectRoot?: string
  crashHook?: (point: "before_mutation" | "after_mutation" | "after_event", action: string) => void
  multiAgentPlanner?: MultiAgentPlanner
  teamCrashAfterAgent?: string
  teamCrashAt?: "before_sc" | "after_sc" | "before_solution_found" | "after_solution_found"
  teamCrashTwoRunning?: boolean
  teamCrashBoundary?: "after_reservation" | "after_tool_start" | "after_result" | "after_step"
  maxStepWallClockMs?: number
  computationRuntime?: ComputationalRuntime
  literatureProvider?: LiteratureProvider
}

export class MathOS {
  private claimService!: ClaimService
  private proofService!: ProofService
  private retrievalService!: RetrievalService
  private formalizationService!: FormalizationService
  private verificationService!: VerificationService
  private experimentService!: ExperimentService
  private literatureService!: LiteratureService
  private researchEngine!: ResearchEngine
  private branchService!: BranchService
  private teamResearchCoordinator!: TeamResearchCoordinator
  private researchQueryService!: ResearchQueryService
  private constructor(
    readonly root: string,
    private readonly client: DatabaseClient,
    private readonly events: EventLog,
    private readonly logger: Logger,
    private readonly workspaces: WorkspaceRepository,
    private readonly claims: ClaimRepository,
    private readonly dependencies: DependencyRepository,
    private readonly evidence: EvidenceRepository,
    private readonly branches: BranchRepository,
    private readonly blockers: BlockerRepository,
    private readonly eventRows: EventRepository,
    private readonly formalStatements: FormalStatementRepository,
    private readonly fidelityReviews: FidelityReviewRepository,
    private readonly verificationRuns: VerificationRunRepository,
    private readonly proofs: ProofAttemptRepository,
    private readonly visibility: ClaimVisibilityRepository,
    private readonly modelProvider: ModelProvider,
    private readonly auditorProvider: ModelProvider,
    private readonly leanAdapter: LeanAdapter,
    private readonly premiseRetriever: PremiseRetriever | null,
    private readonly vcs: ResearchVcs,
    private readonly researchPlanner: import("./research-planner.ts").ResearchPlanner | null,
    private readonly probeModel: boolean,
    private readonly formalProjectRoot: string | null,
    private readonly crashHook: ((point: "before_mutation" | "after_mutation" | "after_event", action: string) => void) | null,
    private readonly multiAgentPlanner: MultiAgentPlanner | null,
    private readonly teamCrashAfterAgent: string | null,
    private readonly teamCrashAt: "before_sc" | "after_sc" | "before_solution_found" | "after_solution_found" | null,
    private readonly teamCrashTwoRunning: boolean,
    private readonly teamCrashBoundary: "after_reservation" | "after_tool_start" | "after_result" | "after_step" | null,
    private readonly maxStepWallClockMs: number,
    private readonly computationRuntime: ComputationalRuntime,
    private readonly literatureProvider: LiteratureProvider,
  ) {}

  lastExperimentPid: number | null = null
  get parallelTimings() { return this.teamResearchCoordinator.parallelTimings }
  get peakConcurrency() { return this.teamResearchCoordinator.peakConcurrency }
  get lastPlannerContextByRun() { return this.researchEngine.lastPlannerContextByRun }

  private currentAccounting(): ResearchRun | null { return this.researchEngine?.currentAccounting() ?? null }

  static async init(cwd = process.cwd(), name?: string): Promise<{ root: string; name: string }> {
    const target = name ? resolve(cwd, name) : resolve(cwd)
    const created = createWorkspaceLayout(target, name ?? basename(target))
    const instance = MathOS.open(created.root)
    instance.bootstrap(created.name)
    instance.close()
    return created
  }

  static locate(start = process.cwd()): string {
    return findWorkspaceRoot(start)
  }

  static tryLocate(start = process.cwd()): string | null {
    return tryFindWorkspaceRoot(start)
  }

  static open(root = process.cwd(), options: MathOSOptions = {}): MathOS {
    const workspaceRoot = findWorkspaceRoot(root)
    const client = new DatabaseClient(databasePath(workspaceRoot))
    client.migrate()
    const events = new EventLog(eventLogPath(workspaceRoot))
    events.ensure()
    const logger = options.logger ?? createLogger(debugLogPath(workspaceRoot))
    const modelProvider = options.modelProvider ?? createDefaultModelProvider(workspaceRoot)
    const auditorProvider = options.auditorProvider ?? modelProvider
    const leanAdapter = options.leanAdapter ?? new NativeLeanAdapter()
    const instance = new MathOS(
      workspaceRoot,
      client,
      events,
      logger,
      new WorkspaceRepository(client.db),
      new ClaimRepository(client.db),
      new DependencyRepository(client.db),
      new EvidenceRepository(client.db),
      new BranchRepository(client.db),
      new BlockerRepository(client.db),
      new EventRepository(client.db),
      new FormalStatementRepository(client.db),
      new FidelityReviewRepository(client.db),
      new VerificationRunRepository(client.db),
      new ProofAttemptRepository(client.db),
      new ClaimVisibilityRepository(client.db),
      modelProvider,
      auditorProvider,
      leanAdapter,
      options.premiseRetriever ?? null,
      options.vcs ?? new GitResearchVcs(),
      options.researchPlanner ?? null,
      options.probeModel === true,
      options.formalProjectRoot ?? null,
      options.crashHook ?? null,
      options.multiAgentPlanner ?? null,
      options.teamCrashAfterAgent ?? null,
      options.teamCrashAt ?? null,
      options.teamCrashTwoRunning === true,
      options.teamCrashBoundary ?? null,
      options.maxStepWallClockMs ?? 120_000,
      options.computationRuntime ?? new PythonRuntime(),
      options.literatureProvider ?? new FakeLiteratureProvider(),
    )
    instance.claimService = new ClaimService({
      client,
      workspaces: instance.workspaces,
      claims: instance.claims,
      dependencies: instance.dependencies,
      evidence: instance.evidence,
      branches: instance.branches,
      blockers: instance.blockers,
      visibility: instance.visibility,
      modelProvider: instance.modelProvider,
      logger: instance.logger,
      allocateId: (prefix) => instance.allocateId(prefix),
      recordEvent: (action, event) => instance.record(action, event),
    })
    instance.formalizationService = new FormalizationService({
      root: workspaceRoot,
      workspaces: instance.workspaces,
      claims: instance.claims,
      formalStatements: instance.formalStatements,
      fidelityReviews: instance.fidelityReviews,
      verificationRuns: instance.verificationRuns,
      modelProvider: instance.modelProvider,
      auditorProvider: instance.auditorProvider,
      leanAdapter: instance.leanAdapter,
      leanContext: () => ({
        workspaceRoot: instance.leanContext().workspaceRoot,
        tmpDir: `${instance.root}/.mathos/tmp`,
      }),
      recordEvent: (action, event) => instance.record(action, event),
    })
    instance.verificationService = new VerificationService({
      root: workspaceRoot,
      workspaces: instance.workspaces,
      claims: instance.claims,
      formalStatements: instance.formalStatements,
      verificationRuns: instance.verificationRuns,
      proofs: instance.proofs,
      leanAdapter: instance.leanAdapter,
      leanContext: () => instance.leanContext(),
      consumeLeanBudget: (reason) => instance.chargeLean(reason),
      recordEvent: (action, event) => instance.record(action, event),
    })
    instance.retrievalService = new RetrievalService({
      root: workspaceRoot,
      workspaces: instance.workspaces,
      branches: instance.branches,
      claims: instance.claims,
      dependencies: instance.dependencies,
      formalStatements: instance.formalStatements,
      leanAdapter: instance.leanAdapter,
      premiseRetriever: instance.premiseRetriever,
      hasActiveAccounting: () => Boolean(instance.currentAccounting()),
    })
    instance.proofService = new ProofService({
      workspaces: instance.workspaces,
      claims: instance.claims,
      formalStatements: instance.formalStatements,
      proofs: instance.proofs,
      modelProvider: instance.modelProvider,
      leanAdapter: instance.leanAdapter,
      retrieval: instance.retrievalService,
      leanContext: () => instance.leanContext(),
      hasActiveAccounting: () => Boolean(instance.currentAccounting()),
      consumeLeanBudget: () => instance.chargeLean("PROOF_COMPILE"),
      crashBoundary: () => instance.teamCrashBoundary,
      allocateId: (prefix) => instance.allocateId(prefix),
      verify: (claimId) => instance.verify(claimId),
      recordEvent: (action, event) => instance.record(action, event),
    })
    instance.experimentService = new ExperimentService({
      root: workspaceRoot,
      workspaces: instance.workspaces,
      branches: instance.branches,
      claims: instance.claims,
      evidence: instance.evidence,
      experiments: new ExperimentRepository(client.db),
      results: new ExperimentResultRepository(client.db),
      computationRuntime: instance.computationRuntime,
      allocateId: (prefix) => instance.allocateId(prefix),
      recordEvent: (action, event) => instance.record(action, event),
      recordPid: (pid) => { instance.lastExperimentPid = pid },
    })
    instance.literatureService = new LiteratureService({
      root: workspaceRoot,
      workspaces: instance.workspaces,
      branches: instance.branches,
      claims: instance.claims,
      evidence: instance.evidence,
      sources: new SourceRepository(client.db),
      excerpts: new SourceExcerptRepository(client.db),
      external: new ExternalResultRepository(client.db),
      citations: new CitationRepository(client.db),
      searches: new LiteratureSearchRepository(client.db),
      provider: instance.literatureProvider,
      allocateId: (prefix) => instance.allocateId(prefix),
      recordEvent: (action, event) => instance.record(action, event),
    })
    instance.branchService = new BranchService({
      root: workspaceRoot,
      workspaces: instance.workspaces,
      branches: instance.branches,
      claims: instance.claims,
      visibility: instance.visibility,
      proofs: instance.proofs,
      blockers: instance.blockers,
      runs: new ResearchRunRepository(client.db),
      vcs: instance.vcs,
      recordEvent: (action, event = {}) => instance.record(action, event),
    })
    instance.researchEngine = new ResearchEngine({
      runs: new ResearchRunRepository(client.db),
      steps: new ResearchStepRepository(client.db),
      blockers: new ResearchBlockerRepository(client.db),
      decisions: new ResearchDecisionRepository(client.db),
      planners: new RunPlannerRepository(client.db),
      agents: new ResearchAgentRepository(client.db),
      modelProvider: instance.modelProvider,
      defaultPlanner: instance.researchPlanner,
      requireWorkspace: () => instance.requireWorkspace(),
      requireCurrentBranch: () => instance.requireCurrentBranch(),
      switchBranch: (id) => instance.switchBranch(id),
      getBranchName: (id) => instance.getBranch(id).name,
      getClaim: (id) => instance.getClaim(id),
      listVisibleClaims: (branchId) => instance.claims.listVisible(branchId),
      currentFormal: (claimId) => instance.formalStatements.currentForClaim(claimId),
      graphContext: (run, worker) => buildGraphContextSummary(instance.buildGraph({ branchId: run.branchId, includeImports: true }), {
        focusClaimId: run.strategy.focusClaimId ?? run.objectiveClaimId ?? null,
        digestClaimIds: worker ? (instance.teamResearchCoordinator.digestForSession(worker.sessionId)?.verifiedFindings ?? []).map((item) => item.claimId) : [],
      }),
      digestVerifiedFindings: (worker) => instance.teamResearchCoordinator.digestForSession(worker.sessionId)?.verifiedFindings ?? [],
      consumeModelBudget: (kind) => instance.chargeModel(kind),
      consumeProofBudget: () => instance.chargeProofAttempt(),
      recordEvent: (action, event) => instance.record(action, event),
      crashHook: instance.crashHook,
      searchPremises: (claimId) => instance.premisesForClaim(claimId, { skipInspect: true }),
      createSubclaim: (input) => instance.createClaim({ kind: "lemma", ...input }),
      addDependency: (from, to) => instance.addDependency(from, to, "depends_on"),
      attemptProof: (claimId, proofBody) => instance.prove(claimId, undefined, { maxAttempts: 1, proofBody, skipInspect: true, skipVerify: true }),
      verify: (claimId) => instance.verify(claimId),
      createExperiment: (input) => instance.createExperiment(input),
      runExperiment: (id, options) => instance.runExperiment(id, options),
      searchLiterature: (query, options) => instance.searchLiterature(query, options),
      inspectSource: (id) => instance.inspectSource(id),
    })
    const teamDependencies: TeamResearchCoordinatorDependencies = {
      root: instance.root,
      client: instance.client,
      claims: instance.claims,
      dependencies: instance.dependencies,
      formalStatements: instance.formalStatements,
      verificationRuns: instance.verificationRuns,
      proofs: instance.proofs,
      researchEngine: instance.researchEngine,
      multiAgentPlanner: instance.multiAgentPlanner,
      maxStepWallClockMs: instance.maxStepWallClockMs,
      teamCrashAfterAgent: instance.teamCrashAfterAgent,
      teamCrashAt: instance.teamCrashAt,
      teamCrashBoundary: instance.teamCrashBoundary,
      teamCrashTwoRunning: instance.teamCrashTwoRunning,
      abandonBranch: (id) => instance.abandonBranch(id),
      allocateId: (prefix) => instance.allocateId(prefix),
      createBranch: (name, goal) => instance.createBranch(name, goal),
      createClaim: (input) => instance.createClaim(input),
      getBranch: (id) => instance.getBranch(id),
      getClaim: (id) => instance.getClaim(id),
      getResearch: (id) => instance.getResearch(id),
      previewMerge: (id) => instance.previewMerge(id),
      record: (action, options) => instance.record(action, options),
      registerRunPlanner: (runId, planner) => instance.registerRunPlanner(runId, planner),
      requireCurrentBranch: () => instance.requireCurrentBranch(),
      requireWorkspace: () => instance.requireWorkspace(),
      researchHistory: (id) => instance.researchHistory(id),
      researchStores: () => instance.researchStores(),
      startResearch: (input) => instance.startResearch(input),
      stepResearch: (id) => instance.stepResearch(id),
      stopRun: (run, reason, status) => instance.stopRun(run, reason, status),
      storeAttempt: (workspaceId, claimId, formalId, attemptNumber, proofSource, status, leanVersion, diagnostics) => instance.storeAttempt(workspaceId, claimId, formalId, attemptNumber, proofSource, status, leanVersion, diagnostics),
      switchBranch: (id) => instance.switchBranch(id),
      verify: (claimId) => instance.verify(claimId),
    }
    instance.teamResearchCoordinator = new TeamResearchCoordinator(teamDependencies)
    instance.researchQueryService = new ResearchQueryService({
      root: workspaceRoot,
      snapshot: () => instance.assembleGraphSnapshot(),
      currentBranchId: () => instance.requireCurrentBranch().id,
      getTeam: (id) => instance.getTeam(id),
      teamAgents: (id) => instance.teamAgents(id),
      teamSolutions: (id) => instance.teamSolutions(id),
      getResearch: (id) => instance.getResearch(id),
      latestResearch: () => instance.latestResearch(),
      getClaim: (id) => instance.getClaim(id),
      workspace: () => instance.requireWorkspace(),
      events: (workspaceId) => instance.eventRows.list(workspaceId),
      stepsForRun: (runId) => instance.researchStores().steps.list(runId),
      interruptSummary: () => instance.interruptSummary(),
    })
    instance.restorePersistentPlanners()
    instance.reconcileInterrupted()
    return instance
  }

  private bootstrap(name: string): void {
    const existing = this.workspaces.get()
    if (existing) return

    const timestamp = nowIso()
    const workspaceId = createId("ws")
    const branchId = MAIN_BRANCH_ID

    const run = this.client.db.transaction(() => {
      this.workspaces.insert({
        id: workspaceId,
        name,
        rootPath: this.root,
        mainObjectiveId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      this.branches.insert({
        id: branchId,
        workspaceId,
        name: MAIN_BRANCH_NAME,
        slug: MAIN_BRANCH_SLUG,
        parentBranchId: null,
        purpose: "Primary research line",
        status: "ACTIVE",
        isCurrent: true,
        staleBase: false,
        createdFromEventId: null,
        gitRef: null,
        worktreePath: null,
        setupState: "READY",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    })
    run()

    this.record("workspace_initialized", { target: name, metadata: { workspaceId, branchId } })
    this.record("branch_initialized", { target: MAIN_BRANCH_NAME, metadata: { branchId } })
    this.logger.info("workspace initialized", { root: this.root, name })
  }

  private record(
    action: string,
    options: { target?: string | null; metadata?: Record<string, unknown> } = {},
  ): void {
    const workspace = this.requireWorkspace()
    const branch = this.branches.current(workspace.id)
    const event = makeEvent(action, {
      ...options,
      metadata: { ...options.metadata, branchId: branch?.id ?? MAIN_BRANCH_ID },
    })
    this.eventRows.insert(workspace.id, event)
    this.events.append(event)
  }

  private requireWorkspace() {
    const workspace = this.workspaces.get()
    if (!workspace) {
      throw new Error("Workspace row is missing after open")
    }
    return workspace
  }

  close(): void {
    this.client.close()
  }

  status(): StatusProjection {
    const workspace = this.requireWorkspace()
    const claims = this.listClaims()
    const currentBranch = this.branches.current(workspace.id)
    const main = workspace.mainObjectiveId
      ? claims.find((claim) => claim.id === workspace.mainObjectiveId) ?? null
      : null

    const research = {
      verified: 0,
      informal: 0,
      conjectures: 0,
      blocked: 0,
      totalClaims: claims.length,
    }

    for (const claim of claims) {
      if (claim.kind === "conjecture") research.conjectures += 1
      const family = statusFamily(claim.status)
      if (family === "verified") research.verified += 1
      else if (family === "informal") research.informal += 1
      else if (family === "blocked") research.blocked += 1
    }

    const dbOk = existsSync(databasePath(this.root))
    const logOk = existsSync(eventLogPath(this.root))

    return {
      projectName: workspace.name,
      workspaceRoot: this.root,
      mainObjective: main
        ? { id: main.id, title: main.title, status: main.status }
        : null,
      research,
      branch: currentBranch
        ? { id: currentBranch.id, name: currentBranch.name, slug: currentBranch.slug, status: currentBranch.status, staleBase: currentBranch.staleBase }
        : null,
      integrity: {
        database: dbOk ? "connected" : "missing",
        eventLog: logOk ? "ok" : "missing",
        initialized: true,
      },
    }
  }

  async doctor() {
    let queryOk = false
    try {
      this.client.db.query("SELECT id FROM schema_migrations LIMIT 1").get()
      queryOk = true
    } catch {
      queryOk = false
    }
    const base = buildDoctorReport(this.root, queryOk)
    const modelChecks = await modelDoctorChecks(resolveModelConfig({ workspaceRoot: this.root }), {
      probe: this.probeModel,
    })
    const env = await this.leanAdapter.detect(this.root)
    const leanChecks = this.leanAdapter.doctorChecks(env)
    const probe = env.leanAvailable ? await this.leanAdapter.probeCompile(this.root) : { ok: false, detail: "skipped" }
    const compileCheck = {
      name: "Lean compile",
      status: probe.ok ? "PASS" as const : env.leanAvailable ? "FAIL" as const : "WARN" as const,
      detail: probe.detail,
    }
    let inspectCheck = { name: "Declaration inspect", status: "WARN" as const, detail: "skipped" }
    if (env.leanAvailable) {
      const inspected = await this.leanAdapter.inspectDeclarations(["Eq.refl"], { workspaceRoot: this.root }, { timeoutMs: 20_000 })
      const eq = inspected.inspections.find((item) => item.name === "Eq.refl")
      inspectCheck = {
        name: "Declaration inspect",
        status: eq?.exists && eq.elaborated ? "PASS" : inspected.failed ? "WARN" : "FAIL",
        detail: eq?.type?.slice(0, 80) ?? inspected.detail ?? "Eq.refl",
      }
    }
    const graphCheck = (() => {
      try {
        const report = validateResearchGraph(this.buildGraph({ includeResearchRuntime: true, includeImports: true }))
        return { name: "Research graph", status: report.ok ? "PASS" as const : "WARN" as const, detail: report.ok ? "consistent" : report.issues.map((item) => item.code).join(",") }
      } catch (error) {
        return { name: "Research graph", status: "WARN" as const, detail: error instanceof Error ? error.message : "unavailable" }
      }
    })()
    const envReport = await this.computationRuntime.inspectEnvironment()
    const pythonCheck = { name: "Python runtime", status: envReport.pythonAvailable ? "PASS" as const : "WARN" as const, detail: envReport.pythonVersion ?? "missing" }
    const pythonVersionCheck = { name: "Python version", status: envReport.pythonVersion ? "PASS" as const : "WARN" as const, detail: envReport.pythonVersion ?? "unknown" }
    const sympyCheck = { name: "SymPy", status: envReport.sympyAvailable ? "PASS" as const : "WARN" as const, detail: envReport.sympyAvailable ? envReport.sympyVersion ?? "present" : "OPTIONAL_MISSING" }
    const sandboxCheck = { name: "Experiment sandbox", status: "PASS" as const, detail: join(this.root, ".mathos", "experiments") }
    const literatureCheck = { name: "Literature providers", status: "PASS" as const, detail: this.literatureProvider.name }
    const sourceExtractCheck = { name: "Local source extraction", status: "PASS" as const, detail: "text/pdf-text" }
    const eventsCheck = (() => {
      const health = eventLogHealth(this.root)
      return { name: "Database/events consistency", status: health.status, detail: health.detail }
    })()
    const schemaCheck = { name: "Schema version", status: "PASS" as const, detail: String(this.client.schemaEpoch()) }
    const versionCheck = { name: "MathOS version", status: "PASS" as const, detail: mathosVersion() }
    const checks = [...base.checks, ...modelChecks, ...leanChecks, compileCheck, inspectCheck, graphCheck, pythonCheck, pythonVersionCheck, sympyCheck, sandboxCheck, literatureCheck, sourceExtractCheck, eventsCheck, schemaCheck, versionCheck]
    return {
      checks,
      ok: checks.every((check) => check.status !== "FAIL"),
      schemaVersion: this.client.schemaEpoch(),
      mathosVersion: mathosVersion(),
    }
  }

  ingest(text: string, signal?: AbortSignal) { return this.claimService.ingest(text, signal) }

  confirmIntake(draft: ResearchDraft, options: { asMainObjective?: boolean } = {}) { return this.claimService.confirmIntake(draft, options) }

  createClaim(input: CreateClaimInput): Claim { return this.claimService.create(input) }

  listClaims(): Claim[] { return this.claimService.list() }

  getClaim(id: string): Claim { return this.claimService.get(id) }

  getClaimDetail(id: string): ClaimDetail { return this.claimService.detail(id) }

  setMainObjective(claimId: string): Claim { return this.claimService.setMainObjective(claimId) }

  addDependency(fromClaimId: string, toClaimId: string, relation: DependencyRelation = "depends_on"): Dependency { return this.claimService.addDependency(fromClaimId, toClaimId, relation) }

  addEvidence(input: AddEvidenceInput): Evidence { return this.claimService.addEvidence(input) }

  addBlocker(input: AddBlockerInput): Blocker { return this.claimService.addBlocker(input) }

  currentBranch(): ResearchBranch { return this.branchService.current() }

  private requireCurrentBranch(): ResearchBranch { return this.branchService.current() }

  private leanContext() {
    const run = this.currentAccounting()
    const branch = run ? this.getBranch(run.branchId) : this.branches.current(this.requireWorkspace().id)
    const fsRoot = branch?.worktreePath && branch.id !== MAIN_BRANCH_ID ? branch.worktreePath : this.root
    return { workspaceRoot: this.formalProjectRoot ?? fsRoot, tmpDir: join(fsRoot, ".mathos", "tmp"), signal: this.researchEngine?.currentAbortSignal() }
  }

  listBranches(): ResearchBranch[] { return this.branchService.list() }

  getBranch(idOrName: string): ResearchBranch { return this.branchService.get(idOrName) }

  branchDetail(idOrName?: string): BranchDetail { return this.branchService.detail(idOrName) }

  async setupResearchVersioning() { return this.branchService.setup() }

  async createBranch(name: string, purpose?: string): Promise<ResearchBranch> { return this.branchService.create(name, purpose) }

  switchBranch(idOrName: string): ResearchBranch { return this.branchService.switch(idOrName) }

  pauseBranch(idOrName: string): ResearchBranch { return this.branchService.pause(idOrName) }

  resumeBranch(idOrName: string): ResearchBranch { return this.branchService.resume(idOrName) }

  abandonBranch(idOrName: string): ResearchBranch { return this.branchService.abandon(idOrName) }

  claimRelation(claimId: string): ArtifactRelation { return this.branchService.claimRelation(claimId) }

  previewMerge(sourceId: string, targetId = MAIN_BRANCH_ID): MergePreview { return this.branchService.previewMerge(sourceId, targetId) }

  mergeBranch(sourceId: string, options: { applySafe?: boolean } = {}): MergePreview { return this.branchService.merge(sourceId, options) }

  async formalize(claimId: string): Promise<FormalizationSession> {
    return this.formalizationService.formalize(claimId)
  }

  getFormal(claimId: string): FormalStatement {
    return this.formalizationService.getFormal(claimId)
  }

  getFidelity(formalId: string): FidelityReview | null {
    return this.formalizationService.getFidelity(formalId)
  }

  approveFormal(formalId: string): FormalStatement {
    return this.formalizationService.approveFormal(formalId)
  }

  rejectFormal(formalId: string): FormalStatement {
    return this.formalizationService.rejectFormal(formalId)
  }

  formalSetup() {
    return this.formalizationService.formalSetup()
  }

  listProofs(claimId: string): ProofAttempt[] { return this.proofService.list(claimId) }

  async prove(claimId: string, signal?: AbortSignal, options?: ProveOptions): Promise<ProofSession> { return this.proofService.prove(claimId, signal, options) }

  async verify(claimId: string): Promise<VerificationReport> { return this.verificationService.verify(claimId) }

  private storeAttempt(
    workspaceId: string,
    claimId: string,
    formalId: string,
    attemptNumber: number,
    proofSource: string,
    status: ProofAttempt["status"],
    leanVersion: string | null,
    diagnostics: ProofAttempt["diagnostics"],
  ): ProofAttempt { return this.proofService.storeAttempt(workspaceId, claimId, formalId, attemptNumber, proofSource, status, leanVersion, diagnostics) }

  indexStatus() { return this.retrievalService.indexStatus() }

  indexBuild() { return this.retrievalService.indexBuild() }

  async searchTheorems(query: string, options: { goal?: string } = {}): Promise<import("@mathos/retrieval").PremiseRetrievalResult> { return this.retrievalService.searchTheorems(query, options) }

  async premisesForClaim(claimId: string, options: { skipInspect?: boolean } = {}): Promise<import("@mathos/retrieval").PremiseRetrievalResult> { return this.retrievalService.premisesForClaim(claimId, options) }

  private allocateId(prefix: string): string {
    return this.client.db.transaction(() => {
      const row = this.client.db.query<{ next_value: number }, [string]>("SELECT next_value FROM id_allocators WHERE prefix = ?").get(prefix)
      if (!row) {
        const existing = this.client.db.query<{ id: string }, [string]>(
          "SELECT id FROM claims WHERE id LIKE ? UNION ALL SELECT id FROM proof_attempts WHERE id LIKE ? UNION ALL SELECT id FROM research_steps WHERE id LIKE ? UNION ALL SELECT id FROM formal_statements WHERE id LIKE ?",
        ).all(`${prefix}-%`, `${prefix}-%`, `${prefix}-%`, `${prefix}-%`)
        let max = 0
        const pattern = new RegExp(`^${prefix}-(\\d+)$`)
        for (const item of existing) {
          const match = pattern.exec(item.id)
          if (match) max = Math.max(max, Number(match[1]))
        }
        const next = max + 1
        this.client.db.query("INSERT INTO id_allocators (prefix, next_value) VALUES (?, ?)").run(prefix, next + 1)
        return `${prefix}-${padSeq(next)}`
      }
      const next = row.next_value
      this.client.db.query("UPDATE id_allocators SET next_value = next_value + 1 WHERE prefix = ?").run(prefix)
      return `${prefix}-${padSeq(next)}`
    })()
  }

  private chargeLean(reason: "PREMISE_INSPECTION" | "PROOF_COMPILE" | "VERIFICATION" | "AXIOM_AUDIT" | "FORMALIZATION_CHECK"): boolean {
    const accounting = this.currentAccounting()
    if (!accounting) return true
    const usage = normalizeResearchUsage(accounting.usage)
    if (usage.leanCalls + 1 > accounting.limits.maxLeanCalls) return false
    const worker = this.teamStores().agents.getByRun(accounting.id)
    if (worker) {
      const reserved = this.client.db.transaction(() => {
        const session = this.teamStores().sessions.get(worker.sessionId)
        if (!session) return false
        if (session.usage.leanCalls + 1 > session.limits.maxTotalLeanCalls) return false
        session.usage.leanCalls += 1
        this.teamStores().sessions.update(session)
        this.client.db.query(
          "INSERT INTO budget_reservations (id, session_id, agent_id, resource, amount, round_sequence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(createId("rsv"), session.id, worker.id, "LEAN_CALL", 1, session.currentRound + 1, "CONSUMED", nowIso())
        return true
      })()
      if (!reserved) throw new Error("GLOBAL_LEAN_BUDGET_EXHAUSTED")
    }
    usage.leanCalls += 1
    usage.lean.total += 1
    if (reason === "PROOF_COMPILE") usage.lean.proofCompile += 1
    else if (reason === "VERIFICATION") usage.lean.verification += 1
    else if (reason === "PREMISE_INSPECTION") usage.lean.inspection += 1
    else if (reason === "AXIOM_AUDIT") usage.lean.axiomAudit += 1
    else usage.lean.formalization += 1
    accounting.usage = usage
    return true
  }

  private chargeModel(kind: "planner" | "proof" | "formalization"): boolean {
    const accounting = this.currentAccounting()
    if (!accounting) return true
    const usage = normalizeResearchUsage(accounting.usage)
    if (usage.modelCalls + 1 > accounting.limits.maxModelCalls) return false
    const worker = this.teamStores().agents.getByRun(accounting.id)
    if (worker) {
      const reserved = this.client.db.transaction(() => {
        const session = this.teamStores().sessions.get(worker.sessionId)
        if (!session) return false
        if (session.usage.modelCalls + 1 > session.limits.maxTotalModelCalls) return false
        session.usage.modelCalls += 1
        this.teamStores().sessions.update(session)
        this.client.db.query(
          "INSERT INTO budget_reservations (id, session_id, agent_id, resource, amount, round_sequence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(createId("rsv"), session.id, worker.id, "MODEL_CALL", 1, session.currentRound + 1, "CONSUMED", nowIso())
        return true
      })()
      if (!reserved) throw new Error("GLOBAL_MODEL_BUDGET_EXHAUSTED")
    }
    usage.modelCalls += 1
    usage.model.total += 1
    usage.model[kind] += 1
    accounting.usage = usage
    return true
  }

  private chargeProofAttempt(): boolean {
    const accounting = this.currentAccounting()
    if (!accounting) return true
    const usage = normalizeResearchUsage(accounting.usage)
    if (usage.proofAttempts + 1 > accounting.limits.maxProofAttempts) return false
    const worker = this.teamStores().agents.getByRun(accounting.id)
    if (worker) {
      const reserved = this.client.db.transaction(() => {
        const session = this.teamStores().sessions.get(worker.sessionId)
        if (!session) return false
        if (session.usage.proofAttempts + 1 > session.limits.maxTotalProofAttempts) return false
        session.usage.proofAttempts += 1
        this.teamStores().sessions.update(session)
        this.client.db.query(
          "INSERT INTO budget_reservations (id, session_id, agent_id, resource, amount, round_sequence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(createId("rsv"), session.id, worker.id, "PROOF_ATTEMPT", 1, session.currentRound + 1, "CONSUMED", nowIso())
        return true
      })()
      if (!reserved) throw new Error("GLOBAL_PROOF_BUDGET_EXHAUSTED")
      if (this.teamCrashBoundary === "after_reservation") throw new Error("crash")
    }
    usage.proofAttempts += 1
    accounting.usage = usage
    return true
  }

  private researchStores() {
    return { runs: new ResearchRunRepository(this.client.db), steps: new ResearchStepRepository(this.client.db), blockers: new ResearchBlockerRepository(this.client.db), decisions: new ResearchDecisionRepository(this.client.db) }
  }
  startResearch(input: { objectiveClaimId?: string; limits?: Partial<ResearchBudget> } = {}) { return this.researchEngine.start(input) }
  getResearch(id: string) { return this.researchEngine.get(id) }
  researchHistory(id: string) { return this.researchEngine.history(id) }
  researchSummary(id: string) { return this.researchEngine.summary(id) }
  researchTrace(id: string) { return this.researchEngine.trace(id) }
  answerResearch(runId: string, blockerId: string, text: string) { return this.researchEngine.answer(runId, blockerId, text) }
  latestResearch() { return this.researchEngine.latest() }
  pauseResearch(id: string) { return this.researchEngine.pause(id) }
  resumeResearch(id: string) { return this.researchEngine.resume(id) }
  stepResearch(id: string) { return this.researchEngine.step(id) }
  runResearch(id: string) { return this.researchEngine.run(id) }
  private stopRun(run: ResearchRun, reason: ResearchStopReason, status: ResearchRun["status"] = "BLOCKED") { return this.researchEngine.stop(run, reason, status) }
  registerRunPlanner(runId: string, planner: ResearchPlanner) { return this.researchEngine.registerPlanner(runId, planner) }
  restorePersistentPlanners() { return this.researchEngine.restorePersistentPlanners() }

  private teamStores(): TeamResearchStores { return this.teamResearchCoordinator.stores() }

  getTeam(id: string): MultiAgentResearchSession { return this.teamResearchCoordinator.getTeam(id) }
  listTeamSessions(): MultiAgentResearchSession[] { return this.teamResearchCoordinator.listTeamSessions() }
  teamAgents(sessionId: string): ResearchAgentWorker[] { return this.teamResearchCoordinator.teamAgents(sessionId) }
  teamSolutions(sessionId: string): SolutionCandidate[] { return this.teamResearchCoordinator.teamSolutions(sessionId) }
  teamHistory(sessionId: string): MultiAgentRound[] { return this.teamResearchCoordinator.teamHistory(sessionId) }
  teamDigest(sessionId: string, round?: number): SharedResearchDigest | null { return this.teamResearchCoordinator.teamDigest(sessionId, round) }
  startTeam(input: { planners?: ResearchPlanner[]; limits?: Partial<MultiAgentBudget>; workerLimits?: Array<Partial<import("@mathos/domain").ResearchBudget>>; executionMode?: MultiAgentExecutionMode; maxParallelWorkers?: number } = {}): Promise<MultiAgentResearchSession> { return this.teamResearchCoordinator.startTeam(input) }
  pauseTeam(id: string): MultiAgentResearchSession { return this.teamResearchCoordinator.pauseTeam(id) }
  resumeTeam(id: string): MultiAgentResearchSession { return this.teamResearchCoordinator.resumeTeam(id) }
  cancelTeam(id: string): MultiAgentResearchSession { return this.teamResearchCoordinator.cancelTeam(id) }
  stepTeam(id: string): Promise<MultiAgentResearchSession> { return this.teamResearchCoordinator.stepTeam(id) }
  runTeam(id: string): Promise<MultiAgentResearchSession> { return this.teamResearchCoordinator.runTeam(id) }
  teamMergePreview(sessionId: string, agentId: string): MergePreview { return this.teamResearchCoordinator.teamMergePreview(sessionId, agentId) }
  teamOverview(sessionId: string): TeamResearchOverview { return this.teamResearchCoordinator.teamOverview(sessionId) }
  teamImports(sessionId: string): VerifiedArtifactImport[] { return this.teamResearchCoordinator.teamImports(sessionId) }
  getImport(id: string): VerifiedArtifactImport { return this.teamResearchCoordinator.getImport(id) }
  previewImport(id: string): ImportPreview { return this.teamResearchCoordinator.previewImport(id) }
  proposeImport(sessionId: string, sourceAgentId: string, targetAgentId: string, sourceClaimId: string): VerifiedArtifactImport { return this.teamResearchCoordinator.proposeImport(sessionId, sourceAgentId, targetAgentId, sourceClaimId) }
  rejectImport(id: string): VerifiedArtifactImport { return this.teamResearchCoordinator.rejectImport(id) }
  applyImport(id: string): Promise<VerifiedArtifactImport> { return this.teamResearchCoordinator.applyImport(id) }

  private assembleGraphSnapshot(): ResearchGraphSnapshot {
    const workspace = this.requireWorkspace()
    const visibility: ResearchGraphSnapshot["visibility"] = []
    for (const branch of this.branches.list(workspace.id)) {
      for (const row of this.visibility.list(branch.id)) visibility.push({ branchId: branch.id, claimId: row.claimId, relation: row.relation })
    }
    const eventSequence = this.client.db.query<{ n: number }, []>("SELECT COUNT(*) as n FROM events").get()?.n ?? 0
    return {
      workspaceId: workspace.id,
      mainObjectiveId: workspace.mainObjectiveId,
      eventSequence,
      builtAt: nowIso(),
      claims: this.claims.list(workspace.id),
      dependencies: this.dependencies.list(workspace.id),
      formals: this.formalStatements.list(workspace.id),
      proofs: this.proofs.list(workspace.id),
      verifications: this.verificationRuns.list(workspace.id),
      blockers: this.researchStores().blockers.listAll(workspace.id),
      decisions: this.researchStores().decisions.listAll(),
      runs: this.researchStores().runs.list(workspace.id),
      agents: this.teamStores().agents.listAll(),
      branches: this.branches.list(workspace.id),
      imports: this.teamStores().imports.listAll(),
      sessions: this.teamStores().sessions.list(workspace.id),
      visibility,
      experiments: this.experimentService.listWorkspaceExperiments(),
      experimentResults: this.experimentService.listWorkspaceExperiments().flatMap((item) => this.experimentService.experimentResults(item.id)),
      ...this.literatureService.workspaceSnapshot(),
    }
  }

  graphSnapshot(): ResearchGraphSnapshot { return this.researchQueryService.graphSnapshot() }
  buildGraph(options: ResearchGraphBuildOptions = {}): ResearchGraph { return this.researchQueryService.buildGraph(options) }
  graphShow(focusId?: string, options: ResearchGraphBuildOptions & { depth?: number; format?: "text" | "json" | "dot" | "mermaid" } = {}) { return this.researchQueryService.graphShow(focusId, options) }
  graphDependencies(claimId: string) { return this.researchQueryService.graphDependencies(claimId) }
  graphDependents(claimId: string) { return this.researchQueryService.graphDependents(claimId) }
  graphBlockers(claimId: string) { return this.researchQueryService.graphBlockers(claimId) }
  graphPath(fromId: string, toId: string) { return this.researchQueryService.graphPath(fromId, toId) }
  graphCompare(leftId: string, rightId: string) { return this.researchQueryService.graphCompare(leftId, rightId) }
  graphClaimDetail(claimId: string) { return this.researchQueryService.graphClaimDetail(claimId) }
  researchContext(runId?: string) { return this.researchQueryService.researchContext(runId) }
  researchProgress(runId?: string) { return this.researchQueryService.researchProgress(runId) }
  graphFrontier(claimId?: string) { return this.researchQueryService.graphFrontier(claimId) }
  graphBlockingChain(claimId: string) { return this.researchQueryService.graphBlockingChain(claimId) }
  graphSupport(claimId: string) { return this.researchQueryService.graphSupport(claimId) }
  graphUnresolved(claimId: string) { return this.researchQueryService.graphUnresolved(claimId) }
  teamGraphContext(sessionId: string) { return this.researchQueryService.teamGraphContext(sessionId) }

  async createExperiment(input: {
    origin?: import("@mathos/domain").ExperimentOrigin
    kind?: string
    claimId?: string
    hypothesis?: string
    code?: string
    parameters?: Record<string, unknown>
    runId?: string
    agentId?: string
  } = {}): Promise<Experiment> {
    return this.experimentService.createExperiment(input)
  }

  listExperiments(branchId?: string) {
    return this.experimentService.listExperiments(branchId)
  }

  getExperiment(id: string) {
    return this.experimentService.getExperiment(id)
  }

  experimentResults(id: string) {
    return this.experimentService.experimentResults(id)
  }

  async runExperiment(id: string, opts: { timeoutMs?: number; stepId?: string; allowUserAuthored?: boolean } = {}): Promise<ExperimentResult> {
    return this.experimentService.runExperiment(id, opts)
  }

  async rerunExperiment(id: string, opts: { allowUserAuthored?: boolean } = {}) {
    return this.experimentService.rerunExperiment(id, opts)
  }

  formatExperiment(id: string) {
    const experiment = this.getExperiment(id)
    const latest = this.experimentResults(experiment.id).at(-1)
    return [
      `EXPERIMENT · ${experiment.id}`,
      `Claim ${experiment.claimId ?? "none"}`,
      `Kind ${experiment.kind}`,
      `Runtime ${experiment.runtime.adapter} ${experiment.runtime.version ?? ""}`.trim(),
      `Status ${experiment.status}`,
      `Result ${latest?.outcome ?? "none"}`,
      "Epistemic meaning",
      "COMPUTATIONAL EVIDENCE — NOT PROOF",
      `Code sha256: ${experiment.codeHash}`,
    ].join("\n")
  }

  get lastLiteratureSearchId(): string | null { return this.literatureService.lastSearchId }
  set lastLiteratureSearchId(value: string | null) { this.literatureService.lastSearchId = value }

  async searchLiterature(query: string, opts: { claimId?: string; runId?: string; stepId?: string; agentId?: string; maxResults?: number } = {}) {
    return this.literatureService.search(query, opts)
  }

  literatureHits(searchId?: string) { return this.literatureService.hits(searchId) }
  getLiteratureSearch(id: string) { return this.literatureService.getSearch(id) }
  async importSearchResult(searchId: string, index: number) { return this.literatureService.importSearchResult(searchId, index) }
  importSource(input: { type?: Source["type"]; title: string; authors: string[]; year?: number; doi?: string; arxivId?: string; isbn?: string; url?: string; venue?: string; provider?: string; providerId?: string; localPath?: string; fileHash?: string }) { return this.literatureService.importSource(input) }
  addLocalSource(filePath: string, meta: { title?: string; authors?: string[] } = {}) { return this.literatureService.addLocalSource(filePath, meta) }
  listSources() { return this.literatureService.listSources() }
  getSource(id: string) { return this.literatureService.getSource(id) }
  inspectSource(id: string) { return this.literatureService.inspectSource(id) }
  addExcerpt(sourceId: string, text: string, locator?: SourceLocator, method: SourceExcerpt["extractionMethod"] = "USER_PROVIDED") { return this.literatureService.addExcerpt(sourceId, text, locator, method) }
  listExcerpts(sourceId: string) { return this.literatureService.listExcerpts(sourceId) }
  extractExternalResult(input: { sourceId: string; excerptId?: string; kind?: string; name?: string; statementSummary: string; locator?: SourceLocator; statementMode?: "SUMMARY" | "QUOTED_EXCERPT" }) { return this.literatureService.extractExternalResult(input) }
  reviewExternalResult(id: string, status: ExternalResult["status"] = "HUMAN_REVIEWED") { return this.literatureService.reviewExternalResult(id, status) }
  getExternal(id: string) { return this.literatureService.getExternal(id) }
  listExternal(branchId?: string) { return this.literatureService.listExternal(branchId) }
  cite(input: { sourceId: string; claimId?: string; purpose?: CitationPurpose; locator?: SourceLocator; externalResultId?: string; excerptId?: string; runId?: string; stepId?: string }) { return this.literatureService.cite(input) }
  invalidateCitation(id: string) { return this.literatureService.invalidateCitation(id) }
  getCitation(id: string) { return this.literatureService.getCitation(id) }
  listCitations(branchId?: string) { return this.literatureService.listCitations(branchId) }
  linkExternalKnown(claimId: string, externalResultId: string) { return this.literatureService.linkExternalKnown(claimId, externalResultId) }
  formatSource(id: string) { return this.literatureService.formatSource(id) }

  productState(): import("./product-ux.ts").ProductState { return this.researchQueryService.productState() }
  workspaceHome(): string { return this.researchQueryService.workspaceHome() }
  statusSummary(): string { return this.researchQueryService.statusSummary() }
  reopenSummary(): string { return this.researchQueryService.reopenSummary() }
  researchDashboard(): string { return this.researchQueryService.researchDashboard() }
  claimPage(id: string): string { return this.researchQueryService.claimPage(id) }
  whyClaim(id: string): string { return this.researchQueryService.whyClaim(id) }
  ledger(id: string) { return this.researchQueryService.ledger(id) }
  ledgerText(id: string): string { return this.researchQueryService.ledgerText(id) }
  timeline(filter = "all"): string { return this.researchQueryService.timeline(filter) }
  blockersPanel(): string { return this.researchQueryService.blockersPanel() }
  experimentsPanel(): string { return this.researchQueryService.experimentsPanel() }
  literatureHome(): string { return this.researchQueryService.literatureHome() }
  environmentReadinessText(checks: Array<{ name: string; status: string; detail: string }>): string { return this.researchQueryService.environmentReadinessText(checks) }
  exportReport(format: "md" | "json" = "md", dir?: string) { return writeReport(this.productState(), format, dir ?? join(this.root, "reports")) }
  configShow(): string { return this.researchQueryService.configShow() }

  reconcileInterrupted(): { research: string[]; team: string[]; experiments: string[] } {
    const research: string[] = []
    const team: string[] = []
    const experiments: string[] = []
    const at = nowIso()
    try {
      const workspace = this.workspaces.get()
      if (!workspace) return { research, team, experiments }
      const stores = this.researchStores()
      for (const run of stores.runs.list(workspace.id)) {
        if (run.status !== "RUNNING") continue
        for (const step of stores.steps.interrupted(run.id)) {
          step.status = "INTERRUPTED"
          step.finishedAt = at
          step.summary = "process interrupted"
          stores.steps.update(step)
        }
        run.status = "PAUSED"
        run.stopReason = "EXECUTION_FAILURE"
        run.stoppedAt = at
        run.updatedAt = at
        stores.runs.update(run)
        research.push(run.id)
      }
      for (const session of this.teamStores().sessions.list(workspace.id)) {
        if (session.status !== "RUNNING") continue
        session.status = "PAUSED"
        session.stopReason = "FATAL_EXECUTION_ERROR"
        session.stoppedAt = at
        this.teamStores().sessions.update(session)
        team.push(session.id)
      }
      experiments.push(...this.experimentService.reconcileInterrupted(at))
      if (research.length || team.length || experiments.length) {
        this.record("workspace_reopened_after_interrupt", {
          target: workspace.id,
          metadata: { research, team, experiments },
        })
      }
    } catch {
      /* opening a half-created workspace */
    }
    return { research, team, experiments }
  }

  interruptSummary(): string {
    const notes: string[] = []
    const workspace = this.workspaces.get()
    if (!workspace) return ""
    for (const run of this.researchStores().runs.list(workspace.id)) {
      if (run.stopReason === "EXECUTION_FAILURE") notes.push(`${run.id} interrupted`)
    }
    for (const session of this.teamStores().sessions.list(workspace.id)) {
      if (session.stopReason === "FATAL_EXECUTION_ERROR") notes.push(`${session.id} interrupted`)
    }
    for (const experiment of this.experimentService.listWorkspaceExperiments()) {
      if (experiment.status === "FAILED" && experiment.finishedAt) notes.push(`${experiment.id} was interrupted`)
    }
    if (!notes.length) return ""
    return ["Previous session ended unexpectedly.", "", ...notes].join("\n")
  }

  backup(destDir: string) {
    return backupWorkspace(this.root, destDir)
  }

  static restore(archive: string, destDir: string) {
    return restoreWorkspace(archive, destDir)
  }

  exportDiagnosticsBundle(destDir: string) {
    return exportDiagnostics(this.root, destDir, "")
  }

  schemaEpoch(): number {
    return this.client.schemaEpoch()
  }

  static versionText(): string {
    return formatMathosVersion(SCHEMA_EPOCH)
  }
}

export { buildDoctorReport } from "./doctor.ts"
