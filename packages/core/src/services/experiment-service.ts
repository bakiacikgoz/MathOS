import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_COMPUTATIONAL_BUDGET,
  isExperimentKind,
  type Evidence,
  type Experiment,
  type ExperimentKind,
  type ExperimentOrigin,
  type ExperimentResult,
  type ResearchBranch,
  type RuntimeDescriptor,
} from "@mathos/domain"
import {
  canonicalJson,
  parseStructured,
  recipeCode,
  sha256Text,
  type ComputationalRuntime,
} from "@mathos/computation"
import {
  BranchRepository,
  ClaimRepository,
  EvidenceRepository,
  ExperimentRepository,
  ExperimentResultRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import { ClaimNotFound, createId, nowIso } from "@mathos/shared"
import type { MutationRecorder } from "../mutation-recorder.ts"

export interface CreateExperimentInput {
  origin?: ExperimentOrigin
  kind?: string
  claimId?: string
  hypothesis?: string
  code?: string
  parameters?: Record<string, unknown>
  runId?: string
  agentId?: string
}

export interface RunExperimentOptions {
  timeoutMs?: number
  stepId?: string
  allowUserAuthored?: boolean
}

interface ExperimentServiceDependencies {
  root: string
  workspaces: WorkspaceRepository
  branches: BranchRepository
  claims: ClaimRepository
  evidence: EvidenceRepository
  experiments: ExperimentRepository
  results: ExperimentResultRepository
  computationRuntime: ComputationalRuntime
  allocateId: (prefix: "EXP" | "ER") => string
  recorder: MutationRecorder
  recordPid: (pid: number | null) => void
}

export class ExperimentService {
  constructor(private readonly dependencies: ExperimentServiceDependencies) {}

  async createExperiment(input: CreateExperimentInput = {}): Promise<Experiment> {
    const workspace = this.requireWorkspace()
    const branch = this.requireCurrentBranch()
    const kind = isExperimentKind(String(input.kind ?? "GENERAL"))
      ? String(input.kind ?? "GENERAL") as ExperimentKind
      : "GENERAL"
    const parameters = { ...(input.parameters ?? {}) }
    if (input.code) parameters.code = input.code
    const id = this.dependencies.allocateId("EXP")
    const dir = this.experimentRoot(id, branch)
    mkdirSync(dir, { recursive: true })
    const code = recipeCode(kind, parameters)
    writeFileSync(join(dir, "main.py"), code, "utf8")
    writeFileSync(join(dir, "input.json"), `${canonicalJson(parameters)}\n`, "utf8")
    const env = await this.dependencies.computationRuntime.inspectEnvironment()
    const runtime: RuntimeDescriptor = {
      adapter: env.pythonExecutable === "fake-python" ? "fake" : "python",
      executable: env.pythonExecutable,
      version: env.pythonVersion,
      sympyVersion: env.sympyVersion,
      platform: env.platform,
      adapterVersion: "v1",
    }
    const claimId = input.claimId ? this.requireClaim(input.claimId).id : null
    const experiment: Experiment = {
      origin: input.runId ? "MODEL_GENERATED" : input.origin ?? "USER_AUTHORED",
      id,
      workspaceId: workspace.id,
      branchId: branch.id,
      claimId,
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
    this.dependencies.recorder.mutate("experiment_created", { target: id, metadata: { experimentId: id, branchId: branch.id } }, () => {
      this.dependencies.experiments.insert(experiment)
    })
    return experiment
  }

  listExperiments(branchId?: string): Experiment[] {
    return this.dependencies.experiments.list(this.requireWorkspace().id, branchId ?? this.requireCurrentBranch().id)
  }

  listWorkspaceExperiments(): Experiment[] {
    return this.dependencies.experiments.list(this.requireWorkspace().id)
  }

  reconcileInterrupted(at: string): string[] {
    const interrupted: string[] = []
    for (const experiment of this.listWorkspaceExperiments()) {
      if (experiment.status !== "RUNNING") continue
      experiment.status = "FAILED"
      experiment.finishedAt = at
      this.dependencies.recorder.mutate("experiment_interrupted", { target: experiment.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId } }, () => {
        this.dependencies.experiments.update(experiment)
      })
      interrupted.push(experiment.id)
    }
    return interrupted
  }

  getExperiment(id: string): Experiment {
    const row = this.dependencies.experiments.get(id.toUpperCase())
    if (!row) throw new Error(`Experiment ${id} was not found.`)
    return row
  }

  experimentResults(id: string): ExperimentResult[] {
    return this.dependencies.results.list(this.getExperiment(id).id)
  }

  async runExperiment(id: string, opts: RunExperimentOptions = {}): Promise<ExperimentResult> {
    const experiment = this.getExperiment(id)
    if (experiment.status === "RUNNING") throw new Error("EXPERIMENT_ALREADY_RUNNING")
    const budget = DEFAULT_COMPUTATIONAL_BUDGET
    const dir = this.experimentRoot(experiment.id, this.requireBranch(experiment.branchId))
    mkdirSync(dir, { recursive: true })
    const code = readFileSync(experiment.codeArtifactId, "utf8")
    if (sha256Text(code) !== experiment.codeHash) throw new Error("EXPERIMENT_CODE_MUTATED")
    experiment.status = "RUNNING"
    experiment.startedAt = nowIso()
    experiment.researchStepId = opts.stepId ?? experiment.researchStepId
    this.dependencies.recorder.mutate("experiment_started", { target: experiment.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId } }, () => {
      this.dependencies.experiments.update(experiment)
    })

    let executed: Awaited<ReturnType<ComputationalRuntime["execute"]>>
    try {
      executed = await this.dependencies.computationRuntime.execute({
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
    this.dependencies.recordPid(executed.pid)
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
      id: this.dependencies.allocateId("ER"),
      experimentId: experiment.id,
      outcome,
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
      randomSeed: typeof experiment.parameters.randomSeed === "string" || typeof experiment.parameters.randomSeed === "number"
        ? experiment.parameters.randomSeed
        : null,
    }
    experiment.status = executed.blockedReason ? "BLOCKED" : executed.timedOut ? "TIMED_OUT" : executed.exitCode === 0 ? "SUCCEEDED" : "FAILED"
    experiment.finishedAt = result.finishedAt
    this.dependencies.recorder.mutate(executed.blockedReason ? "experiment_blocked" : executed.timedOut ? "experiment_timed_out" : executed.exitCode === 0 ? "experiment_completed" : "experiment_failed", { target: experiment.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId, resultId: result.id, blockedReason: executed.blockedReason ?? null, securityReport: executed.securityReport ?? null, outputTruncated: executed.stdoutTruncated || executed.stderrTruncated } }, () => {
      this.dependencies.results.insert(result)
      this.dependencies.experiments.update(experiment)
    })
    this.dependencies.recorder.record("experiment_result_recorded", { target: result.id, metadata: { experimentId: experiment.id, branchId: experiment.branchId } })
    if (experiment.claimId && !executed.blockedReason) this.recordComputationalEvidence(experiment, result)
    return result
  }

  rerunExperiment(id: string, opts: Pick<RunExperimentOptions, "allowUserAuthored"> = {}): Promise<ExperimentResult> {
    return this.runExperiment(id, opts)
  }

  private recordComputationalEvidence(experiment: Experiment, result: ExperimentResult): void {
    const workspace = this.requireWorkspace()
    const evidence: Evidence = {
      id: createId("ev"), workspaceId: workspace.id, claimId: experiment.claimId!,
      kind: result.outcome === "COUNTEREXAMPLE_FOUND" ? "counterexample" : "computation",
      summary: `${result.outcome}: ${result.summary}`.slice(0, 400),
      artifactRef: JSON.stringify({ experimentId: experiment.id, resultId: result.id, codeHash: result.codeHash, runtimeFingerprint: result.runtimeFingerprint, parameters: experiment.parameters }),
      reproducible: result.deterministic, createdAt: nowIso(),
    }
    this.dependencies.recorder.mutate("evidence_created", { target: evidence.id, metadata: { claimId: evidence.claimId, kind: evidence.kind } }, () => {
      this.dependencies.evidence.insert(evidence)
      this.applyComputationalStatus(experiment.claimId!, result.outcome)
    })
    this.dependencies.recorder.record("computational_evidence_recorded", { target: experiment.claimId, metadata: { experimentId: experiment.id, resultId: result.id, branchId: experiment.branchId } })
    if (result.outcome === "COUNTEREXAMPLE_FOUND") this.dependencies.recorder.record("counterexample_candidate_found", { target: experiment.claimId, metadata: { experimentId: experiment.id, resultId: result.id } })
  }

  private applyComputationalStatus(claimId: string, outcome: ExperimentResult["outcome"]): void {
    const claim = this.requireClaim(claimId)
    if (["FORMALIZED_UNVERIFIED", "KERNEL_VERIFIED", "INDEPENDENTLY_CHECKED", "EXTERNAL_KNOWN", "DISPROVED"].includes(claim.status)) return
    if (outcome === "SUPPORTING_EVIDENCE" || outcome === "NO_COUNTEREXAMPLE_FOUND") {
      const next = outcome === "NO_COUNTEREXAMPLE_FOUND" && claim.status !== "COMPUTATIONALLY_SUPPORTED" ? "COMPUTATIONALLY_SUPPORTED" : "HEURISTIC_SUPPORT"
      if (["IDEA", "CONJECTURE", "HEURISTIC_SUPPORT"].includes(claim.status)) this.dependencies.claims.updateStatus(claim.id, next, nowIso())
    }
  }

  private experimentRoot(id: string, branch: ResearchBranch): string {
    const fsRoot = branch.worktreePath && branch.id !== "B-000" ? branch.worktreePath : this.dependencies.root
    return join(fsRoot, ".mathos", "experiments", id)
  }

  private requireWorkspace() {
    const workspace = this.dependencies.workspaces.get()
    if (!workspace) throw new Error("Workspace row is missing after open")
    return workspace
  }

  private requireCurrentBranch(): ResearchBranch {
    const branch = this.dependencies.branches.current(this.requireWorkspace().id) ?? this.dependencies.branches.get("B-000")
    if (!branch) throw new Error("Current branch is missing")
    return branch
  }

  private requireBranch(id: string): ResearchBranch {
    const branch = this.dependencies.branches.get(id)
    if (!branch) throw new Error(`Branch ${id} was not found.`)
    return branch
  }

  private requireClaim(id: string) {
    const claim = this.dependencies.claims.get(id.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(id)
    return claim
  }
}
