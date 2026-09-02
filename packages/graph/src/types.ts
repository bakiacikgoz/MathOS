import type {
  Claim,
  ClaimStatus,
  Dependency,
  FormalStatement,
  FidelityStatus,
  ProofAttempt,
  VerificationRun,
  ResearchBlockerRecord,
  ResearchDecisionRecord,
  ResearchRun,
  ResearchAgentWorker,
  ResearchBranch,
  VerifiedArtifactImport,
  MultiAgentResearchSession,
  Experiment,
  ExperimentResult,
  Source,
  SourceExcerpt,
  ExternalResult,
  Citation,
} from "@mathos/domain"

export const RESEARCH_GRAPH_NODE_KINDS = [
  "OBJECTIVE",
  "CLAIM",
  "FORMAL_STATEMENT",
  "PROOF_ATTEMPT",
  "VERIFICATION",
  "BLOCKER",
  "DECISION",
  "RESEARCH_RUN",
  "AGENT",
  "BRANCH",
  "IMPORT",
  "EVIDENCE",
  "EXPERIMENT",
  "EXPERIMENT_RESULT",
  "SOURCE",
  "EXTERNAL_RESULT",
  "CITATION",
  "NOTEBOOK_BLOCK",
] as const
export type ResearchGraphNodeKind = (typeof RESEARCH_GRAPH_NODE_KINDS)[number]

export const RESEARCH_GRAPH_EDGE_KINDS = [
  "SUPPORTS",
  "REQUIRES",
  "DEPENDS_ON",
  "FORMALIZES",
  "PROOF_ATTEMPT_FOR",
  "VERIFIES",
  "BLOCKS",
  "RESOLVES",
  "CREATED_BY_RUN",
  "CREATED_BY_AGENT",
  "ON_BRANCH",
  "DERIVED_FROM",
  "IMPORTS_FROM",
  "SUPERSEDES",
  "EXPERIMENT_FOR",
  "PRODUCES",
  "COUNTEREXAMPLE_TO",
  "SUPPORTED_BY_SOURCE",
  "EXTRACTED_FROM",
  "KNOWN_FROM",
  "COUNTERPOINT_FROM",
  "CITES",
  "REFERENCES",
] as const
export type ResearchGraphEdgeKind = (typeof RESEARCH_GRAPH_EDGE_KINDS)[number]

export const GRAPH_ORIGINS = ["LOCAL", "INHERITED", "IMPORTED", "MERGED"] as const
export type GraphOrigin = (typeof GRAPH_ORIGINS)[number]

export interface GraphProvenanceSummary {
  branchId?: string
  agentId?: string
  runId?: string
  origin?: GraphOrigin
}

export interface ResearchGraphNode {
  id: string
  kind: ResearchGraphNodeKind
  workspaceId: string
  branchId?: string
  entityId: string
  label: string
  epistemicStatus?: ClaimStatus
  formalizationFidelity?: FidelityStatus | string
  createdAt?: string
  origin?: GraphOrigin
  provenance?: GraphProvenanceSummary
  summary?: string
}

export interface ResearchGraphEdge {
  id: string
  kind: ResearchGraphEdgeKind
  fromNodeId: string
  toNodeId: string
  workspaceId: string
  branchId?: string
  provenance?: GraphProvenanceSummary
}

export interface ResearchGraphMetadata {
  schemaVersion: "research-graph-v1"
  workspaceId: string
  branchId: string | null
  builtAt: string
  eventSequence: number
  graphHash: string
  focusNodeId: string | null
}

export interface ResearchGraph {
  nodes: ResearchGraphNode[]
  edges: ResearchGraphEdge[]
  metadata: ResearchGraphMetadata
}

export interface ResearchGraphBuildOptions {
  branchId?: string
  includeInherited?: boolean
  includeResearchRuntime?: boolean
  includeFailedProofAttempts?: boolean
  includeImports?: boolean
  includeComputation?: boolean
  includeLiterature?: boolean
  proofOnly?: boolean
  teamSessionId?: string
}

export interface ResearchGraphSnapshot {
  workspaceId: string
  mainObjectiveId: string | null
  eventSequence: number
  builtAt?: string
  claims: Claim[]
  dependencies: Dependency[]
  formals: FormalStatement[]
  proofs: ProofAttempt[]
  verifications: VerificationRun[]
  blockers: ResearchBlockerRecord[]
  decisions: ResearchDecisionRecord[]
  runs: ResearchRun[]
  agents: ResearchAgentWorker[]
  branches: ResearchBranch[]
  imports: VerifiedArtifactImport[]
  sessions?: MultiAgentResearchSession[]
  visibility: Array<{ branchId: string; claimId: string; relation: string }>
  experiments?: Experiment[]
  experimentResults?: ExperimentResult[]
  sources?: Source[]
  excerpts?: SourceExcerpt[]
  externalResults?: ExternalResult[]
  citations?: Citation[]
}

export interface GraphValidationIssue {
  code: string
  message: string
  nodeId?: string
  edgeId?: string
}

export interface GraphValidationReport {
  ok: boolean
  issues: GraphValidationIssue[]
  cycles: string[][]
}

export interface ProofGraphProjection {
  objective: string | null
  claims: ResearchGraphNode[]
  dependencies: ResearchGraphEdge[]
  proofs: ResearchGraphNode[]
  verifications: ResearchGraphNode[]
  blockers: ResearchGraphNode[]
}

export const PROOF_NODE_KINDS = new Set<ResearchGraphNodeKind>([
  "OBJECTIVE",
  "CLAIM",
  "FORMAL_STATEMENT",
  "PROOF_ATTEMPT",
  "VERIFICATION",
  "BLOCKER",
])
