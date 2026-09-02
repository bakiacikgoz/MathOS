/** @internal Runtime composition and migration tooling only; application code must use repositories. */
export { DatabaseClient } from "./client.ts"
export { MIGRATIONS, SCHEMA_EPOCH } from "./migrations.ts"
export {
  WorkspaceRepository,
  ClaimRepository,
  DependencyRepository,
  EvidenceRepository,
  BranchRepository,
  BlockerRepository,
  EventRepository,
  FormalStatementRepository,
  FidelityReviewRepository,
  VerificationRunRepository,
  ProofAttemptRepository,
  ClaimVisibilityRepository,
} from "./repositories.ts"
export {
  ResearchRunRepository,
  ResearchStepRepository,
  ResearchBlockerRepository,
  ResearchDecisionRepository,
} from "./research-repos.ts"
export {
  MultiAgentSessionRepository,
  ResearchAgentRepository,
  MultiAgentRoundRepository,
  SolutionCandidateRepository,
  SharedDigestRepository,
} from "./multi-agent-repos.ts"
export { RunPlannerRepository, ArtifactImportRepository } from "./hardening-repos.ts"
export { ExperimentRepository, ExperimentResultRepository } from "./experiment-repos.ts"
export { SourceRepository, SourceExcerptRepository, ExternalResultRepository, CitationRepository, LiteratureSearchRepository } from "./literature-repos.ts"
export { V1StorageDecodeError, V1RevisionConflictError, type Page } from "./v1-repository-utils.ts"
export { ContextItemRepository, ContextRevisionRepository } from "./context-repos.ts"
export { ResearchDocumentRepository, ResearchBlockRepository, NotebookSyncRepository } from "./notebook-repos.ts"
export { StatementRevisionRepository, FormalAlignmentRepository, AlignmentFindingRepository, StaleMarkerRepository } from "./alignment-repos.ts"
export { ProofPortfolioRepository, ProofJobRepository, ProofCandidateRepository, ProofRepairAttemptRepository } from "./portfolio-repos.ts"
export { SolverJobRepository, SolverResultRepository } from "./solver-repos.ts"
export { ConjectureProposalRepository, ConjectureTriageRepository, AgendaItemRepository } from "./agenda-repos.ts"
export { FailureFingerprintRepository, FailureOccurrenceRepository } from "./failure-memory-repos.ts"
export { ReviewPacketRepository, ReviewFindingRepository, ReviewAttestationRepository } from "./review-repos.ts"
export { CapsuleRecordRepository, PublicationRecordRepository } from "./capsule-repos.ts"
export { PluginRecordRepository } from "./plugin-repos.ts"
export { ProjectionRecordRepository } from "./projection-repos.ts"
