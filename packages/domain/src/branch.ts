import { padSeq } from "@mathos/shared"

export const BRANCH_STATUSES = ["ACTIVE", "PAUSED", "MERGED", "ABANDONED", "ARCHIVED"] as const
export type BranchStatus = (typeof BRANCH_STATUSES)[number]

export const ARTIFACT_RELATIONS = ["INHERITED", "LOCAL", "MERGED"] as const
export type ArtifactRelation = (typeof ARTIFACT_RELATIONS)[number]

export const MAIN_BRANCH_ID = "B-000"
export const MAIN_BRANCH_NAME = "MAIN"
export const MAIN_BRANCH_SLUG = "main"

export interface ResearchBranch {
  id: string
  workspaceId: string
  name: string
  slug: string
  parentBranchId: string | null
  purpose: string | null
  status: BranchStatus
  isCurrent: boolean
  staleBase: boolean
  createdFromEventId: string | null
  gitRef: string | null
  worktreePath: string | null
  setupState: "READY" | "FAILED"
  createdAt: string
  updatedAt: string
}

export interface VisibleClaim {
  claimId: string
  relation: ArtifactRelation
}

export interface BranchDetail {
  branch: ResearchBranch
  parent: ResearchBranch | null
  localClaims: number
  inheritedClaims: number
  proofAttempts: number
  blockers: number
}

export interface MergePreviewItem {
  kind: "claim" | "formal_file" | "verified_proof" | "dependency" | "research_note"
  id: string
  change: "ADDITIVE" | "MODIFIED" | "CONFLICT"
  summary: string
  safe: boolean
  reverifyRequired?: boolean
}

export interface MergePreview {
  sourceId: string
  targetId: string
  items: MergePreviewItem[]
  additiveClaims: number
  verifiedProofs: number
  formalChanges: number
  conflicts: number
  safeToAutoMerge: boolean
}

export function isBranchStatus(value: string): value is BranchStatus {
  return (BRANCH_STATUSES as readonly string[]).includes(value)
}

export function normalizeLegacyBranchStatus(value: string): BranchStatus {
  const upper = value.toUpperCase()
  if (isBranchStatus(upper)) return upper
  if (value === "abandoned") return "ABANDONED"
  if (value === "merged") return "MERGED"
  if (value === "blocked") return "PAUSED"
  return "ACTIVE"
}

export function slugifyBranchName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || "branch"
}

export function nextBranchId(existingIds: string[]): string {
  const pattern = /^B-(\d+)$/
  let max = 0
  for (const id of existingIds) {
    const match = pattern.exec(id)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) max = value
  }
  return `B-${padSeq(Math.max(max, 0) + 1)}`
}

export function gitRefForBranch(id: string, slug: string): string {
  return `mathos/${id}-${slug}`
}

export function branchGlyph(status: BranchStatus, current: boolean): string {
  if (status === "MERGED") return "✓"
  if (status === "ABANDONED" || status === "ARCHIVED") return "×"
  if (status === "PAUSED") return "Ⅱ"
  return current ? "●" : "○"
}
