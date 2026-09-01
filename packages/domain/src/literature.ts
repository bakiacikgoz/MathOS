export const SOURCE_TYPES = ["PAPER", "BOOK", "PREPRINT", "THESIS", "WEB", "DOCUMENT", "OTHER"] as const
export type SourceType = (typeof SOURCE_TYPES)[number]

export const SOURCE_STATUSES = ["DISCOVERED", "FETCHED", "INSPECTED", "RELEVANT", "IRRELEVANT", "UNAVAILABLE"] as const
export type SourceStatus = (typeof SOURCE_STATUSES)[number]

export const CITATION_PURPOSES = ["SUPPORT", "BACKGROUND", "DEFINITION", "KNOWN_RESULT", "COUNTERPOINT", "METHOD", "PROVENANCE"] as const
export type CitationPurpose = (typeof CITATION_PURPOSES)[number]

export const EXTRACTION_METHODS = ["NATIVE_TEXT", "PDF_TEXT", "USER_PROVIDED", "WEB_EXTRACT", "OTHER"] as const
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number]

export const EXTERNAL_RESULT_KINDS = ["THEOREM", "LEMMA", "PROPOSITION", "COROLLARY", "DEFINITION", "METHOD", "OTHER"] as const
export type ExternalResultKind = (typeof EXTERNAL_RESULT_KINDS)[number]

export const EXTERNAL_RESULT_STATUSES = ["EXTRACTED", "HUMAN_REVIEWED", "FORMALIZATION_CANDIDATE", "REJECTED"] as const
export type ExternalResultStatus = (typeof EXTERNAL_RESULT_STATUSES)[number]

export type SourceLocator =
  | { kind: "PAGE"; pageStart: number; pageEnd?: number }
  | { kind: "SECTION"; section: string }
  | { kind: "THEOREM"; theorem: string }
  | { kind: "EQUATION"; equation: string }
  | { kind: "URL_FRAGMENT"; fragment: string }
  | { kind: "UNKNOWN" }

export interface Source {
  id: string
  workspaceId: string
  type: SourceType
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  doi: string | null
  arxivId: string | null
  isbn: string | null
  url: string | null
  status: SourceStatus
  fingerprint: string
  localPath: string | null
  provider: string | null
  providerId: string | null
  version: string | null
  retrievedAt: string | null
  createdAt: string
}

export interface Citation {
  id: string
  workspaceId: string
  branchId: string
  sourceId: string
  claimId: string | null
  evidenceId: string | null
  blockerId: string | null
  decisionId: string | null
  researchRunId: string | null
  researchStepId: string | null
  externalResultId: string | null
  excerptId: string | null
  locator: SourceLocator | null
  purpose: CitationPurpose
  invalidated: boolean
  createdAt: string
}

export interface SourceExcerpt {
  id: string
  sourceId: string
  locator: SourceLocator | null
  text: string
  textHash: string
  extractionMethod: ExtractionMethod
  createdAt: string
}

export interface ExternalResult {
  id: string
  workspaceId: string
  branchId: string
  sourceId: string
  excerptId: string | null
  kind: ExternalResultKind
  name: string | null
  statementSummary: string
  statementMode: "SUMMARY" | "QUOTED_EXCERPT"
  locator: SourceLocator | null
  status: ExternalResultStatus
  createdAt: string
}

export interface LiteratureSearchRecord {
  id: string
  workspaceId: string
  branchId: string
  query: string
  queryFingerprint: string
  provider: string
  targetClaimId: string | null
  researchRunId: string | null
  researchStepId: string | null
  agentId: string | null
  resultCount: number
  createdAt: string
}

export interface LiteratureSearchHit {
  searchId: string
  index: number
  provider: string
  externalId: string
  title: string
  authors: string[]
  year: number | null
  doi: string | null
  arxivId: string | null
  url: string | null
  abstract: string | null
  score: number | null
}

export function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ")
}

export function formatLocator(locator: SourceLocator | null | undefined): string {
  if (!locator || locator.kind === "UNKNOWN") return "unspecified"
  if (locator.kind === "PAGE") return locator.pageEnd ? `pp. ${locator.pageStart}–${locator.pageEnd}` : `p. ${locator.pageStart}`
  if (locator.kind === "SECTION") return `§ ${locator.section}`
  if (locator.kind === "THEOREM") return `Theorem ${locator.theorem}`
  if (locator.kind === "EQUATION") return `eq. ${locator.equation}`
  return locator.fragment
}
