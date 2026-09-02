export { SolverRegistry,type SolverAdapterDescriptor,type SolverRegistryOptions } from "./registry.ts"
export { createSolverPolicy,validateTrustTransition,type TrustEvidence } from "./policy.ts"
export { validateSolverResult,type ValidatedSolverResult } from "./result-validation.ts"
export function createSolverRegistry():{readonly adapters:readonly string[]}{return Object.freeze({adapters:Object.freeze([])})}
