import { InvalidStructuredResponse, ModelAuthenticationFailed, ModelResponseTooLarge, ModelTimeout, ModelUnavailable } from "../errors.ts"
import type { ModelRequest, ModelToolCall } from "../types.ts"
import type { HttpTransportConfig, NormalizedTransport, NormalizedTransportResponse } from "./types.ts"
import { readJsonBody } from "./structured-output.ts"
import { parseJsonEvent, readSse, streamDeadline } from "./sse.ts"

export class OpenAIResponsesTransport implements NormalizedTransport {
  readonly protocol = "openai-responses" as const
  constructor(private readonly config: HttpTransportConfig) {}

  async generate(request: ModelRequest): Promise<NormalizedTransportResponse> {
    const streaming = Boolean(request.onDelta) && !request.responseSchema
    const deadline = streaming ? streamDeadline(this.config.timeoutMs ?? 60_000, request.signal) : null
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? 60_000)
    const signal = deadline?.signal ?? (request.signal ? AbortSignal.any([request.signal, timeout]) : timeout)
    const body: Record<string, unknown> = { model: this.config.model, input: request.messages.map(message => ({ role: message.role, content: message.content })) }
    if (request.tools?.length) {
      body.tools = request.tools.map(tool => ({ type: "function", ...tool, strict: false }))
      body.parallel_tool_calls = false
    }
    if (request.maxOutputTokens !== undefined) body.max_output_tokens = request.maxOutputTokens
    const explicitEffort = request.reasoningEffort && request.reasoningEffort !== "none"
    // OpenAI's highest Responses effort is "xhigh"; "max" is rejected.
    const effort = request.reasoningEffort === "max" ? this.config.maxReasoningEffort ?? "xhigh" : request.reasoningEffort
    if (streaming && (explicitEffort || /^(?:openai\/)?(?:gpt-|o\d)/i.test(this.config.model))) body.reasoning = { ...(explicitEffort ? { effort } : {}), summary: "auto" }
    else if (explicitEffort) body.reasoning = { effort }
    if (streaming) body.stream = true
    if (request.responseSchema) body.text = { format: { type: "json_schema", name: request.responseSchema.name, strict: true, schema: request.responseSchema.jsonSchema } }
    try {
      const response = await (this.config.fetch ?? fetch)(`${this.config.baseUrl.replace(/\/$/, "")}/responses`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}`, ...this.config.headers, ...this.config.requestHeaders?.(request) }, body: JSON.stringify(body), signal,
      })
      if (response.status === 401 || response.status === 403) throw new ModelAuthenticationFailed()
      if (!response.ok) { const retryAfter = Number(response.headers.get("retry-after")); throw Object.assign(new Error(`Model endpoint returned ${response.status}.`), { status: response.status, ...(Number.isFinite(retryAfter) && retryAfter >= 0 && response.headers.has("retry-after") ? { retryAfterMs: retryAfter * 1_000 } : {}) }) }
      if (streaming && /event-stream/.test(response.headers.get("content-type") ?? "")) return await this.readStream(response, request, deadline!)
      const payload = await readJsonBody(response, this.config.maxResponseBytes)
      assertComplete(payload)
      const result = output(payload.output ?? [], typeof payload.output_text === "string" ? payload.output_text : "")
      const reasoning = reasoningSummary(payload)
      if (streaming) { if (reasoning) request.onDelta?.({ reasoning }); if (result.text) request.onDelta?.({ text: result.text }) }
      return { ...result, usage: { inputTokens: finite(payload.usage?.input_tokens), outputTokens: finite(payload.usage?.output_tokens) }, rawResponseId: payload.id, ...(reasoning ? { reasoning } : {}) }
    } catch (error) {
      if (error instanceof ModelAuthenticationFailed || error instanceof InvalidStructuredResponse || error instanceof ModelResponseTooLarge) throw error
      if (signal.aborted && !request.signal?.aborted) throw new ModelTimeout()
      throw error instanceof Error && "status" in error ? error : new ModelUnavailable(error instanceof Error ? error.message : String(error))
    } finally { deadline?.dispose() }
  }

  private async readStream(response: Response, request: ModelRequest, deadline: ReturnType<typeof streamDeadline>): Promise<NormalizedTransportResponse> {
    let streamed = "", reasoning = "", firstItem: string | undefined, completed: any = null
    const items = new Map<number, any>()
    const acceptSummary = (full: string) => { const suffix = full.startsWith(reasoning) ? full.slice(reasoning.length) : reasoning ? "" : full; if (suffix) { reasoning += suffix; request.onDelta?.({ reasoning: suffix }) } }
    const publishItems = () => {
      const text = messageText([...items.entries()].sort(([a], [b]) => a - b).map(([, item]) => item))
      if (text.startsWith(streamed) && text.length > streamed.length) { request.onDelta?.({ text: text.slice(streamed.length) }); streamed = text }
    }
    await readSse(response, (data, name) => {
      const event = parseJsonEvent(data)
      if (!event) return
      const type = event.type ?? name
      if (type === "error" || type === "response.failed") throw new ModelUnavailable(event.error?.message ?? event.response?.error?.message ?? "stream error")
      if (type === "response.incomplete") throw new ModelUnavailable(`MODEL_RESPONSE_INCOMPLETE: ${event.response?.incomplete_details?.reason ?? "unknown"}`)
      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        const key = event.item_id ?? String(event.output_index ?? 0)
        firstItem ??= key
        // Later message items can repeat commentary. Publish those only when complete.
        if (key === firstItem) { streamed += event.delta; request.onDelta?.({ text: event.delta }) }
      } else if (type === "response.output_item.done" && event.item) {
        items.set(event.output_index ?? items.size, event.item)
        publishItems()
      } else if ((type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") && typeof event.delta === "string") {
        reasoning += event.delta; request.onDelta?.({ reasoning: event.delta })
      } else if (type === "response.reasoning_summary_text.done" && typeof event.text === "string") acceptSummary(event.text)
      else if (type === "response.reasoning_summary_part.done" && typeof event.part?.text === "string") acceptSummary(event.part.text)
      else if (type === "response.completed") {
        completed = event.response ?? {}
        assertComplete(completed)
        acceptSummary(reasoningSummary(completed))
      }
    }, { maxBytes: this.config.maxResponseBytes ? this.config.maxResponseBytes * 10 : undefined, touch: deadline.touch })
    if (!completed) throw new ModelUnavailable("MODEL_STREAM_INTERRUPTED: response.completed was not received")
    const result = output(completed.output ?? [...items.entries()].sort(([a], [b]) => a - b).map(([, item]) => item), streamed)
    if (result.text.startsWith(streamed) && result.text.length > streamed.length) request.onDelta?.({ text: result.text.slice(streamed.length) })
    return { ...result, usage: { inputTokens: finite(completed.usage?.input_tokens), outputTokens: finite(completed.usage?.output_tokens) }, rawResponseId: completed.id, ...(reasoning ? { reasoning } : {}) }
  }
}

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined
function assertComplete(payload: any) {
  if (payload.status === "incomplete" || payload.status === "failed" || payload.error) throw new ModelUnavailable(`MODEL_RESPONSE_INCOMPLETE: ${payload.error?.message ?? payload.incomplete_details?.reason ?? payload.status}`)
}
function messageText(items: any[]): string {
  const messages: string[] = []
  for (const item of items) {
    if (item.type && item.type !== "message") continue
    const text = (item.content ?? []).filter((part: any) => part.type === "output_text" && typeof part.text === "string").map((part: any) => part.text).join("")
    if (text && text !== messages.at(-1)) messages.push(text)
  }
  return messages.join("\n\n")
}
function output(items: any[], fallback: string): { text: string; toolCalls?: ModelToolCall[] } {
  const text = messageText(items) || fallback
  const calls = new Map<string, ModelToolCall>()
  for (const item of items) if (item.type === "function_call") {
    if (typeof item.name !== "string" || typeof item.arguments !== "string" || typeof item.call_id !== "string") throw new InvalidStructuredResponse("Model returned an invalid function call.")
    calls.set(item.call_id, { id: item.call_id, name: item.name, arguments: item.arguments })
  }
  if (!calls.size && items.some(item => item.phase === "commentary") && !messageText(items.filter(item => item.phase !== "commentary"))) throw new ModelUnavailable("MODEL_RESPONSE_INCOMPLETE: commentary without an answer or tool call")
  if (!text && !calls.size) throw new InvalidStructuredResponse("Model response had no output text or tool call.")
  return { text, ...(calls.size ? { toolCalls: [...calls.values()] } : {}) }
}
function reasoningSummary(payload: any): string {
  return (payload?.output ?? []).filter((item: any) => item.type === "reasoning").flatMap((item: any) => item.summary ?? []).filter((part: any) => part.type === "summary_text" && typeof part.text === "string").map((part: any) => part.text).join("\n")
}
