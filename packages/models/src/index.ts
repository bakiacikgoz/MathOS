import { OpenAICompatibleProvider } from "./openai.ts"
import { resolveModelConfig } from "./config.ts"
import type { ModelConfig } from "./types.ts"
import type { ModelProvider } from "./types.ts"
import type { ModelProfile } from "./profile.ts"
import type { SecretStore } from "./secret-store.ts"
import { assertModelPrivacy } from "./privacy.ts"
import { ModelNotConfigured } from "./errors.ts"

export function createModelProvider(config: ModelConfig, fetchImpl?: typeof fetch): ModelProvider {
  return new OpenAICompatibleProvider(config, fetchImpl)
}

export function createDefaultModelProvider(workspaceRoot?: string, fetchImpl?: typeof fetch): ModelProvider {
  return createModelProvider(resolveModelConfig({ workspaceRoot }), fetchImpl)
}

export async function createProfiledModelProvider(profile: ModelProfile, secrets: SecretStore, privacy: { allowRemoteModels: boolean }, fetchImpl?: typeof fetch): Promise<ModelProvider> {
  const validated = (await import("./profile.ts")).validateModelProfile(profile)
  assertModelPrivacy(validated, privacy)
  const apiKey = validated.secretRef ? await secrets.get(validated.secretRef) : "local-provider"
  if (!apiKey) throw new ModelNotConfigured(`MODEL_SECRET_MISSING: ${validated.secretRef}`)
  return createModelProvider({ provider: validated.id, model: validated.model, baseUrl: validated.baseUrl, apiKey, source: { model: "toml", baseUrl: "toml", apiKey: validated.secretRef ? "env" : "missing" }, timeoutMs: validated.timeoutMs, maxResponseBytes: validated.maxResponseBytes }, fetchImpl)
}

export {
  resolveModelConfig,
  parseTomlSection,
  isModelReady,
} from "./config.ts"
export { OpenAICompatibleProvider } from "./openai.ts"
export { FakeModelProvider } from "./fake.ts"
export { modelDoctorChecks } from "./doctor.ts"
export { redactText, redactValue, containsSecret, collectKnownSecrets } from "./redact.ts"
export * from "./unified-config.ts"
export * from "./secret-store.ts"
export * from "./profile.ts"
export * from "./catalog/types.ts"
export * from "./profiles/types.ts"
export * from "./profiles/migrate-v1.ts"
export * from "./profiles/persistence.ts"
export * from "./registry.ts"
export * from "./router.ts"
export * from "./retry.ts"
export * from "./privacy.ts"
export * from "./usage.ts"
export * from "./health.ts"
export { extractJson } from "./json.ts"
export * from "./errors.ts"
export * from "./types.ts"
