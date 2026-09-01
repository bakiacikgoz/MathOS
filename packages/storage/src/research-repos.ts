import type { Database } from "bun:sqlite"
import type {
  ResearchBlockerRecord,
  ResearchDecisionRecord,
  ResearchRun,
  ResearchRunStatus,
  ResearchStep,
  ResearchStepStatus,
} from "@mathos/domain"
import { normalizeResearchUsage } from "@mathos/domain"

interface RunRow {
  id: string
  workspace_id: string
  branch_id: string
  objective_claim_id: string | null
  status: string
  started_at: string | null
  stopped_at: string | null
  current_step: number
  limits_json: string
  usage_json: string
  stop_reason: string | null
  strategy_json: string
  agent_id: string | null
  created_at: string
  updated_at: string
}

function mapRun(row: RunRow): ResearchRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    branchId: row.branch_id,
    objectiveClaimId: row.objective_claim_id,
    status: row.status as ResearchRunStatus,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    currentStep: row.current_step,
    limits: JSON.parse(row.limits_json),
    usage: normalizeResearchUsage(JSON.parse(row.usage_json)),
    stopReason: row.stop_reason as ResearchRun["stopReason"],
    strategy: JSON.parse(row.strategy_json),
    agentId: row.agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ResearchRunRepository {
  constructor(private readonly db: Database) {}

  insert(run: ResearchRun): void {
    this.db.query(
      `INSERT INTO research_runs (id, workspace_id, branch_id, objective_claim_id, status, started_at, stopped_at, current_step, limits_json, usage_json, stop_reason, strategy_json, agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(run.id, run.workspaceId, run.branchId, run.objectiveClaimId, run.status, run.startedAt, run.stoppedAt, run.currentStep, JSON.stringify(run.limits), JSON.stringify(run.usage), run.stopReason, JSON.stringify(run.strategy), run.agentId, run.createdAt, run.updatedAt)
  }

  get(id: string): ResearchRun | null {
    const row = this.db.query<RunRow, [string]>("SELECT * FROM research_runs WHERE id = ?").get(id)
    return row ? mapRun(row) : null
  }

  ids(workspaceId: string): string[] {
    return this.db.query<{ id: string }, [string]>("SELECT id FROM research_runs WHERE workspace_id = ?").all(workspaceId).map((row) => row.id)
  }

  list(workspaceId: string): ResearchRun[] {
    return this.db.query<RunRow, [string]>("SELECT * FROM research_runs WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapRun)
  }

  activeOnBranch(workspaceId: string, branchId: string, objectiveClaimId: string | null): ResearchRun | null {
    const row = objectiveClaimId
      ? this.db.query<RunRow, [string, string, string]>("SELECT * FROM research_runs WHERE workspace_id = ? AND branch_id = ? AND objective_claim_id = ? AND status IN ('READY','RUNNING','PAUSED','BLOCKED') LIMIT 1").get(workspaceId, branchId, objectiveClaimId)
      : this.db.query<RunRow, [string, string]>("SELECT * FROM research_runs WHERE workspace_id = ? AND branch_id = ? AND status IN ('READY','RUNNING') LIMIT 1").get(workspaceId, branchId)
    return row ? mapRun(row) : null
  }

  runningOnBranch(workspaceId: string, branchId: string): ResearchRun | null {
    const row = this.db.query<RunRow, [string, string]>("SELECT * FROM research_runs WHERE workspace_id = ? AND branch_id = ? AND status = 'RUNNING' LIMIT 1").get(workspaceId, branchId)
    return row ? mapRun(row) : null
  }

  liveOnBranch(workspaceId: string, branchId: string): ResearchRun | null {
    const row = this.db.query<RunRow, [string, string]>("SELECT * FROM research_runs WHERE workspace_id = ? AND branch_id = ? AND status IN ('READY','RUNNING') LIMIT 1").get(workspaceId, branchId)
    return row ? mapRun(row) : null
  }

  update(run: ResearchRun): void {
    this.db.query(
      `UPDATE research_runs SET status = ?, started_at = ?, stopped_at = ?, current_step = ?, usage_json = ?, stop_reason = ?, strategy_json = ?, updated_at = ? WHERE id = ?`,
    ).run(run.status, run.startedAt, run.stoppedAt, run.currentStep, JSON.stringify(run.usage), run.stopReason, JSON.stringify(run.strategy), run.updatedAt, run.id)
  }
}

interface StepRow {
  id: string
  run_id: string
  branch_id: string
  sequence: number
  action: string
  input_json: string
  result_json: string
  status: string
  idempotency_key: string
  started_at: string | null
  finished_at: string | null
  summary: string | null
  failure_class: string | null
  created_at: string
}

function mapStep(row: StepRow): ResearchStep {
  return {
    id: row.id,
    runId: row.run_id,
    branchId: row.branch_id,
    sequence: row.sequence,
    action: row.action as ResearchStep["action"],
    inputArtifactIds: JSON.parse(row.input_json),
    resultArtifactIds: JSON.parse(row.result_json),
    status: row.status as ResearchStepStatus,
    idempotencyKey: row.idempotency_key,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summary: row.summary,
    failureClass: row.failure_class as ResearchStep["failureClass"],
    createdAt: row.created_at,
  }
}

export class ResearchStepRepository {
  constructor(private readonly db: Database) {}

  insert(step: ResearchStep): void {
    this.db.query(
      `INSERT INTO research_steps (id, run_id, branch_id, sequence, action, input_json, result_json, status, idempotency_key, started_at, finished_at, summary, failure_class, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(step.id, step.runId, step.branchId, step.sequence, step.action, JSON.stringify(step.inputArtifactIds), JSON.stringify(step.resultArtifactIds), step.status, step.idempotencyKey, step.startedAt, step.finishedAt, step.summary, step.failureClass, step.createdAt)
  }

  getByKey(key: string): ResearchStep | null {
    const row = this.db.query<StepRow, [string]>("SELECT * FROM research_steps WHERE idempotency_key = ?").get(key)
    return row ? mapStep(row) : null
  }

  list(runId: string): ResearchStep[] {
    return this.db.query<StepRow, [string]>("SELECT * FROM research_steps WHERE run_id = ? ORDER BY sequence").all(runId).map(mapStep)
  }

  interrupted(runId: string): ResearchStep[] {
    return this.db.query<StepRow, [string]>("SELECT * FROM research_steps WHERE run_id = ? AND status = 'RUNNING'").all(runId).map(mapStep)
  }

  update(step: ResearchStep): void {
    this.db.query(
      `UPDATE research_steps SET status = ?, result_json = ?, started_at = ?, finished_at = ?, summary = ?, failure_class = ? WHERE id = ?`,
    ).run(step.status, JSON.stringify(step.resultArtifactIds), step.startedAt, step.finishedAt, step.summary, step.failureClass, step.id)
  }

  ids(workspacePrefix = "RS"): string[] {
    return this.db.query<{ id: string }, []>("SELECT id FROM research_steps").all().map((row) => row.id).filter((id) => id.startsWith(`${workspacePrefix}-`) || true)
  }
}

export class ResearchBlockerRepository {
  constructor(private readonly db: Database) {}

  insert(blocker: ResearchBlockerRecord): void {
    this.db.query(
      `INSERT INTO research_blockers (id, workspace_id, branch_id, claim_id, type, status, summary, created_by_step_id, resolved_by_step_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(blocker.id, blocker.workspaceId, blocker.branchId, blocker.claimId, blocker.type, blocker.status, blocker.summary, blocker.createdByStepId, blocker.resolvedByStepId, blocker.createdAt)
  }

  ids(): string[] {
    return this.db.query<{ id: string }, []>("SELECT id FROM research_blockers").all().map((row) => row.id)
  }

  open(branchId: string): ResearchBlockerRecord[] {
    return this.db.query<{
      id: string
      workspace_id: string
      branch_id: string
      claim_id: string | null
      type: ResearchBlockerRecord["type"]
      status: ResearchBlockerRecord["status"]
      summary: string
      created_by_step_id: string | null
      resolved_by_step_id: string | null
      created_at: string
    }, [string]>("SELECT * FROM research_blockers WHERE branch_id = ? AND status = 'OPEN'").all(branchId).map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      branchId: row.branch_id,
      claimId: row.claim_id,
      type: row.type,
      status: row.status,
      summary: row.summary,
      createdByStepId: row.created_by_step_id,
      resolvedByStepId: row.resolved_by_step_id,
      humanResponse: (row as { human_response?: string | null }).human_response ?? null,
      resolvedByHumanAt: (row as { resolved_by_human_at?: string | null }).resolved_by_human_at ?? null,
      createdAt: row.created_at,
    }))
  }

  listAll(workspaceId: string): ResearchBlockerRecord[] {
    return this.db.query<{
      id: string
      workspace_id: string
      branch_id: string
      claim_id: string | null
      type: ResearchBlockerRecord["type"]
      status: ResearchBlockerRecord["status"]
      summary: string
      created_by_step_id: string | null
      resolved_by_step_id: string | null
      created_at: string
      human_response?: string | null
      resolved_by_human_at?: string | null
    }, [string]>("SELECT * FROM research_blockers WHERE workspace_id = ? ORDER BY id").all(workspaceId).map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      branchId: row.branch_id,
      claimId: row.claim_id,
      type: row.type,
      status: row.status,
      summary: row.summary,
      createdByStepId: row.created_by_step_id,
      resolvedByStepId: row.resolved_by_step_id,
      humanResponse: row.human_response ?? null,
      resolvedByHumanAt: row.resolved_by_human_at ?? null,
      createdAt: row.created_at,
    }))
  }

  get(id: string): ResearchBlockerRecord | null {
    const found = this.db.query<{
      id: string
      workspace_id: string
      branch_id: string
      claim_id: string | null
      type: ResearchBlockerRecord["type"]
      status: ResearchBlockerRecord["status"]
      summary: string
      created_by_step_id: string | null
      resolved_by_step_id: string | null
      human_response: string | null
      resolved_by_human_at: string | null
      created_at: string
    }, [string]>("SELECT * FROM research_blockers WHERE id = ?").get(id)
    if (!found) return null
    return {
      id: found.id,
      workspaceId: found.workspace_id,
      branchId: found.branch_id,
      claimId: found.claim_id,
      type: found.type,
      status: found.status,
      summary: found.summary,
      createdByStepId: found.created_by_step_id,
      resolvedByStepId: found.resolved_by_step_id,
      humanResponse: found.human_response,
      resolvedByHumanAt: found.resolved_by_human_at,
      createdAt: found.created_at,
    }
  }

  answer(id: string, text: string, at: string): void {
    this.db.query("UPDATE research_blockers SET human_response = ?, resolved_by_human_at = ?, status = 'RESOLVED' WHERE id = ?").run(text, at, id)
  }
}

export class ResearchDecisionRepository {
  constructor(private readonly db: Database) {}

  insert(row: ResearchDecisionRecord): void {
    this.db.query("INSERT INTO research_decisions (id, run_id, branch_id, summary, created_at) VALUES (?, ?, ?, ?, ?)").run(row.id, row.runId, row.branchId, row.summary, row.createdAt)
  }

  ids(): string[] {
    return this.db.query<{ id: string }, []>("SELECT id FROM research_decisions").all().map((row) => row.id)
  }

  list(runId: string): ResearchDecisionRecord[] {
    return this.db.query<ResearchDecisionRecord, [string]>("SELECT id, run_id as runId, branch_id as branchId, summary, created_at as createdAt FROM research_decisions WHERE run_id = ?").all(runId)
  }

  listAll(): ResearchDecisionRecord[] {
    return this.db.query<ResearchDecisionRecord, []>("SELECT id, run_id as runId, branch_id as branchId, summary, created_at as createdAt FROM research_decisions ORDER BY id").all()
  }
}
