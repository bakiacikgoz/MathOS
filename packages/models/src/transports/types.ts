import type { ModelRequest } from "../types.ts"

export interface NormalizedTransportUsage { inputTokens?: number; outputTokens?: number }
export interface NormalizedTransportResponse { text: string; usage: NormalizedTransportUsage; rawResponseId?: string }
export interface NormalizedTransport { readonly protocol: "openai-chat" | "openai-responses" | "anthropic-messages"; generate(request: ModelRequest): Promise<NormalizedTransportResponse> }
export interface HttpTransportConfig { provider: string; model: string; baseUrl: string; apiKey: string; timeoutMs?: number; maxResponseBytes?: number; fetch?: typeof fetch; headers?:Record<string,string> }
