import { padSeq } from "@mathos/shared"

export const RESEARCH_RUN_STATUSES = ["READY", "RUNNING", "PAUSED", "BLOCKED", "COMPLETED", "FAILED", "CANCELLED"] as const
export type ResearchRunStatus = (typeof RESEARCH_RUN_STATUSES)[number]

export const RESEARCH_STEP_STATUSES = ["PLANNED", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED", "SKIPPED", "INTERRUPTED"] as const
export type ResearchStepStatus = (typeof RESEARCH_STEP_STATUSES)[number]

export const RESEARCH_ACTIONS = [
  "ANALYZE_GOAL",
  "SEARCH_PREMISES",
  "DECOMPOSE_GOAL",
  "CREATE_SUBCLAIM",
  "ATTEMPT_PROOF",
  "VERIFY",
  "INSPECT_FAILURE",
  "RECORD_BLOCKER",
  "REQUEST_HUMAN",
  "STOP",
  "RUN_EXPERIMENT",
  "SEARCH_LITERATURE",
  "INSPECT_SOURCE",
] as const
export type ResearchActionType = (typeof RESEARCH_ACTIONS)[number]

export const RESEARCH_STOP_REASONS = [
  "OBJECTIVE_KERNEL_VERIFIED",
  "OBJECTIVE_DISPROVED",
  "BLOCKED_NEEDS_HUMAN",
  "BUDGET_EXHAUSTED",
  "STEP_BUDGET_EXHAUSTED",
  "MODEL_CALL_BUDGET_EXHAUSTED",
  "PROOF_ATTEMPT_BUDGET_EXHAUSTED",
  "LEAN_CALL_BUDGET_EXHAUSTED",
  "REPETITION_DETECTED",
  "NO_PRODUCTIVE_ACTION",
  "USER_PAUSED",
  "USER_CANCELLED",
  "EXECUTION_FAILURE",
  "ACTIVE_RESEARCH_RUN_EXISTS",
  "FORMALIZATION_BLOCKED",
  "INVALID_PLANNER_DECISION",
  "PLANNER_UNAVAILABLE",
  "LOCAL_LEAN_BUDGET_EXHAUSTED",
  "LOCAL_MODEL_BUDGET_EXHAUSTED",
  "LOCAL_PROOF_BUDGET_EXHAUSTED",
  "GLOBAL_PROOF_BUDGET_EXHAUSTED",
  "STEP_TIMEOUT",
] as const
export type ResearchStopReason = (typeof RESEARCH_STOP_REASONS)[number]

export const RESEARCH_BLOCKER_TYPES = [
  "MISSING_PREMISE",
  "PROOF_SEARCH_STALLED",
  "FORMALIZATION_MISMATCH",
  "LEAN_ERROR",
  "NEEDS_HUMAN_JUDGMENT",
  "REPETITION",
  "UNKNOWN",
] as const
export type ResearchBlockerType = (typeof RESEARCH_BLOCKER_TYPES)[number]

export const FAILURE_CLASSES = [
  "UNKNOWN_IDENTIFIER",
  "TYPE_MISMATCH",
  "UNSOLVED_GOALS",
  "SYNTAX_ERROR",
  "TIMEOUT",
  "STEP_TIMEOUT",
  "LEAN_TIMEOUT",
  "MODEL_TIMEOUT",
  "STORAGE_TIMEOUT",
  "FORBIDDEN_CONSTRUCT",
  "STATEMENT_MUTATION",
  "OTHER",
] as const
export type FailureClass = (typeof FAILURE_CLASSES)[number]

export interface ResearchBudget {
  maxSteps: number
  maxProofAttempts: number
  maxModelCalls: number
  maxLeanCalls: number
  maxExperiments?: number
  maxLiteratureSearches?: number
  maxSourceInspections?: number
  maxWallClockMinutes?: number
}

export interface ResearchUsage {
  steps: number
  proofAttempts: number
  modelCalls: number
  leanCalls: number
  experiments: number
  computationCalls: number
  computationWallClockMs: number
  literatureSearches: number
  sourceInspections: number
  model: { planner: number; proof: number; formalization: number; total: number }
  lean: { proofCompile: number; verification: number; inspection: number; axiomAudit: number; formalization: number; total: number }
}

export function emptyResearchUsage(): ResearchUsage {
  return {
    steps: 0,
    proofAttempts: 0,
    modelCalls: 0,
    leanCalls: 0,
    experiments: 0,
    computationCalls: 0,
    computationWallClockMs: 0,
    literatureSearches: 0,
    sourceInspections: 0,
    model: { planner: 0, proof: 0, formalization: 0, total: 0 },
    lean: { proofCompile: 0, verification: 0, inspection: 0, axiomAudit: 0, formalization: 0, total: 0 },
  }
}

export function normalizeResearchUsage(raw: unknown): ResearchUsage {
  const base = emptyResearchUsage()
  if (!raw || typeof raw !== "object") return base
  const value = raw as Record<string, unknown>
  const model = (value.model && typeof value.model === "object" ? value.model : {}) as Record<string, number>
  const lean = (value.lean && typeof value.lean === "object" ? value.lean : {}) as Record<string, number>
  const usage: ResearchUsage = {
    steps: Number(value.steps ?? 0),
    proofAttempts: Number(value.proofAttempts ?? 0),
    modelCalls: Number(value.modelCalls ?? model.total ?? 0),
    leanCalls: Number(value.leanCalls ?? lean.total ?? 0),
    experiments: Number(value.experiments ?? 0),
    computationCalls: Number(value.computationCalls ?? 0),
    computationWallClockMs: Number(value.computationWallClockMs ?? 0),
    literatureSearches: Number(value.literatureSearches ?? 0),
    sourceInspections: Number(value.sourceInspections ?? 0),
    model: {
      planner: Number(model.planner ?? 0),
      proof: Number(model.proof ?? 0),
      formalization: Number(model.formalization ?? 0),
      total: Number(model.total ?? value.modelCalls ?? 0),
    },
    lean: {
      proofCompile: Number(lean.proofCompile ?? 0),
      verification: Number(lean.verification ?? 0),
      inspection: Number(lean.inspection ?? 0),
      axiomAudit: Number(lean.axiomAudit ?? 0),
      formalization: Number(lean.formalization ?? 0),
      total: Number(lean.total ?? value.leanCalls ?? 0),
    },
  }
  usage.model.total = usage.model.planner + usage.model.proof + usage.model.formalization || usage.modelCalls
  usage.lean.total = usage.lean.proofCompile + usage.lean.verification + usage.lean.inspection + usage.lean.axiomAudit + usage.lean.formalization || usage.leanCalls
  usage.modelCalls = usage.model.total || usage.modelCalls
  usage.leanCalls = usage.lean.total || usage.leanCalls
  return usage
}

export type LeanCallReason = "PREMISE_INSPECTION" | "PROOF_COMPILE" | "VERIFICATION" | "AXIOM_AUDIT" | "FORMALIZATION_CHECK"
export type RecoveryPolicy = "RETRY_SAFE" | "RECONCILE_REQUIRED" | "NOT_RETRYABLE"

export function recoveryPolicyFor(action: ResearchActionType): RecoveryPolicy {
  if (action === "ANALYZE_GOAL" || action === "SEARCH_PREMISES" || action === "DECOMPOSE_GOAL" || action === "STOP" || action === "SEARCH_LITERATURE") return "RETRY_SAFE"
  if (action === "CREATE_SUBCLAIM" || action === "RECORD_BLOCKER" || action === "INSPECT_FAILURE" || action === "ATTEMPT_PROOF" || action === "VERIFY" || action === "RUN_EXPERIMENT" || action === "INSPECT_SOURCE") return "RECONCILE_REQUIRED"
  return "NOT_RETRYABLE"
}

export const DEFAULT_RESEARCH_BUDGET: ResearchBudget = {
  maxSteps: 20,
  maxProofAttempts: 6,
  maxModelCalls: 15,
  maxLeanCalls: 10,
}

export interface ResearchStrategyState {
  focusClaimId?: string
  currentApproach?: string
  exhaustedApproaches: string[]
  activeBlockerIds: string[]
}

export interface ResearchRun {
  id: string
  workspaceId: string
  branchId: string
  objectiveClaimId: string | null
  status: ResearchRunStatus
  startedAt: string | null
  stoppedAt: string | null
  currentStep: number
  limits: ResearchBudget
  usage: ResearchUsage
  stopReason: ResearchStopReason | null
  strategy: ResearchStrategyState
  agentId: string | null
  createdAt: string
  updatedAt: string
}

export interface ResearchStep {
  id: string
  runId: string
  branchId: string
  sequence: number
  action: ResearchActionType
  inputArtifactIds: string[]
  resultArtifactIds: string[]
  status: ResearchStepStatus
  idempotencyKey: string
  startedAt: string | null
  finishedAt: string | null
  summary: string | null
  failureClass: FailureClass | null
  createdAt: string
}

export interface ResearchDecision {
  action: ResearchActionType
  targetClaimId?: string
  rationaleSummary: string
  expectedInformationGain?: string
  parameters: Record<string, unknown>
  researchDecisionVersion: "v1"
  stop?: { shouldStop: boolean; reason?: ResearchStopReason | string }
}

export interface ResearchBlockerRecord {
  id: string
  workspaceId: string
  branchId: string
  claimId: string | null
  type: ResearchBlockerType
  status: "OPEN" | "RESOLVED" | "SUPERSEDED"
  summary: string
  createdByStepId: string | null
  resolvedByStepId: string | null
  humanResponse: string | null
  resolvedByHumanAt: string | null
  createdAt: string
}

export interface ResearchDecisionRecord {
  id: string
  runId: string
  branchId: string
  summary: string
  createdAt: string
}

export function nextPrefixedId(existingIds: string[], prefix: string): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const id of existingIds) {
    const match = pattern.exec(id)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > max) max = value
  }
  return `${prefix}-${padSeq(max + 1)}`
}

export function classifyLeanFailure(messages: string[]): FailureClass {
  const text = messages.join("\n").toLowerCase()
  if (/unknown identifier|unknown constant/.test(text)) return "UNKNOWN_IDENTIFIER"
  if (/type mismatch|has type/.test(text)) return "TYPE_MISMATCH"
  if (/unsolved goals/.test(text)) return "UNSOLVED_GOALS"
  if (/unexpected token|syntax/.test(text)) return "SYNTAX_ERROR"
  if (/timeout/.test(text)) return "TIMEOUT"
  if (/sorry|admit|axiom|unsafe/.test(text)) return "FORBIDDEN_CONSTRUCT"
  if (/mutated the formal statement/.test(text)) return "STATEMENT_MUTATION"
  return "OTHER"
}

export function parseResearchDecision(value: unknown): ResearchDecision {
  if (!value || typeof value !== "object") throw new Error("INVALID_PLANNER_DECISION")
  const raw = value as Record<string, unknown>
  const action = String(raw.action ?? "")
  if (!(RESEARCH_ACTIONS as readonly string[]).includes(action)) throw new Error("INVALID_PLANNER_DECISION")
  const parameters = raw.parameters && typeof raw.parameters === "object" ? { ...(raw.parameters as Record<string, unknown>) } : {}
  delete parameters.forceVerified
  delete parameters.claimStatus
  return {
    action: action as ResearchActionType,
    targetClaimId: raw.targetClaimId ? String(raw.targetClaimId) : undefined,
    rationaleSummary: String(raw.rationaleSummary ?? "").slice(0, 400),
    expectedInformationGain: raw.expectedInformationGain ? String(raw.expectedInformationGain).slice(0, 240) : undefined,
    parameters,
    researchDecisionVersion: "v1",
    stop: raw.stop && typeof raw.stop === "object"
      ? { shouldStop: Boolean((raw.stop as { shouldStop?: boolean }).shouldStop), reason: (raw.stop as { reason?: string }).reason }
      : undefined,
  }
}

export function deterministicResearchSummary(input: {
  run: ResearchRun
  createdClaims: number
  verifiedLemmas: number
  openBlockers: number
  currentApproach?: string
}): string {
  return [
    `RESEARCH SUMMARY · ${input.run.id}`,
    "",
    "Objective",
    input.run.objectiveClaimId ?? "none",
    "",
    "Steps",
    String(input.run.usage.steps),
    "",
    "Created claims",
    String(input.createdClaims),
    "",
    "Verified lemmas",
    String(input.verifiedLemmas),
    "",
    "Open blockers",
    String(input.openBlockers),
    "",
    "Current best approach",
    input.currentApproach ?? input.run.strategy.currentApproach ?? "none recorded",
    "",
    "Stop reason",
    input.run.stopReason ?? input.run.status,
    "",
    "Objective verified",
    "see claim status; planner opinion is not a completion condition",
  ].join("\n")
}
