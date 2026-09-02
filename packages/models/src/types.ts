export interface ModelCapabilities {
  structuredOutput: boolean
  toolCalling: boolean
  reasoning: boolean
  streaming: boolean
  vision: boolean
  contextWindow?: number
}
export type ModelRole="primary"|"auditor"|"alignment"|"planner"|"repair"|"intake"|"formalizer"|"prover"|"checker"|"literature_synthesis"|"researcher"

export interface ModelMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ModelRequest {
  messages: ModelMessage[]
  role?: ModelRole
  researchRunId?: string
  temperature?: number
  signal?: AbortSignal
  responseSchema?: { name: string; jsonSchema: Record<string, unknown> }
  maxOutputTokens?: number
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max"
  metadata?: { role?: ModelRole; researchRunId?: string }
}

export interface ModelResponse {
  text: string
  provider: string
  model: string
  usage?: { inputTokens?: number; outputTokens?: number }
}

export interface StructuredModelRequest<T> extends ModelRequest {
  schemaName: string
  parse: (value: unknown) => T
}

export interface ModelProvider {
  readonly id: string
  readonly model: string
  readonly capabilities: ModelCapabilities
  generate(request: ModelRequest): Promise<ModelResponse>
  generateStructured<T>(request: StructuredModelRequest<T>): Promise<T>
}

export interface ModelConfig {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  source: {
    model: "env" | "toml" | "default"
    baseUrl: "env" | "toml" | "default"
    apiKey: "env" | "missing"
  }
  roles?:Partial<Record<ModelRole,string>>
  timeoutMs?: number
  maxResponseBytes?: number
}

export const DEFAULT_BASE_URL = "https://api.openai.com/v1"
export const DEFAULT_PROVIDER = "openai-compatible"
