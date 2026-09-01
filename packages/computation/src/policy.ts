import type { ExperimentOrigin } from "@mathos/domain"
export const EXECUTION_POLICY_VERSION = "sandbox-v1"
export interface ExperimentPolicyInput { origin?: ExperimentOrigin; timeoutMs: number; maxOutputBytes: number; codeBytes: number; allowUserAuthored?: boolean }
export function evaluateExperimentPolicy(input: ExperimentPolicyInput) {
 const origin = input.origin ?? "USER_AUTHORED"
 const allowed = ["TRUSTED_BUILTIN", "USER_AUTHORED", "MODEL_GENERATED"].includes(origin) && Number.isInteger(input.timeoutMs) && input.timeoutMs >= 1 && input.timeoutMs <= 60_000 && Number.isInteger(input.maxOutputBytes) && input.maxOutputBytes >= 1 && input.maxOutputBytes <= 1_048_576 && input.codeBytes <= 65_536 && (origin !== "USER_AUTHORED" || input.allowUserAuthored === true)
 return {allowed, origin, version:EXECUTION_POLICY_VERSION, networkAllowed:false as const, filesystemMode:"PRIVATE_TEMP_ONLY", blockedReason:allowed ? null : "EXPERIMENT_BLOCKED_POLICY"}
}
