export interface PluginRegistry {
  readonly plugins: readonly string[]
}

export function createPluginRegistry(): PluginRegistry {
  return Object.freeze({ plugins: Object.freeze([]) })
}
export * from "./manifest.ts"
export * from "./permissions.ts"
export * from "./protocol.ts"
export * from "./process-host.ts"
export * from "./quarantine.ts"
export * from "./registry.ts"
