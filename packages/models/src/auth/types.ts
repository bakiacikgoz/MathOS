export type SecretRef = string

export type SecretStoreBackend = "environment" | "macos-keychain" | "windows-credential-manager" | "linux-secret-service"

export interface SecretStoreCapability {
  backend: SecretStoreBackend
  readable: boolean
  writable: boolean
  detail: string
}

export interface SecretMetadata { ref: SecretRef; configured: boolean; backend: SecretStoreBackend }

export interface SecretStore {
  capability(): Promise<SecretStoreCapability>
  set(ref: SecretRef, value: string): Promise<void>
  get(ref: SecretRef): Promise<string | null>
  delete(ref: SecretRef): Promise<void>
  listMetadata(refs?: SecretRef[]): Promise<SecretMetadata[]>
}

export interface SecretCommandResult { exitCode: number; stdout: string; stderr: string }
export interface SecretCommandRunner { run(executable: string, args: string[], stdin?: string): Promise<SecretCommandResult> }

export function validateSecretRef(ref: string): SecretRef {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(ref)) throw new Error("SECRET_REF_INVALID")
  return ref
}

export function validateSecretValue(value: string): string {
  if (!value || value.includes("\0") || value.length > 65_536) throw new Error("SECRET_VALUE_INVALID")
  return value
}
