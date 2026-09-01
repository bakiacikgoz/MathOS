import type { Database } from "bun:sqlite"
import type {
  MultiAgentResearchSession,
  MultiAgentRound,
  ResearchAgentWorker,
  SolutionCandidate,
  SharedResearchDigest,
} from "@mathos/domain"

export class MultiAgentSessionRepository {
  constructor(private readonly db: Database) {}

  insert(row: MultiAgentResearchSession): void {
    this.db.query(
      `INSERT INTO multi_agent_sessions (id, workspace_id, source_branch_id, source_revision, objective_claim_id, status, strategy, limits_json, usage_json, current_round, source_stale, created_at, started_at, stopped_at, stop_reason, execution_mode, max_parallel_workers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.workspaceId, row.sourceBranchId, row.sourceRevision, row.objectiveClaimId, row.status, row.strategy, JSON.stringify(row.limits), JSON.stringify(row.usage), row.currentRound, row.sourceStale ? 1 : 0, row.createdAt, row.startedAt, row.stoppedAt, row.stopReason, row.executionMode ?? "SEQUENTIAL", row.maxParallelWorkers ?? 2)
  }

  get(id: string): MultiAgentResearchSession | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM multi_agent_sessions WHERE id = ?").get(id)
    return row ? mapSession(row) : null
  }

  ids(workspaceId: string): string[] {
    return this.db.query<{ id: string }, [string]>("SELECT id FROM multi_agent_sessions WHERE workspace_id = ?").all(workspaceId).map((row) => row.id)
  }

  list(workspaceId: string): MultiAgentResearchSession[] {
    return this.ids(workspaceId).map((id) => this.get(id)!).filter(Boolean)
  }

  update(row: MultiAgentResearchSession): void {
    this.db.query(
      `UPDATE multi_agent_sessions SET status = ?, usage_json = ?, current_round = ?, source_stale = ?, started_at = ?, stopped_at = ?, stop_reason = ? WHERE id = ?`,
    ).run(row.status, JSON.stringify(row.usage), row.currentRound, row.sourceStale ? 1 : 0, row.startedAt, row.stoppedAt, row.stopReason, row.id)
  }
}

function mapSession(row: Record<string, unknown>): MultiAgentResearchSession {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    sourceBranchId: String(row.source_branch_id),
    sourceRevision: row.source_revision ? String(row.source_revision) : null,
    objectiveClaimId: String(row.objective_claim_id),
    status: row.status as MultiAgentResearchSession["status"],
    strategy: "DIVERSE_BRANCHES",
    limits: JSON.parse(String(row.limits_json)),
    usage: JSON.parse(String(row.usage_json)),
    currentRound: Number(row.current_round),
    sourceStale: Number(row.source_stale) === 1,
    executionMode: (row.execution_mode as MultiAgentResearchSession["executionMode"]) || "SEQUENTIAL",
    maxParallelWorkers: Number(row.max_parallel_workers ?? 2),
    createdAt: String(row.created_at),
    startedAt: row.started_at ? String(row.started_at) : null,
    stoppedAt: row.stopped_at ? String(row.stopped_at) : null,
    stopReason: row.stop_reason as MultiAgentResearchSession["stopReason"],
  }
}

export class ResearchAgentRepository {
  constructor(private readonly db: Database) {}

  insert(row: ResearchAgentWorker): void {
    this.db.query(
      `INSERT INTO research_agents (id, session_id, role, branch_id, research_run_id, local_claim_id, status, assignment_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.sessionId, row.role, row.branchId, row.researchRunId, row.localClaimId, row.status, JSON.stringify(row.assignment), row.createdAt)
  }

  list(sessionId: string): ResearchAgentWorker[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM research_agents WHERE session_id = ? ORDER BY id").all(sessionId).map(mapAgent)
  }

  listAll(): ResearchAgentWorker[] {
    return this.db.query<Record<string, unknown>, []>("SELECT * FROM research_agents ORDER BY id").all().map(mapAgent)
  }

  ids(): string[] {
    return this.db.query<{ id: string }, []>("SELECT id FROM research_agents").all().map((row) => row.id)
  }

  update(row: ResearchAgentWorker): void {
    this.db.query("UPDATE research_agents SET status = ?, assignment_json = ? WHERE id = ?").run(row.status, JSON.stringify(row.assignment), row.id)
  }

  getByRun(runId: string): ResearchAgentWorker | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM research_agents WHERE research_run_id = ?").get(runId)
    return row ? mapAgent(row) : null
  }

  get(id: string): ResearchAgentWorker | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM research_agents WHERE id = ?").get(id)
    return row ? mapAgent(row) : null
  }
}

function mapAgent(row: Record<string, unknown>): ResearchAgentWorker {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: row.role as ResearchAgentWorker["role"],
    branchId: String(row.branch_id),
    researchRunId: String(row.research_run_id),
    localClaimId: String(row.local_claim_id),
    status: row.status as ResearchAgentWorker["status"],
    assignment: JSON.parse(String(row.assignment_json)),
    createdAt: String(row.created_at),
  }
}

export class MultiAgentRoundRepository {
  constructor(private readonly db: Database) {}

  insert(row: MultiAgentRound): void {
    this.db.query("INSERT INTO multi_agent_rounds (id, session_id, sequence, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?)").run(row.id, row.sessionId, row.sequence, row.status, row.startedAt, row.finishedAt)
  }

  getByKey(sessionId: string, sequence: number): MultiAgentRound | null {
    const row = this.db.query<Record<string, unknown>, [string, number]>("SELECT * FROM multi_agent_rounds WHERE session_id = ? AND sequence = ?").get(sessionId, sequence)
    return row ? mapRound(row) : null
  }

  list(sessionId: string): MultiAgentRound[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM multi_agent_rounds WHERE session_id = ? ORDER BY sequence").all(sessionId).map(mapRound)
  }

  update(row: MultiAgentRound): void {
    this.db.query("UPDATE multi_agent_rounds SET status = ?, started_at = ?, finished_at = ? WHERE id = ?").run(row.status, row.startedAt, row.finishedAt, row.id)
  }
}

function mapRound(row: Record<string, unknown>): MultiAgentRound {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    sequence: Number(row.sequence),
    status: row.status as MultiAgentRound["status"],
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
  }
}

export class SolutionCandidateRepository {
  constructor(private readonly db: Database) {}

  insert(row: SolutionCandidate): void {
    this.db.query("INSERT INTO solution_candidates (id, session_id, agent_id, branch_id, claim_id, verification_run_id, formal_revision, discovered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.sessionId, row.agentId, row.branchId, row.claimId, row.verificationRunId, row.formalRevision, row.discoveredAt)
  }

  list(sessionId: string): SolutionCandidate[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM solution_candidates WHERE session_id = ?").all(sessionId).map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      agentId: String(row.agent_id),
      branchId: String(row.branch_id),
      claimId: String(row.claim_id),
      verificationRunId: row.verification_run_id ? String(row.verification_run_id) : null,
      formalRevision: row.formal_revision ? String(row.formal_revision) : null,
      discoveredAt: String(row.discovered_at),
    }))
  }

  ids(): string[] {
    return this.db.query<{ id: string }, []>("SELECT id FROM solution_candidates").all().map((row) => row.id)
  }
}

export class SharedDigestRepository {
  constructor(private readonly db: Database) {}

  upsert(digest: SharedResearchDigest): void {
    this.db.query("INSERT INTO shared_digests (session_id, round, digest_json) VALUES (?, ?, ?) ON CONFLICT(session_id, round) DO UPDATE SET digest_json = excluded.digest_json").run(digest.sessionId, digest.round, JSON.stringify(digest))
  }

  get(sessionId: string, round: number): SharedResearchDigest | null {
    const row = this.db.query<{ digest_json: string }, [string, number]>("SELECT digest_json FROM shared_digests WHERE session_id = ? AND round = ?").get(sessionId, round)
    return row ? JSON.parse(row.digest_json) : null
  }
}
