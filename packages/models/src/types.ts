export interface ModelCapabilities {
  structuredOutput: boolean
  toolCalling: boolean
  reasoning: boolean
  streaming: boolean
  vision: boolean
  contextWindow?: number
}
export type ModelRole="primary"|"auditor"|"alignment"|"planner"|"repair"

export interface ModelMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ModelRequest {
  messages: ModelMessage[]
  temperature?: number
  signal?: AbortSignal
}

export interface ModelResponse {
  text: string
  provider: string
  model: string
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
}

export const DEFAULT_BASE_URL = "https://api.openai.com/v1"
export const DEFAULT_PROVIDER = "openai-compatible"
