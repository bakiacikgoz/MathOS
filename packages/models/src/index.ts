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
export * from "./transports/types.ts"
export * from "./transports/openai-chat.ts"
export * from "./transports/openai-responses.ts"
export * from "./transports/anthropic-messages.ts"
export * from "./transports/structured-output.ts"
export * from "./transports/process-supervisor.ts"
export * from "./transports/jsonrpc-process.ts"
export * from "./transports/acp-client.ts"
export * from "./auth/external-client-auth.ts"
export * from "./discovery/normalize.ts"
export * from "./discovery/cache.ts"
export * from "./discovery/static-fallback.ts"
export * from "./discovery/service.ts"
export * from "./quota/types.ts"
export * from "./quota/normalize.ts"
export * from "./quota/service.ts"
export * from "./health/probe.ts"
export * from "./health/service.ts"
export * from "./providers/generic-direct.ts"
export * from "./providers/openai-api.ts"
export * from "./providers/anthropic-api.ts"
export * from "./providers/gemini-api.ts"
export * from "./providers/google-vertex.ts"
export * from "./providers/factory.ts"
export * from "./protocols/codex-app-server.ts"
export * from "./providers/openai-codex-account.ts"
export * from "./protocols/claude-code-client.ts"
export * from "./providers/claude-code-account.ts"
export * from "./protocols/copilot-sdk.ts"
export * from "./providers/github-copilot.ts"
export * from "./providers/gemini-cli.ts"
export * from "./providers/google-antigravity.ts"
export * from "./profile.ts"
export * from "./catalog/types.ts"
export * from "./catalog/catalog.ts"
export * from "./catalog/terms-policy.ts"
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
