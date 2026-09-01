import { padSeq } from "@mathos/shared"

export const AGENT_ROLES = [
  "DIRECT_PROVER",
  "DECOMPOSER",
  "LEMMA_RESEARCHER",
  "COUNTEREXAMPLE_HUNTER",
  "PROOF_REPAIRER",
  "INDEPENDENT_CHECKER",
  "GENERAL_RESEARCHER",
] as const
export type ResearchAgentRole = (typeof AGENT_ROLES)[number]

export const AGENT_APPROACHES = [
  "DIRECT",
  "DECOMPOSITION",
  "AUXILIARY_LEMMA",
  "CONTRADICTION",
  "INDUCTION",
  "REWRITE",
  "ORDER_REASONING",
  "GENERAL",
] as const
export type ResearchApproach = (typeof AGENT_APPROACHES)[number]

export const MULTI_AGENT_EXECUTION_MODES = ["SEQUENTIAL", "BOUNDED_PARALLEL"] as const
export type MultiAgentExecutionMode = (typeof MULTI_AGENT_EXECUTION_MODES)[number]

export const HARD_MAX_PARALLEL_WORKERS = 3
export const DEFAULT_MAX_PARALLEL_WORKERS = 2

export const MULTI_AGENT_SESSION_STATUSES = [
  "READY",
  "RUNNING",
  "PAUSED",
  "BLOCKED",
  "SOLUTION_FOUND",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const
export type MultiAgentSessionStatus = (typeof MULTI_AGENT_SESSION_STATUSES)[number]

export const MULTI_AGENT_STOP_REASONS = [
  "SOLUTION_FOUND",
  "ALL_AGENTS_BLOCKED",
  "GLOBAL_BUDGET_EXHAUSTED",
  "MAX_ROUNDS",
  "REQUEST_HUMAN",
  "USER_PAUSED",
  "USER_CANCELLED",
  "FATAL_EXECUTION_ERROR",
  "LOW_ASSIGNMENT_DIVERSITY",
  "PARTIAL_INITIALIZATION",
] as const
export type MultiAgentStopReason = (typeof MULTI_AGENT_STOP_REASONS)[number]

export interface MultiAgentBudget {
  maxAgents: number
  maxRounds: number
  maxTotalSteps: number
  maxTotalModelCalls: number
  maxTotalLeanCalls: number
  maxTotalProofAttempts: number
}

export interface MultiAgentUsage {
  rounds: number
  steps: number
  modelCalls: number
  leanCalls: number
  proofAttempts: number
}

export const DEFAULT_MULTI_AGENT_BUDGET: MultiAgentBudget = {
  maxAgents: 3,
  maxRounds: 8,
  maxTotalSteps: 24,
  maxTotalModelCalls: 30,
  maxTotalLeanCalls: 20,
  maxTotalProofAttempts: 12,
}

export const DEFAULT_WORKER_ROLES: ResearchAgentRole[] = ["DIRECT_PROVER", "DECOMPOSER", "LEMMA_RESEARCHER"]

export interface ResearchAssignment {
  objectiveClaimId: string
  targetClaimId?: string
  role: ResearchAgentRole
  goalSummary: string
  approach: ResearchApproach
  approachHint?: string
  sourceArtifactIds: string[]
}

export interface PlannedAgentAssignment {
  role: ResearchAgentRole
  approach: ResearchApproach
  goalSummary: string
  targetClaimId?: string
}

export interface AgentAssignmentPlan {
  version: "v1"
  assignments: PlannedAgentAssignment[]
  rationaleSummary: string
  warning?: "LOW_ASSIGNMENT_DIVERSITY"
}

export interface MultiAgentResearchSession {
  id: string
  workspaceId: string
  sourceBranchId: string
  sourceRevision: string | null
  objectiveClaimId: string
  status: MultiAgentSessionStatus
  strategy: "DIVERSE_BRANCHES"
  limits: MultiAgentBudget
  usage: MultiAgentUsage
  currentRound: number
  sourceStale: boolean
  executionMode: MultiAgentExecutionMode
  maxParallelWorkers: number
  createdAt: string
  startedAt: string | null
  stoppedAt: string | null
  stopReason: MultiAgentStopReason | null
}

export interface ResearchAgentWorker {
  id: string
  sessionId: string
  role: ResearchAgentRole
  branchId: string
  researchRunId: string
  localClaimId: string
  status: "READY" | "RUNNING" | "PAUSED" | "BLOCKED" | "COMPLETED" | "FAILED" | "CANCELLED"
  assignment: ResearchAssignment
  createdAt: string
}

export interface MultiAgentRound {
  id: string
  sessionId: string
  sequence: number
  status: "PLANNED" | "RUNNING" | "COMPLETED" | "INTERRUPTED" | "FAILED"
  startedAt: string | null
  finishedAt: string | null
}

export interface SolutionCandidate {
  id: string
  sessionId: string
  agentId: string
  branchId: string
  claimId: string
  verificationRunId: string | null
  formalRevision: string | null
  discoveredAt: string
}

export interface SharedResearchDigest {
  sessionId: string
  round: number
  verifiedFindings: Array<{ claimId: string; branchId: string; title: string }>
  unverifiedFindings: Array<{ claimId: string; branchId: string; status: string }>
  openBlockers: Array<{ id: string; summary: string }>
  approachesTried: Array<{ agentId: string; approach: string; summary: string }>
  failedApproaches: Array<{ agentId: string; approach: string; summary: string }>
  solutionCandidates: Array<{ id: string; agentId: string; claimId: string }>
  checkerReviews: Array<{ checkerAgentId: string; candidateId: string; verdict: "ACCEPT" | "REJECT" | "NEEDS_REVIEW"; critique: string[] }>
  duplicateApproachFingerprints: string[]
}

export function nextRoundId(sessionId: string, sequence: number): string {
  return `${sessionId}-R${padSeq(sequence).slice(-2)}`
}

export function fallbackAssignmentPlan(objectiveClaimId: string): AgentAssignmentPlan {
  return {
    version: "v1",
    rationaleSummary: "deterministic diverse fallback",
    assignments: [
      { role: "DIRECT_PROVER", approach: "DIRECT", goalSummary: "Prove the objective directly", targetClaimId: objectiveClaimId },
      { role: "DECOMPOSER", approach: "DECOMPOSITION", goalSummary: "Decompose into subclaims", targetClaimId: objectiveClaimId },
      { role: "LEMMA_RESEARCHER", approach: "AUXILIARY_LEMMA", goalSummary: "Search for an auxiliary lemma", targetClaimId: objectiveClaimId },
    ],
  }
}

export function assignmentDiversity(plan: AgentAssignmentPlan): { ok: boolean; warning?: "LOW_ASSIGNMENT_DIVERSITY" } {
  const approaches = new Set(plan.assignments.map((item) => item.approach))
  const roles = new Set(plan.assignments.map((item) => item.role))
  const fingerprints = plan.assignments.map(approachFingerprint)
  if (new Set(fingerprints).size !== fingerprints.length || (plan.assignments.length >= 3 && (approaches.size === 1 || roles.size === 1))) {
    return { ok: false, warning: "LOW_ASSIGNMENT_DIVERSITY" }
  }
  return { ok: true }
}

const CANONICAL_WORDS: Record<string, string> = { demonstrate: "prove", show: "prove", establish: "prove", directly: "direct", objective: "goal", proposition: "goal", theorem: "goal", implies: "implication", equals: "eq", zero: "0" }
export function canonicalApproachTokens(value: string): string[] {
  const operators = value.replaceAll("∀", " forall ").replaceAll("∃", " exists ").replaceAll("→", " implication ").replaceAll("⇒", " implication ").replaceAll("↔", " iff ").replaceAll("≤", " le ").replaceAll("≥", " ge ").replaceAll("=", " eq ").replaceAll("+", " add ").replaceAll("*", " mul ")
  return [...new Set(operators.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).map((token) => CANONICAL_WORDS[token] ?? token))].sort()
}

export function approachFingerprint(assignment: Pick<PlannedAgentAssignment, "approach" | "goalSummary" | "targetClaimId"> & { objectiveClaimId?: string }): string {
  const target = assignment.objectiveClaimId ?? assignment.targetClaimId ?? "objective"
  return `${assignment.approach}|${target}|${canonicalApproachTokens(assignment.goalSummary).join(" ")}`
}

export function approachSimilarity(left: Parameters<typeof approachFingerprint>[0], right: Parameters<typeof approachFingerprint>[0]): number {
  if (left.approach !== right.approach) return 0
  const leftTarget = left.objectiveClaimId ?? left.targetClaimId ?? "objective", rightTarget = right.objectiveClaimId ?? right.targetClaimId ?? "objective"
  if (leftTarget !== rightTarget) return 0
  const a = new Set(canonicalApproachTokens(left.goalSummary)), b = new Set(canonicalApproachTokens(right.goalSummary))
  const union = new Set([...a, ...b]); if (!union.size) return 1
  return [...a].filter((token) => b.has(token)).length / union.size
}

export function parseAssignmentPlan(value: unknown): AgentAssignmentPlan {
  if (!value || typeof value !== "object") throw new Error("INVALID_PLANNER_DECISION")
  const raw = value as Record<string, unknown>
  const assignments = Array.isArray(raw.assignments) ? raw.assignments : []
  const parsed: PlannedAgentAssignment[] = assignments.map((item) => {
    const row = item as Record<string, unknown>
    const role = String(row.role ?? "")
    const approach = String(row.approach ?? "")
    if (!(AGENT_ROLES as readonly string[]).includes(role)) throw new Error("INVALID_PLANNER_DECISION")
    if (!(AGENT_APPROACHES as readonly string[]).includes(approach)) throw new Error("INVALID_PLANNER_DECISION")
    return {
      role: role as ResearchAgentRole,
      approach: approach as ResearchApproach,
      goalSummary: String(row.goalSummary ?? role),
      targetClaimId: row.targetClaimId ? String(row.targetClaimId) : undefined,
    }
  })
  if (!parsed.length) throw new Error("INVALID_PLANNER_DECISION")
  if (parsed.length > 5) parsed.length = 5
  return { version: "v1", assignments: parsed, rationaleSummary: String(raw.rationaleSummary ?? "").slice(0, 400) }
}
