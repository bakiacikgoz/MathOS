export const CLAIM_KINDS = [
  "definition",
  "conjecture",
  "lemma",
  "theorem",
  "corollary",
] as const

export type ClaimKind = (typeof CLAIM_KINDS)[number]

export const CLAIM_STATUSES = [
  "IDEA",
  "CONJECTURE",
  "HEURISTIC_SUPPORT",
  "COMPUTATIONALLY_SUPPORTED",
  "INFORMAL_ARGUMENT",
  "HUMAN_REVIEWED_ARGUMENT",
  "FORMALIZED_UNVERIFIED",
  "KERNEL_VERIFIED",
  "INDEPENDENTLY_CHECKED",
  "EXTERNAL_KNOWN",
  "DISPROVED",
  "BLOCKED",
  "STALE",
] as const

export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

export const EVIDENCE_KINDS = [
  "computation",
  "formal_verification",
  "literature",
  "human_review",
  "counterexample",
] as const

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const DEPENDENCY_RELATIONS = [
  "depends_on",
  "implies",
  "contradicts",
  "generalizes",
  "special_case_of",
  "uses_definition",
  "supported_by",
  "disproved_by",
  "formalizes",
  "verified_by",
  "cites",
  "derived_from",
  "motivates",
  "blocks",
  "resolves",
  "equivalent_to",
] as const

export type DependencyRelation = (typeof DEPENDENCY_RELATIONS)[number]

export {
  BRANCH_STATUSES,
  type BranchStatus,
  type ResearchBranch,
  type ArtifactRelation,
} from "./branch.ts"
export type Branch = import("./branch.ts").ResearchBranch

export const BLOCKER_PRIORITIES = ["critical", "high", "normal", "low"] as const
export type BlockerPriority = (typeof BLOCKER_PRIORITIES)[number]

export const BLOCKER_STATUSES = ["open", "resolved"] as const
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number]

export const ACTOR_TYPES = ["user", "system", "agent"] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

export interface Actor {
  type: ActorType
  id: string
}

export interface WorkspaceRecord {
  id: string
  name: string
  rootPath: string
  mainObjectiveId: string | null
  createdAt: string
  updatedAt: string
}

export interface Claim {
  id: string
  workspaceId: string
  kind: ClaimKind
  title: string
  naturalStatement: string
  originalInput: string | null
  status: ClaimStatus
  branchId: string
  createdBy: "user" | "model"
  provider: string | null
  modelName: string | null
  createdAt: string
  updatedAt: string
}

export interface Dependency {
  id: string
  workspaceId: string
  fromClaimId: string
  toClaimId: string
  relation: DependencyRelation
  createdAt: string
}

export interface Evidence {
  id: string
  workspaceId: string
  claimId: string
  kind: EvidenceKind
  summary: string
  artifactRef: string | null
  reproducible: boolean
  createdAt: string
}



export interface Blocker {
  id: string
  workspaceId: string
  targetClaimId: string | null
  title: string
  description: string
  priority: BlockerPriority
  status: BlockerStatus
  createdAt: string
  resolvedAt: string | null
}

export interface ResearchEvent {
  eventId: string
  timestamp: string
  actor: Actor
  action: string
  target: string | null
  metadata: Record<string, unknown>
}

export const VERIFIED_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "KERNEL_VERIFIED",
  "INDEPENDENTLY_CHECKED",
])

export const INFORMAL_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "INFORMAL_ARGUMENT",
  "HUMAN_REVIEWED_ARGUMENT",
  "FORMALIZED_UNVERIFIED",
  "HEURISTIC_SUPPORT",
])

export const CONJECTURE_STATUSES: ReadonlySet<ClaimStatus> = new Set([
  "CONJECTURE",
  "IDEA",
])

export function isClaimKind(value: string): value is ClaimKind {
  return (CLAIM_KINDS as readonly string[]).includes(value)
}

export function isClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(value)
}

export function defaultStatusForKind(kind: ClaimKind): ClaimStatus {
  return kind === "conjecture" ? "CONJECTURE" : "IDEA"
}

export function claimPrefix(kind: ClaimKind): string {
  switch (kind) {
    case "definition":
      return "D"
    case "conjecture":
      return "C"
    case "lemma":
      return "L"
    case "theorem":
      return "T"
    case "corollary":
      return "COR"
  }
}

export function statusFamily(status: ClaimStatus): "verified" | "informal" | "conjecture" | "blocked" | "disproved" | "stale" | "other" {
  if (VERIFIED_STATUSES.has(status)) return "verified"
  if (INFORMAL_STATUSES.has(status)) return "informal"
  if (CONJECTURE_STATUSES.has(status)) return "conjecture"
  if (status === "BLOCKED") return "blocked"
  if (status === "DISPROVED") return "disproved"
  if (status === "STALE") return "stale"
  return "other"
}
