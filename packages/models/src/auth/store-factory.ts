import type { SecretCommandRunner, SecretStore } from "./types.ts"
import { EnvironmentSecretStore } from "./environment-store.ts"
import { MacOSKeychainSecretStore } from "./macos-keychain.ts"
import { WindowsCredentialManagerStore } from "./windows-credential-manager.ts"
import { LinuxSecretServiceStore } from "./linux-secret-service.ts"

export interface SecretStoreFactoryOptions { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; which?: (name: string) => string | null; runner?: SecretCommandRunner }

export function createSecretStore(envOrOptions: NodeJS.ProcessEnv | SecretStoreFactoryOptions = process.env): SecretStore {
  const configured = envOrOptions as SecretStoreFactoryOptions
  const options: SecretStoreFactoryOptions = configured.platform !== undefined || configured.which !== undefined || configured.env !== undefined || configured.runner !== undefined ? configured : { env: envOrOptions as NodeJS.ProcessEnv }
  const platform = options.platform ?? process.platform, which = options.which ?? (name => Bun.which(name))
  if (platform === "darwin" && which("security")) return new MacOSKeychainSecretStore(options.runner, which("security")!)
  if (platform === "win32" && (which("powershell.exe") || which("powershell"))) return new WindowsCredentialManagerStore(options.runner, which("powershell.exe") ?? which("powershell")!)
  if (platform === "linux" && which("secret-tool")) return new LinuxSecretServiceStore(options.runner, which("secret-tool")!)
  return new EnvironmentSecretStore(options.env ?? process.env)
}
