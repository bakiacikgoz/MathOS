import { basename, join, resolve } from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import {
  type Blocker,
  type Claim,
  type ClaimDetail,
  type ClaimKind,
  type ClaimStatus,
  type Dependency,
  type DependencyRelation,
  type Evidence,
  type EvidenceKind,
  type StatusProjection,
  claimPrefix,
  defaultStatusForKind,
  isClaimStatus,
  nextClaimId,
  statusFamily,
  validateClaimDraft,
  type ResearchDraft,
  type FormalizationSession,
  type FormalStatement,
  type FidelityReview,
  type ProofAttempt,
  type ProofSession,
  type VerificationReport,
  composeProof,
  declarationsMatch,
  nextSequentialId,
  scanForbidden,
  MAIN_BRANCH_ID,
  MAIN_BRANCH_NAME,
  MAIN_BRANCH_SLUG,
  nextBranchId,
  slugifyBranchName,
  gitRefForBranch,
  type ResearchBranch,
  type BranchDetail,
  type MergePreview,
  type MergePreviewItem,
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
} from "@mathos/domain"
import { EventLog, makeEvent } from "@mathos/events"
import {
  createDefaultModelProvider,
  modelDoctorChecks,
  resolveModelConfig,
  type ModelProvider,
} from "@mathos/models"
import { NativeLeanAdapter, type LeanAdapter } from "@mathos/lean"
import {
  buildProofContext,
  extractUnknownIdentifiers,
  HybridPremiseRetriever,
  resolveRetrievalConfig,
  writeRetrievalLog,
  type IndexStatus,
  type PremiseCandidate,
  type PremiseRetriever,
} from "@mathos/retrieval"
import { runResearchIntake } from "./intake.ts"
import { parseProofBody, PROVE_SYSTEM_PROMPT } from "./prove.ts"
import { FormalizationService } from "./services/formalization-service.ts"
import { VerificationService } from "./services/verification-service.ts"
import { ExperimentService } from "./services/experiment-service.ts"
import { LiteratureService } from "./services/literature-service.ts"
import { ResearchEngine } from "./services/research-engine.ts"
import { TeamResearchCoordinator } from "./services/team-research-coordinator.ts"
import {
  buildResearchGraph,
  formatClaimDetail,
  formatGraphDot,
  formatGraphJson,
  formatGraphMermaid,
  formatGraphTree,
  formatGraphContext,
  formatFrontier,
  buildGraphContextSummary,
  buildTeamGraphContext,
  summarizeObjective,
  pathBetween,
  validateResearchGraph,
  type ResearchGraph,
  type ResearchGraphBuildOptions,
  type ResearchGraphSnapshot,
} from "@mathos/graph"
import {
  ClaimNotFound,
  FormalStatementNotFound,
  InvalidClaimStatus,
  ProofAttemptFailed,
  ProofPrerequisiteFailed,
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
  workspaceHome as formatWorkspaceHome,
  formatStatusSummary,
  reopenSummary as formatReopenSummary,
  researchDashboard as formatResearchDashboard,
  claimPage as formatClaimPage,
  whyVerified,
  whyNotVerified,
  epistemicLedger,
  formatLedger,
  sessionTimeline,
  blockerReview,
  experimentPanel,
  literaturePanel,
  formatEnvironmentReadiness,
  writeReport,
  formatConfigShow,
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
  private formalizationService!: FormalizationService
  private verificationService!: VerificationService
  private experimentService!: ExperimentService
  private literatureService!: LiteratureService
  private researchEngine!: ResearchEngine
  private teamResearchCoordinator!: TeamResearchCoordinator
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
    instance.teamResearchCoordinator = new TeamResearchCoordinator(instance as unknown as import("./services/team-research-coordinator.ts").TeamResearchCoordinatorDependencies)
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

  ingest(text: string, signal?: AbortSignal) {
    return runResearchIntake(this.modelProvider, text, signal)
  }

  confirmIntake(draft: ResearchDraft, options: { asMainObjective?: boolean } = {}) {
    return this.createClaim({
      kind: draft.kind,
      title: draft.title,
      statement: draft.normalizedStatement,
      status: draft.suggestedStatus,
      originalInput: draft.originalInput,
      createdBy: "model",
      provider: draft.modelProvenance.provider,
      modelName: draft.modelProvenance.model,
      asMainObjective: options.asMainObjective,
    })
  }

  createClaim(input: {
    kind: ClaimKind | string
    title: string
    naturalStatement?: string
    statement?: string
    status?: ClaimStatus | string
    asMainObjective?: boolean
    originalInput?: string | null
    createdBy?: "user" | "model"
    provider?: string | null
    modelName?: string | null
  }): Claim {
    const draft = validateClaimDraft({
      kind: input.kind,
      title: input.title,
      statement: input.statement ?? input.naturalStatement ?? "",
    })
    const status = input.status ?? defaultStatusForKind(draft.kind)
    if (!isClaimStatus(String(status))) throw new InvalidClaimStatus(String(status))

    const workspace = this.requireWorkspace()
    const branch = this.branches.current(workspace.id)
    if (!branch) throw new Error("Current branch is missing")

    const prefix = claimPrefix(draft.kind)
    const id = this.allocateId(prefix)
    const timestamp = nowIso()

    const claim: Claim = {
      id,
      workspaceId: workspace.id,
      kind: draft.kind,
      title: draft.title,
      naturalStatement: draft.statement,
      originalInput: input.originalInput ?? null,
      status,
      branchId: branch.id,
      createdBy: input.createdBy ?? "user",
      provider: input.provider ?? null,
      modelName: input.modelName ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const run = this.client.db.transaction(() => {
      this.claims.insert(claim)
      this.visibility.insert(branch.id, claim.id, "LOCAL", timestamp)
      if (input.asMainObjective) {
        this.workspaces.setMainObjective(workspace.id, claim.id, timestamp)
      }
    })
    run()

    this.record("claim_created", {
      target: claim.id,
      metadata: {
        claim_id: claim.id,
        claim_type: claim.kind,
        title: claim.title,
        status: claim.status,
        branch: branch.id,
        branch_name: branch.name,
        created_by: claim.createdBy,
        provider: claim.provider,
        model: claim.modelName,
      },
    })
    if (input.asMainObjective) {
      this.record("main_objective_changed", {
        target: claim.id,
        metadata: { previous: workspace.mainObjectiveId, claim_id: claim.id },
      })
    }
    this.logger.info("claim created", { id: claim.id, kind: claim.kind })
    return claim
  }

  listClaims(): Claim[] {
    const branch = this.requireCurrentBranch()
    const visible = this.claims.listVisible(branch.id)
    return visible.length ? visible : this.claims.list(this.requireWorkspace().id).filter((claim) => claim.branchId === branch.id)
  }

  getClaim(id: string): Claim {
    const claim = this.claims.get(id.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(id)
    return claim
  }

  getClaimDetail(id: string): ClaimDetail {
    const workspace = this.requireWorkspace()
    const claim = this.getClaim(id)
    const branch = this.branches.get(claim.branchId)
    return {
      id: claim.id,
      kind: claim.kind,
      title: claim.title,
      status: claim.status,
      naturalStatement: claim.naturalStatement,
      branchName: branch?.name ?? "unknown",
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
      evidence: this.evidence.listForClaim(workspace.id, claim.id).map((item) => ({
        id: item.id,
        kind: item.kind,
        summary: item.summary,
      })),
      dependencies: this.dependencies.listForClaim(workspace.id, claim.id).map((item) => ({
        id: item.id,
        relation: item.relation,
        fromClaimId: item.fromClaimId,
        toClaimId: item.toClaimId,
      })),
    }
  }

  setMainObjective(claimId: string): Claim {
    const workspace = this.requireWorkspace()
    const claim = this.getClaim(claimId)
    const previous = workspace.mainObjectiveId
    this.workspaces.setMainObjective(workspace.id, claim.id, nowIso())
    this.record("main_objective_changed", {
      target: claim.id,
      metadata: { previous, claim_id: claim.id, title: claim.title },
    })
    return claim
  }

  addDependency(fromClaimId: string, toClaimId: string, relation: DependencyRelation = "depends_on"): Dependency {
    const workspace = this.requireWorkspace()
    if (!this.claims.get(fromClaimId)) throw new ClaimNotFound(fromClaimId)
    if (!this.claims.get(toClaimId)) throw new ClaimNotFound(toClaimId)

    const dep: Dependency = {
      id: createId("dep"),
      workspaceId: workspace.id,
      fromClaimId,
      toClaimId,
      relation,
      createdAt: nowIso(),
    }
    this.dependencies.insert(dep)
    this.record("dependency_created", {
      target: dep.id,
      metadata: { from: fromClaimId, to: toClaimId, relation },
    })
    return dep
  }

  addEvidence(input: {
    claimId: string
    kind: EvidenceKind
    summary: string
    artifactRef?: string | null
    reproducible?: boolean
  }): Evidence {
    const workspace = this.requireWorkspace()
    if (!this.claims.get(input.claimId)) throw new ClaimNotFound(input.claimId)
    const evidence: Evidence = {
      id: createId("ev"),
      workspaceId: workspace.id,
      claimId: input.claimId,
      kind: input.kind,
      summary: input.summary,
      artifactRef: input.artifactRef ?? null,
      reproducible: input.reproducible ?? false,
      createdAt: nowIso(),
    }
    this.evidence.insert(evidence)
    this.record("evidence_created", {
      target: evidence.id,
      metadata: { claimId: input.claimId, kind: input.kind },
    })
    return evidence
  }

  addBlocker(input: {
    title: string
    description?: string
    targetClaimId?: string | null
    priority?: Blocker["priority"]
  }): Blocker {
    const workspace = this.requireWorkspace()
    if (input.targetClaimId && !this.claims.get(input.targetClaimId)) {
      throw new ClaimNotFound(input.targetClaimId)
    }
    const blocker: Blocker = {
      id: createId("blk"),
      workspaceId: workspace.id,
      targetClaimId: input.targetClaimId ?? null,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority ?? "normal",
      status: "open",
      createdAt: nowIso(),
      resolvedAt: null,
    }
    this.blockers.insert(blocker)
    this.record("blocker_created", { target: blocker.id, metadata: { title: blocker.title } })
    return blocker
  }

  currentBranch() {
    return this.requireCurrentBranch()
  }

  private requireCurrentBranch() {
    const branch = this.branches.current(this.requireWorkspace().id) ?? this.branches.get(MAIN_BRANCH_ID)
    if (!branch) throw new Error("Current branch is missing")
    return branch
  }

  private leanContext() {
    const run = this.currentAccounting()
    const branch = run ? this.getBranch(run.branchId) : this.branches.current(this.requireWorkspace().id)
    const fsRoot = branch?.worktreePath && branch.id !== MAIN_BRANCH_ID ? branch.worktreePath : this.root
    return { workspaceRoot: this.formalProjectRoot ?? fsRoot, tmpDir: join(fsRoot, ".mathos", "tmp"), signal: this.researchEngine?.currentAbortSignal() }
  }

  listBranches() {
    return this.branches.list(this.requireWorkspace().id)
  }

  getBranch(idOrName: string): ResearchBranch {
    const workspace = this.requireWorkspace()
    const key = idOrName.trim()
    const found = this.branches.get(key.toUpperCase()) ?? this.branches.getByName(workspace.id, key) ?? this.branches.getByName(workspace.id, key.toUpperCase())
    if (!found) throw new Error(`Branch ${idOrName} was not found.`)
    return found
  }

  branchDetail(idOrName = this.requireCurrentBranch().id): BranchDetail {
    const branch = this.getBranch(idOrName)
    const counts = this.visibility.counts(branch.id)
    const parent = branch.parentBranchId ? this.branches.get(branch.parentBranchId) : null
    const proofs = this.listClaims().filter((claim) => this.visibility.relation(branch.id, claim.id) === "LOCAL").reduce((sum, claim) => sum + this.proofs.listForClaim(claim.id).length, 0)
    return {
      branch,
      parent,
      localClaims: counts.local,
      inheritedClaims: counts.inherited,
      proofAttempts: proofs,
      blockers: this.blockers.openCriticalCount(this.requireWorkspace().id),
    }
  }

  async setupResearchVersioning() {
    const status = await this.vcs.initialize(this.root)
    this.record("branch_versioning_initialized", { metadata: { root: status.root } })
    return status
  }

  async createBranch(name: string, purpose?: string): Promise<ResearchBranch> {
    const workspace = this.requireWorkspace()
    const parent = this.requireCurrentBranch()
    const timestamp = nowIso()
    const slug = slugifyBranchName(name)
    const id = parent.id === MAIN_BRANCH_ID && this.branches.ids(workspace.id).length === 1
      ? nextBranchId(this.branches.ids(workspace.id))
      : nextBranchId(this.branches.ids(workspace.id))
    const gitRef = gitRefForBranch(id, slug)
    const worktreePath = `${this.root}/.mathos/worktrees/${id}`
    const branch: ResearchBranch = {
      id,
      workspaceId: workspace.id,
      name: name.trim() || slug,
      slug,
      parentBranchId: parent.id,
      purpose: purpose?.trim() || name.trim(),
      status: "ACTIVE",
      isCurrent: false,
      staleBase: false,
      createdFromEventId: null,
      gitRef: null,
      worktreePath: null,
      setupState: "READY",
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.branches.insert(branch)
    this.visibility.copyInherited(parent.id, id, timestamp)
    const vcs = await this.vcs.detect(this.root)
    if (vcs.initialized) {
      try {
        await this.vcs.createBranch(this.root, gitRef)
        await this.vcs.createWorktree(this.root, gitRef, worktreePath)
        mkdirSync(join(worktreePath, "formal"), { recursive: true })
        mkdirSync(join(worktreePath, "research"), { recursive: true })
        mkdirSync(join(worktreePath, "experiments"), { recursive: true })
        this.branches.updateWorktree(id, gitRef, worktreePath, "READY", timestamp)
        branch.gitRef = gitRef
        branch.worktreePath = worktreePath
      } catch (error) {
        await this.vcs.removeWorktree(this.root, worktreePath, gitRef).catch(() => undefined)
        this.branches.delete(id)
        throw error
      }
    }
    this.record("branch_created", { target: id, metadata: { parent: parent.id, name: branch.name, slug, purpose: branch.purpose, gitRef: branch.gitRef } })
    return this.getBranch(id)
  }

  switchBranch(idOrName: string): ResearchBranch {
    const workspace = this.requireWorkspace()
    const branch = this.getBranch(idOrName)
    if (branch.status === "ABANDONED") throw new Error(`Branch ${branch.id} is abandoned.`)
    const timestamp = nowIso()
    this.branches.setCurrent(workspace.id, branch.id, timestamp)
    this.record("branch_switched", { target: branch.id, metadata: { name: branch.name } })
    return this.getBranch(branch.id)
  }

  pauseBranch(idOrName: string): ResearchBranch {
    const branch = this.getBranch(idOrName)
    this.branches.updateStatus(branch.id, "PAUSED", nowIso())
    this.record("branch_paused", { target: branch.id })
    return this.getBranch(branch.id)
  }

  resumeBranch(idOrName: string): ResearchBranch {
    const branch = this.getBranch(idOrName)
    this.branches.updateStatus(branch.id, "ACTIVE", nowIso())
    this.record("branch_reactivated", { target: branch.id })
    return this.switchBranch(branch.id)
  }

  abandonBranch(idOrName: string): ResearchBranch {
    const branch = this.getBranch(idOrName)
    if (branch.id === MAIN_BRANCH_ID) throw new Error("MAIN cannot be abandoned.")
    const live = this.researchStores().runs.liveOnBranch(this.requireWorkspace().id, branch.id)
    if (live) throw new Error(`ACTIVE_RESEARCH_RUN_EXISTS:${live.id}`)
    if (branch.isCurrent) this.switchBranch(MAIN_BRANCH_ID)
    this.branches.updateStatus(branch.id, "ABANDONED", nowIso())
    this.record("branch_abandoned", { target: branch.id })
    return this.getBranch(branch.id)
  }

  claimRelation(claimId: string): ArtifactRelation {
    const relation = this.visibility.relation(this.requireCurrentBranch().id, this.getClaim(claimId).id)
    return relation === "MERGED" || relation === "INHERITED" || relation === "LOCAL" ? relation : "LOCAL"
  }

  previewMerge(sourceId: string, targetId = MAIN_BRANCH_ID): MergePreview {
    const source = this.getBranch(sourceId)
    const target = this.getBranch(targetId)
    const sourceClaims = this.visibility.list(source.id)
    const targetClaims = new Set(this.visibility.list(target.id).map((item) => item.claimId))
    const items: MergePreviewItem[] = []
    for (const row of sourceClaims.filter((item) => item.relation === "LOCAL")) {
      const claim = this.claims.get(row.claimId)
      if (!claim) continue
      if (!targetClaims.has(claim.id)) {
        const verified = claim.status === "KERNEL_VERIFIED"
        items.push({
          kind: verified ? "verified_proof" : "claim",
          id: claim.id,
          change: "ADDITIVE",
          summary: claim.title,
          safe: true,
          reverifyRequired: verified && source.parentBranchId !== target.id ? true : verified,
        })
      }
    }
    if (source.worktreePath) {
      const compare = (rel: string) => {
        const child = join(source.worktreePath!, rel)
        const parent = join(this.root, rel)
        if (!existsSync(child)) return
        if (!existsSync(parent)) {
          items.push({ kind: rel.startsWith("formal") ? "formal_file" : "research_note", id: rel, change: "ADDITIVE", summary: rel, safe: true })
          return
        }
        if (readFileSync(parent, "utf8") !== readFileSync(child, "utf8")) {
          items.push({ kind: rel.startsWith("formal") ? "formal_file" : "research_note", id: rel, change: "CONFLICT", summary: rel, safe: false })
        }
      }
      const walk = (rel: string) => {
        const dir = join(source.worktreePath!, rel)
        if (!existsSync(dir) || !statSync(dir).isDirectory()) return
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith(".")) continue
          const next = join(rel, entry)
          if (statSync(join(source.worktreePath!, next)).isDirectory()) walk(next)
          else compare(next)
        }
      }
      walk("formal")
      walk("research")
    }
    const conflicts = items.filter((item) => item.change === "CONFLICT").length
    const additiveClaims = items.filter((item) => item.kind === "claim" && item.change === "ADDITIVE").length
    const verifiedProofs = items.filter((item) => item.kind === "verified_proof").length
    const formalChanges = items.filter((item) => item.kind === "formal_file").length
    return {
      sourceId: source.id,
      targetId: target.id,
      items,
      additiveClaims,
      verifiedProofs,
      formalChanges,
      conflicts,
      safeToAutoMerge: conflicts === 0,
    }
  }

  mergeBranch(sourceId: string, options: { applySafe?: boolean } = {}): MergePreview {
    const preview = this.previewMerge(sourceId)
    this.record("branch_merge_started", { target: sourceId, metadata: { conflicts: preview.conflicts } })
    if (!options.applySafe) return preview
    const running = this.researchStores().runs.runningOnBranch(this.requireWorkspace().id, this.getBranch(sourceId).id)
    if (running) throw new Error(`ACTIVE_RESEARCH_RUN_EXISTS:${running.id}`)
    if (preview.conflicts > 0) {
      this.record("branch_merge_conflict", { target: sourceId, metadata: { conflicts: preview.conflicts } })
      throw new Error("Merge has conflicts and cannot auto-apply.")
    }
    const timestamp = nowIso()
    const target = this.getBranch(preview.targetId)
    for (const item of preview.items.filter((row) => row.safe && (row.kind === "claim" || row.kind === "verified_proof"))) {
      const claim = this.claims.get(item.id)
      if (!claim) continue
      this.visibility.insert(target.id, claim.id, "MERGED", timestamp)
      if (item.reverifyRequired && claim.status === "KERNEL_VERIFIED") {
        this.claims.updateStatus(claim.id, "STALE", timestamp)
      }
    }
    this.branches.updateStatus(sourceId, "MERGED", timestamp)
    this.record("branch_merge_completed", { target: sourceId, metadata: { additive: preview.additiveClaims } })
    return preview
  }

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

  listProofs(claimId: string): ProofAttempt[] {
    return this.proofs.listForClaim(this.getClaim(claimId).id)
  }

  async prove(claimId: string, signal?: AbortSignal, options?: { maxAttempts?: number; proofBody?: string; skipInspect?: boolean; skipVerify?: boolean }): Promise<ProofSession> {
    const workspace = this.requireWorkspace()
    const claim = this.getClaim(claimId)
    const formal = this.formalStatements.currentForClaim(claim.id)
    if (!formal) throw new FormalStatementNotFound(claim.id)
    if (formal.verificationStatus !== "ELABORATES") {
      throw new ProofPrerequisiteFailed("Formal statement must elaborate before /prove.")
    }
    if (formal.fidelityStatus === "REJECTED") {
      throw new ProofPrerequisiteFailed("Rejected fidelity cannot be proved.")
    }
    if ((claim.kind === "theorem" || claim.kind === "corollary") && formal.fidelityStatus !== "HUMAN_APPROVED") {
      throw new ProofPrerequisiteFailed("Theorems require HUMAN_APPROVED fidelity before /prove.")
    }

    this.record("proof_attempt_started", { target: claim.id, metadata: { formal_id: formal.id } })
    const attempts: ProofAttempt[] = []
    let previous = ""
    let lastDiagnostics = ""
    let lastRetrieval: ProofSession["retrieval"] = null
    const config = resolveRetrievalConfig(this.root)

    for (let n = 1; n <= (options?.maxAttempts ?? 3); n += 1) {
      if (signal?.aborted) throw new ProofAttemptFailed("Proof attempt cancelled.")
      const unknown = extractUnknownIdentifiers(lastDiagnostics)
      const retrieved = await this.retriever().retrieve({
        query: formal.sourceText,
        goal: formal.sourceText,
        unknownIdentifiers: unknown,
        localBoosts: this.dependencyNames(claim.id),
        dependencyNames: this.dependencyNames(claim.id),
        allowedLocalStatuses: config.includeUnverifiedLocal ? ["KERNEL_VERIFIED", "FORMALIZED_UNVERIFIED"] : ["KERNEL_VERIFIED"],
        maxPremises: config.maxPremises,
        candidatePool: config.candidatePool,
        inspectTopK: config.inspectTopK,
        excludeNames: [formal.declarationName],
        previousNames: attempts.map((item) => item.candidateNames).flat(),
        goalAware: config.goalAware,
        mode: unknown.length ? "DIAGNOSTIC_REPAIR" : "FORMAL_GOAL",
        skipInspect: options?.skipInspect === true || Boolean(this.currentAccounting()),
      })
      lastRetrieval = {
        localCount: retrieved.localCount,
        mathlibCount: retrieved.mathlibCount,
        topNames: retrieved.candidates.slice(0, 6).map((item) => item.declaration.name),
        indexRevision: retrieved.indexRevision,
        mode: retrieved.mode,
        warning: retrieved.warning,
        enrichment: retrieved.enrichment,
        inspectedCount: retrieved.inspectedCount,
        cacheHits: retrieved.cacheHits,
        inspectSelectionStrategy: retrieved.inspectSelectionStrategy,
        inspectSelectorVersion: retrieved.inspectSelectorVersion,
        inspectionLimit: retrieved.inspectionLimit,
        inspectedCandidates: retrieved.inspectedCandidates,
        selectionReasons: retrieved.selectionReasons,
        fusionMethod: retrieved.fusionMethod,
      }
      writeRetrievalLog(this.root, {
        claimId: claim.id,
        attempt: n,
        query: retrieved.query,
        names: retrieved.candidates.map((item) => item.declaration.name),
        mode: retrieved.mode,
        indexRevision: retrieved.indexRevision,
        pool: retrieved.candidatePoolSize,
        inspected: retrieved.inspectedCount,
        cacheHits: retrieved.cacheHits,
        enrichment: retrieved.enrichment,
      })

      const context = buildProofContext({
        formalStatement: formal.sourceText,
        naturalStatement: claim.naturalStatement,
        diagnostics: lastDiagnostics,
        premises: retrieved.candidates,
        goalProfile: retrieved.goalProfile,
        config,
      })
      const body = options?.proofBody ?? await this.modelProvider.generateStructured({
        schemaName: "proof_body",
        signal,
        messages: [
          { role: "system", content: PROVE_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              `Claim ${claim.id}: ${claim.title}`,
              `NATURAL:\n${claim.naturalStatement}`,
              `FORMAL:\n${formal.sourceText}`,
              context,
              previous ? `PREVIOUS PROOF:\n${previous}` : "",
              lastDiagnostics ? `LEAN DIAGNOSTICS:\n${lastDiagnostics}` : "",
              "Return only a proof body. Do not change the statement.",
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
        parse: parseProofBody,
      })
      const source = composeProof(formal.sourceText, body)
      const names = retrieved.candidates.map((item) => item.declaration.name)
      const retrievalProvenance: ProofAttempt["retrievalProvenance"] = {
        inspectSelectionStrategy: retrieved.inspectSelectionStrategy ?? null,
        inspectSelectorVersion: retrieved.inspectSelectorVersion ?? null,
        inspectionLimit: retrieved.inspectionLimit ?? null,
        inspectedCandidates: retrieved.inspectedCandidates ?? [],
        selectionReasons: retrieved.selectionReasons ?? {},
        fusionMethod: retrieved.fusionMethod ?? null,
      }
      if (!declarationsMatch(formal.sourceText, source)) {
        const failed = this.storeAttempt(workspace.id, claim.id, formal.id, n, source, "FAILED", formal.leanVersion, [
          { severity: "error", message: "Proof mutated the formal statement." },
        ], retrieved.query, names, retrieved.indexRevision, retrieved.mode, retrievalProvenance)
        attempts.push(failed)
        this.record("proof_attempt_failed", { target: failed.id, metadata: { reason: "statement_mutated", n } })
        continue
      }
      const forbidden = scanForbidden(source)
      if (forbidden.length) {
        const failed = this.storeAttempt(workspace.id, claim.id, formal.id, n, source, "FAILED", formal.leanVersion, [
          { severity: "error", message: `Forbidden constructs: ${forbidden.join(", ")}` },
        ], retrieved.query, names, retrieved.indexRevision, retrieved.mode, retrievalProvenance)
        attempts.push(failed)
        this.record("proof_attempt_failed", { target: failed.id, metadata: { reason: "forbidden", n } })
        previous = source
        lastDiagnostics = forbidden.join(", ")
        continue
      }

      if (!this.chargeLean("PROOF_COMPILE")) throw new Error("LEAN_CALL_BUDGET_EXHAUSTED")
      if (this.teamCrashBoundary === "after_tool_start") throw new Error("crash")
      const checked = await this.leanAdapter.checkProof(source, {
        workspaceRoot: this.leanContext().workspaceRoot,
        tmpDir: this.leanContext().tmpDir,
        signal: this.leanContext().signal ?? signal,
      })
      if (this.teamCrashBoundary === "after_result") throw new Error("crash")
      if (checked.result === "KERNEL_ACCEPTED") {
        const accepted = this.storeAttempt(workspace.id, claim.id, formal.id, n, source, "KERNEL_ACCEPTED", checked.leanVersion, checked.diagnostics, retrieved.query, names, retrieved.indexRevision, retrieved.mode, retrievalProvenance)
        attempts.push(accepted)
        this.record("proof_attempt_accepted", {
          target: accepted.id,
          metadata: { claim_id: claim.id, formal_id: formal.id, n, lean: checked.leanVersion, premises: names.slice(0, 8) },
        })
        const verification = options?.skipVerify || this.currentAccounting() ? null : await this.verify(claim.id)
        return { claimId: claim.id, formalStatement: formal, attempts, accepted, verification, proofAttempted: true, retrieval: lastRetrieval }
      }

      const failed = this.storeAttempt(workspace.id, claim.id, formal.id, n, source, "FAILED", checked.leanVersion, checked.diagnostics, retrieved.query, names, retrieved.indexRevision, retrieved.mode, retrievalProvenance)
      attempts.push(failed)
      this.record("proof_attempt_failed", { target: failed.id, metadata: { n } })
      previous = source
      lastDiagnostics = checked.diagnostics.map((item) => item.message).join("\n")
    }

    return {
      claimId: claim.id,
      formalStatement: formal,
      attempts,
      accepted: null,
      verification: null,
      proofAttempted: true,
      retrieval: lastRetrieval,
    }
  }

  async verify(claimId: string): Promise<VerificationReport> {
    return this.verificationService.verify(claimId)
  }

  private storeAttempt(
    workspaceId: string,
    claimId: string,
    formalId: string,
    attemptNumber: number,
    proofSource: string,
    status: ProofAttempt["status"],
    leanVersion: string | null,
    diagnostics: ProofAttempt["diagnostics"],
    retrievalQuery: string | null = null,
    candidateNames: string[] = [],
    indexRevision: string | null = null,
    retrievalMode: string | null = null,
    retrievalProvenance: ProofAttempt["retrievalProvenance"] = null,
  ): ProofAttempt {
    const attempt: ProofAttempt = {
      id: this.allocateId("PA"),
      workspaceId,
      claimId,
      formalStatementId: formalId,
      status,
      proofSource,
      attemptNumber,
      provider: this.modelProvider.id,
      modelName: this.modelProvider.model,
      leanVersion,
      diagnostics,
      retrievalQuery,
      candidateNames,
      indexRevision,
      retrievalMode,
      retrievalProvenance,
      createdAt: nowIso(),
    }
    this.proofs.insert(attempt)
    return attempt
  }

  private retriever(): PremiseRetriever {
    if (this.premiseRetriever) return this.premiseRetriever
    return new HybridPremiseRetriever(this.root, () => this.localDecls(), this.leanAdapter)
  }

  private localDecls() {
    return this.listClaims().flatMap((claim) => {
      const formal = this.formalStatements.currentForClaim(claim.id)
      if (!formal) return []
      return [{ name: formal.declarationName, signature: formal.sourceText, claimId: claim.id, claimStatus: claim.status }]
    })
  }

  private dependencyNames(claimId: string): string[] {
    const workspace = this.requireWorkspace()
    return this.dependencies.listForClaim(workspace.id, claimId).flatMap((item) => {
      const other = item.fromClaimId === claimId ? item.toClaimId : item.fromClaimId
      const formal = this.formalStatements.currentForClaim(other)
      return [other, formal?.declarationName ?? ""].filter(Boolean)
    })
  }

  indexStatus(): IndexStatus {
    const hybrid = this.retriever()
    if (hybrid instanceof HybridPremiseRetriever) {
      return hybrid.status(null)
    }
    return { present: true, stale: false, manifest: null, reason: "in-memory retriever" }
  }

  indexBuild() {
    const envPromise = this.leanAdapter.detect(this.root)
    return envPromise.then((env) => {
      const hybrid = this.retriever()
      if (!(hybrid instanceof HybridPremiseRetriever)) {
        return { revision: "memory", declarationCount: 0, mathlibCount: 0, workspaceCount: 0, builtAt: new Date().toISOString() }
      }
      return hybrid.build(env.leanVersion)
    })
  }

  async searchTheorems(query: string, options: { goal?: string } = {}): Promise<import("@mathos/retrieval").PremiseRetrievalResult> {
    const config = resolveRetrievalConfig(this.root)
    const looksFormal = /theorem |lemma |:\s*\S/.test(query)
    return this.retriever().retrieve({
      query,
      goal: options.goal ?? (looksFormal ? query : undefined),
      maxPremises: config.maxPremises,
      candidatePool: config.candidatePool,
      inspectTopK: config.inspectTopK,
      goalAware: config.goalAware,
    })
  }

  async premisesForClaim(claimId: string, options: { skipInspect?: boolean } = {}): Promise<import("@mathos/retrieval").PremiseRetrievalResult> {
    const claim = this.getClaim(claimId)
    const formal = this.formalStatements.currentForClaim(claim.id)
    const config = resolveRetrievalConfig(this.root)
    return this.retriever().retrieve({
      query: formal?.sourceText ?? `${claim.title} ${claim.naturalStatement}`,
      goal: formal?.sourceText,
      localBoosts: this.dependencyNames(claim.id),
      dependencyNames: this.dependencyNames(claim.id),
      allowedLocalStatuses: config.includeUnverifiedLocal ? ["KERNEL_VERIFIED", "FORMALIZED_UNVERIFIED"] : ["KERNEL_VERIFIED"],
      maxPremises: config.maxPremises,
      candidatePool: config.candidatePool,
      inspectTopK: config.inspectTopK,
      excludeNames: formal ? [formal.declarationName] : [],
      goalAware: config.goalAware,
      mode: formal ? "FORMAL_GOAL" : "NATURAL_FALLBACK",
      skipInspect: options.skipInspect === true,
    })
  }

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

  private teamStores() { return this.teamResearchCoordinator.stores() }

  getTeam(id: string): MultiAgentResearchSession { return this.teamResearchCoordinator.getTeam(id) }
  listTeamSessions() { return this.teamResearchCoordinator.listTeamSessions() }
  teamAgents(sessionId: string) { return this.teamResearchCoordinator.teamAgents(sessionId) }
  teamSolutions(sessionId: string) { return this.teamResearchCoordinator.teamSolutions(sessionId) }
  teamHistory(sessionId: string) { return this.teamResearchCoordinator.teamHistory(sessionId) }
  teamDigest(sessionId: string, round?: number) { return this.teamResearchCoordinator.teamDigest(sessionId, round) }
  startTeam(input: { planners?: ResearchPlanner[]; limits?: Partial<MultiAgentBudget>; workerLimits?: Array<Partial<import("@mathos/domain").ResearchBudget>>; executionMode?: MultiAgentExecutionMode; maxParallelWorkers?: number } = {}) { return this.teamResearchCoordinator.startTeam(input) }
  pauseTeam(id: string) { return this.teamResearchCoordinator.pauseTeam(id) }
  resumeTeam(id: string) { return this.teamResearchCoordinator.resumeTeam(id) }
  cancelTeam(id: string) { return this.teamResearchCoordinator.cancelTeam(id) }
  stepTeam(id: string) { return this.teamResearchCoordinator.stepTeam(id) }
  runTeam(id: string) { return this.teamResearchCoordinator.runTeam(id) }
  teamMergePreview(sessionId: string, agentId: string) { return this.teamResearchCoordinator.teamMergePreview(sessionId, agentId) }
  teamOverview(sessionId: string) { return this.teamResearchCoordinator.teamOverview(sessionId) }
  teamImports(sessionId: string) { return this.teamResearchCoordinator.teamImports(sessionId) }
  getImport(id: string) { return this.teamResearchCoordinator.getImport(id) }
  previewImport(id: string) { return this.teamResearchCoordinator.previewImport(id) }
  proposeImport(sessionId: string, sourceAgentId: string, targetAgentId: string, sourceClaimId: string) { return this.teamResearchCoordinator.proposeImport(sessionId, sourceAgentId, targetAgentId, sourceClaimId) }
  rejectImport(id: string) { return this.teamResearchCoordinator.rejectImport(id) }
  applyImport(id: string) { return this.teamResearchCoordinator.applyImport(id) }

  graphSnapshot(): ResearchGraphSnapshot {
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

  buildGraph(options: ResearchGraphBuildOptions = {}): ResearchGraph {
    const snapshot = this.graphSnapshot()
    if (options.teamSessionId) {
      const session = this.getTeam(options.teamSessionId)
      const agents = this.teamAgents(session.id)
      const allowed = new Set(snapshot.visibility.filter((row) => row.branchId === session.sourceBranchId || agents.some((agent) => agent.branchId === row.branchId)).map((row) => `${row.branchId}:${row.claimId}`))
      snapshot.visibility = snapshot.visibility.filter((row) => allowed.has(`${row.branchId}:${row.claimId}`))
      return buildResearchGraph(snapshot, { ...options, includeResearchRuntime: true, includeImports: true })
    }
    return buildResearchGraph(snapshot, { branchId: options.branchId ?? this.requireCurrentBranch().id, ...options })
  }

  graphShow(focusId?: string, options: ResearchGraphBuildOptions & { depth?: number; format?: "text" | "json" | "dot" | "mermaid" } = {}) {
    const graph = this.buildGraph({ ...options, proofOnly: options.proofOnly ?? options.format !== "json" })
    const focus = focusId ?? graph.metadata.focusNodeId
    const analysis = buildGraphContextSummary(graph, { focusClaimId: focus })
    if (options.format === "json") return formatGraphJson(graph, { ...analysis })
    if (options.format === "dot") return formatGraphDot(graph)
    if (options.format === "mermaid") return formatGraphMermaid(graph)
    return formatGraphTree(graph, focus, options.depth ?? 2)
  }

  graphDependencies(claimId: string) {
    const graph = this.buildGraph()
    return graph.edges.filter((edge) => edge.kind === "DEPENDS_ON" && edge.fromNodeId === claimId.toUpperCase()).map((edge) => `${edge.fromNodeId} DEPENDS_ON ${edge.toNodeId}`)
  }

  graphDependents(claimId: string) {
    const graph = this.buildGraph()
    return graph.edges.filter((edge) => edge.kind === "DEPENDS_ON" && edge.toNodeId === claimId.toUpperCase()).map((edge) => `${edge.fromNodeId} DEPENDS_ON ${edge.toNodeId}`)
  }

  graphBlockers(claimId: string) {
    const graph = this.buildGraph()
    return graph.edges.filter((edge) => edge.kind === "BLOCKS" && edge.toNodeId === claimId.toUpperCase()).map((edge) => edge.fromNodeId)
  }

  graphPath(fromId: string, toId: string) {
    return pathBetween(this.buildGraph(), fromId.toUpperCase(), toId.toUpperCase())
  }

  graphCompare(leftId: string, rightId: string) {
    const left = this.buildGraph({ branchId: leftId.toUpperCase(), includeResearchRuntime: true, includeImports: true, proofOnly: false })
    const right = this.buildGraph({ branchId: rightId.toUpperCase(), includeResearchRuntime: true, includeImports: true, proofOnly: false })
    const leftClaims = new Set(left.nodes.filter((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE").map((node) => node.id))
    const rightClaims = new Set(right.nodes.filter((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE").map((node) => node.id))
    return {
      left: leftId.toUpperCase(),
      right: rightId.toUpperCase(),
      shared: [...leftClaims].filter((id) => rightClaims.has(id)).sort(),
      onlyLeft: [...leftClaims].filter((id) => !rightClaims.has(id)).sort(),
      onlyRight: [...rightClaims].filter((id) => !leftClaims.has(id)).sort(),
      leftVerified: left.nodes.filter((node) => node.epistemicStatus === "KERNEL_VERIFIED").map((node) => node.id).sort(),
      rightVerified: right.nodes.filter((node) => node.epistemicStatus === "KERNEL_VERIFIED").map((node) => node.id).sort(),
      leftBlockers: left.nodes.filter((node) => node.kind === "BLOCKER").map((node) => node.id),
      rightBlockers: right.nodes.filter((node) => node.kind === "BLOCKER").map((node) => node.id),
    }
  }

  graphClaimDetail(claimId: string) {
    return formatClaimDetail(this.buildGraph({ includeResearchRuntime: true }), claimId.toUpperCase())
  }

  researchContext(runId?: string) {
    const run = runId ? this.getResearch(runId) : this.latestResearch()
    const objective = (run?.objectiveClaimId ?? this.requireWorkspace().mainObjectiveId)
      ? this.getClaim((run?.objectiveClaimId ?? this.requireWorkspace().mainObjectiveId)!)
      : null
    const graph = this.buildGraph({ branchId: run?.branchId ?? this.requireCurrentBranch().id, includeImports: true })
    const summary = buildGraphContextSummary(graph, { focusClaimId: run?.strategy.focusClaimId ?? objective?.id ?? null })
    return { run, objective, graph, summary, text: formatGraphContext(summary) }
  }

  researchProgress(runId?: string) {
    const ctx = this.researchContext(runId)
    const run = ctx.run
    const objective = ctx.objective
    const lines = [
      run ? `RESEARCH RUN ${run.id}` : "WORKSPACE",
      `Objective ${objective?.id ?? "none"} · ${objective?.status ?? "n/a"}`,
      run ? `Focus ${run.strategy.focusClaimId ?? run.objectiveClaimId ?? "none"}` : `Focus ${objective?.id ?? "none"}`,
      `Structural frontier ${ctx.summary.unverifiedFrontier.length} claims`,
      `Verified prerequisites ${ctx.summary.verifiedPrerequisites.length}`,
      `Open blockers ${ctx.summary.openBlockingChain.length}`,
      `Computational evidence ${ctx.summary.computationalEvidence.length}`,
    ]
    if (run) {
      lines.push(`Steps ${run.usage.steps} / ${run.limits.maxSteps}`)
      lines.push(`Lean ${run.usage.leanCalls} / ${run.limits.maxLeanCalls}`)
      lines.push(`Model ${run.usage.modelCalls} / ${run.limits.maxModelCalls}`)
    }
    lines.push(summarizeObjective(ctx.graph, objective?.id ?? ctx.summary.objectiveClaimId ?? "none"))
    return lines.join("\n")
  }

  graphFrontier(claimId?: string) {
    const graph = this.buildGraph({ includeImports: true })
    const summary = buildGraphContextSummary(graph, { focusClaimId: claimId?.toUpperCase() ?? graph.metadata.focusNodeId })
    return { text: formatFrontier(summary), summary }
  }

  graphBlockingChain(claimId: string) {
    const graph = this.buildGraph({ includeImports: true })
    const summary = buildGraphContextSummary(graph, { focusClaimId: claimId.toUpperCase() })
    return summary.openBlockingChain
  }

  graphSupport(claimId: string) {
    const graph = this.buildGraph({ includeImports: true })
    return buildGraphContextSummary(graph, { focusClaimId: claimId.toUpperCase() }).verifiedPrerequisites
  }

  graphUnresolved(claimId: string) {
    const graph = this.buildGraph({ includeImports: true })
    return buildGraphContextSummary(graph, { focusClaimId: claimId.toUpperCase() }).unverifiedFrontier
  }

  teamGraphContext(sessionId: string) {
    const session = this.getTeam(sessionId)
    const graph = this.buildGraph({ teamSessionId: session.id, includeResearchRuntime: true, includeImports: true, proofOnly: false })
    const agents = this.teamAgents(session.id)
    return buildTeamGraphContext({
      graph,
      workers: agents.map((agent) => ({
        agentId: agent.id,
        branchId: agent.branchId,
        focusClaimId: this.getResearch(agent.researchRunId).strategy.focusClaimId,
        localClaimId: agent.localClaimId,
      })),
      solutions: this.teamSolutions(session.id).map((item) => item.claimId),
    })
  }

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

  productState(): import("./product-ux.ts").ProductState {
    const workspace = this.requireWorkspace()
    const snapshot = this.graphSnapshot()
    const events = this.eventRows.list(workspace.id)
    const steps = snapshot.runs.flatMap((run) => this.researchStores().steps.list(run.id))
    return { projectName: workspace.name, workspaceRoot: this.root, snapshot, events, steps }
  }

  workspaceHome(): string {
    return formatWorkspaceHome(this.productState())
  }

  statusSummary(): string {
    return formatStatusSummary(this.productState())
  }

  reopenSummary(): string {
    const extra = this.interruptSummary()
    const base = formatReopenSummary(this.productState())
    return extra ? `${extra}\n\n${base}` : base
  }

  researchDashboard(): string {
    return formatResearchDashboard(this.productState())
  }

  claimPage(id: string): string {
    return formatClaimPage(this.productState(), id)
  }

  whyClaim(id: string): string {
    const state = this.productState()
    const claim = state.snapshot.claims.find((item) => item.id === id)
    return claim?.status === "KERNEL_VERIFIED" ? whyVerified(state, id) : whyNotVerified(state, id)
  }

  ledger(id: string) {
    return epistemicLedger(this.productState(), id)
  }

  ledgerText(id: string): string {
    return formatLedger(this.ledger(id))
  }

  timeline(filter = "all"): string {
    return sessionTimeline(this.productState(), filter)
  }

  blockersPanel(): string {
    return blockerReview(this.productState())
  }

  experimentsPanel(): string {
    return experimentPanel(this.productState())
  }

  literatureHome(): string {
    return literaturePanel(this.productState())
  }

  environmentReadinessText(checks: Array<{ name: string; status: string; detail: string }>): string {
    return formatEnvironmentReadiness(checks)
  }

  exportReport(format: "md" | "json" = "md", dir?: string) {
    return writeReport(this.productState(), format, dir ?? join(this.root, "reports"))
  }

  configShow(): string {
    return formatConfigShow(this.root)
  }

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
