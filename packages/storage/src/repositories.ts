import type { Database } from "bun:sqlite"
import type {
  Blocker,
  BlockerPriority,
  BlockerStatus,
  Branch,
  BranchStatus,
  Claim,
  ClaimKind,
  ClaimStatus,
  Dependency,
  DependencyRelation,
  Evidence,
  EvidenceKind,
  FidelityReview,
  FormalStatement,
  ProofAttempt,
  ResearchEvent,
  VerificationRun,
  WorkspaceRecord,
} from "@mathos/domain"
import { VerificationFailed } from "@mathos/shared"

interface WorkspaceRow {
  id: string
  name: string
  root_path: string
  main_objective_id: string | null
  created_at: string
  updated_at: string
}

interface ClaimRow {
  id: string
  workspace_id: string
  kind: string
  title: string
  natural_statement: string
  original_input: string | null
  status: string
  branch_id: string
  created_by: string | null
  provider: string | null
  model_name: string | null
  created_at: string
  updated_at: string
}

interface DependencyRow {
  id: string
  workspace_id: string
  from_claim_id: string
  to_claim_id: string
  relation: string
  created_at: string
}

interface EvidenceRow {
  id: string
  workspace_id: string
  claim_id: string
  kind: string
  summary: string
  artifact_ref: string | null
  reproducible: number
  created_at: string
}

interface BranchRow {
  id: string
  workspace_id: string
  name: string
  status: string
  is_current: number
  created_at: string
  slug: string | null
  parent_branch_id: string | null
  purpose: string | null
  updated_at: string | null
  created_from_event_id: string | null
  git_ref: string | null
  worktree_path: string | null
  stale_base: number | null
  setup_state: string | null
}

interface BlockerRow {
  id: string
  workspace_id: string
  target_claim_id: string | null
  title: string
  description: string
  priority: string
  status: string
  created_at: string
  resolved_at: string | null
}

function mapWorkspace(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    mainObjectiveId: row.main_objective_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind as ClaimKind,
    title: row.title,
    naturalStatement: row.natural_statement,
    originalInput: row.original_input ?? null,
    status: row.status as ClaimStatus,
    branchId: row.branch_id,
    createdBy: row.created_by === "model" ? "model" : "user",
    provider: row.provider ?? null,
    modelName: row.model_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDependency(row: DependencyRow): Dependency {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fromClaimId: row.from_claim_id,
    toClaimId: row.to_claim_id,
    relation: row.relation as DependencyRelation,
    createdAt: row.created_at,
  }
}

function mapEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    claimId: row.claim_id,
    kind: row.kind as EvidenceKind,
    summary: row.summary,
    artifactRef: row.artifact_ref,
    reproducible: row.reproducible === 1,
    createdAt: row.created_at,
  }
}

function mapBranch(row: BranchRow): Branch {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug ?? row.name.toLowerCase(),
    parentBranchId: row.parent_branch_id,
    purpose: row.purpose,
    status: row.status as BranchStatus,
    isCurrent: row.is_current === 1,
    staleBase: row.stale_base === 1,
    createdFromEventId: row.created_from_event_id,
    gitRef: row.git_ref,
    worktreePath: row.worktree_path,
    setupState: row.setup_state === "FAILED" ? "FAILED" : "READY",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  }
}

function mapBlocker(row: BlockerRow): Blocker {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    targetClaimId: row.target_claim_id,
    title: row.title,
    description: row.description,
    priority: row.priority as BlockerPriority,
    status: row.status as BlockerStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}

export class WorkspaceRepository {
  constructor(private readonly db: Database) {}

  insert(record: WorkspaceRecord): void {
    this.db
      .query(
        `INSERT INTO workspaces (id, name, root_path, main_objective_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.name, record.rootPath, record.mainObjectiveId, record.createdAt, record.updatedAt)
  }

  get(): WorkspaceRecord | null {
    const row = this.db.query<WorkspaceRow, []>("SELECT * FROM workspaces LIMIT 1").get()
    return row ? mapWorkspace(row) : null
  }

  setMainObjective(workspaceId: string, claimId: string | null, updatedAt: string): void {
    this.db
      .query("UPDATE workspaces SET main_objective_id = ?, updated_at = ? WHERE id = ?")
      .run(claimId, updatedAt, workspaceId)
  }
}

export class ClaimRepository {
  constructor(private readonly db: Database) {}

  insert(claim: Claim): void {
    this.assertNotKernelPromotion(claim.status)
    this.db
      .query(
        `INSERT INTO claims (
           id, workspace_id, kind, title, natural_statement, original_input, status, branch_id,
           created_by, provider, model_name, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        claim.id,
        claim.workspaceId,
        claim.kind,
        claim.title,
        claim.naturalStatement,
        claim.originalInput,
        claim.status,
        claim.branchId,
        claim.createdBy,
        claim.provider,
        claim.modelName,
        claim.createdAt,
        claim.updatedAt,
      )
  }

  get(id: string): Claim | null {
    const row = this.db.query<ClaimRow, [string]>("SELECT * FROM claims WHERE id = ?").get(id)
    return row ? mapClaim(row) : null
  }

  list(workspaceId: string): Claim[] {
    return this.db
      .query<ClaimRow, [string]>("SELECT * FROM claims WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId)
      .map(mapClaim)
  }

  listVisible(branchId: string): Claim[] {
    return this.db
      .query<ClaimRow, [string]>(
        `SELECT c.* FROM claims c
         INNER JOIN claim_branch_visibility v ON v.claim_id = c.id
         WHERE v.branch_id = ?
         ORDER BY c.created_at`,
      )
      .all(branchId)
      .map(mapClaim)
  }

  idsByPrefix(workspaceId: string, prefix: string): string[] {
    return this.db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM claims WHERE workspace_id = ? AND id LIKE ?",
      )
      .all(workspaceId, `${prefix}-%`)
      .map((row) => row.id)
  }

  countByKindPrefix(workspaceId: string, prefix: string): number {
    return this.idsByPrefix(workspaceId, prefix).length
  }

  updateStatus(id: string, status: ClaimStatus, updatedAt: string): void {
    this.assertNotKernelPromotion(status)
    this.db.query("UPDATE claims SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id)
  }

  private assertNotKernelPromotion(status: ClaimStatus): void {
    if (status === "KERNEL_VERIFIED") {
      throw new VerificationFailed("KERNEL_VERIFIED can only be assigned by VerificationGate.")
    }
  }
}

export class DependencyRepository {
  constructor(private readonly db: Database) {}

  insert(dep: Dependency): void {
    this.db
      .query(
        `INSERT INTO dependencies (id, workspace_id, from_claim_id, to_claim_id, relation, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(dep.id, dep.workspaceId, dep.fromClaimId, dep.toClaimId, dep.relation, dep.createdAt)
  }

  list(workspaceId: string): Dependency[] {
    return this.db
      .query<DependencyRow, [string]>("SELECT * FROM dependencies WHERE workspace_id = ?")
      .all(workspaceId)
      .map(mapDependency)
  }

  listForClaim(workspaceId: string, claimId: string): Dependency[] {
    return this.db
      .query<DependencyRow, [string, string, string]>(
        "SELECT * FROM dependencies WHERE workspace_id = ? AND (from_claim_id = ? OR to_claim_id = ?)",
      )
      .all(workspaceId, claimId, claimId)
      .map(mapDependency)
  }
}

export class EvidenceRepository {
  constructor(private readonly db: Database) {}

  insert(evidence: Evidence): void {
    this.db
      .query(
        `INSERT INTO evidence (id, workspace_id, claim_id, kind, summary, artifact_ref, reproducible, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        evidence.id,
        evidence.workspaceId,
        evidence.claimId,
        evidence.kind,
        evidence.summary,
        evidence.artifactRef,
        evidence.reproducible ? 1 : 0,
        evidence.createdAt,
      )
  }

  listForClaim(workspaceId: string, claimId: string): Evidence[] {
    return this.db
      .query<EvidenceRow, [string, string]>(
        "SELECT * FROM evidence WHERE workspace_id = ? AND claim_id = ? ORDER BY created_at",
      )
      .all(workspaceId, claimId)
      .map(mapEvidence)
  }
}

export class BranchRepository {
  constructor(private readonly db: Database) {}

  insert(branch: Branch): void {
    this.db
      .query(
        `INSERT INTO branches (
           id, workspace_id, name, status, is_current, created_at,
           slug, parent_branch_id, purpose, updated_at, created_from_event_id, git_ref, worktree_path, stale_base, setup_state
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        branch.id,
        branch.workspaceId,
        branch.name,
        branch.status,
        branch.isCurrent ? 1 : 0,
        branch.createdAt,
        branch.slug,
        branch.parentBranchId,
        branch.purpose,
        branch.updatedAt,
        branch.createdFromEventId,
        branch.gitRef,
        branch.worktreePath,
        branch.staleBase ? 1 : 0,
        branch.setupState,
      )
  }

  list(workspaceId: string): Branch[] {
    return this.db
      .query<BranchRow, [string]>("SELECT * FROM branches WHERE workspace_id = ? ORDER BY id")
      .all(workspaceId)
      .map(mapBranch)
  }

  ids(workspaceId: string): string[] {
    return this.db
      .query<{ id: string }, [string]>("SELECT id FROM branches WHERE workspace_id = ?")
      .all(workspaceId)
      .map((row) => row.id)
  }

  setCurrent(workspaceId: string, branchId: string, updatedAt: string): void {
    this.db.query("UPDATE branches SET is_current = 0, updated_at = ? WHERE workspace_id = ?").run(updatedAt, workspaceId)
    this.db.query("UPDATE branches SET is_current = 1, updated_at = ? WHERE id = ?").run(updatedAt, branchId)
  }

  updateStatus(id: string, status: BranchStatus, updatedAt: string): void {
    this.db.query("UPDATE branches SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id)
  }

  updateWorktree(id: string, gitRef: string | null, worktreePath: string | null, setupState: Branch["setupState"], updatedAt: string): void {
    this.db
      .query("UPDATE branches SET git_ref = ?, worktree_path = ?, setup_state = ?, updated_at = ? WHERE id = ?")
      .run(gitRef, worktreePath, setupState, updatedAt, id)
  }

  setStaleBase(id: string, stale: boolean, updatedAt: string): void {
    this.db.query("UPDATE branches SET stale_base = ?, updated_at = ? WHERE id = ?").run(stale ? 1 : 0, updatedAt, id)
  }

  delete(id: string): void {
    this.db.query("DELETE FROM claim_branch_visibility WHERE branch_id = ?").run(id)
    this.db.query("DELETE FROM branches WHERE id = ?").run(id)
  }

  current(workspaceId: string): Branch | null {
    const row = this.db
      .query<BranchRow, [string]>("SELECT * FROM branches WHERE workspace_id = ? AND is_current = 1 LIMIT 1")
      .get(workspaceId)
    return row ? mapBranch(row) : null
  }

  get(id: string): Branch | null {
    const row = this.db.query<BranchRow, [string]>("SELECT * FROM branches WHERE id = ?").get(id)
    return row ? mapBranch(row) : null
  }

  getByName(workspaceId: string, name: string): Branch | null {
    const row = this.db
      .query<BranchRow, [string, string, string]>("SELECT * FROM branches WHERE workspace_id = ? AND (name = ? OR slug = ?)")
      .get(workspaceId, name, name.toLowerCase())
    return row ? mapBranch(row) : null
  }
}

export class ClaimVisibilityRepository {
  constructor(private readonly db: Database) {}

  insert(branchId: string, claimId: string, relation: string, createdAt: string): void {
    this.db
      .query("INSERT OR REPLACE INTO claim_branch_visibility (branch_id, claim_id, relation, created_at) VALUES (?, ?, ?, ?)")
      .run(branchId, claimId, relation, createdAt)
  }

  copyInherited(fromBranchId: string, toBranchId: string, createdAt: string): void {
    this.db
      .query(
        `INSERT OR IGNORE INTO claim_branch_visibility (branch_id, claim_id, relation, created_at)
         SELECT ?, claim_id, 'INHERITED', ? FROM claim_branch_visibility WHERE branch_id = ?`,
      )
      .run(toBranchId, createdAt, fromBranchId)
  }

  relation(branchId: string, claimId: string): string | null {
    return this.db
      .query<{ relation: string }, [string, string]>("SELECT relation FROM claim_branch_visibility WHERE branch_id = ? AND claim_id = ?")
      .get(branchId, claimId)?.relation ?? null
  }

  counts(branchId: string): { local: number; inherited: number } {
    const rows = this.db
      .query<{ relation: string; n: number }, [string]>("SELECT relation, COUNT(*) as n FROM claim_branch_visibility WHERE branch_id = ? GROUP BY relation")
      .all(branchId)
    return {
      local: rows.find((row) => row.relation === "LOCAL")?.n ?? 0,
      inherited: rows.find((row) => row.relation === "INHERITED")?.n ?? 0,
    }
  }

  list(branchId: string): Array<{ claimId: string; relation: string }> {
    return this.db
      .query<{ claim_id: string; relation: string }, [string]>("SELECT claim_id, relation FROM claim_branch_visibility WHERE branch_id = ?")
      .all(branchId)
      .map((row) => ({ claimId: row.claim_id, relation: row.relation }))
  }
}

export class BlockerRepository {
  constructor(private readonly db: Database) {}

  insert(blocker: Blocker): void {
    this.db
      .query(
        `INSERT INTO blockers (id, workspace_id, target_claim_id, title, description, priority, status, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        blocker.id,
        blocker.workspaceId,
        blocker.targetClaimId,
        blocker.title,
        blocker.description,
        blocker.priority,
        blocker.status,
        blocker.createdAt,
        blocker.resolvedAt,
      )
  }

  openCriticalCount(workspaceId: string): number {
    const row = this.db
      .query<{ n: number }, [string]>(
        "SELECT COUNT(*) as n FROM blockers WHERE workspace_id = ? AND status = 'open' AND priority = 'critical'",
      )
      .get(workspaceId)
    return row?.n ?? 0
  }
}

export class EventRepository {
  constructor(private readonly db: Database) {}

  insert(workspaceId: string, event: ResearchEvent): void {
    this.db
      .query(
        `INSERT INTO events (id, workspace_id, timestamp, actor_type, actor_id, action, target, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.eventId,
        workspaceId,
        event.timestamp,
        event.actor.type,
        event.actor.id,
        event.action,
        event.target,
        JSON.stringify(event.metadata),
      )
  }

  list(workspaceId: string): ResearchEvent[] {
    return this.db
      .query<Record<string, unknown>, [string]>("SELECT * FROM events WHERE workspace_id = ? ORDER BY timestamp, id")
      .all(workspaceId)
      .map((row) => ({
        eventId: String(row.id),
        timestamp: String(row.timestamp),
        actor: { type: String(row.actor_type) as ResearchEvent["actor"]["type"], id: String(row.actor_id) },
        action: String(row.action),
        target: row.target ? String(row.target) : null,
        metadata: row.metadata_json ? JSON.parse(String(row.metadata_json)) : {},
      }))
  }
}

export class FormalStatementRepository {
  constructor(private readonly db: Database) {}

  insert(statement: FormalStatement): void {
    this.db
      .query(
        `INSERT INTO formal_statements (
           id, workspace_id, claim_id, language, declaration_name, source_text, file_path,
           is_current, verification_status, fidelity_status, created_by, provider, model_name,
           lean_version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        statement.id,
        statement.workspaceId,
        statement.claimId,
        statement.language,
        statement.declarationName,
        statement.sourceText,
        statement.filePath,
        statement.isCurrent ? 1 : 0,
        statement.verificationStatus,
        statement.fidelityStatus,
        statement.createdBy,
        statement.provider,
        statement.modelName,
        statement.leanVersion,
        statement.createdAt,
        statement.updatedAt,
      )
  }

  get(id: string): FormalStatement | null {
    const row = this.db.query<FormalRow, [string]>("SELECT * FROM formal_statements WHERE id = ?").get(id)
    return row ? mapFormal(row) : null
  }

  currentForClaim(claimId: string): FormalStatement | null {
    const row = this.db
      .query<FormalRow, [string]>("SELECT * FROM formal_statements WHERE claim_id = ? AND is_current = 1 ORDER BY created_at DESC LIMIT 1")
      .get(claimId)
    return row ? mapFormal(row) : null
  }

  ids(workspaceId: string): string[] {
    return this.db.query<{ id: string }, [string]>("SELECT id FROM formal_statements WHERE workspace_id = ?").all(workspaceId).map((row) => row.id)
  }

  list(workspaceId: string): FormalStatement[] {
    return this.db.query<FormalRow, [string]>("SELECT * FROM formal_statements WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapFormal)
  }

  markOthersNotCurrent(claimId: string): void {
    this.db.query("UPDATE formal_statements SET is_current = 0 WHERE claim_id = ?").run(claimId)
  }

  updateStatuses(
    id: string,
    verificationStatus: FormalStatement["verificationStatus"],
    fidelityStatus: FormalStatement["fidelityStatus"],
    updatedAt: string,
    filePath?: string | null,
  ): void {
    this.db
      .query(
        "UPDATE formal_statements SET verification_status = ?, fidelity_status = ?, updated_at = ?, file_path = COALESCE(?, file_path) WHERE id = ?",
      )
      .run(verificationStatus, fidelityStatus, updatedAt, filePath ?? null, id)
  }
}

export class FidelityReviewRepository {
  constructor(private readonly db: Database) {}

  insert(review: FidelityReview): void {
    this.db
      .query(
        `INSERT INTO fidelity_reviews (
           id, workspace_id, claim_id, formal_statement_id, verdict, findings_json,
           natural_summary, formal_back_translation, reviewer_type, provider, model_name, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        review.id,
        review.workspaceId,
        review.claimId,
        review.formalStatementId,
        review.verdict,
        JSON.stringify(review.findings),
        review.naturalSummary,
        review.formalBackTranslation,
        review.reviewerType,
        review.provider,
        review.model,
        review.createdAt,
      )
  }

  latestForFormal(formalId: string): FidelityReview | null {
    const row = this.db
      .query<FidelityRow, [string]>("SELECT * FROM fidelity_reviews WHERE formal_statement_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(formalId)
    return row ? mapFidelity(row) : null
  }
}

export class VerificationRunRepository {
  constructor(private readonly db: Database) {}

  insert(run: VerificationRun): void {
    this.db
      .query(
        `INSERT INTO verification_runs (
           id, workspace_id, formal_statement_id, result, lean_version, toolchain, diagnostics_json, created_at,
           claim_id, proof_attempt_id, axioms_json, forbidden_json, fidelity_status, gate_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.workspaceId,
        run.formalStatementId,
        run.result,
        run.leanVersion,
        run.toolchain,
        run.diagnosticsJson,
        run.createdAt,
        run.claimId,
        run.proofAttemptId,
        run.axiomsJson,
        run.forbiddenJson,
        run.fidelityStatus,
        run.gateJson,
      )
  }

  latestForFormal(formalId: string): VerificationRun | null {
    const row = this.db
      .query<VerificationRow, [string]>("SELECT * FROM verification_runs WHERE formal_statement_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(formalId)
    return row ? mapVerification(row) : null
  }

  list(workspaceId: string): VerificationRun[] {
    return this.db.query<VerificationRow, [string]>("SELECT * FROM verification_runs WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapVerification)
  }
}

interface FormalRow {
  id: string
  workspace_id: string
  claim_id: string
  language: string
  declaration_name: string
  source_text: string
  file_path: string | null
  is_current: number
  verification_status: string
  fidelity_status: string
  created_by: string
  provider: string | null
  model_name: string | null
  lean_version: string | null
  created_at: string
  updated_at: string
}

interface FidelityRow {
  id: string
  workspace_id: string
  claim_id: string
  formal_statement_id: string
  verdict: string
  findings_json: string
  natural_summary: string
  formal_back_translation: string
  reviewer_type: string
  provider: string
  model_name: string
  created_at: string
}

interface VerificationRow {
  id: string
  workspace_id: string
  formal_statement_id: string
  result: string
  lean_version: string | null
  toolchain: string | null
  diagnostics_json: string
  created_at: string
  claim_id: string | null
  proof_attempt_id: string | null
  axioms_json: string | null
  forbidden_json: string | null
  fidelity_status: string | null
  gate_json: string | null
}

function mapFormal(row: FormalRow): FormalStatement {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    claimId: row.claim_id,
    language: "lean4",
    declarationName: row.declaration_name,
    sourceText: row.source_text,
    filePath: row.file_path,
    isCurrent: row.is_current === 1,
    verificationStatus: row.verification_status as FormalStatement["verificationStatus"],
    fidelityStatus: row.fidelity_status as FormalStatement["fidelityStatus"],
    createdBy: row.created_by === "user" ? "user" : "model",
    provider: row.provider,
    modelName: row.model_name,
    leanVersion: row.lean_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapFidelity(row: FidelityRow): FidelityReview {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    claimId: row.claim_id,
    formalStatementId: row.formal_statement_id,
    verdict: row.verdict as FidelityReview["verdict"],
    findings: JSON.parse(row.findings_json) as FidelityReview["findings"],
    naturalSummary: row.natural_summary,
    formalBackTranslation: row.formal_back_translation,
    reviewerType: "model",
    provider: row.provider,
    model: row.model_name,
    createdAt: row.created_at,
  }
}

function mapVerification(row: VerificationRow): VerificationRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    formalStatementId: row.formal_statement_id,
    claimId: row.claim_id ?? null,
    proofAttemptId: row.proof_attempt_id ?? null,
    result: row.result as VerificationRun["result"],
    leanVersion: row.lean_version,
    toolchain: row.toolchain,
    diagnosticsJson: row.diagnostics_json,
    axiomsJson: row.axioms_json ?? "[]",
    forbiddenJson: row.forbidden_json ?? "[]",
    fidelityStatus: row.fidelity_status,
    gateJson: row.gate_json ?? "[]",
    createdAt: row.created_at,
  }
}

export class ProofAttemptRepository {
  constructor(private readonly db: Database) {}

  insert(attempt: ProofAttempt): void {
    this.db
      .query(
        `INSERT INTO proof_attempts (
           id, workspace_id, claim_id, formal_statement_id, status, proof_source, attempt_number,
           provider, model_name, lean_version, diagnostics_json, created_at,
           retrieval_query, candidate_names_json, index_revision, retrieval_mode, retrieval_provenance_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attempt.id,
        attempt.workspaceId,
        attempt.claimId,
        attempt.formalStatementId,
        attempt.status,
        attempt.proofSource,
        attempt.attemptNumber,
        attempt.provider,
        attempt.modelName,
        attempt.leanVersion,
        JSON.stringify(attempt.diagnostics),
        attempt.createdAt,
        attempt.retrievalQuery,
        JSON.stringify(attempt.candidateNames),
        attempt.indexRevision,
        attempt.retrievalMode,
        attempt.retrievalProvenance ? JSON.stringify(attempt.retrievalProvenance) : null,
      )
  }

  ids(workspaceId: string): string[] {
    return this.db
      .query<{ id: string }, [string]>("SELECT id FROM proof_attempts WHERE workspace_id = ?")
      .all(workspaceId)
      .map((row) => row.id)
  }

  listForClaim(claimId: string): ProofAttempt[] {
    return this.db.query<ProofRow, [string]>("SELECT * FROM proof_attempts WHERE claim_id = ? ORDER BY attempt_number").all(claimId).map(mapProof)
  }

  list(workspaceId: string): ProofAttempt[] {
    return this.db.query<ProofRow, [string]>("SELECT * FROM proof_attempts WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapProof)
  }

  latestAccepted(claimId: string): ProofAttempt | null {
    const row = this.db
      .query<ProofRow, [string]>(
        "SELECT * FROM proof_attempts WHERE claim_id = ? AND status = 'KERNEL_ACCEPTED' ORDER BY created_at DESC LIMIT 1",
      )
      .get(claimId)
    return row ? mapProof(row) : null
  }
}

interface ProofRow {
  id: string
  workspace_id: string
  claim_id: string
  formal_statement_id: string
  status: string
  proof_source: string
  attempt_number: number
  provider: string | null
  model_name: string | null
  lean_version: string | null
  diagnostics_json: string
  created_at: string
  retrieval_query: string | null
  candidate_names_json: string | null
  index_revision: string | null
  retrieval_mode: string | null
  retrieval_provenance_json: string | null
}

function mapProof(row: ProofRow): ProofAttempt {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    claimId: row.claim_id,
    formalStatementId: row.formal_statement_id,
    status: row.status as ProofAttempt["status"],
    proofSource: row.proof_source,
    attemptNumber: row.attempt_number,
    provider: row.provider,
    modelName: row.model_name,
    leanVersion: row.lean_version,
    diagnostics: JSON.parse(row.diagnostics_json) as ProofAttempt["diagnostics"],
    retrievalQuery: row.retrieval_query ?? null,
    candidateNames: row.candidate_names_json ? (JSON.parse(row.candidate_names_json) as string[]) : [],
    indexRevision: row.index_revision ?? null,
    retrievalMode: row.retrieval_mode ?? null,
    retrievalProvenance: row.retrieval_provenance_json ? (JSON.parse(row.retrieval_provenance_json) as ProofAttempt["retrievalProvenance"]) : null,
    createdAt: row.created_at,
  }
}
