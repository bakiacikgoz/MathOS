export const EXPERIMENT_KINDS = [
  "COUNTEREXAMPLE_SEARCH",
  "FINITE_VERIFICATION",
  "SYMBOLIC_COMPUTATION",
  "NUMERICAL_EXPERIMENT",
  "PATTERN_SEARCH",
  "SANITY_CHECK",
  "GENERAL",
] as const
export type ExperimentKind = (typeof EXPERIMENT_KINDS)[number]

export const EXPERIMENT_STATUSES = ["DRAFT", "READY", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

export const EXPERIMENT_OUTCOMES = [
  "SUPPORTING_EVIDENCE",
  "COUNTEREXAMPLE_FOUND",
  "NO_COUNTEREXAMPLE_FOUND",
  "INCONCLUSIVE",
  "EXECUTION_FAILED",
] as const
export type ExperimentOutcome = (typeof EXPERIMENT_OUTCOMES)[number]

export interface RuntimeDescriptor {
  adapter: "python" | "fake"
  executable: string
  version: string | null
  sympyVersion: string | null
  platform: string
  adapterVersion: "v1"
}

export interface Experiment {
  id: string
  workspaceId: string
  branchId: string
  claimId: string | null
  researchRunId: string | null
  researchStepId: string | null
  agentId: string | null
  kind: ExperimentKind
  status: ExperimentStatus
  hypothesis: string | null
  runtime: RuntimeDescriptor
  codeArtifactId: string
  parameters: Record<string, unknown>
  codeHash: string
  inputHash: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface ExperimentResult {
  id: string
  experimentId: string
  outcome: ExperimentOutcome
  summary: string
  structuredOutput: Record<string, unknown>
  stdoutArtifactId: string | null
  stderrArtifactId: string | null
  startedAt: string
  finishedAt: string
  runtimeFingerprint: string
  codeHash: string
  inputHash: string
  exactArithmetic: boolean
  deterministic: boolean
  stdoutTruncated: boolean
  stderrTruncated: boolean
  randomSeed: string | number | null
}

export interface ComputationalBudget {
  maxExperiments: number
  maxRuntimeCalls: number
  maxWallClockMsPerExperiment: number
  maxTotalWallClockMs?: number
  maxOutputBytes: number
}

export const DEFAULT_COMPUTATIONAL_BUDGET: ComputationalBudget = {
  maxExperiments: 8,
  maxRuntimeCalls: 12,
  maxWallClockMsPerExperiment: 15_000,
  maxOutputBytes: 65_536,
}

export function isExperimentKind(value: string): value is ExperimentKind {
  return (EXPERIMENT_KINDS as readonly string[]).includes(value)
}
