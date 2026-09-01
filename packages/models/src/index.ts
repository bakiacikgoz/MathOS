import { OpenAICompatibleProvider } from "./openai.ts"
import { resolveModelConfig, type ModelConfig } from "./config.ts"
import type { ModelProvider } from "./types.ts"

export function createModelProvider(config: ModelConfig, fetchImpl?: typeof fetch): ModelProvider {
  return new OpenAICompatibleProvider(config, fetchImpl)
}

export function createDefaultModelProvider(workspaceRoot?: string, fetchImpl?: typeof fetch): ModelProvider {
  return createModelProvider(resolveModelConfig({ workspaceRoot }), fetchImpl)
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
export { extractJson } from "./json.ts"
export * from "./errors.ts"
export * from "./types.ts"
