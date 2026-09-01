import { basename, join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { AsyncLocalStorage } from "node:async_hooks"
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs"
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
import { draftFormalization } from "./formalize.ts"
import { reviewFidelity } from "./fidelity.ts"
import { parseProofBody, PROVE_SYSTEM_PROMPT } from "./prove.ts"
import { runVerificationGate } from "./verify.ts"
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
  FormalizationFailed,
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
import { PythonRuntime, recipeCode, parseStructured, sha256Text, canonicalJson, type ComputationalRuntime } from "@mathos/computation"
import { FakeLiteratureProvider, queryFingerprint, sourceFingerprint, type LiteratureProvider, type LiteratureSearchResult } from "@mathos/literature"
import { DEFAULT_COMPUTATIONAL_BUDGET, isExperimentKind, type Experiment, type ExperimentKind, type ExperimentResult, type RuntimeDescriptor, type CitationPurpose, type ExternalResultKind, type SourceLocator, type Source, type SourceExcerpt, type Citation, type ExternalResult, formatLocator } from "@mathos/domain"

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

  private accounting: ResearchRun | null = null
  lastExperimentPid: number | null = null
  private readonly runAccounting = new AsyncLocalStorage<ResearchRun>()
  private readonly runPlanners = new Map<string, ResearchPlanner>()
  private teamPauseRequested = new Set<string>()
  private teamCancelRequested = new Set<string>()
  private readonly stepAbort = new AsyncLocalStorage<AbortSignal>()
  readonly parallelTimings: Array<{ agentId: string; start: number; end: number }> = []
  peakConcurrency = 0
  private liveLeases = 0
  lastPlannerContextByRun = new Map<string, import("./research-planner.ts").ResearchContextView>()
  private frozenDigestBySession = new Map<string, SharedResearchDigest | null>()

  private currentAccounting(): ResearchRun | null {
    return this.runAccounting.getStore() ?? this.accounting
  }

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
    return { workspaceRoot: this.formalProjectRoot ?? fsRoot, tmpDir: join(fsRoot, ".mathos", "tmp"), signal: this.stepAbort.getStore() }
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
    const workspace = this.requireWorkspace()
    const claim = this.getClaim(claimId)
    let draft = await draftFormalization(this.modelProvider, claim)
    this.record("formalization_drafted", {
      target: claim.id,
      metadata: { declaration: draft.declarationName, provider: draft.modelProvenance.provider },
    })

    let repairs = 0
    let check = await this.leanAdapter.checkStatement(draft.leanStatement, {
      workspaceRoot: this.leanContext().workspaceRoot,
      tmpDir: `${this.root}/.mathos/tmp`,
    })
    while (check.result !== "ELABORATES" && repairs < 2) {
      repairs += 1
      draft = await draftFormalization(this.modelProvider, claim, {
        previous: draft.leanStatement,
        diagnostics: check.diagnostics.map((item) => item.message).join("\n"),
      })
      check = await this.leanAdapter.checkStatement(draft.leanStatement, {
        workspaceRoot: this.leanContext().workspaceRoot,
        tmpDir: `${this.root}/.mathos/tmp`,
      })
    }
    if (check.result !== "ELABORATES") {
      throw new FormalizationFailed("FORMALIZATION_FAILED: Lean statement did not elaborate after 2 repairs.")
    }

    const timestamp = nowIso()
    const id = nextSequentialId(this.formalStatements.ids(workspace.id), "FS")
    this.formalStatements.markOthersNotCurrent(claim.id)
    const statement: FormalStatement = {
      id,
      workspaceId: workspace.id,
      claimId: claim.id,
      language: "lean4",
      declarationName: draft.declarationName,
      sourceText: draft.leanStatement,
      filePath: null,
      isCurrent: true,
      verificationStatus: "ELABORATES",
      fidelityStatus: "AI_REVIEWED",
      createdBy: "model",
      provider: draft.modelProvenance.provider,
      modelName: draft.modelProvenance.model,
      leanVersion: check.leanVersion,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.formalStatements.insert(statement)
    this.record("formal_statement_created", {
      target: statement.id,
      metadata: { claim_id: claim.id, declaration: statement.declarationName, lean: check.leanVersion },
    })

    this.verificationRuns.insert({
      id: createId("vr"),
      workspaceId: workspace.id,
      formalStatementId: statement.id,
      claimId: claim.id,
      proofAttemptId: null,
      result: "ELABORATES",
      leanVersion: check.leanVersion,
      toolchain: check.toolchain,
      diagnosticsJson: JSON.stringify(check.diagnostics),
      axiomsJson: "[]",
      forbiddenJson: "[]",
      fidelityStatus: statement.fidelityStatus,
      gateJson: "[]",
      createdAt: timestamp,
    })
    this.record("formal_statement_checked", {
      target: statement.id,
      metadata: { result: "ELABORATES", repairs },
    })

    const reviewed = await reviewFidelity(this.auditorProvider, {
      claimId: claim.id,
      naturalStatement: claim.naturalStatement,
      leanStatement: statement.sourceText,
    })
    const fidelity: FidelityReview = {
      ...reviewed,
      id: createId("fr"),
      workspaceId: workspace.id,
      formalStatementId: statement.id,
      createdAt: timestamp,
    }
    this.fidelityReviews.insert(fidelity)
    this.record("fidelity_review_completed", {
      target: statement.id,
      metadata: { verdict: fidelity.verdict, provider: fidelity.provider },
    })

    if (claim.status === "KERNEL_VERIFIED") {
      throw new FormalizationFailed("Refusing to treat elaboration as kernel verification.")
    }

    return {
      claimId: claim.id,
      formalStatement: statement,
      check: { result: check.result, diagnostics: check.diagnostics, repairs },
      fidelity,
      proofAttempted: false,
    }
  }

  getFormal(claimId: string): FormalStatement {
    const statement = this.formalStatements.currentForClaim(this.getClaim(claimId).id)
    if (!statement) throw new FormalStatementNotFound(claimId)
    return statement
  }

  getFidelity(formalId: string): FidelityReview | null {
    return this.fidelityReviews.latestForFormal(formalId)
  }

  approveFormal(formalId: string): FormalStatement {
    const statement = this.formalStatements.get(formalId)
    if (!statement) throw new FormalStatementNotFound(formalId)
    const claim = this.getClaim(statement.claimId)
    if (statement.verificationStatus !== "ELABORATES") {
      throw new FormalizationFailed("Cannot approve a statement that does not elaborate.")
    }
    const timestamp = nowIso()
    this.formalStatements.updateStatuses(statement.id, "ELABORATES", "HUMAN_APPROVED", timestamp, maybeWriteFormalFile(this.root, claim.id, statement.sourceText))
    if (claim.status !== "KERNEL_VERIFIED" && claim.status !== "INDEPENDENTLY_CHECKED") {
      this.claims.updateStatus(claim.id, "FORMALIZED_UNVERIFIED", timestamp)
    }
    this.record("fidelity_approved", { target: statement.id, metadata: { claim_id: claim.id } })
    return this.formalStatements.get(statement.id)!
  }

  rejectFormal(formalId: string): FormalStatement {
    const statement = this.formalStatements.get(formalId)
    if (!statement) throw new FormalStatementNotFound(formalId)
    this.formalStatements.updateStatuses(statement.id, statement.verificationStatus, "REJECTED", nowIso())
    this.record("fidelity_rejected", { target: statement.id, metadata: { claim_id: statement.claimId } })
    return this.formalStatements.get(statement.id)!
  }

  formalSetup() {
    return this.leanAdapter.setupProject(this.root)
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
        skipInspect: options?.skipInspect === true || Boolean(this.accounting),
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
        const verification = options?.skipVerify || this.accounting ? null : await this.verify(claim.id)
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
    const workspace = this.requireWorkspace()
    const claim = this.getClaim(claimId)
    const formal = this.formalStatements.currentForClaim(claim.id)
    if (!formal) throw new FormalStatementNotFound(claim.id)
    const proof = this.proofs.latestAccepted(claim.id)
    this.record("verification_started", { target: claim.id, metadata: { formal_id: formal.id, proof_id: proof?.id ?? null } })

    if (proof && !this.chargeLean("VERIFICATION")) throw new Error("LEAN_CALL_BUDGET_EXHAUSTED")
    const compiled = proof
      ? (await this.leanAdapter.checkProof(proof.proofSource, { workspaceRoot: this.leanContext().workspaceRoot, tmpDir: this.leanContext().tmpDir })).result ===
        "KERNEL_ACCEPTED"
      : false
    if (proof && !this.chargeLean("AXIOM_AUDIT")) throw new Error("LEAN_CALL_BUDGET_EXHAUSTED")
    const axioms = proof
      ? await this.leanAdapter.printAxioms(formal.declarationName, proof.proofSource, {
          workspaceRoot: this.leanContext().workspaceRoot,
          tmpDir: this.leanContext().tmpDir,
        })
      : []
    const env = await this.leanAdapter.detect(this.leanContext().workspaceRoot)
    const report = runVerificationGate({
      claim,
      formal,
      proof,
      axioms,
      leanVersion: env.leanVersion,
      toolchain: env.toolchain,
      compiled,
      currentRevision: formal.isCurrent,
    })

    this.verificationRuns.insert({
      id: createId("vr"),
      workspaceId: workspace.id,
      formalStatementId: formal.id,
      claimId: claim.id,
      proofAttemptId: proof?.id ?? null,
      result: report.passed ? "KERNEL_ACCEPTED" : "FAILED",
      leanVersion: env.leanVersion,
      toolchain: env.toolchain,
      diagnosticsJson: "[]",
      axiomsJson: JSON.stringify(axioms),
      forbiddenJson: JSON.stringify(proof ? scanForbidden(proof.proofSource) : []),
      fidelityStatus: formal.fidelityStatus,
      gateJson: JSON.stringify(report.checks),
      createdAt: nowIso(),
    })

    if (report.passed) {
      this.claims.updateStatus(claim.id, "KERNEL_VERIFIED", nowIso())
      writeProofFile(this.root, claim.id, proof!.proofSource)
      this.record("verification_passed", { target: claim.id, metadata: { formal_id: formal.id, proof_id: proof?.id } })
      this.record("claim_kernel_verified", { target: claim.id, metadata: { formal_id: formal.id } })
    } else {
      this.record("verification_failed", { target: claim.id, metadata: { reasons: report.checks.filter((c) => c.status === "FAIL").map((c) => c.name) } })
    }
    return { ...report, claimStatus: report.passed ? "KERNEL_VERIFIED" : this.getClaim(claim.id).status }
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
    return {
      runs: new ResearchRunRepository(this.client.db),
      steps: new ResearchStepRepository(this.client.db),
      blockers: new ResearchBlockerRepository(this.client.db),
      decisions: new ResearchDecisionRepository(this.client.db),
    }
  }

  private planner(): ResearchPlanner {
    return this.researchPlanner ?? new ModelResearchPlanner(this.modelProvider)
  }

  startResearch(input: { objectiveClaimId?: string; limits?: Partial<ResearchBudget> } = {}): ResearchRun {
    const workspace = this.requireWorkspace()
    const branch = this.requireCurrentBranch()
    const objectiveId = input.objectiveClaimId ?? workspace.mainObjectiveId
    if (!objectiveId) throw new Error("Research requires an objective claim.")
    const stores = this.researchStores()
    const existing = stores.runs.activeOnBranch(workspace.id, branch.id, objectiveId)
    if (existing && (existing.status === "RUNNING" || existing.status === "READY")) {
      throw new Error("ACTIVE_RESEARCH_RUN_EXISTS")
    }
    const timestamp = nowIso()
    const run: ResearchRun = {
      id: nextPrefixedId(stores.runs.ids(workspace.id), "R"),
      workspaceId: workspace.id,
      branchId: branch.id,
      objectiveClaimId: objectiveId,
      status: "READY",
      startedAt: null,
      stoppedAt: null,
      currentStep: 0,
      limits: { ...DEFAULT_RESEARCH_BUDGET, ...input.limits },
      usage: emptyResearchUsage(),
      stopReason: null,
      strategy: { focusClaimId: objectiveId, exhaustedApproaches: [], activeBlockerIds: [] },
      agentId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    stores.runs.insert(run)
    this.record("research_run_created", { target: run.id, metadata: { runId: run.id, branchId: branch.id, objectiveClaimId: objectiveId } })
    return run
  }

  getResearch(id: string): ResearchRun {
    const run = this.researchStores().runs.get(id.toUpperCase())
    if (!run) throw new Error(`Research run ${id} was not found.`)
    return run
  }

  researchHistory(id: string) {
    return this.researchStores().steps.list(this.getResearch(id).id)
  }

  researchSummary(id: string): string {
    const run = this.getResearch(id)
    const claims = this.claims.listVisible(run.branchId)
    return deterministicResearchSummary({
      run,
      createdClaims: claims.filter((claim) => claim.createdAt >= run.createdAt).length,
      verifiedLemmas: claims.filter((claim) => claim.status === "KERNEL_VERIFIED").length,
      openBlockers: this.researchStores().blockers.open(run.branchId).length,
      currentApproach: run.strategy.currentApproach,
    })
  }

  researchTrace(id: string): string {
    const run = this.getResearch(id)
    const steps = this.researchHistory(id)
    return [
      run.id,
      "",
      ...steps.map((step) => `${step.id} ${step.action.padEnd(18)} ${step.status}`),
      "",
      "STOP",
      run.stopReason ?? run.status,
    ].join("\n")
  }

  answerResearch(runId: string, blockerId: string, text: string) {
    const run = this.getResearch(runId)
    const blocker = this.researchStores().blockers.get(blockerId.toUpperCase())
    if (!blocker) throw new Error(`Blocker ${blockerId} was not found.`)
    this.researchStores().blockers.answer(blocker.id, text, nowIso())
    this.record("research_blocker_resolved", { target: blocker.id, metadata: { runId: run.id, branchId: run.branchId, human: true } })
    return this.researchStores().blockers.get(blocker.id)
  }

  latestResearch(): ResearchRun | null {
    const ids = this.researchStores().runs.ids(this.requireWorkspace().id)
    const last = ids.at(-1)
    return last ? this.getResearch(last) : null
  }

  pauseResearch(id: string): ResearchRun {
    const stores = this.researchStores()
    const run = this.getResearch(id)
    run.status = "PAUSED"
    run.stopReason = "USER_PAUSED"
    run.stoppedAt = nowIso()
    run.updatedAt = run.stoppedAt
    stores.runs.update(run)
    this.record("research_run_paused", { target: run.id, metadata: { runId: run.id, branchId: run.branchId } })
    return run
  }

  resumeResearch(id: string): ResearchRun {
    const stores = this.researchStores()
    const run = this.getResearch(id)
    for (const step of stores.steps.interrupted(run.id)) {
      step.status = "INTERRUPTED"
      step.finishedAt = nowIso()
      stores.steps.update(step)
    }
    run.status = "READY"
    run.stopReason = null
    run.stoppedAt = null
    run.updatedAt = nowIso()
    stores.runs.update(run)
    this.record("research_run_resumed", { target: run.id, metadata: { runId: run.id, branchId: run.branchId } })
    return run
  }

  async stepResearch(id: string): Promise<ResearchRun> {
    const stores = this.researchStores()
    const run = this.getResearch(id)
    if (run.status === "COMPLETED" || run.status === "CANCELLED") return run
    if (run.usage.steps >= run.limits.maxSteps) return this.stopRun(run, "STEP_BUDGET_EXHAUSTED")
    const worker = this.teamStores().agents.getByRun(run.id)
    if (run.usage.modelCalls >= run.limits.maxModelCalls) return this.stopRun(run, worker ? "LOCAL_MODEL_BUDGET_EXHAUSTED" : "MODEL_CALL_BUDGET_EXHAUSTED")
    if (run.usage.proofAttempts >= run.limits.maxProofAttempts) return this.stopRun(run, worker ? "LOCAL_PROOF_BUDGET_EXHAUSTED" : "PROOF_ATTEMPT_BUDGET_EXHAUSTED")
    if (run.usage.leanCalls >= run.limits.maxLeanCalls) return this.stopRun(run, worker ? "LOCAL_LEAN_BUDGET_EXHAUSTED" : "LEAN_CALL_BUDGET_EXHAUSTED")

    const previousBranch = this.requireCurrentBranch()
    if (previousBranch.id !== run.branchId) this.switchBranch(run.branchId)
    this.accounting = run
    try {
      return await this.runAccounting.run(run, async () => {
        try {
          const objective = run.objectiveClaimId ? this.getClaim(run.objectiveClaimId) : null
          if (objective?.status === "KERNEL_VERIFIED") return this.stopRun(run, "OBJECTIVE_KERNEL_VERIFIED", "COMPLETED")
          const formal = objective ? this.formalStatements.currentForClaim(objective.id) : null
          const fidelityBlocked = formal?.fidelityStatus === "REJECTED" || formal?.fidelityStatus === "MISMATCH"
          const steps = stores.steps.list(run.id)
          const context = buildResearchContext({
            run,
            objective,
            branchName: this.getBranch(run.branchId).name,
            claims: this.claims.listVisible(run.branchId),
            blockers: stores.blockers.open(run.branchId).map((item) => ({ id: item.id, summary: item.summary, type: item.type })),
            steps,
            lastFailure: steps.filter((step) => step.status === "FAILED").at(-1)?.summary ?? undefined,
            fidelityBlocked,
            digestVerifiedFindings: worker ? (this.frozenDigestBySession.get(worker.sessionId)?.verifiedFindings ?? []) : [],
            graph: buildGraphContextSummary(this.buildGraph({ branchId: run.branchId, includeImports: true }), {
              focusClaimId: run.strategy.focusClaimId ?? objective?.id ?? null,
              digestClaimIds: worker ? (this.frozenDigestBySession.get(worker.sessionId)?.verifiedFindings ?? []).map((item) => item.claimId) : [],
            }),
          })
          this.lastPlannerContextByRun.set(run.id, context)
          if (!this.chargeModel("planner")) return this.stopRun(run, worker ? "LOCAL_MODEL_BUDGET_EXHAUSTED" : "MODEL_CALL_BUDGET_EXHAUSTED")
          let decision: ResearchDecision
          try {
            const stored = this.plannerRepo().get(run.id)
            if (stored && !this.runPlanners.has(run.id)) this.restoreOnePlanner(run.id, stored.descriptor, stored.cursor)
            const active = this.runPlanners.get(run.id) ?? this.planner()
            if (stored && !this.runPlanners.has(run.id)) return this.stopRun(run, "PLANNER_UNAVAILABLE")
            decision = await active.decideNextAction(context)
            decision.parameters = {
              ...decision.parameters,
              graphRevision: context.graph?.graphRevision,
              graphContextHash: context.graph?.graphContextHash,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : ""
            if (message === "INVALID_PLANNER_DECISION") return this.stopRun(run, "INVALID_PLANNER_DECISION")
            throw error
          }
          if (decision.stop?.shouldStop) {
            const reason = (decision.stop.reason as ResearchStopReason) ?? "NO_PRODUCTIVE_ACTION"
            if (reason === "OBJECTIVE_KERNEL_VERIFIED") {
              const verified = run.objectiveClaimId ? this.getClaim(run.objectiveClaimId) : null
              if (verified?.status !== "KERNEL_VERIFIED") return this.stopRun(run, "NO_PRODUCTIVE_ACTION")
            }
            return this.stopRun(run, reason)
          }
          const target = decision.targetClaimId ?? run.strategy.focusClaimId ?? run.objectiveClaimId ?? ""
          const recentFail = steps.filter((step) => step.action === decision.action && step.status === "FAILED" && (step.inputArtifactIds[0] ?? "") === target)
          if (recentFail.length >= 3) {
            this.createResearchBlocker(run, "REPETITION", "REPETITION_DETECTED", decision.targetClaimId ?? run.objectiveClaimId)
            return this.stopRun(run, "REPETITION_DETECTED")
          }
          return await this.executeResearchDecision(run, decision)
        } catch (error) {
          const message = error instanceof Error ? error.message : ""
          if (message === "LEAN_CALL_BUDGET_EXHAUSTED") return this.stopRun(run, worker ? "LOCAL_LEAN_BUDGET_EXHAUSTED" : "LEAN_CALL_BUDGET_EXHAUSTED")
          if (message === "PROOF_ATTEMPT_BUDGET_EXHAUSTED") return this.stopRun(run, worker ? "LOCAL_PROOF_BUDGET_EXHAUSTED" : "PROOF_ATTEMPT_BUDGET_EXHAUSTED")
          if (message === "GLOBAL_PROOF_BUDGET_EXHAUSTED") {
            run.updatedAt = nowIso()
            this.researchStores().runs.update(run)
            return run
          }
          if (message === "GLOBAL_LEAN_BUDGET_EXHAUSTED" || message === "GLOBAL_MODEL_BUDGET_EXHAUSTED" || message === "GLOBAL_PROOF_BUDGET_EXHAUSTED") {
            run.updatedAt = nowIso()
            this.researchStores().runs.update(run)
            return run
          }
          throw error
        }
      })
    } finally {
      this.accounting = null
      if (previousBranch.id !== this.requireCurrentBranch().id) this.switchBranch(previousBranch.id)
    }
  }

  async runResearch(id: string): Promise<ResearchRun> {
    this.record("research_run_started", { target: id, metadata: { runId: id } })
    let run = this.getResearch(id)
    run.status = "RUNNING"
    run.startedAt = run.startedAt ?? nowIso()
    this.researchStores().runs.update(run)
    while (["READY", "RUNNING"].includes(this.getResearch(id).status)) {
      run = await this.stepResearch(id)
      if (run.status !== "RUNNING" && run.status !== "READY") break
      run.status = "RUNNING"
      this.researchStores().runs.update(run)
    }
    return this.getResearch(id)
  }

  private stopRun(run: ResearchRun, reason: ResearchStopReason, status: ResearchRun["status"] = "BLOCKED"): ResearchRun {
    run.status = reason === "OBJECTIVE_KERNEL_VERIFIED" ? "COMPLETED" : status
    if (reason === "OBJECTIVE_KERNEL_VERIFIED") run.status = "COMPLETED"
    run.stopReason = reason
    run.stoppedAt = nowIso()
    run.updatedAt = run.stoppedAt
    this.researchStores().runs.update(run)
    this.record(run.status === "COMPLETED" ? "research_run_completed" : "research_run_blocked", { target: run.id, metadata: { runId: run.id, branchId: run.branchId, reason } })
    return run
  }

  private createResearchBlocker(run: ResearchRun, type: import("@mathos/domain").ResearchBlockerType, summary: string, claimId: string | null, stepId?: string) {
    const stores = this.researchStores()
    const blocker = {
      id: nextPrefixedId(stores.blockers.ids(), "BL"),
      workspaceId: run.workspaceId,
      branchId: run.branchId,
      claimId,
      type,
      status: "OPEN" as const,
      summary,
      createdByStepId: stepId ?? null,
      resolvedByStepId: null,
      createdAt: nowIso(),
    }
    stores.blockers.insert(blocker)
    this.record("research_blocker_created", { target: blocker.id, metadata: { runId: run.id, branchId: run.branchId } })
    return blocker
  }

  private async executeResearchDecision(run: ResearchRun, decision: ResearchDecision): Promise<ResearchRun> {
    const stores = this.researchStores()
    const sequence = run.currentStep + 1
    const key = `${run.id}:${sequence}`
    const existing = stores.steps.getByKey(key)
    if (existing && existing.status !== "RUNNING" && existing.status !== "INTERRUPTED") return run
    const timestamp = nowIso()
    const step = existing ?? {
      id: nextPrefixedId(stores.steps.ids(), "RS"),
      runId: run.id,
      branchId: run.branchId,
      sequence,
      action: decision.action,
      inputArtifactIds: [decision.targetClaimId ?? run.objectiveClaimId ?? ""],
      resultArtifactIds: [],
      status: "RUNNING" as const,
      idempotencyKey: key,
      startedAt: timestamp,
      finishedAt: null,
      summary: decision.rationaleSummary,
      failureClass: null,
      createdAt: timestamp,
    }
    if (!existing) stores.steps.insert(step)
    else if (existing.status === "INTERRUPTED" && existing.resultArtifactIds.length) {
      existing.status = "SUCCEEDED"
      stores.steps.update(existing)
      run.currentStep = sequence
      stores.runs.update(run)
      return run
    }
    this.record("research_step_started", { target: step.id, metadata: { runId: run.id, branchId: run.branchId, action: step.action } })
    this.crashHook?.("after_event", decision.action)
    const focus = decision.targetClaimId ?? run.strategy.focusClaimId ?? run.objectiveClaimId
    if (focus && focus !== run.strategy.focusClaimId) {
      run.strategy.focusClaimId = focus
      this.record("research_focus_changed", { target: run.id, metadata: { runId: run.id, branchId: run.branchId, focus } })
    }
    try {
      this.crashHook?.("before_mutation", decision.action)
      const result = await this.dispatchResearchAction(run, step, decision)
      step.resultArtifactIds = result.artifacts
      stores.steps.update(step)
      this.crashHook?.("after_mutation", decision.action)
      step.status = result.failed ? "FAILED" : "SUCCEEDED"
      step.summary = result.summary
      step.failureClass = result.failureClass
      step.finishedAt = nowIso()
      stores.steps.update(step)
      run.currentStep = sequence
      run.usage = normalizeResearchUsage(run.usage)
      run.usage.steps += 1
      run.usage.proofAttempts += result.proofAttempts
      run.updatedAt = nowIso()
      if (decision.rationaleSummary && /abandon|switch/i.test(decision.rationaleSummary)) {
        stores.decisions.insert({ id: nextPrefixedId(stores.decisions.ids(), "DEC"), runId: run.id, branchId: run.branchId, summary: decision.rationaleSummary, createdAt: nowIso() })
      }
      const objective = run.objectiveClaimId ? this.getClaim(run.objectiveClaimId) : null
      if (objective?.status === "KERNEL_VERIFIED") return this.stopRun(run, "OBJECTIVE_KERNEL_VERIFIED", "COMPLETED")
      if (decision.action === "STOP" || decision.action === "REQUEST_HUMAN") {
        return this.stopRun(run, decision.action === "REQUEST_HUMAN" ? "BLOCKED_NEEDS_HUMAN" : "NO_PRODUCTIVE_ACTION")
      }
      run.status = "RUNNING"
      stores.runs.update(run)
      this.record("research_step_completed", { target: step.id, metadata: { runId: run.id, branchId: run.branchId } })
      return run
    } catch (error) {
      if (error instanceof Error && error.message === "crash") {
        stores.steps.update(step)
        throw error
      }
      step.status = "FAILED"
      step.summary = error instanceof Error ? error.message : "execution failure"
      step.finishedAt = nowIso()
      stores.steps.update(step)
      run.currentStep = sequence
      run.usage.steps += 1
      this.record("research_step_failed", { target: step.id, metadata: { runId: run.id, branchId: run.branchId } })
      return this.stopRun(run, "EXECUTION_FAILURE", "FAILED")
    }
  }

  private async dispatchResearchAction(run: ResearchRun, step: import("@mathos/domain").ResearchStep, decision: ResearchDecision) {
    const target = decision.targetClaimId ?? run.strategy.focusClaimId ?? run.objectiveClaimId
    const artifacts: string[] = []
    let proofAttempts = 0
    let leanCalls = 0
    let modelCalls = 0
    let failed = false
    let failureClass: import("@mathos/domain").FailureClass | null = null
    let summary = decision.rationaleSummary
    if (decision.action === "ANALYZE_GOAL") {
      summary = target ? `Analyzed ${target}` : "Analyzed objective"
    } else if (decision.action === "SEARCH_PREMISES" && target) {
      const result = await this.premisesForClaim(target, { skipInspect: true })
      artifacts.push(...result.candidates.slice(0, 8).map((item) => item.declaration.name))
      summary = `Retrieved ${result.candidates.length} premises`
    } else if (decision.action === "DECOMPOSE_GOAL") {
      summary = `Decompose ${target}`
    } else if (decision.action === "CREATE_SUBCLAIM") {
      this.crashHook?.("before_mutation", "CREATE_SUBCLAIM")
      const created = this.createClaim({
        kind: "lemma",
        title: String(decision.parameters.title ?? "Auxiliary lemma"),
        statement: String(decision.parameters.statement ?? "Auxiliary obligation."),
      })
      if (run.objectiveClaimId) this.addDependency(created.id, run.objectiveClaimId, "depends_on")
      artifacts.push(created.id)
      run.strategy.focusClaimId = created.id
      summary = `Created ${created.id}`
    } else if (decision.action === "ATTEMPT_PROOF" && target) {
      if (!this.chargeProofAttempt()) throw new Error("PROOF_ATTEMPT_BUDGET_EXHAUSTED")
      if (!decision.parameters.proofBody && !this.chargeModel("proof")) throw new Error("MODEL_CALL_BUDGET_EXHAUSTED")
      const session = await this.prove(target, undefined, { maxAttempts: 1, proofBody: decision.parameters.proofBody ? String(decision.parameters.proofBody) : undefined, skipInspect: true, skipVerify: true })
      proofAttempts += session.attempts.length
      const last = session.attempts.at(-1)
      if (!session.accepted) {
        failed = true
        failureClass = classifyLeanFailure(last?.diagnostics.map((item) => item.message) ?? [])
        summary = `Proof failed (${failureClass})`
      } else {
        artifacts.push(session.accepted.id)
        summary = "Proof kernel accepted"
      }
    } else if (decision.action === "VERIFY" && target) {
      leanCalls += 1
      const report = await this.verify(target)
      summary = report.passed ? "Verification PASS" : "Verification FAIL"
      failed = !report.passed
    } else if (decision.action === "INSPECT_FAILURE") {
      const blocker = this.createResearchBlocker(run, "LEAN_ERROR", String(decision.parameters.summary ?? "Inspected proof failure"), target ?? null, step.id)
      artifacts.push(blocker.id)
      summary = `Blocker ${blocker.id}`
    } else if (decision.action === "RECORD_BLOCKER") {
      const blocker = this.createResearchBlocker(run, "UNKNOWN", String(decision.parameters.summary ?? "Recorded blocker"), target ?? null, step.id)
      artifacts.push(blocker.id)
    } else if (decision.action === "REQUEST_HUMAN") {
      this.createResearchBlocker(run, "NEEDS_HUMAN_JUDGMENT", decision.rationaleSummary || "Needs human judgment", target ?? null, step.id)
      summary = "REQUEST_HUMAN"
    } else if (decision.action === "RUN_EXPERIMENT") {
      const claimId = target ?? run.objectiveClaimId
      const created = await this.createExperiment({
        origin: "MODEL_GENERATED",
        kind: String(decision.parameters.kind ?? "FINITE_VERIFICATION"),
        claimId: claimId ?? undefined,
        hypothesis: String(decision.parameters.hypothesis ?? decision.rationaleSummary ?? ""),
        code: decision.parameters.code ? String(decision.parameters.code) : undefined,
        parameters: decision.parameters,
        runId: run.id,
        agentId: run.agentId ?? undefined,
      })
      const er = await this.runExperiment(created.id, { stepId: step.id, timeoutMs: Number(decision.parameters.timeoutMs ?? DEFAULT_COMPUTATIONAL_BUDGET.maxWallClockMsPerExperiment) })
      artifacts.push(created.id, er.id)
      run.usage.experiments += 1
      run.usage.computationCalls += 1
      summary = `RUN_EXPERIMENT ${created.id} ${er.outcome}`
      failed = er.outcome === "EXECUTION_FAILED"
    } else if (decision.action === "SEARCH_LITERATURE") {
      const query = String(decision.parameters.query ?? decision.parameters.text ?? "")
      if (!query.trim()) throw new Error("LITERATURE_QUERY_REQUIRED")
      const search = await this.searchLiterature(query, { claimId: target ?? run.objectiveClaimId ?? undefined, runId: run.id, stepId: step.id, agentId: run.agentId ?? undefined })
      artifacts.push(search.id)
      run.usage.literatureSearches += 1
      summary = `SEARCH_LITERATURE ${search.id} ${search.resultCount} hits`
    } else if (decision.action === "INSPECT_SOURCE") {
      const sourceId = String(decision.parameters.sourceId ?? "")
      this.inspectSource(sourceId)
      run.usage.sourceInspections += 1
      artifacts.push(sourceId)
      summary = `INSPECT_SOURCE ${sourceId}`
    } else if (decision.action === "STOP") {
      summary = "STOP"
    }
    return { artifacts, proofAttempts, leanCalls, modelCalls, failed, failureClass, summary }
  }

  registerRunPlanner(runId: string, planner: ResearchPlanner): void {
    const remaining = planner instanceof FakeResearchPlanner || planner instanceof PersistentScriptedPlanner ? planner.remaining() : []
    const descriptor = plannerDescriptorFrom(planner)
    if (descriptor.kind === "SCRIPTED") descriptor.config.steps = remaining
    descriptor.config.cursor = 0
    this.plannerRepo().upsert(runId, descriptor, 0, nowIso())
    this.restoreOnePlanner(runId, descriptor, 0)
  }

  restorePersistentPlanners(): void {
    try {
      for (const row of this.plannerRepo().list()) this.restoreOnePlanner(row.runId, row.descriptor, row.cursor)
    } catch {
      /* migration may not exist on very old paths */
    }
  }

  private plannerRepo() {
    return new RunPlannerRepository(this.client.db)
  }

  private restoreOnePlanner(runId: string, descriptor: import("@mathos/domain").ResearchPlannerDescriptor, cursor: number) {
    try {
      const persist = (next: number) => {
        const copy = { ...descriptor, config: { ...descriptor.config, cursor: next } }
        this.plannerRepo().upsert(runId, copy, next, nowIso())
      }
      this.runPlanners.set(runId, createPlannerFromDescriptor({ ...descriptor, config: { ...descriptor.config, cursor } }, { modelProvider: this.modelProvider, persist }))
    } catch {
      this.runPlanners.delete(runId)
    }
  }

  private teamStores() {
    return {
      sessions: new MultiAgentSessionRepository(this.client.db),
      agents: new ResearchAgentRepository(this.client.db),
      rounds: new MultiAgentRoundRepository(this.client.db),
      solutions: new SolutionCandidateRepository(this.client.db),
      digests: new SharedDigestRepository(this.client.db),
      imports: new ArtifactImportRepository(this.client.db),
    }
  }

  getTeam(id: string): MultiAgentResearchSession {
    const session = this.teamStores().sessions.get(id.toUpperCase())
    if (!session) throw new Error(`Team session ${id} was not found.`)
    return session
  }

  listTeamSessions() {
    return this.teamStores().sessions.ids(this.requireWorkspace().id).map((id) => this.getTeam(id))
  }

  teamAgents(sessionId: string) {
    return this.teamStores().agents.list(this.getTeam(sessionId).id)
  }

  teamSolutions(sessionId: string) {
    return this.teamStores().solutions.list(this.getTeam(sessionId).id)
  }

  teamHistory(sessionId: string) {
    return this.teamStores().rounds.list(this.getTeam(sessionId).id)
  }

  teamDigest(sessionId: string, round?: number) {
    const session = this.getTeam(sessionId)
    return this.teamStores().digests.get(session.id, round ?? session.currentRound)
  }

  async startTeam(input: { planners?: ResearchPlanner[]; limits?: Partial<MultiAgentBudget>; workerLimits?: Array<Partial<import("@mathos/domain").ResearchBudget>>; executionMode?: MultiAgentExecutionMode; maxParallelWorkers?: number } = {}): Promise<MultiAgentResearchSession> {
    const workspace = this.requireWorkspace()
    const source = this.requireCurrentBranch()
    const mode = input.executionMode ?? "SEQUENTIAL"
    if (mode !== "SEQUENTIAL" && mode !== "BOUNDED_PARALLEL") throw new Error("INVALID_EXECUTION_MODE")
    const parallel = input.maxParallelWorkers ?? DEFAULT_MAX_PARALLEL_WORKERS
    if (!Number.isInteger(parallel) || parallel < 1 || parallel > HARD_MAX_PARALLEL_WORKERS) throw new Error("INVALID_PARALLEL_WORKERS")
    const objectiveId = workspace.mainObjectiveId
    if (!objectiveId) throw new Error("Team research requires an objective claim.")
    const stores = this.teamStores()
    const timestamp = nowIso()
    const sessionId = nextPrefixedId(stores.sessions.ids(workspace.id), "MR")
    const planner = this.multiAgentPlanner ?? new FakeMultiAgentPlanner()
    let plan = await planner.planAssignments(objectiveId)
    const diversity = assignmentDiversity(plan)
    if (!diversity.ok) plan = { ...fallbackAssignmentPlan(objectiveId), warning: "LOW_ASSIGNMENT_DIVERSITY" }
    const created: ResearchAgentWorker[] = []
    try {
      for (const assignment of plan.assignments.slice(0, input.limits?.maxAgents ?? DEFAULT_MULTI_AGENT_BUDGET.maxAgents)) {
        this.switchBranch(source.id)
        const agentId = nextPrefixedId(stores.agents.ids(), "A")
        const branch = await this.createBranch(`${sessionId.toLowerCase()}-${assignment.approach.toLowerCase()}`, assignment.goalSummary)
        this.switchBranch(branch.id)
        const local = this.cloneObjectiveForWorker(objectiveId, agentId)
        const localLimits = input.workerLimits?.[created.length] ?? {}
        const run = this.startResearch({
          objectiveClaimId: local.id,
          limits: { maxSteps: localLimits.maxSteps ?? 8, maxProofAttempts: localLimits.maxProofAttempts ?? 4, maxModelCalls: localLimits.maxModelCalls ?? 10, maxLeanCalls: localLimits.maxLeanCalls ?? 6 },
        })
        const workerPlanner = input.planners?.[created.length]
        if (workerPlanner) this.registerRunPlanner(run.id, workerPlanner)
        const note = join(branch.worktreePath ?? join(this.root, "research"), `${agentId}.lean`)
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
        stores.agents.insert(worker)
        created.push(worker)
        this.record("agent_created", { target: agentId, metadata: { sessionId, agentId, branchId: branch.id } })
      }
    } catch (error) {
      for (const worker of created) {
        try { this.abandonBranch(worker.branchId) } catch { /* ignore */ }
      }
      throw error
    }
    this.switchBranch(source.id)
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
    stores.sessions.insert(session)
    this.record("multi_agent_session_created", { target: session.id, metadata: { sessionId: session.id, branchId: source.id } })
    return session
  }

  private async executeAgentRoundStep(session: MultiAgentResearchSession, sequence: number, agent: ResearchAgentWorker) {
    const stores = this.teamStores()
    const before = this.getResearch(agent.researchRunId)
    const active = this.client.db.query<{ lease_id: string }, [string]>("SELECT lease_id FROM execution_leases WHERE run_id = ? AND status IN ('RESERVED','RUNNING')").get(agent.researchRunId)
    if (active) throw new Error("WORKER_ALREADY_EXECUTING")
    const leaseId = createId("lease")
    this.client.db.query(
      "INSERT INTO execution_leases (lease_id, session_id, agent_id, run_id, branch_id, round_sequence, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(leaseId, session.id, agent.id, agent.researchRunId, agent.branchId, sequence, "RUNNING", nowIso())
    this.liveLeases += 1
    this.peakConcurrency = Math.max(this.peakConcurrency, this.liveLeases)
    const start = Date.now()
    this.record("agent_round_step_started", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId } })
    if (this.teamCrashAfterAgent === agent.id) throw new Error("crash")
    if (this.teamCrashTwoRunning) {
      const n = this.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE session_id = ? AND status = 'RUNNING'").get(session.id)
      if (n && n.n >= 2) throw new Error("crash")
    }
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.maxStepWallClockMs)
    try {
      const after = await this.stepAbort.run(ac.signal, async () => {
        let done = false
        try {
          return await Promise.race([
            this.stepResearch(agent.researchRunId).finally(() => { done = true }),
            new Promise<never>((_, reject) => {
              ac.signal.addEventListener("abort", () => { if (!done) reject(new Error("STEP_TIMEOUT")) })
            }),
          ])
        } finally {
          done = true
        }
      })
      this.client.db.query("INSERT OR IGNORE INTO agent_round_progress (session_id, sequence, agent_id) VALUES (?, ?, ?)").run(session.id, sequence, agent.id)
      const fresh = this.getTeam(session.id)
      fresh.usage.steps += Math.max(0, after.usage.steps - before.usage.steps)
      stores.sessions.update(fresh)
      agent.status = after.status === "BLOCKED" || after.status === "FAILED" ? "BLOCKED" : "RUNNING"
      if (after.stopReason === "BLOCKED_NEEDS_HUMAN" || after.stopReason === "STEP_TIMEOUT") agent.status = "BLOCKED"
      stores.agents.update(agent)
      this.record("agent_round_step_completed", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId } })
      const local = this.getClaim(agent.localClaimId)
      if (local.status === "KERNEL_VERIFIED" && !stores.solutions.list(session.id).some((item) => item.agentId === agent.id)) {
        if (this.teamCrashAt === "before_sc") throw new Error("crash")
        try {
          stores.solutions.insert({
            id: this.allocateId("SC"),
            sessionId: session.id,
            agentId: agent.id,
            branchId: agent.branchId,
            claimId: local.id,
            verificationRunId: this.verificationRuns.latestForFormal(this.formalStatements.currentForClaim(local.id)?.id ?? "")?.id ?? null,
            formalRevision: this.formalStatements.currentForClaim(local.id)?.id ?? null,
            discoveredAt: nowIso(),
          })
        } catch { /* unique */ }
        if (this.teamCrashAt === "after_sc") throw new Error("crash")
        this.record("solution_candidate_found", { target: agent.id, metadata: { sessionId: session.id, agentId: agent.id, branchId: agent.branchId } })
      }
      if (this.teamCrashBoundary === "after_step") throw new Error("crash")
    } catch (error) {
      if (error instanceof Error && error.message === "STEP_TIMEOUT") {
        this.stopRun(this.getResearch(agent.researchRunId), "STEP_TIMEOUT")
        agent.status = "BLOCKED"
        stores.agents.update(agent)
      } else {
        throw error
      }
    } finally {
      clearTimeout(timer)
      this.liveLeases = Math.max(0, this.liveLeases - 1)
      this.parallelTimings.push({ agentId: agent.id, start, end: Date.now() })
      this.client.db.query("UPDATE execution_leases SET status = 'RELEASED' WHERE lease_id = ?").run(leaseId)
    }
  }

  private cloneObjectiveForWorker(sourceId: string, agentId: string) {
    const source = this.getClaim(sourceId)
    const formal = this.formalStatements.currentForClaim(source.id)
    const clone = this.createClaim({
      kind: source.kind === "theorem" ? "conjecture" : source.kind,
      title: `${source.title} · ${agentId}`,
      statement: source.naturalStatement,
    })
    if (formal) {
      const declarationName = `${formal.declarationName}_${agentId.replaceAll("-", "").toLowerCase()}`
      this.formalStatements.markOthersNotCurrent(clone.id)
      this.formalStatements.insert({
        ...formal,
        id: nextSequentialId(this.formalStatements.ids(this.requireWorkspace().id), "FS"),
        claimId: clone.id,
        declarationName,
        sourceText: formal.sourceText.replace(formal.declarationName, declarationName),
        isCurrent: true,
        fidelityStatus: formal.fidelityStatus === "REJECTED" ? "AI_REVIEWED" : formal.fidelityStatus,
      })
    }
    return clone
  }

  pauseTeam(id: string) {
    const session = this.getTeam(id)
    this.teamPauseRequested.add(session.id)
    const busy = this.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").get(session.id)
    if (busy && busy.n > 0) return session
    session.status = "PAUSED"
    session.stopReason = "USER_PAUSED"
    session.stoppedAt = nowIso()
    this.teamStores().sessions.update(session)
    this.record("multi_agent_session_paused", { target: session.id, metadata: { sessionId: session.id } })
    return session
  }

  resumeTeam(id: string) {
    const session = this.getTeam(id)
    for (const round of this.teamStores().rounds.list(session.id).filter((item) => item.status === "RUNNING")) {
      round.status = "INTERRUPTED"
      round.finishedAt = nowIso()
      this.teamStores().rounds.update(round)
    }
    this.client.db.query("UPDATE execution_leases SET status = 'INTERRUPTED' WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").run(session.id)
    this.teamPauseRequested.delete(session.id)
    session.status = "READY"
    session.stopReason = null
    session.stoppedAt = null
    this.teamStores().sessions.update(session)
    this.record("multi_agent_session_resumed", { target: session.id, metadata: { sessionId: session.id } })
    return session
  }

  cancelTeam(id: string) {
    const session = this.getTeam(id)
    this.teamCancelRequested.add(session.id)
    const busy = this.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").get(session.id)
    if (busy && busy.n > 0) return session
    session.status = "CANCELLED"
    session.stopReason = "USER_CANCELLED"
    session.stoppedAt = nowIso()
    this.teamStores().sessions.update(session)
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
    if (!existing) stores.rounds.insert(round)
    else {
      round.status = "RUNNING"
      stores.rounds.update(round)
    }
    this.record("multi_agent_round_started", { target: round.id, metadata: { sessionId: session.id } })
    const source = this.requireCurrentBranch()
    const agents = stores.agents.list(session.id)
    const eligible: ResearchAgentWorker[] = []
    const localStop = ["LOCAL_LEAN_BUDGET_EXHAUSTED", "LOCAL_MODEL_BUDGET_EXHAUSTED", "LOCAL_PROOF_BUDGET_EXHAUSTED", "LEAN_CALL_BUDGET_EXHAUSTED", "MODEL_CALL_BUDGET_EXHAUSTED", "PROOF_ATTEMPT_BUDGET_EXHAUSTED"]
    for (const agent of agents) {
      if (!["READY", "RUNNING"].includes(agent.status)) continue
      const before = this.getResearch(agent.researchRunId)
      if (before.status === "COMPLETED" || before.stopReason === "OBJECTIVE_KERNEL_VERIFIED") continue
      if (before.status === "BLOCKED" || localStop.includes(before.stopReason ?? "")) {
        agent.status = "BLOCKED"
        stores.agents.update(agent)
        continue
      }
      const done = this.client.db.query<{ agent_id: string }, [string, number, string]>("SELECT agent_id FROM agent_round_progress WHERE session_id = ? AND sequence = ? AND agent_id = ?").get(session.id, sequence, agent.id)
      if (done) continue
      eligible.push(agent)
    }
    this.frozenDigestBySession.set(session.id, stores.digests.get(session.id, session.currentRound))
    this.client.db.query("INSERT OR REPLACE INTO round_plans (session_id, sequence, plan_json) VALUES (?, ?, ?)").run(session.id, sequence, JSON.stringify({
      sessionId: session.id,
      roundSequence: sequence,
      workers: eligible.map((agent, plannedIndex) => ({ agentId: agent.id, runId: agent.researchRunId, branchId: agent.branchId, plannedIndex })),
      executionMode: session.executionMode,
      maxParallelWorkers: session.maxParallelWorkers,
    }))
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
        stores.rounds.update(round)
        this.client.db.query("UPDATE execution_leases SET status = 'INTERRUPTED' WHERE session_id = ? AND status IN ('RESERVED','RUNNING')").run(session.id)
        throw error
      }
      round.status = "FAILED"
      stores.rounds.update(round)
      return this.stopTeam(session, "FATAL_EXECUTION_ERROR")
    } finally {
      if (source.id !== this.requireCurrentBranch().id) this.switchBranch(source.id)
    }
    session = this.getTeam(session.id)
    round.status = "COMPLETED"
    round.finishedAt = nowIso()
    stores.rounds.update(round)
    session.currentRound = sequence
    session.usage.rounds = sequence
    session.status = "RUNNING"
    session.startedAt = session.startedAt ?? nowIso()
    const digest = this.buildDigest(session, agents)
    stores.digests.upsert(digest)
    this.record("shared_digest_updated", { target: session.id, metadata: { sessionId: session.id } })
    const solutions = stores.solutions.list(session.id)
    const live = stores.agents.list(session.id)
    if (this.teamPauseRequested.has(session.id)) return this.pauseTeam(session.id)
    if (this.teamCancelRequested.has(session.id)) return this.cancelTeam(session.id)
    if (solutions.length) {
      if (this.teamCrashAt === "before_solution_found") throw new Error("crash")
      const stopped = this.stopTeam(session, "SOLUTION_FOUND", "SOLUTION_FOUND")
      if (this.teamCrashAt === "after_solution_found") throw new Error("crash")
      return stopped
    }
    if (live.every((agent) => agent.status === "BLOCKED" || agent.status === "FAILED")) return this.stopTeam(session, "ALL_AGENTS_BLOCKED")
    stores.sessions.update(session)
    return session
  }

  async runTeam(id: string): Promise<MultiAgentResearchSession> {
    this.record("multi_agent_session_started", { target: id, metadata: { sessionId: id } })
    let session = this.getTeam(id)
    session.status = "RUNNING"
    session.startedAt = session.startedAt ?? nowIso()
    this.teamStores().sessions.update(session)
    while (!["SOLUTION_FOUND", "COMPLETED", "CANCELLED", "FAILED", "BLOCKED", "PAUSED"].includes(this.getTeam(id).status)) {
      session = await this.stepTeam(id)
      if (["SOLUTION_FOUND", "BLOCKED", "FAILED", "CANCELLED", "COMPLETED"].includes(session.status)) break
      if (session.currentRound >= session.limits.maxRounds) return this.stopTeam(session, "MAX_ROUNDS")
    }
    return this.getTeam(id)
  }

  teamMergePreview(sessionId: string, agentId: string) {
    const agent = this.teamStores().agents.get(agentId.toUpperCase())
    if (!agent || agent.sessionId !== this.getTeam(sessionId).id) throw new Error(`Agent ${agentId} was not found.`)
    const run = this.getResearch(agent.researchRunId)
    if (run.status === "RUNNING") throw new Error(`ACTIVE_RESEARCH_RUN_EXISTS:${run.id}`)
    return this.previewMerge(agent.branchId)
  }

  private stopTeam(session: MultiAgentResearchSession, reason: import("@mathos/domain").MultiAgentStopReason, status: MultiAgentResearchSession["status"] = "BLOCKED"): MultiAgentResearchSession {
    session.status = reason === "SOLUTION_FOUND" ? "SOLUTION_FOUND" : status
    session.stopReason = reason
    session.stoppedAt = nowIso()
    this.teamStores().sessions.update(session)
    this.record(reason === "SOLUTION_FOUND" ? "multi_agent_solution_found" : "multi_agent_session_blocked", { target: session.id, metadata: { sessionId: session.id, reason } })
    return session
  }

  private buildDigest(session: MultiAgentResearchSession, agents: ResearchAgentWorker[]): SharedResearchDigest {
    const verified: SharedResearchDigest["verifiedFindings"] = []
    const unverified: SharedResearchDigest["unverifiedFindings"] = []
    const approachesTried: SharedResearchDigest["approachesTried"] = []
    const failedApproaches: SharedResearchDigest["failedApproaches"] = []
    for (const agent of agents) {
      const claim = this.getClaim(agent.localClaimId)
      if (claim.status === "KERNEL_VERIFIED") verified.push({ claimId: claim.id, branchId: agent.branchId, title: claim.title })
      else unverified.push({ claimId: claim.id, branchId: agent.branchId, status: claim.status })
      approachesTried.push({ agentId: agent.id, approach: agent.assignment.approach, summary: agent.assignment.goalSummary })
      const last = this.researchHistory(agent.researchRunId).at(-1)
      if (last?.status === "FAILED") failedApproaches.push({ agentId: agent.id, approach: agent.assignment.approach, summary: last.summary ?? last.action })
    }
    return {
      sessionId: session.id,
      round: session.currentRound,
      verifiedFindings: verified,
      unverifiedFindings: unverified,
      openBlockers: this.researchStores().blockers.open(session.sourceBranchId).map((item) => ({ id: item.id, summary: item.summary })),
      approachesTried,
      failedApproaches,
      solutionCandidates: this.teamStores().solutions.list(session.id).map((item) => ({ id: item.id, agentId: item.agentId, claimId: item.claimId })),
    }
  }

  teamOverview(sessionId: string) {
    const session = this.getTeam(sessionId)
    const agents = this.teamAgents(session.id)
    return {
      session,
      agents: agents.map((agent) => {
        const run = this.getResearch(agent.researchRunId)
        const local = this.getClaim(agent.localClaimId)
        return { agent, run, localStatus: local.status, verified: local.status === "KERNEL_VERIFIED", recentSteps: this.researchHistory(agent.researchRunId).slice(-5) }
      }),
      imports: this.teamStores().imports.list(session.id),
      solutions: this.teamSolutions(session.id),
      digest: this.teamDigest(session.id),
    }
  }

  teamImports(sessionId: string) {
    return this.teamStores().imports.list(this.getTeam(sessionId).id)
  }

  getImport(id: string) {
    const row = this.teamStores().imports.get(id.toUpperCase())
    if (!row) throw new Error(`Import ${id} was not found.`)
    return row
  }

  previewImport(id: string): import("@mathos/domain").ImportPreview {
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
      allVerified: [item.sourceClaimId, ...deps].every((claimId) => this.getClaim(claimId).status === "KERNEL_VERIFIED"),
      conflicts: this.declarationConflicts(item.targetBranchId, item.sourceClaimId),
    }
  }

  proposeImport(sessionId: string, sourceAgentId: string, targetAgentId: string, sourceClaimId: string) {
    const session = this.getTeam(sessionId)
    const sourceAgent = this.teamStores().agents.get(sourceAgentId.toUpperCase())
    const targetAgent = this.teamStores().agents.get(targetAgentId.toUpperCase())
    if (!sourceAgent || !targetAgent || sourceAgent.sessionId !== session.id || targetAgent.sessionId !== session.id) throw new Error("Agent not in session")
    const claim = this.getClaim(sourceClaimId)
    const formal = this.formalStatements.currentForClaim(claim.id)
    const item: import("@mathos/domain").VerifiedArtifactImport = {
      id: nextPrefixedId(this.teamStores().imports.ids(), "IMP"),
      sessionId: session.id,
      sourceAgentId: sourceAgent.id,
      sourceBranchId: sourceAgent.branchId,
      targetAgentId: targetAgent.id,
      targetBranchId: targetAgent.branchId,
      sourceClaimId: claim.id,
      targetClaimId: null,
      sourceVerificationRunId: formal ? this.verificationRuns.latestForFormal(formal.id)?.id ?? null : null,
      sourceFormalRevision: formal?.id ?? "missing",
      status: "PROPOSED",
      failureCode: null,
      createdAt: nowIso(),
      approvedAt: null,
      appliedAt: null,
    }
    this.teamStores().imports.insert(item)
    for (const dep of this.dependencyClosure(claim.id)) this.teamStores().imports.addDependency(item.id, dep)
    this.record("artifact_import_proposed", { target: item.id, metadata: { sessionId: session.id, agentId: sourceAgent.id, branchId: sourceAgent.branchId } })
    return item
  }

  rejectImport(id: string) {
    const item = this.getImport(id)
    item.status = "REJECTED"
    this.teamStores().imports.update(item)
    this.record("artifact_import_rejected", { target: item.id, metadata: { sessionId: item.sessionId } })
    return item
  }

  async applyImport(id: string) {
    const item = this.getImport(id)
    if (item.status === "APPLIED") return item
    const busy = this.client.db.query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM execution_leases WHERE agent_id = ? AND status IN ('RESERVED','RUNNING')").get(item.targetAgentId)
    if (busy && busy.n > 0) throw new Error("TARGET_WORKER_BUSY")
    const source = this.getClaim(item.sourceClaimId)
    if (source.status !== "KERNEL_VERIFIED") {
      item.status = "FAILED"
      item.failureCode = "SOURCE_NOT_KERNEL_VERIFIED"
      this.teamStores().imports.update(item)
      this.record("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: item.failureCode } })
      return item
    }
    const formal = this.formalStatements.currentForClaim(source.id)
    if (!formal || formal.id !== item.sourceFormalRevision) {
      item.status = "REVERIFY_REQUIRED"
      item.failureCode = "REVERIFY_REQUIRED"
      this.teamStores().imports.update(item)
      this.record("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: "REVERIFY_REQUIRED" } })
      return item
    }
    let deps: string[]
    try {
      deps = this.dependencyClosure(source.id)
    } catch (error) {
      if (error instanceof Error && error.message === "IMPORT_DEPENDENCY_CYCLE") {
        item.status = "FAILED"
        item.failureCode = "IMPORT_DEPENDENCY_CYCLE"
        this.teamStores().imports.update(item)
        return item
      }
      throw error
    }
    if (deps.some((dep) => this.getClaim(dep).status !== "KERNEL_VERIFIED")) {
      item.status = "FAILED"
      item.failureCode = "DEPENDENCY_IMPORT_REQUIRED"
      this.teamStores().imports.update(item)
      return item
    }
    const conflicts = this.declarationConflicts(item.targetBranchId, source.id)
    if (conflicts.length) {
      item.status = "CONFLICT"
      item.failureCode = "DECLARATION_CONFLICT"
      this.teamStores().imports.update(item)
      this.record("artifact_import_conflict", { target: item.id, metadata: { sessionId: item.sessionId } })
      return item
    }
    item.status = "APPLYING"
    item.approvedAt = nowIso()
    this.teamStores().imports.update(item)
    this.record("artifact_import_started", { target: item.id, metadata: { sessionId: item.sessionId } })
    const previous = this.requireCurrentBranch()
    try {
      this.switchBranch(item.targetBranchId)
      const clone = this.createClaim({ kind: "conjecture", title: `${source.title} (imported)`, statement: source.naturalStatement })
      this.claims.updateStatus(clone.id, "FORMALIZED_UNVERIFIED", nowIso())
      const declarationName = formal.declarationName
      this.formalStatements.insert({
        ...formal,
        id: nextSequentialId(this.formalStatements.ids(this.requireWorkspace().id), "FS"),
        claimId: clone.id,
        declarationName,
        isCurrent: true,
        fidelityStatus: "HUMAN_APPROVED",
        verificationStatus: "ELABORATES",
      })
      const proof = this.proofs.latestAccepted(source.id)
      if (proof) {
        this.storeAttempt(this.requireWorkspace().id, clone.id, this.formalStatements.currentForClaim(clone.id)!.id, 1, proof.proofSource, "KERNEL_ACCEPTED", proof.leanVersion, [])
      }
      const targetFormal = this.formalStatements.currentForClaim(clone.id)!
      const worktree = this.getBranch(item.targetBranchId).worktreePath
      if (worktree) writeFileSync(join(worktree, `${clone.id}.lean`), `${targetFormal.sourceText}\n`, "utf8")
      this.record("artifact_import_reverify_started", { target: item.id, metadata: { sessionId: item.sessionId } })
      const report = await this.verify(clone.id)
      if (!report.passed) {
        item.status = "FAILED"
        item.failureCode = "TARGET_VERIFICATION_FAILED"
        item.targetClaimId = clone.id
        this.teamStores().imports.update(item)
        this.record("artifact_import_failed", { target: item.id, metadata: { sessionId: item.sessionId, code: item.failureCode } })
        return item
      }
      item.status = "APPLIED"
      item.targetClaimId = clone.id
      item.appliedAt = nowIso()
      this.teamStores().imports.update(item)
      this.record("artifact_import_applied", { target: item.id, metadata: { sessionId: item.sessionId, agentId: item.targetAgentId, branchId: item.targetBranchId } })
      return item
    } finally {
      if (previous.id !== this.requireCurrentBranch().id) this.switchBranch(previous.id)
    }
  }

  private dependencyClosure(claimId: string): string[] {
    const seen = new Set<string>()
    const stack = new Set<string>()
    const walk = (id: string) => {
      if (stack.has(id)) throw new Error("IMPORT_DEPENDENCY_CYCLE")
      stack.add(id)
      for (const dep of this.dependencies.listForClaim(this.requireWorkspace().id, id)) {
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
    const sourceFormal = this.formalStatements.currentForClaim(sourceClaimId)
    if (!sourceFormal) return []
    const conflicts: string[] = []
    for (const claim of this.claims.listVisible(targetBranchId)) {
      const formal = this.formalStatements.currentForClaim(claim.id)
      if (!formal) continue
      if (formal.declarationName === sourceFormal.declarationName && formal.sourceText !== sourceFormal.sourceText) conflicts.push(formal.declarationName)
    }
    return conflicts
  }

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
      experiments: this.experimentStores().experiments.list(workspace.id),
      experimentResults: this.experimentStores().experiments.list(workspace.id).flatMap((item) => this.experimentStores().results.list(item.id)),
      sources: this.literatureStores().sources.list(workspace.id),
      excerpts: this.literatureStores().sources.list(workspace.id).flatMap((item) => this.literatureStores().excerpts.list(item.id)),
      externalResults: this.literatureStores().external.list(workspace.id),
      citations: this.literatureStores().citations.list(workspace.id),
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

  private experimentStores() {
    return {
      experiments: new ExperimentRepository(this.client.db),
      results: new ExperimentResultRepository(this.client.db),
    }
  }

  private experimentRoot(id: string, branchId?: string) {
    const branch = branchId ? this.getBranch(branchId) : this.requireCurrentBranch()
    const fsRoot = branch.worktreePath && branch.id !== "B-000" ? branch.worktreePath : this.root
    return join(fsRoot, ".mathos", "experiments", id)
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
    const workspace = this.requireWorkspace()
    const branch = this.requireCurrentBranch()
    const kind = isExperimentKind(String(input.kind ?? "GENERAL")) ? String(input.kind ?? "GENERAL") as ExperimentKind : "GENERAL"
    const parameters = { ...(input.parameters ?? {}) }
    if (input.code) parameters.code = input.code
    const id = this.allocateId("EXP")
    const dir = this.experimentRoot(id, branch.id)
    mkdirSync(dir, { recursive: true })
    const code = recipeCode(kind, parameters)
    writeFileSync(join(dir, "main.py"), code, "utf8")
    writeFileSync(join(dir, "input.json"), `${canonicalJson(parameters)}\n`, "utf8")
    const env = await this.computationRuntime.inspectEnvironment()
    const runtime: RuntimeDescriptor = {
      adapter: env.pythonExecutable === "fake-python" ? "fake" : "python",
      executable: env.pythonExecutable,
      version: env.pythonVersion,
      sympyVersion: env.sympyVersion,
      platform: env.platform,
      adapterVersion: "v1",
    }
    const experiment: Experiment = {
      origin: input.runId ? "MODEL_GENERATED" : input.origin ?? "USER_AUTHORED",
      id,
      workspaceId: workspace.id,
      branchId: branch.id,
      claimId: input.claimId ? this.getClaim(input.claimId).id : null,
      researchRunId: input.runId ?? null,
      researchStepId: null,
      agentId: input.agentId ?? null,
      kind,
      status: "READY",
      hypothesis: input.hypothesis ?? null,
      runtime,
      codeArtifactId: join(dir, "main.py"),
      parameters,
      codeHash: sha256Text(code),
      inputHash: sha256Text(canonicalJson(parameters)),
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
    }
    this.experimentStores().experiments.insert(experiment)
    this.record("experiment_created", { target: id, metadata: { experimentId: id, branchId: branch.id } })
    return experiment
  }

  listExperiments(branchId?: string) {
    return this.experimentStores().experiments.list(this.requireWorkspace().id, branchId ?? this.requireCurrentBranch().id)
  }

  getExperiment(id: string) {
    const row = this.experimentStores().experiments.get(id.toUpperCase())
    if (!row) throw new Error(`Experiment ${id} was not found.`)
    return row
  }

  experimentResults(id: string) {
    return this.experimentStores().results.list(this.getExperiment(id).id)
  }

  async runExperiment(id: string, opts: { timeoutMs?: number; stepId?: string; allowUserAuthored?: boolean } = {}): Promise<ExperimentResult> {
    const experiment = this.getExperiment(id)
    if (experiment.status === "RUNNING") throw new Error("EXPERIMENT_ALREADY_RUNNING")
    const budget = DEFAULT_COMPUTATIONAL_BUDGET
    const dir = this.experimentRoot(experiment.id, experiment.branchId)
    mkdirSync(dir, { recursive: true })
    const code = readFileSync(experiment.codeArtifactId, "utf8")
    if (sha256Text(code) !== experiment.codeHash) throw new Error("EXPERIMENT_CODE_MUTATED")
    experiment.status = "RUNNING"
    experiment.startedAt = nowIso()
    experiment.researchStepId = opts.stepId ?? experiment.researchStepId
    this.experimentStores().experiments.update(experiment)
    this.record("experiment_started", { target: experiment.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId } })
    let executed: Awaited<ReturnType<ComputationalRuntime["execute"]>>
    try {
      executed = await this.computationRuntime.execute({
        executable: experiment.runtime.executable,
        origin: experiment.origin,
        allowUserAuthored: opts.allowUserAuthored,
        scriptPath: experiment.codeArtifactId,
        cwd: dir,
        timeoutMs: opts.timeoutMs ?? budget.maxWallClockMsPerExperiment,
        maxOutputBytes: budget.maxOutputBytes,
      })
    } catch {
      executed = {
        exitCode: null, timedOut: false, stdout: "", stderr: "", stdoutTruncated: false,
        stderrTruncated: false, durationMs: 0, pid: null,
        blockedReason: "EXPERIMENT_BLOCKED_SANDBOX_FAILURE",
        securityReport: {
          sandboxAvailable: false, sandboxBackend: null, networkAllowed: false,
          filesystemMode: "PRIVATE_TEMP_ONLY", timeoutMs: opts.timeoutMs ?? budget.maxWallClockMsPerExperiment,
          outputLimitBytes: budget.maxOutputBytes, blockedReason: "EXPERIMENT_BLOCKED_SANDBOX_FAILURE",
          executionPolicyVersion: "sandbox-v1",
        },
      }
    }
    this.lastExperimentPid = executed.pid
    experiment.sandboxMode = executed.securityReport?.sandboxBackend ?? null
    experiment.networkPolicy = executed.securityReport ? (executed.securityReport.networkAllowed ? "NETWORK_ALLOW" : "NETWORK_DENY") : null
    experiment.executionPolicyVersion = executed.securityReport?.executionPolicyVersion ?? null
    writeFileSync(join(dir, "stdout.txt"), executed.stdout, "utf8")
    writeFileSync(join(dir, "stderr.txt"), executed.stderr, "utf8")
    const structured = parseStructured(executed.stdout)
    const reportedOutcome = typeof structured.outcome === "string" && ["SUPPORTING_EVIDENCE", "COUNTEREXAMPLE_FOUND", "NO_COUNTEREXAMPLE_FOUND", "INCONCLUSIVE", "EXECUTION_FAILED"].includes(structured.outcome)
      ? structured.outcome as ExperimentResult["outcome"] : null
    const outcome = executed.blockedReason ? "INCONCLUSIVE" : executed.timedOut
      ? "EXECUTION_FAILED"
      : executed.exitCode === 0
        ? (reportedOutcome ?? (typeof structured.outcome === "string" ? "INCONCLUSIVE" : structured.witness ? "COUNTEREXAMPLE_FOUND" : Object.keys(structured).length === 1 && "raw" in structured ? "INCONCLUSIVE" : "SUPPORTING_EVIDENCE"))
        : "EXECUTION_FAILED"
    const result: ExperimentResult = {
      id: this.allocateId("ER"),
      experimentId: experiment.id,
      outcome: executed.timedOut ? "EXECUTION_FAILED" : outcome,
      summary: executed.blockedReason ?? (executed.stdoutTruncated || executed.stderrTruncated
        ? "OUTPUT_TRUNCATED"
        : executed.timedOut
        ? "EXPERIMENT_TIMEOUT"
        : executed.exitCode === 0
          ? String(structured.outcome ?? "SUPPORTING_EVIDENCE")
          : (executed.stderr || "EXECUTION_FAILED").slice(0, 400)),
      structuredOutput: { ...structured, security: executed.securityReport ?? null, epistemic: "COMPUTATIONAL EVIDENCE — NOT PROOF" },
      stdoutArtifactId: join(dir, "stdout.txt"),
      stderrArtifactId: join(dir, "stderr.txt"),
      startedAt: experiment.startedAt ?? nowIso(),
      finishedAt: nowIso(),
      runtimeFingerprint: sha256Text(`${experiment.runtime.executable}|${experiment.runtime.version}|${experiment.runtime.sympyVersion}|${experiment.runtime.platform}|${experiment.runtime.adapterVersion}`),
      codeHash: experiment.codeHash,
      inputHash: experiment.inputHash,
      exactArithmetic: structured.exact === true,
      deterministic: experiment.parameters.randomSeed != null || experiment.kind !== "NUMERICAL_EXPERIMENT",
      stdoutTruncated: executed.stdoutTruncated,
      stderrTruncated: executed.stderrTruncated,
      randomSeed: experiment.parameters.randomSeed ?? null,
    }
    if (executed.timedOut) result.outcome = "EXECUTION_FAILED"
    this.experimentStores().results.insert(result)
    experiment.status = executed.blockedReason ? "BLOCKED" : executed.timedOut ? "TIMED_OUT" : executed.exitCode === 0 ? "SUCCEEDED" : "FAILED"
    experiment.finishedAt = result.finishedAt
    this.experimentStores().experiments.update(experiment)
    this.record(executed.blockedReason ? "experiment_blocked" : executed.timedOut ? "experiment_timed_out" : executed.exitCode === 0 ? "experiment_completed" : "experiment_failed", { target: experiment.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId, resultId: result.id, blockedReason: executed.blockedReason ?? null, securityReport: executed.securityReport ?? null, outputTruncated: executed.stdoutTruncated || executed.stderrTruncated } })
    this.record("experiment_result_recorded", { target: result.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId } })
    if (experiment.claimId && !executed.blockedReason) {
      const kind = result.outcome === "COUNTEREXAMPLE_FOUND" ? "counterexample" : "computation"
      this.addEvidence({
        claimId: experiment.claimId,
        kind,
        summary: `${result.outcome}: ${result.summary}`.slice(0, 400),
        artifactRef: JSON.stringify({ experimentId: experiment.id, resultId: result.id, codeHash: result.codeHash, runtimeFingerprint: result.runtimeFingerprint, parameters: experiment.parameters }),
        reproducible: result.deterministic,
      })
      this.record("computational_evidence_recorded", { target: experiment.claimId, metadata: { experimentId: experiment.id, resultId: result.id, branchId: experiment.branchId } })
      if (result.outcome === "COUNTEREXAMPLE_FOUND") this.record("counterexample_candidate_found", { target: experiment.claimId, metadata: { experimentId: experiment.id, resultId: result.id } })
      this.applyComputationalStatus(experiment.claimId, result.outcome)
    }
    return result
  }

  async rerunExperiment(id: string, opts: { allowUserAuthored?: boolean } = {}) {
    return this.runExperiment(id, opts)
  }

  private applyComputationalStatus(claimId: string, outcome: ExperimentResult["outcome"]) {
    const claim = this.getClaim(claimId)
    if (["FORMALIZED_UNVERIFIED", "KERNEL_VERIFIED", "INDEPENDENTLY_CHECKED", "EXTERNAL_KNOWN", "DISPROVED"].includes(claim.status)) return
    if (outcome === "SUPPORTING_EVIDENCE" || outcome === "NO_COUNTEREXAMPLE_FOUND") {
      const next = outcome === "NO_COUNTEREXAMPLE_FOUND" && claim.status !== "COMPUTATIONALLY_SUPPORTED" ? "COMPUTATIONALLY_SUPPORTED" : "HEURISTIC_SUPPORT"
      if (claim.status === "IDEA" || claim.status === "CONJECTURE" || claim.status === "HEURISTIC_SUPPORT") {
        this.claims.updateStatus(claim.id, next, nowIso())
      }
    }
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

  private literatureStores() {
    return {
      sources: new SourceRepository(this.client.db),
      excerpts: new SourceExcerptRepository(this.client.db),
      external: new ExternalResultRepository(this.client.db),
      citations: new CitationRepository(this.client.db),
      searches: new LiteratureSearchRepository(this.client.db),
    }
  }

  lastLiteratureSearchId: string | null = null

  async searchLiterature(query: string, opts: { claimId?: string; runId?: string; stepId?: string; agentId?: string; maxResults?: number } = {}) {
    const workspace = this.requireWorkspace()
    const branch = this.requireCurrentBranch()
    const maxResults = Math.min(opts.maxResults ?? 10, 10)
    const fingerprint = queryFingerprint(this.literatureProvider.name, { text: query, maxResults })
    const prior = this.literatureStores().searches.findFingerprint(workspace.id, fingerprint)
    if (prior && (!opts.runId || prior.researchRunId === opts.runId)) throw new Error("LITERATURE_SEARCH_REPETITION")
    this.record("literature_search_started", { target: workspace.id, metadata: { query, provider: this.literatureProvider.name, branchId: branch.id, runId: opts.runId, stepId: opts.stepId, agentId: opts.agentId } })
    const hits = await this.literatureProvider.search({ text: query, maxResults })
    const search = {
      id: this.allocateId("LS"),
      workspaceId: workspace.id,
      branchId: branch.id,
      query,
      queryFingerprint: fingerprint,
      provider: this.literatureProvider.name,
      targetClaimId: opts.claimId ?? null,
      researchRunId: opts.runId ?? null,
      researchStepId: opts.stepId ?? null,
      agentId: opts.agentId ?? null,
      resultCount: hits.length,
      createdAt: nowIso(),
    }
    this.literatureStores().searches.insert(search)
    hits.forEach((hit, index) => this.literatureStores().searches.insertHit({
      searchId: search.id, index, provider: hit.provider, externalId: hit.externalId, title: hit.title, authors: hit.authors,
      year: hit.year ?? null, doi: hit.doi ?? null, arxivId: hit.arxivId ?? null, url: hit.url ?? null, abstract: hit.abstract ?? null, score: hit.score ?? null,
    }))
    this.lastLiteratureSearchId = search.id
    this.record("literature_search_completed", { target: search.id, metadata: { resultCount: hits.length, provider: search.provider, branchId: branch.id, runId: opts.runId } })
    return search
  }

  literatureHits(searchId?: string) {
    const id = searchId ?? this.lastLiteratureSearchId
    if (!id) return []
    return this.literatureStores().searches.hits(id)
  }

  getLiteratureSearch(id: string) {
    const row = this.literatureStores().searches.get(id.toUpperCase())
    if (!row) throw new Error(`Literature search ${id} was not found.`)
    return row
  }

  async importSearchResult(searchId: string, index: number) {
    const hits = this.literatureHits(searchId)
    const hit = hits.find((item) => item.index === index)
    if (!hit) throw new Error("SEARCH_RESULT_NOT_FOUND")
    const meta = await this.literatureProvider.fetchMetadata({
      provider: hit.provider, externalId: hit.externalId, title: hit.title, authors: hit.authors, year: hit.year ?? undefined, doi: hit.doi ?? undefined, arxivId: hit.arxivId ?? undefined, url: hit.url ?? undefined, abstract: hit.abstract ?? undefined,
    })
    return this.importSource({
      type: meta.type ?? "PAPER",
      title: meta.title,
      authors: meta.authors,
      year: meta.year,
      doi: meta.doi,
      arxivId: meta.arxivId,
      url: meta.url,
      venue: meta.venue,
      provider: hit.provider,
      providerId: hit.externalId,
    })
  }

  importSource(input: { type?: Source["type"]; title: string; authors: string[]; year?: number; doi?: string; arxivId?: string; isbn?: string; url?: string; venue?: string; provider?: string; providerId?: string; localPath?: string; fileHash?: string }) {
    const workspace = this.requireWorkspace()
    const fingerprint = sourceFingerprint({ doi: input.doi, arxivId: input.arxivId, isbn: input.isbn, url: input.url, title: input.title, authors: input.authors, year: input.year, fileHash: input.fileHash })
    const existing = this.literatureStores().sources.findByFingerprint(workspace.id, fingerprint)
    if (existing) {
      this.record("source_discovered", { target: existing.id, metadata: { dedup: true, fingerprint } })
      return existing
    }
    const source: Source = {
      id: this.allocateId("SRC"),
      workspaceId: workspace.id,
      type: input.type ?? "PAPER",
      title: input.title,
      authors: input.authors,
      year: input.year ?? null,
      venue: input.venue ?? null,
      doi: input.doi ?? null,
      arxivId: input.arxivId ?? null,
      isbn: input.isbn ?? null,
      url: input.url ?? null,
      status: "DISCOVERED",
      fingerprint,
      localPath: input.localPath ?? null,
      provider: input.provider ?? null,
      providerId: input.providerId ?? null,
      version: null,
      retrievedAt: nowIso(),
      createdAt: nowIso(),
    }
    this.literatureStores().sources.insert(source)
    this.record("source_imported", { target: source.id, metadata: { fingerprint, provider: source.provider } })
    return source
  }

  addLocalSource(filePath: string, meta: { title?: string; authors?: string[] } = {}) {
    const abs = resolve(filePath)
    if (!existsSync(abs)) throw new Error("SOURCE_FILE_NOT_FOUND")
    const bytes = readFileSync(abs)
    const fileHash = createHash("sha256").update(bytes).digest("hex")
    const destDir = join(this.root, ".mathos", "sources")
    mkdirSync(destDir, { recursive: true })
    const dest = join(destDir, `${fileHash.slice(0, 16)}${abs.slice(abs.lastIndexOf("."))}`)
    writeFileSync(dest, bytes)
    return this.importSource({
      type: "DOCUMENT",
      title: meta.title ?? basename(abs),
      authors: meta.authors ?? [],
      localPath: dest,
      fileHash,
    })
  }

  listSources() {
    return this.literatureStores().sources.list(this.requireWorkspace().id)
  }

  getSource(id: string) {
    const row = this.literatureStores().sources.get(id.toUpperCase())
    if (!row) throw new Error(`Source ${id} was not found.`)
    return row
  }

  inspectSource(id: string) {
    const source = this.getSource(id)
    this.literatureStores().sources.updateStatus(source.id, "INSPECTED")
    this.record("source_inspected", { target: source.id, metadata: { branchId: this.requireCurrentBranch().id } })
    return this.getSource(source.id)
  }

  addExcerpt(sourceId: string, text: string, locator?: SourceLocator, method: SourceExcerpt["extractionMethod"] = "USER_PROVIDED") {
    const source = this.getSource(sourceId)
    const excerpt: SourceExcerpt = {
      id: this.allocateId("EXC"),
      sourceId: source.id,
      locator: locator ?? null,
      text,
      textHash: sha256Text(text),
      extractionMethod: method,
      createdAt: nowIso(),
    }
    this.literatureStores().excerpts.insert(excerpt)
    this.record("source_excerpt_created", { target: excerpt.id, metadata: { sourceId: source.id } })
    return excerpt
  }

  listExcerpts(sourceId: string) {
    return this.literatureStores().excerpts.list(this.getSource(sourceId).id)
  }

  extractExternalResult(input: { sourceId: string; excerptId?: string; kind?: string; name?: string; statementSummary: string; locator?: SourceLocator; statementMode?: "SUMMARY" | "QUOTED_EXCERPT" }) {
    const source = this.getSource(input.sourceId)
    const excerpt = input.excerptId ? this.literatureStores().excerpts.get(input.excerptId.toUpperCase()) : null
    if (!excerpt && !input.locator) throw new Error("UNSUPPORTED_EXTRACTION")
    if (excerpt && !excerpt.text.toLowerCase().includes(input.statementSummary.trim().slice(0, 24).toLowerCase()) && input.statementMode !== "SUMMARY") throw new Error("UNSUPPORTED_EXTRACTION")
    if (excerpt && input.locator && excerpt.locator && excerpt.locator.kind !== "UNKNOWN" && excerpt.locator.kind !== input.locator.kind) throw new Error("LOCATOR_MISMATCH")
    const result: ExternalResult = {
      id: this.allocateId("EXT"),
      workspaceId: this.requireWorkspace().id,
      branchId: this.requireCurrentBranch().id,
      sourceId: source.id,
      excerptId: excerpt?.id ?? null,
      kind: (["THEOREM", "LEMMA", "PROPOSITION", "COROLLARY", "DEFINITION", "METHOD", "OTHER"].includes(String(input.kind)) ? input.kind : "THEOREM") as ExternalResultKind,
      name: input.name ?? null,
      statementSummary: input.statementSummary,
      statementMode: input.statementMode ?? (excerpt ? "QUOTED_EXCERPT" : "SUMMARY"),
      locator: input.locator ?? excerpt?.locator ?? null,
      status: "EXTRACTED",
      createdAt: nowIso(),
    }
    this.literatureStores().external.insert(result)
    this.record("external_result_extracted", { target: result.id, metadata: { sourceId: source.id, branchId: result.branchId, excerptId: result.excerptId } })
    return result
  }

  reviewExternalResult(id: string, status: ExternalResult["status"] = "HUMAN_REVIEWED") {
    const row = this.getExternal(id)
    this.literatureStores().external.updateStatus(row.id, status)
    this.record("external_result_reviewed", { target: row.id, metadata: { status } })
    return this.getExternal(row.id)
  }

  getExternal(id: string) {
    const row = this.literatureStores().external.get(id.toUpperCase())
    if (!row) throw new Error(`External result ${id} was not found.`)
    return row
  }

  listExternal(branchId?: string) {
    return this.literatureStores().external.list(this.requireWorkspace().id, branchId ?? this.requireCurrentBranch().id)
  }

  cite(input: { sourceId: string; claimId?: string; purpose?: CitationPurpose; locator?: SourceLocator; externalResultId?: string; excerptId?: string; runId?: string; stepId?: string }) {
    const source = this.getSource(input.sourceId)
    const citation: Citation = {
      id: this.allocateId("CIT"),
      workspaceId: this.requireWorkspace().id,
      branchId: this.requireCurrentBranch().id,
      sourceId: source.id,
      claimId: input.claimId ? this.getClaim(input.claimId).id : null,
      evidenceId: null,
      blockerId: null,
      decisionId: null,
      researchRunId: input.runId ?? null,
      researchStepId: input.stepId ?? null,
      externalResultId: input.externalResultId ?? null,
      excerptId: input.excerptId ?? null,
      locator: input.locator ?? null,
      purpose: input.purpose ?? "SUPPORT",
      invalidated: false,
      createdAt: nowIso(),
    }
    if (citation.claimId) {
      const evidence = this.addEvidence({
        claimId: citation.claimId,
        kind: "literature",
        summary: `${citation.purpose} ${source.title} ${formatLocator(citation.locator)}`.slice(0, 400),
        artifactRef: JSON.stringify({ sourceId: source.id, citationId: citation.id, externalResultId: citation.externalResultId, excerptId: citation.excerptId, locator: citation.locator }),
        reproducible: true,
      })
      citation.evidenceId = evidence.id
    }
    this.literatureStores().citations.insert(citation)
    this.record("citation_created", { target: citation.id, metadata: { sourceId: source.id, claimId: citation.claimId, branchId: citation.branchId } })
    return citation
  }

  invalidateCitation(id: string) {
    const row = this.getCitation(id)
    this.literatureStores().citations.invalidate(row.id)
    this.record("citation_invalidated", { target: row.id, metadata: {} })
    return this.getCitation(row.id)
  }

  getCitation(id: string) {
    const row = this.literatureStores().citations.get(id.toUpperCase())
    if (!row) throw new Error(`Citation ${id} was not found.`)
    return row
  }

  listCitations(branchId?: string) {
    return this.literatureStores().citations.list(this.requireWorkspace().id, branchId ?? this.requireCurrentBranch().id)
  }

  linkExternalKnown(claimId: string, externalResultId: string) {
    const claim = this.getClaim(claimId)
    const ext = this.getExternal(externalResultId)
    if (ext.branchId !== this.requireCurrentBranch().id) throw new Error("EXTERNAL_RESULT_BRANCH_MISMATCH")
    if (ext.status !== "HUMAN_REVIEWED") throw new Error("EXTERNAL_KNOWN_REQUIRES_REVIEW")
    const excerpt = ext.excerptId ? this.literatureStores().excerpts.get(ext.excerptId) : null
    if (!excerpt) throw new Error("EXTERNAL_KNOWN_REQUIRES_EXCERPT")
    this.cite({ sourceId: ext.sourceId, claimId: claim.id, purpose: "KNOWN_RESULT", locator: ext.locator ?? undefined, externalResultId: ext.id, excerptId: excerpt.id })
    if (!["KERNEL_VERIFIED", "INDEPENDENTLY_CHECKED", "DISPROVED"].includes(claim.status)) {
      this.claims.updateStatus(claim.id, "EXTERNAL_KNOWN", nowIso())
    }
    this.record("external_known_linked", { target: claim.id, metadata: { externalResultId: ext.id, sourceId: ext.sourceId } })
    return this.getClaim(claim.id)
  }

  formatSource(id: string) {
    const source = this.getSource(id)
    const externals = this.listExternal().filter((item) => item.sourceId === source.id)
    const citations = this.listCitations().filter((item) => item.sourceId === source.id)
    return [
      `SOURCE · ${source.id}`,
      `Title ${source.title}`,
      `Authors ${source.authors.join(", ") || "unknown"}`,
      `Year ${source.year ?? "n/a"}`,
      `DOI ${source.doi ?? "n/a"}`,
      `Status ${source.status}`,
      `External results ${externals.length}`,
      `Citations ${citations.length}`,
      "EXTERNAL SOURCE — NOT KERNEL VERIFIED",
    ].join("\n")
  }

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
      for (const experiment of this.experimentStores().experiments.list(workspace.id)) {
        if (experiment.status !== "RUNNING") continue
        experiment.status = "FAILED"
        experiment.finishedAt = at
        this.experimentStores().experiments.update(experiment)
        experiments.push(experiment.id)
      }
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
    for (const experiment of this.experimentStores().experiments.list(workspace.id)) {
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

function maybeWriteFormalFile(root: string, claimId: string, source: string): string | null {
  const dir = join(root, "formal", "Claims")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${claimId.replace("-", "")}.lean`)
  if (existsSync(file)) return null
  writeFileSync(file, `${source.trim()}\n`, "utf8")
  return `formal/Claims/${claimId.replace("-", "")}.lean`
}

function writeProofFile(root: string, claimId: string, source: string): string | null {
  const dir = join(root, "formal", "Claims")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${claimId.replace("-", "")}.lean`)
  const tmp = `${file}.tmp`
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8")
    if (existing.includes(":= by") && !existing.includes(source.slice(0, 40))) {
      return null
    }
  }
  writeFileSync(tmp, `${source.trim()}\n`, "utf8")
  renameSync(tmp, file)
  return `formal/Claims/${claimId.replace("-", "")}.lean`
}

export { buildDoctorReport } from "./doctor.ts"
