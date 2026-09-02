import type { Database } from "bun:sqlite"
import { V1Repository } from "./v1-repository-utils.ts"
import type { Citation, ExternalResult, LiteratureSearchHit, LiteratureSearchRecord, Source, SourceExcerpt, SourceLocator } from "@mathos/domain"

function loc(raw: unknown): SourceLocator | null {
  if (!raw) return null
  return typeof raw === "string" ? JSON.parse(raw) as SourceLocator : raw as SourceLocator
}

export class SourceRepository {
  constructor(private readonly db: Database) {}

  insert(row: Source): void {
    this.db.query(`INSERT INTO sources (id, workspace_id, type, title, authors_json, year, venue, doi, arxiv_id, isbn, url, status, fingerprint, local_path, provider, provider_id, version, retrieved_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      row.id, row.workspaceId, row.type, row.title, JSON.stringify(row.authors), row.year, row.venue, row.doi, row.arxivId, row.isbn, row.url, row.status, row.fingerprint, row.localPath, row.provider, row.providerId, row.version, row.retrievedAt, row.createdAt,
    )
  }

  updateStatus(id: string, status: Source["status"]): void {
    this.db.query("UPDATE sources SET status = ? WHERE id = ?").run(status, id)
  }

  get(id: string): Source | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM sources WHERE id = ?").get(id)
    return row ? mapSource(row) : null
  }

  findByFingerprint(workspaceId: string, fingerprint: string): Source | null {
    const row = this.db.query<Record<string, unknown>, [string, string]>("SELECT * FROM sources WHERE workspace_id = ? AND fingerprint = ?").get(workspaceId, fingerprint)
    return row ? mapSource(row) : null
  }

  list(workspaceId: string): Source[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM sources WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapSource)
  }
}

function mapSource(row: Record<string, unknown>): Source {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    type: row.type as Source["type"],
    title: String(row.title),
    authors: JSON.parse(String(row.authors_json)),
    year: row.year == null ? null : Number(row.year),
    venue: row.venue ? String(row.venue) : null,
    doi: row.doi ? String(row.doi) : null,
    arxivId: row.arxiv_id ? String(row.arxiv_id) : null,
    isbn: row.isbn ? String(row.isbn) : null,
    url: row.url ? String(row.url) : null,
    status: row.status as Source["status"],
    fingerprint: String(row.fingerprint),
    localPath: row.local_path ? String(row.local_path) : null,
    provider: row.provider ? String(row.provider) : null,
    providerId: row.provider_id ? String(row.provider_id) : null,
    version: row.version ? String(row.version) : null,
    retrievedAt: row.retrieved_at ? String(row.retrieved_at) : null,
    createdAt: String(row.created_at),
  }
}

export class SourceExcerptRepository {
  constructor(private readonly db: Database) {}
  insert(row: SourceExcerpt): void {
    this.db.query("INSERT INTO source_excerpts (id, source_id, locator_json, text, text_hash, extraction_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(row.id, row.sourceId, row.locator ? JSON.stringify(row.locator) : null, row.text, row.textHash, row.extractionMethod, row.createdAt)
  }
  list(sourceId: string): SourceExcerpt[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM source_excerpts WHERE source_id = ? ORDER BY CASE WHEN json_extract(locator_json,'$.kind')='PAGE' THEN json_extract(locator_json,'$.pageStart') ELSE 2147483647 END, id").all(sourceId).map((row) => ({
      id: String(row.id), sourceId: String(row.source_id), locator: loc(row.locator_json), text: String(row.text), textHash: String(row.text_hash), extractionMethod: row.extraction_method as SourceExcerpt["extractionMethod"], createdAt: String(row.created_at),
    }))
  }
  get(id: string): SourceExcerpt | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM source_excerpts WHERE id = ?").get(id)
    return row ? { id: String(row.id), sourceId: String(row.source_id), locator: loc(row.locator_json), text: String(row.text), textHash: String(row.text_hash), extractionMethod: row.extraction_method as SourceExcerpt["extractionMethod"], createdAt: String(row.created_at) } : null
  }
  deleteForSource(sourceId:string):void { this.db.query("DELETE FROM source_excerpts WHERE source_id=?").run(sourceId) }
}

export class ExternalResultRepository {
  constructor(private readonly db: Database) {}
  insert(row: ExternalResult): void {
    this.db.query("INSERT INTO external_results (id, workspace_id, branch_id, source_id, excerpt_id, kind, name, statement_summary, statement_mode, locator_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.workspaceId, row.branchId, row.sourceId, row.excerptId, row.kind, row.name, row.statementSummary, row.statementMode, row.locator ? JSON.stringify(row.locator) : null, row.status, row.createdAt)
  }
  updateStatus(id: string, status: ExternalResult["status"]): void {
    this.db.query("UPDATE external_results SET status = ? WHERE id = ?").run(status, id)
  }
  get(id: string): ExternalResult | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM external_results WHERE id = ?").get(id)
    return row ? mapExt(row) : null
  }
  list(workspaceId: string, branchId?: string): ExternalResult[] {
    if (branchId) return this.db.query<Record<string, unknown>, [string, string]>("SELECT * FROM external_results WHERE workspace_id = ? AND branch_id = ? ORDER BY id").all(workspaceId, branchId).map(mapExt)
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM external_results WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapExt)
  }
}

type ExtractionCandidateRow = { id: string; sourceId: string; excerptId: string | null; pageLocator: string | null; kind: string; name: string | null; rawStatement: string; normalizedSummary: string; status: string; provider: string | null; model: string | null; promptHash: string | null; duplicationTargetId: string | null; createdAt: string }
export class ExtractionCandidateRepository extends V1Repository<ExtractionCandidateRow> {
  constructor(db: Database) { super(db, "extraction_candidates", ["id", "sourceId", "excerptId", "pageLocator", "kind", "name", "rawStatement", "normalizedSummary", "status", "provider", "model", "promptHash", "duplicationTargetId", "createdAt"], [], "created_at") }
  updateStatus(id: string, status: string): void { if (this.db.query("UPDATE extraction_candidates SET status=? WHERE id=?").run(status, id).changes !== 1) throw new Error("EXTRACTION_CANDIDATE_NOT_FOUND") }
}

function mapExt(row: Record<string, unknown>): ExternalResult {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), branchId: String(row.branch_id), sourceId: String(row.source_id), excerptId: row.excerpt_id ? String(row.excerpt_id) : null,
    kind: row.kind as ExternalResult["kind"], name: row.name ? String(row.name) : null, statementSummary: String(row.statement_summary), statementMode: row.statement_mode as ExternalResult["statementMode"],
    locator: loc(row.locator_json), status: row.status as ExternalResult["status"], createdAt: String(row.created_at),
  }
}

export class CitationRepository {
  constructor(private readonly db: Database) {}
  insert(row: Citation): void {
    this.db.query("INSERT INTO citations (id, workspace_id, branch_id, source_id, claim_id, evidence_id, blocker_id, decision_id, research_run_id, research_step_id, external_result_id, excerpt_id, locator_json, purpose, invalidated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.workspaceId, row.branchId, row.sourceId, row.claimId, row.evidenceId, row.blockerId, row.decisionId, row.researchRunId, row.researchStepId, row.externalResultId, row.excerptId, row.locator ? JSON.stringify(row.locator) : null, row.purpose, row.invalidated ? 1 : 0, row.createdAt)
  }
  invalidate(id: string): void {
    this.db.query("UPDATE citations SET invalidated = 1 WHERE id = ?").run(id)
  }
  get(id: string): Citation | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM citations WHERE id = ?").get(id)
    return row ? mapCit(row) : null
  }
  list(workspaceId: string, branchId?: string): Citation[] {
    if (branchId) return this.db.query<Record<string, unknown>, [string, string]>("SELECT * FROM citations WHERE workspace_id = ? AND branch_id = ? ORDER BY id").all(workspaceId, branchId).map(mapCit)
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM citations WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapCit)
  }
}

function mapCit(row: Record<string, unknown>): Citation {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), branchId: String(row.branch_id), sourceId: String(row.source_id),
    claimId: row.claim_id ? String(row.claim_id) : null, evidenceId: row.evidence_id ? String(row.evidence_id) : null, blockerId: row.blocker_id ? String(row.blocker_id) : null,
    decisionId: row.decision_id ? String(row.decision_id) : null, researchRunId: row.research_run_id ? String(row.research_run_id) : null, researchStepId: row.research_step_id ? String(row.research_step_id) : null,
    externalResultId: row.external_result_id ? String(row.external_result_id) : null, excerptId: row.excerpt_id ? String(row.excerpt_id) : null,
    locator: loc(row.locator_json), purpose: row.purpose as Citation["purpose"], invalidated: Number(row.invalidated) === 1, createdAt: String(row.created_at),
  }
}

export class LiteratureSearchRepository {
  constructor(private readonly db: Database) {}
  insert(row: LiteratureSearchRecord): void {
    this.db.query("INSERT INTO literature_searches (id, workspace_id, branch_id, query, query_fingerprint, provider, target_claim_id, research_run_id, research_step_id, agent_id, result_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(row.id, row.workspaceId, row.branchId, row.query, row.queryFingerprint, row.provider, row.targetClaimId, row.researchRunId, row.researchStepId, row.agentId, row.resultCount, row.createdAt)
  }
  insertHit(hit: LiteratureSearchHit): void {
    this.db.query("INSERT INTO literature_search_results (search_id, result_index, provider, external_id, title, authors_json, year, doi, arxiv_id, url, abstract, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(hit.searchId, hit.index, hit.provider, hit.externalId, hit.title, JSON.stringify(hit.authors), hit.year, hit.doi, hit.arxivId, hit.url, hit.abstract, hit.score)
  }
  list(workspaceId: string): LiteratureSearchRecord[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM literature_searches WHERE workspace_id = ? ORDER BY id").all(workspaceId).map(mapSearch)
  }
  get(id: string): LiteratureSearchRecord | null {
    const row = this.db.query<Record<string, unknown>, [string]>("SELECT * FROM literature_searches WHERE id = ?").get(id)
    return row ? mapSearch(row) : null
  }
  hits(searchId: string): LiteratureSearchHit[] {
    return this.db.query<Record<string, unknown>, [string]>("SELECT * FROM literature_search_results WHERE search_id = ? ORDER BY result_index").all(searchId).map((row) => ({
      searchId: String(row.search_id), index: Number(row.result_index), provider: String(row.provider), externalId: String(row.external_id), title: String(row.title),
      authors: JSON.parse(String(row.authors_json)), year: row.year == null ? null : Number(row.year), doi: row.doi ? String(row.doi) : null, arxivId: row.arxiv_id ? String(row.arxiv_id) : null,
      url: row.url ? String(row.url) : null, abstract: row.abstract ? String(row.abstract) : null, score: row.score == null ? null : Number(row.score),
    }))
  }
  findFingerprint(workspaceId: string, fingerprint: string): LiteratureSearchRecord | null {
    const row = this.db.query<Record<string, unknown>, [string, string]>("SELECT * FROM literature_searches WHERE workspace_id = ? AND query_fingerprint = ? ORDER BY id DESC").get(workspaceId, fingerprint)
    return row ? mapSearch(row) : null
  }
}

function mapSearch(row: Record<string, unknown>): LiteratureSearchRecord {
  return {
    id: String(row.id), workspaceId: String(row.workspace_id), branchId: String(row.branch_id), query: String(row.query), queryFingerprint: String(row.query_fingerprint),
    provider: String(row.provider), targetClaimId: row.target_claim_id ? String(row.target_claim_id) : null, researchRunId: row.research_run_id ? String(row.research_run_id) : null,
    researchStepId: row.research_step_id ? String(row.research_step_id) : null, agentId: row.agent_id ? String(row.agent_id) : null, resultCount: Number(row.result_count), createdAt: String(row.created_at),
  }
}
