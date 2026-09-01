export interface ResearchPlannerDescriptor {
  version: "v1"
  kind: "MODEL" | "SCRIPTED" | "DETERMINISTIC_FALLBACK"
  config: Record<string, unknown>
}

export const IMPORT_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "APPLYING",
  "REVERIFY_REQUIRED",
  "APPLIED",
  "REJECTED",
  "CONFLICT",
  "FAILED",
] as const
export type ImportStatus = (typeof IMPORT_STATUSES)[number]

export interface VerifiedArtifactImport {
  id: string
  sessionId: string
  sourceAgentId: string
  sourceBranchId: string
  targetAgentId: string
  targetBranchId: string
  sourceClaimId: string
  targetClaimId: string | null
  sourceVerificationRunId: string | null
  sourceFormalRevision: string
  status: ImportStatus
  failureCode: string | null
  createdAt: string
  approvedAt: string | null
  appliedAt: string | null
}

export interface ImportPreview {
  importId: string
  sourceAgentId: string
  sourceBranchId: string
  targetAgentId: string
  targetBranchId: string
  requestedClaimId: string
  requiredDependencies: string[]
  files: number
  allVerified: boolean
  conflicts: string[]
}

export function parsePlannerDescriptor(value: unknown): ResearchPlannerDescriptor {
  if (!value || typeof value !== "object") throw new Error("PLANNER_UNAVAILABLE")
  const raw = value as Record<string, unknown>
  const kind = String(raw.kind ?? "")
  if (kind !== "MODEL" && kind !== "SCRIPTED" && kind !== "DETERMINISTIC_FALLBACK") throw new Error("PLANNER_UNAVAILABLE")
  const config = raw.config && typeof raw.config === "object" ? { ...(raw.config as Record<string, unknown>) } : {}
  delete config.apiKey
  delete config.token
  delete config.secret
  return { version: "v1", kind, config }
}
