import { padSeq } from "@mathos/shared"
import type { ClaimStatus } from "./model.ts"

export const VERIFICATION_STATUSES = ["UNVERIFIED", "ELABORATES", "VERIFIED"] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const FIDELITY_STATUSES = [
  "NOT_REVIEWED",
  "REVIEW_REQUIRED",
  "AI_REVIEWED",
  "HUMAN_APPROVED",
  "REJECTED",
] as const
export type FidelityStatus = (typeof FIDELITY_STATUSES)[number]

export const FIDELITY_VERDICTS = ["MATCH", "POTENTIAL_MISMATCH", "MISMATCH"] as const
export type FidelityVerdict = (typeof FIDELITY_VERDICTS)[number]

export const PROOF_ATTEMPT_STATUSES = ["DRAFT", "CHECKING", "FAILED", "KERNEL_ACCEPTED"] as const
export type ProofAttemptStatus = (typeof PROOF_ATTEMPT_STATUSES)[number]

export const FORBIDDEN_PROOF_TOKENS = ["sorry", "admit", "axiom", "unsafe", "sorryAx"] as const

export interface FormalStatement {
  id: string
  workspaceId: string
  claimId: string
  language: "lean4"
  declarationName: string
  sourceText: string
  filePath: string | null
  isCurrent: boolean
  verificationStatus: VerificationStatus
  fidelityStatus: FidelityStatus
  createdBy: "user" | "model"
  provider: string | null
  modelName: string | null
  leanVersion: string | null
  createdAt: string
  updatedAt: string
}

export interface LeanDiagnostic {
  severity: "error" | "warning" | "info"
  message: string
  line?: number
  column?: number
}

export interface VerificationRun {
  id: string
  workspaceId: string
  formalStatementId: string
  claimId: string | null
  proofAttemptId: string | null
  result: "ELABORATES" | "ERROR" | "KERNEL_ACCEPTED" | "FAILED"
  leanVersion: string | null
  toolchain: string | null
  diagnosticsJson: string
  axiomsJson: string
  forbiddenJson: string
  fidelityStatus: string | null
  gateJson: string
  createdAt: string
}

export interface FidelityFinding {
  dimension: "objects" | "domains" | "quantifiers" | "assumptions" | "conclusion" | "scope" | "strength"
  severity: "info" | "warning" | "error"
  message: string
}

export interface FidelityReview {
  id: string
  workspaceId: string
  claimId: string
  formalStatementId: string
  verdict: FidelityVerdict
  findings: FidelityFinding[]
  naturalSummary: string
  formalBackTranslation: string
  reviewerType: "model"
  provider: string
  model: string
  createdAt: string
}

export interface FormalizationDraft {
  declarationName: string
  leanStatement: string
  variableMapping: Array<{ natural: string; lean: string }>
  assumptionMapping: Array<{ natural: string; lean: string }>
  uncertainties: Array<{ id: string; note: string }>
  modelProvenance: { provider: string; model: string }
}

export interface FormalizationSession {
  claimId: string
  formalStatement: FormalStatement
  check: {
    result: "ELABORATES" | "ERROR"
    diagnostics: LeanDiagnostic[]
    repairs: number
  }
  fidelity: FidelityReview | null
  proofAttempted: false
}

export interface ProofAttempt {
  id: string
  workspaceId: string
  claimId: string
  formalStatementId: string
  status: ProofAttemptStatus
  proofSource: string
  attemptNumber: number
  provider: string | null
  modelName: string | null
  leanVersion: string | null
  diagnostics: LeanDiagnostic[]
  retrievalQuery: string | null
  candidateNames: string[]
  indexRevision: string | null
  retrievalMode: string | null
  retrievalProvenance: {
    inspectSelectionStrategy: string | null
    inspectSelectorVersion: string | null
    inspectionLimit: number | null
    inspectedCandidates: string[]
    selectionReasons: Record<string, string>
    fusionMethod: string | null
  } | null
  createdAt: string
}

export interface ProofSession {
  claimId: string
  formalStatement: FormalStatement
  attempts: ProofAttempt[]
  accepted: ProofAttempt | null
  verification: VerificationReport | null
  proofAttempted: true
  retrieval: {
    localCount: number
    mathlibCount: number
    topNames: string[]
    indexRevision: string | null
    mode?: string
    warning?: string
    enrichment?: string
    inspectedCount?: number
    cacheHits?: number
    inspectSelectionStrategy?: string
    inspectSelectorVersion?: string
    inspectionLimit?: number
    inspectedCandidates?: string[]
    selectionReasons?: Record<string, string>
    fusionMethod?: string
  } | null
}

export interface GateCheck {
  name: string
  status: "PASS" | "FAIL"
  detail: string
}

export interface VerificationReport {
  claimId: string
  formalStatementId: string
  proofAttemptId: string | null
  passed: boolean
  claimStatus: ClaimStatus
  checks: GateCheck[]
  axioms: string[]
  customAxioms: string[]
  leanVersion: string | null
  toolchain: string | null
}

export function nextSequentialId(existingIds: string[], prefix: string, pad = padSeq): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const id of existingIds) {
    const match = pattern.exec(id)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) max = value
  }
  return `${prefix}-${pad(max + 1)}`
}

export function hasProofBody(source: string): boolean {
  return /\bsorry\b/.test(source) || /:=\s*by\b/.test(source) || /\n\s*by\b/.test(source)
}

export function extractDeclaration(source: string): string {
  const trimmed = source.trim()
  const idx = trimmed.search(/\s*:=\s*/)
  return (idx === -1 ? trimmed : trimmed.slice(0, idx)).trim()
}

export function composeProof(declaration: string, proofBody: string): string {
  const decl = extractDeclaration(declaration)
  let body = proofBody.trim()
  if (body.includes(":=")) body = body.slice(body.search(/:=/) + 2).trim()
  if (!body.startsWith("by") && !body.startsWith("sorry")) body = `by\n  ${body}`
  return `${decl} :=\n${body}`
}

export function scanForbidden(source: string): string[] {
  return FORBIDDEN_PROOF_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`).test(source))
}

export function declarationsMatch(formal: string, withProof: string): boolean {
  return extractDeclaration(formal) === extractDeclaration(withProof)
}
