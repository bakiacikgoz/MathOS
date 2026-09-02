export interface SolverRegistry {
  readonly adapters: readonly string[]
}

export function createSolverRegistry(): SolverRegistry {
  return Object.freeze({ adapters: Object.freeze([]) })
}
