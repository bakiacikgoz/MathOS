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
