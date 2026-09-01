import type { RealResearchCaseResult } from "./research-case-runner.ts"

const rate = (n: number, d: number) => d ? n / d : 0
const median = (values: number[]) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export interface RealResearchSummary {
  eligibleCases: number; blockedConfigurationCases: number
  kernelVerifiedRate: number; formalizationSuccessRate: number; fidelityApprovalRequiredRate: number
  proofCompileRate: number; medianProofAttempts: number; medianModelCalls: number; medianLeanCalls: number
  medianWallClock: number; blockedRate: number; timeoutRate: number
}

export function summarizeRealResearch(rows: RealResearchCaseResult[]): RealResearchSummary {
  const eligible = rows.filter((row) => row.status !== "BLOCKED_CONFIGURATION")
  return {
    eligibleCases: eligible.length, blockedConfigurationCases: rows.length - eligible.length,
    kernelVerifiedRate: rate(eligible.filter((x) => x.kernelVerified).length, eligible.length),
    formalizationSuccessRate: rate(eligible.filter((x) => x.formalizationSucceeded).length, eligible.length),
    fidelityApprovalRequiredRate: rate(eligible.filter((x) => x.fidelityApprovalRequired).length, eligible.length),
    proofCompileRate: rate(eligible.filter((x) => x.proofCompiled).length, eligible.length),
    medianProofAttempts: median(eligible.map((x) => x.proofAttempts)), medianModelCalls: median(eligible.map((x) => x.modelCalls)),
    medianLeanCalls: median(eligible.map((x) => x.leanCalls)), medianWallClock: median(eligible.map((x) => x.wallClockMs)),
    blockedRate: rate(eligible.filter((x) => x.status === "BLOCKED").length, eligible.length),
    timeoutRate: rate(eligible.filter((x) => x.status === "TIMED_OUT").length, eligible.length),
  }
}

export function nondeterministicRegression(current: RealResearchSummary, baseline?: RealResearchSummary) {
  if (!baseline) return { classification: "NO_BASELINE" as const, hardGate: false, deltas: {} }
  const deltas = {
    kernelVerifiedRate: current.kernelVerifiedRate - baseline.kernelVerifiedRate,
    formalizationSuccessRate: current.formalizationSuccessRate - baseline.formalizationSuccessRate,
    proofCompileRate: current.proofCompileRate - baseline.proofCompileRate,
    blockedRate: current.blockedRate - baseline.blockedRate,
    timeoutRate: current.timeoutRate - baseline.timeoutRate,
  }
  const signal = deltas.kernelVerifiedRate <= -0.1 || deltas.proofCompileRate <= -0.1 || deltas.blockedRate >= 0.1 || deltas.timeoutRate >= 0.1
  return { classification: signal ? "REGRESSION_SIGNAL" as const : "WITHIN_NOISE_BAND" as const, hardGate: false, deltas }
}

export function formatRealResearchReport(summary: RealResearchSummary): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`
  return ["MATHOS REAL RESEARCH V1", `Eligible ${summary.eligibleCases}`, `Configuration blocked ${summary.blockedConfigurationCases}`,
    `KernelVerifiedRate ${pct(summary.kernelVerifiedRate)}`, `FormalizationSuccessRate ${pct(summary.formalizationSuccessRate)}`,
    `FidelityApprovalRequiredRate ${pct(summary.fidelityApprovalRequiredRate)}`, `ProofCompileRate ${pct(summary.proofCompileRate)}`,
    `MedianProofAttempts ${summary.medianProofAttempts}`, `MedianModelCalls ${summary.medianModelCalls}`, `MedianLeanCalls ${summary.medianLeanCalls}`,
    `MedianWallClock ${summary.medianWallClock}ms`, `BlockedRate ${pct(summary.blockedRate)}`, `TimeoutRate ${pct(summary.timeoutRate)}`,
    "Regression signal only; never a CI/release hard gate."].join("\n")
}
