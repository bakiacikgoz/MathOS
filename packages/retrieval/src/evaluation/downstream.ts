export interface DownstreamExecution { caseId: string; executed: boolean; kernelAccepted: boolean; detail?: string }
export interface DownstreamMetrics { k: number; attempted: number; successes: number; rate: number; valid: boolean }
export function downstreamProofSuccess(executions: DownstreamExecution[], k: number): DownstreamMetrics {
  const attempted = executions.filter((row) => row.executed)
  const successes = attempted.filter((row) => row.kernelAccepted).length
  return { k, attempted: attempted.length, successes, rate: attempted.length ? successes / attempted.length : 0, valid: attempted.length > 0 }
}
