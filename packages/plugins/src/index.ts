export interface PluginRegistry {
  readonly plugins: readonly string[]
}

export function createPluginRegistry(): PluginRegistry {
  return Object.freeze({ plugins: Object.freeze([]) })
}
export * from "./manifest.ts"
export * from "./permissions.ts"
