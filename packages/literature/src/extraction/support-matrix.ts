export type ClaimSourceRelation = "DIRECT_KNOWN_RESULT" | "CONTEXTUAL_BACKGROUND" | "COUNTERPOINT" | "CONTRADICTION"
export interface ClaimSourceAssessment {
  id: string; claimId: string; sourceId: string; externalResultId: string | null; relation: ClaimSourceRelation
  strength: "DIRECT" | "CONTEXTUAL"; humanReviewed: boolean; status: "PROPOSED" | "REVIEWED" | "STALE"
  rationale: string; sourceVersion: string; excerptHash: string; publicationIds: string[]; claimProofStatus: string; createdAt: string
}
export interface AssessmentMarker { targetType: "CLAIM_SOURCE_ASSESSMENT" | "PUBLICATION_REFERENCE"; targetId: string; reasonCode: "SOURCE_REVISION_CHANGED"; detectedAt: string }
type Actor = { actorType: "HUMAN" | "MODEL"; actorId: string }
type Input = Omit<ClaimSourceAssessment, "id" | "strength" | "humanReviewed" | "status" | "createdAt" | "externalResultId" | "publicationIds" | "claimProofStatus"> & { externalResultId?: string; publicationIds?: string[]; claimProofStatus?: string; excerptInvalidated?: boolean }

export class ClaimSourceSupportMatrix {
  private sequence = 0
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}
  assess(input: Input, actor: Actor): ClaimSourceAssessment {
    if (!actor.actorId.trim()) throw new Error("ASSESSMENT_ACTOR_REQUIRED")
    if (input.excerptInvalidated) throw new Error("ASSESSMENT_EXCERPT_INVALIDATED")
    const human = actor.actorType === "HUMAN"
    return { id: `CSA-${++this.sequence}`, claimId: input.claimId, sourceId: input.sourceId, externalResultId: input.externalResultId ?? null, relation: input.relation, strength: input.relation === "DIRECT_KNOWN_RESULT" || input.relation === "CONTRADICTION" ? "DIRECT" : "CONTEXTUAL", humanReviewed: human, status: human ? "REVIEWED" : "PROPOSED", rationale: input.rationale, sourceVersion: input.sourceVersion, excerptHash: input.excerptHash, publicationIds: input.publicationIds ?? [], claimProofStatus: input.claimProofStatus ?? "DRAFT", createdAt: this.now() }
  }
  checkRevision(assessment: ClaimSourceAssessment, current: { sourceVersion: string; excerptHash: string }): { assessment: ClaimSourceAssessment; markers: AssessmentMarker[]; claimProofStatus: string } {
    if (assessment.sourceVersion === current.sourceVersion && assessment.excerptHash === current.excerptHash) return { assessment, markers: [], claimProofStatus: assessment.claimProofStatus }
    const markers: AssessmentMarker[] = [{ targetType: "CLAIM_SOURCE_ASSESSMENT", targetId: assessment.id, reasonCode: "SOURCE_REVISION_CHANGED", detectedAt: this.now() }, ...assessment.publicationIds.map((targetId) => ({ targetType: "PUBLICATION_REFERENCE" as const, targetId, reasonCode: "SOURCE_REVISION_CHANGED" as const, detectedAt: this.now() }))]
    return { assessment: { ...assessment, status: "STALE" }, markers, claimProofStatus: assessment.claimProofStatus }
  }
}
