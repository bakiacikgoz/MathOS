export type {
  CandidateProfile,
  DeclarationKind,
  DeclarationOrigin,
  GoalProfile,
  IndexManifest,
  IndexStatus,
  LeanDeclaration,
  PremiseCandidate,
  PremiseRetrievalRequest,
  PremiseRetrievalResult,
  PremiseRetriever,
  RetrievalConfig,
  RetrievalMode,
  RetrievalScoreBreakdown,
  FusionMethod,
  PremiseRole,
  PremiseSetMember,
  PremiseSetCandidate,
} from "./types.ts"
export { ALLOWED_LOCAL_STATUSES, DEFAULT_RETRIEVAL_CONFIG, FORBIDDEN_LOCAL_STATUSES } from "./types.ts"
export { GlobalPremiseSetPlanner,DEFAULT_PREMISE_SET_SIZE,MAX_PREMISE_SET_SIZE,evaluateGlobalPremisePromotion,type PremiseSetBenchmarkMetrics } from "./global-premise-set.ts"
export { ProofFeedbackLedger,proofFeedbackKey,type ProofFeedbackOutcome,type ProofFeedbackInput,type ProofFeedbackRow } from "./proof-feedback.ts"
export { extractUnknownIdentifiers, parseLeanDeclarations, tokenize } from "./parse.ts"
export { rankDeclarations } from "./rank.ts"
export { applyGoalAwareRerank } from "./rerank.ts"
export { retrieveFromDeclarations, explainCandidate } from "./pipeline.ts"
export { profileGoal, profileCandidate } from "./profile.ts"
export { buildProofContext } from "./context.ts"
export { HybridPremiseRetriever, writeRetrievalLog, type LocalClaimDecl } from "./retriever.ts"
export { InMemoryPremiseRetriever } from "./fake.ts"
export { indexStatus, readIndex, writeIndex } from "./store.ts"
export { resolveRetrievalConfig } from "./config.ts"
export { seedDeclarations, scanLeanTree, findMathlibRoot } from "./scan.ts"
export { loadProfileCache, saveProfileCache, profileCacheKey } from "./cache.ts"
export { hitAtK, goldFound, compareRankers, metricsFor, namesOf, MATHLIB_FIXTURES, diagnoseFixtures, stageRecall, type BenchmarkCase, type StageRecall, type RankMetrics } from "./benchmark.ts"
export { formalQueryTokens, tokenizeName, expandSymbols } from "./normalize.ts"
export { buildChannelIndex, generateCandidates, INDEX_FORMAT_VERSION, type ChannelIndex } from "./channels.ts"
export { profileDeclarationName, matchGoalToDeclaration, profileGoalName, type DeclarationNameProfile, type GoalNameProfile, type NameMatchResult } from "./name-profile.ts"
export { nameAwareRank, type NameScoreBreakdown } from "./name-rank.ts"
export { applyLeanEnrichment } from "./enrich.ts"
export {
  AggregateInspectSelector,
  StratifiedInspectSelector,
  type InspectCandidateSelector,
  type InspectSelection,
  type SelectedInspectionCandidate,
  type InspectionSelectionReason,
  type InspectExclusionReason,
  type InspectSelectorMode,
  type InspectCandidateDiagnostic,
  type InspectQuotaTrace,
  type CandidateChannelRanks,
} from "./inspect-selector.ts"
export { normalizeScores, enrichForLean, fuseCandidateRanks, type FusionOptions, type FusionResult } from "./fusion.ts"
export { readInspectionCache, writeInspectionCache, inspectionCacheStats, storeInspection } from "./inspect-cache.ts"
export { scoreExperiment, selectorExperiment, type RetrievalExperiment, type ExperimentalRetrievalContext, type ExperimentalScore } from "./experiments.ts"
export { extractSemanticOperatorProfile, SEMANTIC_OPERATOR_PROFILE_VERSION, type SemanticOperatorProfile, type SemanticOperator, type RelationProfile, type RelationProperty } from "./semantic-operator-profile.ts"
export * from "./evaluation/metrics.ts"
export * from "./evaluation/paired-analysis.ts"
export * from "./evaluation/downstream.ts"
export * from "./evaluation/report.ts"
