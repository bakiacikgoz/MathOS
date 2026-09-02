export type DeclarationKind = "theorem" | "lemma" | "def" | "axiom" | "other"
export type DeclarationOrigin = "workspace" | "mathlib"
export type RetrievalMode = "FORMAL_GOAL" | "NATURAL_FALLBACK" | "DIAGNOSTIC_REPAIR"
export type TypeSource = "HEADER" | "LEAN_ELABORATED"
export type EnrichmentStatus = "LEAN_ELABORATED" | "HEADER" | "LEAN_ENRICHMENT_FAILED"
export type FusionMethod = "CURRENT" | "SCORE_FUSION" | "RRF"
export type PremiseRole="CONCLUSION_MATCH"|"REWRITE"|"TYPECLASS_OR_STRUCTURE"|"DOMAIN_LEMMA"|"BRIDGE_LEMMA"|"AUXILIARY"
export interface PremiseSetMember{declarationName:string;role:PremiseRole;sourceRank:number;marginalCoverage:number;provenance:{indexRevision:string|null;retrievalMode:RetrievalMode;channels:string[]}}
export interface PremiseSetCandidate{id:string;members:PremiseSetMember[];setScore:number;goalCoverage:string[];redundancyPenalty:number;unresolvedGoalFeatures:string[];generationVersion:"global-premise-set-v1"}
export type InspectionSelectionReason = "OVERALL" | "NAME" | "STRUCTURE" | "TYPE" | "SYMBOL" | "OPERATOR" | "LOCAL" | "DEPENDENCY" | "DIVERSITY"

export interface LeanDeclaration {
  name: string
  kind: DeclarationKind
  signature: string
  module?: string
  source?: string
  namespace?: string
  origin: DeclarationOrigin
  unsafeForRelease?: boolean
  claimId?: string
  claimStatus?: string
}

export interface GoalProfile {
  rawTarget: string
  propositionHead?: string
  constants: string[]
  namespaces: string[]
  typeConstructors: string[]
  operators: string[]
  localTypes: string[]
  conclusionTokens: string[]
  isEquality: boolean
  isIff: boolean
  isImplication: boolean
  isExistential: boolean
  isUniversal: boolean
  operatorMultiplicity?: Record<string, number>
  known: boolean
}

export interface CandidateProfile {
  declarationName: string
  conclusionHead?: string
  constants: string[]
  namespaces: string[]
  typeConstructors: string[]
  isEquality: boolean
  isIff: boolean
  isImplication: boolean
  origin: "workspace" | "mathlib" | "lean-core"
  known: boolean
  typeSource?: TypeSource
}

export interface RetrievalScoreBreakdown {
  lexical: number
  symbol: number
  namespace: number
  typeOverlap: number
  conclusion: number
  propositionShape: number
  localBoost: number
  dependencyBoost: number
  penalties: number
}

export interface PremiseCandidate {
  declaration: LeanDeclaration
  score: number
  reasons: string[]
  breakdown?: RetrievalScoreBreakdown
  profile?: CandidateProfile
  typeSource?: TypeSource
  cacheHit?: boolean
  selectionReason?: InspectionSelectionReason
  selectionDiagnostics?: {
    channelRanks: Record<string, number | null>
    informationScore: number
    crossChannelStrength: number
    consensus: "HIGH" | "MEDIUM" | "LOW" | "NONE"
    matchedTokens: string[]
    exclusionReason?: string
  }
  stage1Rank?: number
  leanRank?: number
  fusionMethod?: FusionMethod
  finalRank?: number
  stage1Normalized?: number
  leanNormalized?: number
  generation?: {
    channels: string[]
    matchedTokens: string[]
    channelRanks?: Record<string, number>
  }
}

export interface PremiseRetrievalRequest {
  query: string
  goal?: string
  unknownIdentifiers?: string[]
  localBoosts?: string[]
  dependencyNames?: string[]
  allowedLocalStatuses?: string[]
  maxPremises?: number
  candidatePool?: number
  inspectTopK?: number
  excludeNames?: string[]
  previousNames?: string[]
  goalAware?: boolean
  skipInspect?: boolean
  mode?: RetrievalMode
}

export interface PremiseRetrievalResult {
  candidates: PremiseCandidate[]
  indexRevision: string | null
  query: string
  localCount: number
  mathlibCount: number
  mode: RetrievalMode
  warning?: string
  goalProfile?: GoalProfile
  enrichment?: EnrichmentStatus
  inspectedCount?: number
  cacheHits?: number
  cacheMisses?: number
  candidatePoolSize?: number
  unionSize?: number
  generation?: {
    union: number
    channels: Record<string, number>
  }
  inspectSelectionStrategy?: "AGGREGATE" | "STRATIFIED"
  inspectSelectorVersion?: string
  inspectionLimit?: number
  inspectedCandidates?: string[]
  selectionReasons?: Record<string, InspectionSelectionReason>
  fusionMethod?: FusionMethod
}

export interface IndexManifest {
  revision: string
  formatVersion: number
  leanVersion: string | null
  mathlibRevision: string | null
  formalFingerprint: string
  verifiedFingerprint: string
  builtAt: string
  declarationCount: number
  mathlibCount: number
  workspaceCount: number
  channelCounts?: {
    names: number
    bigrams: number
    trigrams: number
    types: number
    operators: number
    namespaces: number
    structures: number
    modules: number
  }
}

export interface InspectionCacheStats {
  entries: number
  valid: number
  stale: number
}

export interface IndexStatus {
  present: boolean
  stale: boolean
  manifest: IndexManifest | null
  reason?: string
  inspectionCache?: InspectionCacheStats
  channelIndex?: {
    names: number
    bigrams: number
    trigrams: number
    types: number
    operators: number
    namespaces: number
    structures: number
    modules: number
  }
}

export interface PremiseRetriever {
  retrieve(request: PremiseRetrievalRequest): Promise<PremiseRetrievalResult>
}

export interface RetrievalConfig {
  maxPremises: number
  maxContextChars: number
  includeUnverifiedLocal: boolean
  candidatePool: number
  inspectTopK: number
  goalAware: boolean
  inspectionTimeoutMs: number
  generationPerChannel: number
  candidateUnionCap: number
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxPremises: 20,
  maxContextChars: 6000,
  includeUnverifiedLocal: false,
  candidatePool: 200,
  inspectTopK: 30,
  goalAware: true,
  inspectionTimeoutMs: 120_000,
  generationPerChannel: 100,
  candidateUnionCap: 800,
}

export const ALLOWED_LOCAL_STATUSES = ["KERNEL_VERIFIED"] as const
export const FORBIDDEN_LOCAL_STATUSES = ["DISPROVED", "STALE"] as const
