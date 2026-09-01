import type { Database } from "bun:sqlite"
import type { ResearchPlannerDescriptor, VerifiedArtifactImport } from "@mathos/domain"

export class RunPlannerRepository {
  constructor(private readonly db: Database) {}

  upsert(runId: string, descriptor: ResearchPlannerDescriptor, cursor: number, at: string): void {
    this.db.query(
      `INSERT INTO run_planners (run_id, descriptor_json, cursor, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET descriptor_json = excluded.descriptor_json, cursor = excluded.cursor, updated_at = excluded.updated_at`,
    ).run(runId, JSON.stringify(descriptor), cursor, at)
  }

  list(): Array<{ runId: string; descriptor: ResearchPlannerDescriptor; cursor: number }> {
    return this.db.query<{ run_id: string; descriptor_json: string; cursor: number }, []>("SELECT run_id, descriptor_json, cursor FROM run_planners").all().map((row) => ({
      runId: row.run_id,
      descriptor: JSON.parse(row.descriptor_json),
      cursor: row.cursor,
    }))
  }

  get(runId: string): { descriptor: ResearchPlannerDescriptor; cursor: number } | null {
    const row = this.db.query<{ descriptor_json: string; cursor: number }, [string]>("SELECT descriptor_json, cursor FROM run_planners WHERE run_id = ?").get(runId)
    return row ? { descriptor: JSON.parse(row.descriptor_json), cursor: row.cursor } : null
  }
}

export class ArtifactImportRepository {
  constructor(private readonly db: Database) {}

  insert(row: VerifiedArtifactImport): void {
    this.db.query(
      `INSERT INTO verified_artifact_imports (id, session_id, source_agent_id, source_branch_id, target_agent_id, target_branch_id, source_claim_id, target_claim_id, source_verification_run_id, source_formal_revision, status, failure_code, created_at, approved_at, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.sessionId, row.sourceAgentId, row.sourceBranchId, row.targetAgentId, row.targetBranchId, row.sourceClaimId, row.targetClaimId, row.sourceVerificationRunId, row.sourceFormalRevision, row.status, row.failureCode, row.createdAt, row.approvedAt, row.appliedAt)
  }

  get(id: string): VerifiedArtifactImport | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM verified_artifact_imports WHERE id = ?").get(id)
    return row ? mapImport(row) : null
  }

  list(sessionId: string): VerifiedArtifactImport[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM verified_artifact_imports WHERE session_id = ? ORDER BY id").all(sessionId).map(mapImport)
  }

  listAll(): VerifiedArtifactImport[] {
    return this.db.query<Record<string, unknown>, []>("SELECT * FROM verified_artifact_imports ORDER BY id").all().map(mapImport)
  }

  ids(): string[] {
    return this.db.query<{ id: string }, []>("SELECT id FROM verified_artifact_imports").all().map((row) => row.id)
  }

  update(row: VerifiedArtifactImport): void {
    this.db.query(
      `UPDATE verified_artifact_imports SET status = ?, failure_code = ?, target_claim_id = ?, approved_at = ?, applied_at = ? WHERE id = ?`,
    ).run(row.status, row.failureCode, row.targetClaimId, row.approvedAt, row.appliedAt, row.id)
  }

  addDependency(importId: string, claimId: string): void {
    this.db.query("INSERT OR IGNORE INTO import_dependencies (import_id, claim_id) VALUES (?, ?)").run(importId, claimId)
  }

  dependencies(importId: string): string[] {
    return this.db.query<{ claim_id: string }, [string]>("SELECT claim_id FROM import_dependencies WHERE import_id = ?").all(importId).map((row) => row.claim_id)
  }
}

function mapImport(row: Record<string, unknown>): VerifiedArtifactImport {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    sourceAgentId: String(row.source_agent_id),
    sourceBranchId: String(row.source_branch_id),
    targetAgentId: String(row.target_agent_id),
    targetBranchId: String(row.target_branch_id),
    sourceClaimId: String(row.source_claim_id),
    targetClaimId: row.target_claim_id ? String(row.target_claim_id) : null,
    sourceVerificationRunId: row.source_verification_run_id ? String(row.source_verification_run_id) : null,
    sourceFormalRevision: String(row.source_formal_revision),
    status: row.status as VerifiedArtifactImport["status"],
    failureCode: row.failure_code ? String(row.failure_code) : null,
    createdAt: String(row.created_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    appliedAt: row.applied_at ? String(row.applied_at) : null,
  }
}
