import type { SecretMetadata, SecretRef, SecretStore, SecretStoreCapability } from "./types.ts"
import { validateSecretRef } from "./types.ts"

export function secretEnvironmentName(ref: SecretRef): string { return `MATHOS_SECRET_${validateSecretRef(ref).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}` }

export class EnvironmentSecretStore implements SecretStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  async capability(): Promise<SecretStoreCapability> { return { backend: "environment", readable: true, writable: false, detail: "Environment-only; plaintext persistence is disabled" } }
  async set(_ref: SecretRef, _value: string): Promise<void> { throw new Error("SECRET_STORE_READ_ONLY") }
  async get(ref: SecretRef): Promise<string | null> { validateSecretRef(ref); return this.env[secretEnvironmentName(ref)]?.trim() || (ref === "model.default" ? this.env.MATHOS_API_KEY?.trim() : null) || null }
  async delete(_ref: SecretRef): Promise<void> { throw new Error("SECRET_STORE_READ_ONLY") }
  async listMetadata(refs: SecretRef[] = []): Promise<SecretMetadata[]> { return Promise.all(refs.map(async ref => ({ ref: validateSecretRef(ref), configured: Boolean(await this.get(ref)), backend: "environment" as const }))) }
}
