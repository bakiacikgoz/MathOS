import type { SecretMetadata, SecretRef, SecretStore, SecretStoreCapability, SecretCommandRunner } from "./types.ts"
import { validateSecretRef, validateSecretValue } from "./types.ts"
import { bunSecretCommandRunner } from "./command-runner.ts"

export const MATHOS_KEYCHAIN_SERVICE = "com.mathos.model-provider"

export class MacOSKeychainSecretStore implements SecretStore {
  constructor(private readonly runner: SecretCommandRunner = bunSecretCommandRunner, private readonly executable = "/usr/bin/security") {}
  async capability(): Promise<SecretStoreCapability> { const result = await this.runner.run(this.executable, ["help", "find-generic-password"]); return { backend: "macos-keychain", readable: result.exitCode === 0, writable: result.exitCode === 0, detail: result.exitCode === 0 ? "macOS Keychain available" : "macOS Keychain unavailable" } }
  async set(ref: SecretRef, value: string): Promise<void> { const account = validateSecretRef(ref), hex = Buffer.from(validateSecretValue(value), "utf8").toString("hex"); const result = await this.runner.run(this.executable, ["-i"], `add-generic-password -a "${account}" -s "${MATHOS_KEYCHAIN_SERVICE}" -U -X ${hex}\n`); if (result.exitCode !== 0) throw new Error("SECRET_STORE_WRITE_FAILED") }
  async get(ref: SecretRef): Promise<string | null> { const result = await this.runner.run(this.executable, ["find-generic-password", "-a", validateSecretRef(ref), "-s", MATHOS_KEYCHAIN_SERVICE, "-w"]); if (result.exitCode === 44) return null; if (result.exitCode !== 0) throw new Error("SECRET_STORE_READ_FAILED"); return result.stdout.replace(/[\r\n]+$/, "") || null }
  async delete(ref: SecretRef): Promise<void> { const result = await this.runner.run(this.executable, ["delete-generic-password", "-a", validateSecretRef(ref), "-s", MATHOS_KEYCHAIN_SERVICE]); if (result.exitCode !== 0 && result.exitCode !== 44) throw new Error("SECRET_STORE_DELETE_FAILED") }
  async listMetadata(refs: SecretRef[] = []): Promise<SecretMetadata[]> { return Promise.all(refs.map(async ref => ({ ref: validateSecretRef(ref), configured: Boolean(await this.get(ref)), backend: "macos-keychain" as const }))) }
}
