import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import {
  formatLocator,
  type Citation,
  type CitationPurpose,
  type Evidence,
  type ExternalResult,
  type ExternalResultKind,
  type ResearchBranch,
  type Source,
  type SourceExcerpt,
  type SourceLocator,
} from "@mathos/domain"
import { queryFingerprint, sourceFingerprint, type LiteratureProvider } from "@mathos/literature"
import {
  BranchRepository,
  CitationRepository,
  ClaimRepository,
  EvidenceRepository,
  ExternalResultRepository,
  LiteratureSearchRepository,
  SourceExcerptRepository,
  SourceRepository,
  WorkspaceRepository,
} from "@mathos/storage"
import { ClaimNotFound, createId, nowIso } from "@mathos/shared"
import { sha256Text } from "@mathos/computation"
import type { MutationRecorder } from "../mutation-recorder.ts"

export interface LiteratureServiceDependencies {
  root: string
  workspaces: WorkspaceRepository
  branches: BranchRepository
  claims: ClaimRepository
  evidence: EvidenceRepository
  sources: SourceRepository
  excerpts: SourceExcerptRepository
  external: ExternalResultRepository
  citations: CitationRepository
  searches: LiteratureSearchRepository
  provider: LiteratureProvider
  allocateId: (prefix: string) => string
  recorder: MutationRecorder
}

export class LiteratureService {
  lastSearchId: string | null = null

  constructor(private readonly dependencies: LiteratureServiceDependencies) {}

  async search(query: string, opts: { claimId?: string; runId?: string; stepId?: string; agentId?: string; maxResults?: number } = {}) {
    const workspace = this.requireWorkspace()
    const branch = this.requireCurrentBranch()
    const maxResults = Math.min(opts.maxResults ?? 10, 10)
    const fingerprint = queryFingerprint(this.dependencies.provider.name, { text: query, maxResults })
    const prior = this.dependencies.searches.findFingerprint(workspace.id, fingerprint)
    if (prior && (!opts.runId || prior.researchRunId === opts.runId)) throw new Error("LITERATURE_SEARCH_REPETITION")
    this.dependencies.recorder.record("literature_search_started", { target: workspace.id, metadata: { query, provider: this.dependencies.provider.name, branchId: branch.id, runId: opts.runId, stepId: opts.stepId, agentId: opts.agentId } })
    const hits = await this.dependencies.provider.search({ text: query, maxResults })
    const search = {
      id: this.dependencies.allocateId("LS"), workspaceId: workspace.id, branchId: branch.id, query,
      queryFingerprint: fingerprint, provider: this.dependencies.provider.name, targetClaimId: opts.claimId ?? null,
      researchRunId: opts.runId ?? null, researchStepId: opts.stepId ?? null, agentId: opts.agentId ?? null,
      resultCount: hits.length, createdAt: nowIso(),
    }
    this.dependencies.recorder.mutate("literature_search_completed", { target: search.id, metadata: { resultCount: hits.length, provider: search.provider, branchId: branch.id, runId: opts.runId } }, () => {
      this.dependencies.searches.insert(search)
      hits.forEach((hit, index) => this.dependencies.searches.insertHit({
        searchId: search.id, index, provider: hit.provider, externalId: hit.externalId, title: hit.title, authors: hit.authors,
        year: hit.year ?? null, doi: hit.doi ?? null, arxivId: hit.arxivId ?? null, url: hit.url ?? null,
        abstract: hit.abstract ?? null, score: hit.score ?? null,
      }))
    })
    this.lastSearchId = search.id
    return search
  }

  hits(searchId?: string) {
    const id = searchId ?? this.lastSearchId
    return id ? this.dependencies.searches.hits(id) : []
  }

  getSearch(id: string) {
    const row = this.dependencies.searches.get(id.toUpperCase())
    if (!row) throw new Error(`Literature search ${id} was not found.`)
    return row
  }

  async importSearchResult(searchId: string, index: number) {
    const hit = this.hits(searchId).find((item) => item.index === index)
    if (!hit) throw new Error("SEARCH_RESULT_NOT_FOUND")
    const meta = await this.dependencies.provider.fetchMetadata({
      provider: hit.provider, externalId: hit.externalId, title: hit.title, authors: hit.authors,
      year: hit.year ?? undefined, doi: hit.doi ?? undefined, arxivId: hit.arxivId ?? undefined,
      url: hit.url ?? undefined, abstract: hit.abstract ?? undefined,
    })
    return this.importSource({ type: meta.type ?? "PAPER", title: meta.title, authors: meta.authors, year: meta.year, doi: meta.doi, arxivId: meta.arxivId, url: meta.url, venue: meta.venue, provider: hit.provider, providerId: hit.externalId })
  }

  importSource(input: { type?: Source["type"]; title: string; authors: string[]; year?: number; doi?: string; arxivId?: string; isbn?: string; url?: string; venue?: string; provider?: string; providerId?: string; localPath?: string; fileHash?: string }) {
    const workspace = this.requireWorkspace()
    const fingerprint = sourceFingerprint({ doi: input.doi, arxivId: input.arxivId, isbn: input.isbn, url: input.url, title: input.title, authors: input.authors, year: input.year, fileHash: input.fileHash })
    const existing = this.dependencies.sources.findByFingerprint(workspace.id, fingerprint)
    if (existing) {
      this.dependencies.recorder.record("source_discovered", { target: existing.id, metadata: { dedup: true, fingerprint } })
      return existing
    }
    const timestamp = nowIso()
    const source: Source = {
      id: this.dependencies.allocateId("SRC"), workspaceId: workspace.id, type: input.type ?? "PAPER", title: input.title,
      authors: input.authors, year: input.year ?? null, venue: input.venue ?? null, doi: input.doi ?? null,
      arxivId: input.arxivId ?? null, isbn: input.isbn ?? null, url: input.url ?? null, status: "DISCOVERED", fingerprint,
      localPath: input.localPath ?? null, provider: input.provider ?? null, providerId: input.providerId ?? null,
      version: null, retrievedAt: timestamp, createdAt: timestamp,
    }
    this.dependencies.recorder.mutate("source_imported", { target: source.id, metadata: { fingerprint, provider: source.provider } }, () => this.dependencies.sources.insert(source))
    return source
  }

  addLocalSource(filePath: string, meta: { title?: string; authors?: string[] } = {}) {
    const abs = resolve(filePath)
    if (!existsSync(abs)) throw new Error("SOURCE_FILE_NOT_FOUND")
    const bytes = readFileSync(abs)
    const fileHash = createHash("sha256").update(bytes).digest("hex")
    const destDir = join(this.dependencies.root, ".mathos", "sources")
    mkdirSync(destDir, { recursive: true })
    const dest = join(destDir, `${fileHash.slice(0, 16)}${abs.slice(abs.lastIndexOf("."))}`)
    writeFileSync(dest, bytes)
    return this.importSource({ type: "DOCUMENT", title: meta.title ?? basename(abs), authors: meta.authors ?? [], localPath: dest, fileHash })
  }

  listSources() { return this.dependencies.sources.list(this.requireWorkspace().id) }

  getSource(id: string) {
    const row = this.dependencies.sources.get(id.toUpperCase())
    if (!row) throw new Error(`Source ${id} was not found.`)
    return row
  }

  inspectSource(id: string) {
    const source = this.getSource(id)
    this.dependencies.recorder.mutate("source_inspected", { target: source.id, metadata: { branchId: this.requireCurrentBranch().id } }, () => this.dependencies.sources.updateStatus(source.id, "INSPECTED"))
    return this.getSource(source.id)
  }

  addExcerpt(sourceId: string, text: string, locator?: SourceLocator, method: SourceExcerpt["extractionMethod"] = "USER_PROVIDED") {
    const source = this.getSource(sourceId)
    const excerpt: SourceExcerpt = { id: this.dependencies.allocateId("EXC"), sourceId: source.id, locator: locator ?? null, text, textHash: sha256Text(text), extractionMethod: method, createdAt: nowIso() }
    this.dependencies.recorder.mutate("source_excerpt_created", { target: excerpt.id, metadata: { sourceId: source.id } }, () => this.dependencies.excerpts.insert(excerpt))
    return excerpt
  }

  listExcerpts(sourceId: string) { return this.dependencies.excerpts.list(this.getSource(sourceId).id) }

  extractExternalResult(input: { sourceId: string; excerptId?: string; kind?: string; name?: string; statementSummary: string; locator?: SourceLocator; statementMode?: "SUMMARY" | "QUOTED_EXCERPT" }) {
    const source = this.getSource(input.sourceId)
    const excerpt = input.excerptId ? this.dependencies.excerpts.get(input.excerptId.toUpperCase()) : null
    if (!excerpt && !input.locator) throw new Error("UNSUPPORTED_EXTRACTION")
    if (excerpt && !excerpt.text.toLowerCase().includes(input.statementSummary.trim().slice(0, 24).toLowerCase()) && input.statementMode !== "SUMMARY") throw new Error("UNSUPPORTED_EXTRACTION")
    if (excerpt && input.locator && excerpt.locator && excerpt.locator.kind !== "UNKNOWN" && excerpt.locator.kind !== input.locator.kind) throw new Error("LOCATOR_MISMATCH")
    const result: ExternalResult = {
      id: this.dependencies.allocateId("EXT"), workspaceId: this.requireWorkspace().id, branchId: this.requireCurrentBranch().id,
      sourceId: source.id, excerptId: excerpt?.id ?? null,
      kind: (["THEOREM", "LEMMA", "PROPOSITION", "COROLLARY", "DEFINITION", "METHOD", "OTHER"].includes(String(input.kind)) ? input.kind : "THEOREM") as ExternalResultKind,
      name: input.name ?? null, statementSummary: input.statementSummary, statementMode: input.statementMode ?? (excerpt ? "QUOTED_EXCERPT" : "SUMMARY"),
      locator: input.locator ?? excerpt?.locator ?? null, status: "EXTRACTED", createdAt: nowIso(),
    }
    this.dependencies.recorder.mutate("external_result_extracted", { target: result.id, metadata: { sourceId: source.id, branchId: result.branchId, excerptId: result.excerptId } }, () => this.dependencies.external.insert(result))
    return result
  }

  reviewExternalResult(id: string, status: ExternalResult["status"] = "HUMAN_REVIEWED") {
    const row = this.getExternal(id)
    this.dependencies.recorder.mutate("external_result_reviewed", { target: row.id, metadata: { status } }, () => this.dependencies.external.updateStatus(row.id, status))
    return this.getExternal(row.id)
  }

  getExternal(id: string) {
    const row = this.dependencies.external.get(id.toUpperCase())
    if (!row) throw new Error(`External result ${id} was not found.`)
    return row
  }

  listExternal(branchId?: string) { return this.dependencies.external.list(this.requireWorkspace().id, branchId ?? this.requireCurrentBranch().id) }

  cite(input: { sourceId: string; claimId?: string; purpose?: CitationPurpose; locator?: SourceLocator; externalResultId?: string; excerptId?: string; runId?: string; stepId?: string }) {
    const source = this.getSource(input.sourceId)
    const citation: Citation = {
      id: this.dependencies.allocateId("CIT"), workspaceId: this.requireWorkspace().id, branchId: this.requireCurrentBranch().id,
      sourceId: source.id, claimId: input.claimId ? this.requireClaim(input.claimId).id : null, evidenceId: null,
      blockerId: null, decisionId: null, researchRunId: input.runId ?? null, researchStepId: input.stepId ?? null,
      externalResultId: input.externalResultId ?? null, excerptId: input.excerptId ?? null, locator: input.locator ?? null,
      purpose: input.purpose ?? "SUPPORT", invalidated: false, createdAt: nowIso(),
    }
    let evidence: Evidence | null = null
    this.dependencies.recorder.mutate("citation_created", { target: citation.id, metadata: { sourceId: source.id, claimId: citation.claimId, branchId: citation.branchId } }, () => {
      if (citation.claimId) {
        evidence = this.recordLiteratureEvidence(citation, source)
        citation.evidenceId = evidence.id
      }
      this.dependencies.citations.insert(citation)
    })
    if (evidence) this.dependencies.recorder.record("evidence_created", { target: evidence.id, metadata: { claimId: evidence.claimId, kind: evidence.kind } })
    return citation
  }

  invalidateCitation(id: string) {
    const row = this.getCitation(id)
    this.dependencies.recorder.mutate("citation_invalidated", { target: row.id, metadata: {} }, () => this.dependencies.citations.invalidate(row.id))
    return this.getCitation(row.id)
  }

  getCitation(id: string) {
    const row = this.dependencies.citations.get(id.toUpperCase())
    if (!row) throw new Error(`Citation ${id} was not found.`)
    return row
  }

  listCitations(branchId?: string) { return this.dependencies.citations.list(this.requireWorkspace().id, branchId ?? this.requireCurrentBranch().id) }

  workspaceSnapshot() {
    const workspace = this.requireWorkspace()
    const sources = this.dependencies.sources.list(workspace.id)
    return {
      sources,
      excerpts: sources.flatMap((source) => this.dependencies.excerpts.list(source.id)),
      externalResults: this.dependencies.external.list(workspace.id),
      citations: this.dependencies.citations.list(workspace.id),
    }
  }

  linkExternalKnown(claimId: string, externalResultId: string) {
    const claim = this.requireClaim(claimId)
    const ext = this.getExternal(externalResultId)
    if (ext.branchId !== this.requireCurrentBranch().id) throw new Error("EXTERNAL_RESULT_BRANCH_MISMATCH")
    if (ext.status !== "HUMAN_REVIEWED") throw new Error("EXTERNAL_KNOWN_REQUIRES_REVIEW")
    const excerpt = ext.excerptId ? this.dependencies.excerpts.get(ext.excerptId) : null
    if (!excerpt) throw new Error("EXTERNAL_KNOWN_REQUIRES_EXCERPT")
    this.cite({ sourceId: ext.sourceId, claimId: claim.id, purpose: "KNOWN_RESULT", locator: ext.locator ?? undefined, externalResultId: ext.id, excerptId: excerpt.id })
    if (!["KERNEL_VERIFIED", "INDEPENDENTLY_CHECKED", "DISPROVED"].includes(claim.status)) {
      this.dependencies.recorder.mutate("external_known_linked", { target: claim.id, metadata: { externalResultId: ext.id, sourceId: ext.sourceId } }, () => this.dependencies.claims.updateStatus(claim.id, "EXTERNAL_KNOWN", nowIso()))
    } else {
      this.dependencies.recorder.record("external_known_linked", { target: claim.id, metadata: { externalResultId: ext.id, sourceId: ext.sourceId } })
    }
    return this.requireClaim(claim.id)
  }

  formatSource(id: string) {
    const source = this.getSource(id)
    const externals = this.listExternal().filter((item) => item.sourceId === source.id)
    const citations = this.listCitations().filter((item) => item.sourceId === source.id)
    return [`SOURCE · ${source.id}`, "EXTERNAL SOURCE", "NOT A PROOF", `Title ${source.title}`, `Authors ${source.authors.join(", ") || "unknown"}`, `Year ${source.year ?? "n/a"}`, `DOI ${source.doi ?? "n/a"}`, `Status ${source.status}`, `External results ${externals.length}`, `Citations ${citations.length}`].join("\n")
  }

  private recordLiteratureEvidence(citation: Citation, source: Source): Evidence {
    const evidence: Evidence = {
      id: createId("ev"), workspaceId: this.requireWorkspace().id, claimId: citation.claimId!, kind: "literature",
      summary: `${citation.purpose} ${source.title} ${formatLocator(citation.locator)}`.slice(0, 400),
      artifactRef: JSON.stringify({ sourceId: source.id, citationId: citation.id, externalResultId: citation.externalResultId, excerptId: citation.excerptId, locator: citation.locator }),
      reproducible: true, createdAt: nowIso(),
    }
    this.dependencies.evidence.insert(evidence)
    return evidence
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

  private requireClaim(id: string) {
    const claim = this.dependencies.claims.get(id.trim().toUpperCase())
    if (!claim) throw new ClaimNotFound(id)
    return claim
  }
}
