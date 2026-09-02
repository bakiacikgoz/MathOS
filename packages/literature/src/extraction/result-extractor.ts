import type { ExternalResultKind, SourceExcerpt, SourceLocator } from "@mathos/domain"
import { sameLocator } from "./locator"

export interface ExtractionCandidate {
  id: string
  sourceId: string
  excerptId: string | null
  pageLocator: string | null
  kind: ExternalResultKind
  name: string | null
  rawStatement: string
  normalizedSummary: string
  status: string
  provider: string | null
  model: string | null
  promptHash: string | null
  duplicationTargetId: string | null
  createdAt: string
}

export interface ExtractionProposal {
  sourceId: string
  excerptId: string
  excerptHash: string
  locator: SourceLocator
  kind: ExternalResultKind
  name?: string
  rawStatement: string
  normalizedSummary: string
  provider?: string
  model?: string
  promptHash?: string
}

export function validateExtractionProposal(proposal: ExtractionProposal, excerpt: SourceExcerpt): "SUPPORTED_BY_EXCERPT" | "UNSUPPORTED_BY_EXCERPT" {
  if (excerpt.sourceId !== proposal.sourceId) throw new Error("EXTRACTION_SOURCE_MISMATCH")
  if (excerpt.textHash !== proposal.excerptHash) throw new Error("EXTRACTION_EXCERPT_HASH_MISMATCH")
  if (!sameLocator(excerpt.locator, proposal.locator)) throw new Error("EXTRACTION_LOCATOR_MISMATCH")
  const raw = proposal.rawStatement.trim().replace(/\s+/g, " ")
  const source = excerpt.text.replace(/\s+/g, " ")
  return raw.length >= 8 && source.includes(raw) ? "SUPPORTED_BY_EXCERPT" : "UNSUPPORTED_BY_EXCERPT"
}
