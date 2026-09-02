import type { ExternalResult, SourceExcerpt } from "@mathos/domain"
import { validateExtractionProposal, type ExtractionCandidate, type ExtractionProposal } from "@mathos/literature/extraction/result-extractor"

interface ReviewActor { actorType: "HUMAN" | "MODEL"; actorId: string }
interface Dependencies {
  workspaceId: string; branchId: string
  getExcerpt(id: string): SourceExcerpt | null
  insertCandidate(row: ExtractionCandidate): void
  getCandidate(id: string): ExtractionCandidate | null
  updateCandidateStatus(id: string, status: string): void
  insertExternalResult(row: ExternalResult): void
  nextId(prefix: string): string
  now(): string
}

export class LiteratureIntelligenceService {
  constructor(private readonly dependencies: Dependencies) {}

  propose(proposal: ExtractionProposal): ExtractionCandidate {
    const excerpt = this.dependencies.getExcerpt(proposal.excerptId)
    if (!excerpt) throw new Error("EXTRACTION_EXCERPT_NOT_FOUND")
    const status = validateExtractionProposal(proposal, excerpt)
    const row: ExtractionCandidate = { id: this.dependencies.nextId("XC"), sourceId: proposal.sourceId, excerptId: excerpt.id, pageLocator: JSON.stringify(proposal.locator), kind: proposal.kind, name: proposal.name ?? null, rawStatement: proposal.rawStatement, normalizedSummary: proposal.normalizedSummary, status, provider: proposal.provider ?? null, model: proposal.model ?? null, promptHash: proposal.promptHash ?? null, duplicationTargetId: null, createdAt: this.dependencies.now() }
    this.dependencies.insertCandidate(row)
    return row
  }

  accept(id: string, actor: ReviewActor): ExternalResult {
    this.requireHuman(actor)
    const candidate = this.requireCandidate(id)
    if (candidate.status !== "SUPPORTED_BY_EXCERPT") throw new Error("EXTRACTION_NOT_SUPPORTED")
    const result: ExternalResult = { id: this.dependencies.nextId("EXT"), workspaceId: this.dependencies.workspaceId, branchId: this.dependencies.branchId, sourceId: candidate.sourceId, excerptId: candidate.excerptId, kind: candidate.kind, name: candidate.name, statementSummary: candidate.normalizedSummary, statementMode: "QUOTED_EXCERPT", locator: candidate.pageLocator ? JSON.parse(candidate.pageLocator) : null, status: "HUMAN_REVIEWED", createdAt: this.dependencies.now() }
    this.dependencies.insertExternalResult(result)
    this.dependencies.updateCandidateStatus(candidate.id, `ACCEPTED_BY:${actor.actorId}`)
    return result
  }

  reject(id: string, actor: ReviewActor & { reason: string }): void {
    this.requireHuman(actor)
    if (!actor.reason.trim()) throw new Error("EXTRACTION_REJECTION_REASON_REQUIRED")
    this.requireCandidate(id)
    this.dependencies.updateCandidateStatus(id, `REJECTED:${actor.reason.trim()}`)
  }

  private requireCandidate(id: string) { const row = this.dependencies.getCandidate(id); if (!row) throw new Error("EXTRACTION_CANDIDATE_NOT_FOUND"); return row }
  private requireHuman(actor: ReviewActor) { if (actor.actorType !== "HUMAN" || !actor.actorId.trim()) throw new Error("HUMAN_REVIEW_REQUIRED") }
}
