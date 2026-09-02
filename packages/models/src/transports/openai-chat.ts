import { InvalidStructuredResponse, ModelAuthenticationFailed, ModelTimeout, ModelUnavailable, ProviderQuotaExhausted, ProviderRateLimited } from "../errors.ts"
import type { ModelRequest } from "../types.ts"
import type { HttpTransportConfig, NormalizedTransport, NormalizedTransportResponse } from "./types.ts"
import { readJsonBody } from "./structured-output.ts"

export class OpenAIChatTransport implements NormalizedTransport {
  readonly protocol = "openai-chat" as const
  constructor(private readonly config: HttpTransportConfig) {}
  async generate(request: ModelRequest): Promise<NormalizedTransportResponse> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 60_000), signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    const body: Record<string, unknown> = { model: this.config.model, messages: request.messages, temperature: request.temperature ?? 0 }
    if (request.maxOutputTokens !== undefined) body.max_completion_tokens = request.maxOutputTokens
    if(request.reasoningEffort&&this.config.supportedReasoningEfforts&&!this.config.supportedReasoningEfforts.includes(request.reasoningEffort))throw new Error(`REASONING_EFFORT_UNSUPPORTED: ${request.reasoningEffort}`)
    if (request.reasoningEffort && request.reasoningEffort !== "none") body.reasoning_effort = request.reasoningEffort
    if (request.responseSchema) body.response_format = { type: "json_schema", json_schema: { name: request.responseSchema.name, strict: true, schema: request.responseSchema.jsonSchema } }
    try {
      const response = await (this.config.fetch ?? fetch)(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}`, ...this.config.headers }, body: JSON.stringify(body), signal })
      if (response.status === 401 || response.status === 403) throw new ModelAuthenticationFailed()
      if(response.status===402)throw new ProviderQuotaExhausted("PROVIDER_MEMBERSHIP_UNAVAILABLE")
      if(response.status===429)throw new ProviderRateLimited()
      if (!response.ok) throw Object.assign(new Error(`Model endpoint returned ${response.status}.`), { status: response.status, retryAfterMs: retryAfter(response) })
      const payload = await readJsonBody(response, this.config.maxResponseBytes)
      const text = payload.choices?.[0]?.message?.content
      if (typeof text !== "string" || !text) throw new InvalidStructuredResponse("Model response had no content.")
      return { text, usage: { inputTokens: finite(payload.usage?.prompt_tokens), outputTokens: finite(payload.usage?.completion_tokens) }, rawResponseId: typeof payload.id === "string" ? payload.id : undefined }
    } catch (error) { if (error instanceof ModelAuthenticationFailed || error instanceof ProviderQuotaExhausted || error instanceof ProviderRateLimited || error instanceof InvalidStructuredResponse || error instanceof (await import("../errors.ts")).ModelResponseTooLarge) throw error; if (signal.aborted && !request.signal?.aborted) throw new ModelTimeout(); throw error instanceof Error && "status" in error ? error : new ModelUnavailable(error instanceof Error ? error.message : String(error)) }
  }
}
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined
const retryAfter = (response: Response) => { const value = response.headers.get("retry-after"); return value ? Math.max(0, Number(value) * 1_000) : undefined }
