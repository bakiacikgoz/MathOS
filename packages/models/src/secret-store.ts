export type SecretRef = string
export interface SecretStoreCapability { backend: "environment" | "macos-keychain" | "linux-secret-service"; readable: boolean; writable: boolean; detail: string }
export interface SecretMetadata { ref: SecretRef; configured: boolean; backend: SecretStoreCapability["backend"] }
export interface SecretStore { capability(): Promise<SecretStoreCapability>; set(ref: SecretRef, value: string): Promise<void>; get(ref: SecretRef): Promise<string | null>; delete(ref: SecretRef): Promise<void>; listMetadata(refs?: SecretRef[]): Promise<SecretMetadata[]> }
export function secretEnvironmentName(ref: SecretRef): string { return `MATHOS_SECRET_${ref.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}` }
export class EnvironmentSecretStore implements SecretStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  async capability(): Promise<SecretStoreCapability> { return { backend: "environment", readable: true, writable: false, detail: "Environment-only; plaintext persistence is disabled" } }
  async set(_ref: SecretRef, _value: string): Promise<void> { throw new Error("SECRET_STORE_READ_ONLY") }
  async get(ref: SecretRef): Promise<string | null> { return this.env[secretEnvironmentName(ref)]?.trim() || (ref === "model.default" ? this.env.MATHOS_API_KEY?.trim() : null) || null }
  async delete(_ref: SecretRef): Promise<void> { throw new Error("SECRET_STORE_READ_ONLY") }
  async listMetadata(refs: SecretRef[] = []): Promise<SecretMetadata[]> { return Promise.all(refs.map(async ref => ({ ref, configured: Boolean(await this.get(ref)), backend: "environment" as const }))) }
}
export function createSecretStore(env: NodeJS.ProcessEnv = process.env): SecretStore {
  // Capability-honest fallback. Native keychain adapters are enabled only when implemented and detected.
  return new EnvironmentSecretStore(env)
}
