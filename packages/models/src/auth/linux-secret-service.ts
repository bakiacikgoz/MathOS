import type { SecretMetadata, SecretRef, SecretStore, SecretStoreCapability, SecretCommandRunner } from "./types.ts"
import { validateSecretRef, validateSecretValue } from "./types.ts"
import { bunSecretCommandRunner } from "./command-runner.ts"

export class LinuxSecretServiceStore implements SecretStore {
  constructor(private readonly runner: SecretCommandRunner = bunSecretCommandRunner, private readonly executable = "secret-tool") {}
  async capability(): Promise<SecretStoreCapability> { const result = await this.runner.run(this.executable, ["--version"]); return { backend: "linux-secret-service", readable: result.exitCode === 0, writable: result.exitCode === 0, detail: result.exitCode === 0 ? "Secret Service available" : "secret-tool unavailable" } }
  async set(ref: SecretRef, value: string): Promise<void> { const result = await this.runner.run(this.executable, ["store", "--label=MathOS model provider", "service", "com.mathos.model-provider", "ref", validateSecretRef(ref)], validateSecretValue(value)); if (result.exitCode !== 0) throw new Error("SECRET_STORE_WRITE_FAILED") }
  async get(ref: SecretRef): Promise<string | null> { const result = await this.runner.run(this.executable, ["lookup", "service", "com.mathos.model-provider", "ref", validateSecretRef(ref)]); if (result.exitCode === 1) return null; if (result.exitCode !== 0) throw new Error("SECRET_STORE_READ_FAILED"); return result.stdout.replace(/[\r\n]+$/, "") || null }
  async delete(ref: SecretRef): Promise<void> { const result = await this.runner.run(this.executable, ["clear", "service", "com.mathos.model-provider", "ref", validateSecretRef(ref)]); if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error("SECRET_STORE_DELETE_FAILED") }
  async listMetadata(refs: SecretRef[] = []): Promise<SecretMetadata[]> { return Promise.all(refs.map(async ref => ({ ref: validateSecretRef(ref), configured: Boolean(await this.get(ref)), backend: "linux-secret-service" as const }))) }
}
