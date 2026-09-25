import { InvalidStructuredResponse, ModelAuthenticationFailed, ModelResponseTooLarge, ModelTimeout, ModelUnavailable, ProviderQuotaExhausted, ProviderRateLimited } from "../errors.ts"
import type { ModelRequest } from "../types.ts"
import type { HttpTransportConfig, NormalizedTransport, NormalizedTransportResponse } from "./types.ts"
import { readJsonBody } from "./structured-output.ts"
import { parseJsonEvent, readSse, streamDeadline } from "./sse.ts"

export class OpenAIChatTransport implements NormalizedTransport {
  readonly protocol = "openai-chat" as const
  constructor(private readonly config: HttpTransportConfig) {}
  async generate(request: ModelRequest): Promise<NormalizedTransportResponse> {
    const streaming = Boolean(request.onDelta) && !request.responseSchema
    const deadline = streaming ? streamDeadline(this.config.timeoutMs ?? 60_000, request.signal) : null
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 60_000), signal = deadline?.signal ?? (request.signal ? AbortSignal.any([request.signal, timeout]) : timeout)
    const body: Record<string, unknown> = { model: this.config.model, messages: request.messages, temperature: request.temperature ?? 0 }
    if (request.maxOutputTokens !== undefined) body.max_completion_tokens = request.maxOutputTokens
    if(request.reasoningEffort&&this.config.supportedReasoningEfforts&&!this.config.supportedReasoningEfforts.includes(request.reasoningEffort))throw new Error(`REASONING_EFFORT_UNSUPPORTED: ${request.reasoningEffort}`)
    if (request.reasoningEffort && request.reasoningEffort !== "none") body.reasoning_effort = request.reasoningEffort
    if (request.responseSchema) body.response_format = { type: "json_schema", json_schema: { name: request.responseSchema.name, strict: true, schema: request.responseSchema.jsonSchema } }
    if (streaming) { body.stream = true; body.stream_options = { include_usage: true } }
    try {
      const response = await (this.config.fetch ?? fetch)(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}`, ...this.config.headers,...this.config.requestHeaders?.(request) }, body: JSON.stringify(body), signal })
      if (response.status === 401 || response.status === 403) throw new ModelAuthenticationFailed()
      if(response.status===402)throw new ProviderQuotaExhausted("PROVIDER_MEMBERSHIP_UNAVAILABLE")
      if(response.status===429)throw new ProviderRateLimited()
      if (!response.ok) throw Object.assign(new Error(`Model endpoint returned ${response.status}.`), { status: response.status, retryAfterMs: retryAfter(response) })
      if (streaming && /event-stream/.test(response.headers.get("content-type") ?? "")) return await this.readStream(response, request, deadline!)
      const payload = await readJsonBody(response, this.config.maxResponseBytes)
      const message = payload.choices?.[0]?.message, text = message?.content
      if (typeof text !== "string" || !text) throw new InvalidStructuredResponse("Model response had no content.")
      const reasoning = typeof message?.reasoning_content === "string" ? message.reasoning_content : typeof message?.reasoning === "string" ? message.reasoning : undefined
      if (streaming) { if (reasoning) request.onDelta?.({ reasoning }); request.onDelta?.({ text }) }
      return { text, usage: { inputTokens: finite(payload.usage?.prompt_tokens), outputTokens: finite(payload.usage?.completion_tokens) }, rawResponseId: typeof payload.id === "string" ? payload.id : undefined, ...(reasoning ? { reasoning } : {}) }
    } catch (error) { if (error instanceof ModelAuthenticationFailed || error instanceof ProviderQuotaExhausted || error instanceof ProviderRateLimited || error instanceof InvalidStructuredResponse || error instanceof ModelResponseTooLarge) throw error; if (signal.aborted && !request.signal?.aborted) throw new ModelTimeout(); throw error instanceof Error && "status" in error ? error : new ModelUnavailable(error instanceof Error ? error.message : String(error)) }
    finally { deadline?.dispose() }
  }

  /** Chat Completions streaming: `delta.content`, plus `reasoning_content` / `reasoning` from providers that expose thinking. */
  private async readStream(response: Response, request: ModelRequest, deadline: ReturnType<typeof streamDeadline>): Promise<NormalizedTransportResponse> {
    let text = "", reasoning = "", id: string | undefined, inputTokens: number | undefined, outputTokens: number | undefined
    await readSse(response, (data) => {
      if (data === "[DONE]") return
      const chunk = parseJsonEvent(data)
      if (!chunk) return
      if (chunk.error) throw new ModelUnavailable(typeof chunk.error.message === "string" ? chunk.error.message : "stream error")
      id ??= typeof chunk.id === "string" ? chunk.id : undefined
      const delta = chunk.choices?.[0]?.delta
      const thought = typeof delta?.reasoning_content === "string" ? delta.reasoning_content : typeof delta?.reasoning === "string" ? delta.reasoning : ""
      if (thought) { reasoning += thought; request.onDelta?.({ reasoning: thought }) }
      if (typeof delta?.content === "string" && delta.content) { text += delta.content; request.onDelta?.({ text: delta.content }) }
      if (chunk.usage) { inputTokens = finite(chunk.usage.prompt_tokens) ?? inputTokens; outputTokens = finite(chunk.usage.completion_tokens) ?? outputTokens }
    }, { maxBytes: this.config.maxResponseBytes ? this.config.maxResponseBytes * 10 : undefined, touch: deadline.touch })
    if (!text) throw new InvalidStructuredResponse("Model response had no content.")
    return { text, usage: { inputTokens, outputTokens }, rawResponseId: id, ...(reasoning ? { reasoning } : {}) }
  }
}
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined
const retryAfter = (response: Response) => { const value = response.headers.get("retry-after"); return value ? Math.max(0, Number(value) * 1_000) : undefined }
