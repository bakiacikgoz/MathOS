import type { Database } from "bun:sqlite"
import type { Experiment, ExperimentResult } from "@mathos/domain"

function mapExperiment(row: Record<string, unknown>): Experiment {
  return {
    id: String(row.id),
    origin: row.origin as Experiment["origin"],
    sandboxMode: row.sandbox_mode ? String(row.sandbox_mode) : null,
    networkPolicy: row.network_policy ? String(row.network_policy) : null,
    executionPolicyVersion: row.execution_policy_version ? String(row.execution_policy_version) : null,
    workspaceId: String(row.workspace_id),
    branchId: String(row.branch_id),
    claimId: row.claim_id ? String(row.claim_id) : null,
    researchRunId: row.research_run_id ? String(row.research_run_id) : null,
    researchStepId: row.research_step_id ? String(row.research_step_id) : null,
    agentId: row.agent_id ? String(row.agent_id) : null,
    kind: row.kind as Experiment["kind"],
    status: row.status as Experiment["status"],
    hypothesis: row.hypothesis ? String(row.hypothesis) : null,
    runtime: JSON.parse(String(row.runtime_json)),
    codeArtifactId: String(row.code_artifact_id),
    parameters: JSON.parse(String(row.parameters_json)),
    codeHash: String(row.code_hash),
    inputHash: String(row.input_hash),
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }
}

function mapResult(row: Record<string, unknown>): ExperimentResult {
  return {
    id: String(row.id),
    experimentId: String(row.experiment_id),
    outcome: row.outcome as ExperimentResult["outcome"],
    summary: String(row.summary),
    structuredOutput: JSON.parse(String(row.structured_json)),
    stdoutArtifactId: row.stdout_artifact_id ? String(row.stdout_artifact_id) : null,
    stderrArtifactId: row.stderr_artifact_id ? String(row.stderr_artifact_id) : null,
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    runtimeFingerprint: String(row.runtime_fingerprint),
    codeHash: String(row.code_hash),
    inputHash: String(row.input_hash),
    exactArithmetic: Number(row.exact_arithmetic) === 1,
    deterministic: Number(row.deterministic) === 1,
    stdoutTruncated: Number(row.stdout_truncated) === 1,
    stderrTruncated: Number(row.stderr_truncated) === 1,
    randomSeed: row.random_seed ?? null,
  }
}

export class ExperimentRepository {
  constructor(private readonly db: Database) {}

  insert(row: Experiment): void {
    this.db.query(
      `INSERT INTO experiments (id, workspace_id, branch_id, claim_id, research_run_id, research_step_id, agent_id, kind, status, hypothesis, runtime_json, code_artifact_id, parameters_json, code_hash, input_hash, created_at, started_at, finished_at, origin, sandbox_mode, network_policy, execution_policy_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.workspaceId, row.branchId, row.claimId, row.researchRunId, row.researchStepId, row.agentId, row.kind, row.status, row.hypothesis, JSON.stringify(row.runtime), row.codeArtifactId, JSON.stringify(row.parameters), row.codeHash, row.inputHash, row.createdAt, row.startedAt, row.finishedAt, row.origin, row.sandboxMode ?? null, row.networkPolicy ?? null, row.executionPolicyVersion ?? null)
  }

  update(row: Experiment): void {
    this.db.query(
      `UPDATE experiments SET status = ?, started_at = ?, finished_at = ?, research_step_id = ?, sandbox_mode = ?, network_policy = ?, execution_policy_version = ? WHERE id = ?`,
    ).run(row.status, row.startedAt, row.finishedAt, row.researchStepId, row.sandboxMode ?? null, row.networkPolicy ?? null, row.executionPolicyVersion ?? null, row.id)
  }

  get(id: string): Experiment | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM experiments WHERE id = ?").get(id)
    return row ? mapExperiment(row) : null
  }

  list(workspaceId: string, branchId?: string): Experiment[] {
    if (branchId) {
      return this.db.query<Record<string, unknown>, [string, string]>("SELECT * FROM experiments WHERE workspace_id = ? AND branch_id = ? ORDER BY id").all(workspaceId, branchId).map(mapExperiment)
    }
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM experiments WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapExperiment)
  }
}

export class ExperimentResultRepository {
  constructor(private readonly db: Database) {}

  insert(row: ExperimentResult): void {
    this.db.query(
      `INSERT INTO experiment_results (id, experiment_id, outcome, summary, structured_json, stdout_artifact_id, stderr_artifact_id, started_at, finished_at, runtime_fingerprint, code_hash, input_hash, exact_arithmetic, deterministic, stdout_truncated, stderr_truncated, random_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.experimentId, row.outcome, row.summary, JSON.stringify(row.structuredOutput), row.stdoutArtifactId, row.stderrArtifactId, row.startedAt, row.finishedAt, row.runtimeFingerprint, row.codeHash, row.inputHash, row.exactArithmetic ? 1 : 0, row.deterministic ? 1 : 0, row.stdoutTruncated ? 1 : 0, row.stderrTruncated ? 1 : 0, row.randomSeed == null ? null : String(row.randomSeed))
  }

  list(experimentId: string): ExperimentResult[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM experiment_results WHERE experiment_id = ? ORDER BY id").all(experimentId).map(mapResult)
  }

  get(id: string): ExperimentResult | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM experiment_results WHERE id = ?").get(id)
    return row ? mapResult(row) : null
  }
}
