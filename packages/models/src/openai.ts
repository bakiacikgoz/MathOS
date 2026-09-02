import {
  InvalidStructuredResponse,
  ModelAuthenticationFailed,
  ModelNotConfigured,
  ModelTimeout,
  ModelUnavailable,
  ModelResponseTooLarge,
} from "./errors.ts"
import { extractJson } from "./json.ts"
import type { ModelConfig, ModelProvider, ModelRequest, ModelResponse, StructuredModelRequest } from "./types.ts"
import { retryModelCall } from "./retry.ts"
import type { ModelUsageLedger } from "./usage.ts"

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string
  readonly model: string
  readonly capabilities = {
    structuredOutput: true,
    toolCalling: false,
    reasoning: false,
    streaming: false,
    vision: false,
  }

  constructor(
    private readonly config: ModelConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly usage?: Pick<ModelUsageLedger, "record">,
  ) {
    this.id = config.provider
    this.model = config.model
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.config.apiKey || !this.config.model) {
      throw new ModelNotConfigured("Set MATHOS_API_KEY and MATHOS_MODEL to enable research intake.")
    }

    const url = `${this.config.baseUrl}/chat/completions`, timeout = AbortSignal.timeout(this.config.timeoutMs ?? 60_000), signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout
    const call = async (): Promise<Response> => {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: request.temperature ?? 0,
          messages: request.messages,
          response_format: { type: "json_object" },
        }),
        signal,
      })
      if (response.status === 401 || response.status === 403) throw new ModelAuthenticationFailed()
      if (!response.ok) {
        const error: Error & { status: number; retryAfterMs?: number } = Object.assign(new Error(`Model endpoint returned ${response.status}.`), { status: response.status })
        const retryAfter = response.headers.get("retry-after"); if (retryAfter) error.retryAfterMs = Math.max(0, Number(retryAfter) * 1_000)
        throw error
      }
      return response
    }
    let response: Response, retries = 0
    const started = Date.now()
    try { const outcome = await retryModelCall(call, { signal }); response = outcome.value; retries = outcome.retries } catch (error) {
      this.usage?.record({ profileId: this.id, model: this.model, role: request.role ?? "primary", durationMs: Date.now() - started, retries, success: false, errorClass: error instanceof Error ? error.name : "UNKNOWN", researchRunId: request.researchRunId })
      if (request.signal?.aborted || signal.aborted && request.signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("aborted")) {
        throw new ModelTimeout()
      }
      if (error instanceof ModelAuthenticationFailed) throw error
      throw new ModelUnavailable(message)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > (this.config.maxResponseBytes ?? 2_000_000)) throw new ModelResponseTooLarge()
    let payload: {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    try { payload = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new InvalidStructuredResponse("Model response was not valid JSON.") }
    const text = payload.choices?.[0]?.message?.content
    if (!text) throw new InvalidStructuredResponse("Model response had no content.")
    this.usage?.record({ profileId: this.id, model: this.model, role: request.role ?? "primary", durationMs: Date.now() - started, retries, success: true, inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens, researchRunId: request.researchRunId })
    return { text, provider: this.id, model: this.model }
  }

  async generateStructured<T>(request: StructuredModelRequest<T>): Promise<T> {
    const first = await this.generate(request)
    try {
      return request.parse(extractJson(first.text))
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid structured response"
      const retry = await this.generate({
        ...request,
        messages: [
          ...request.messages,
          { role: "assistant", content: first.text },
          {
            role: "user",
            content: `Your previous JSON failed validation: ${reason}. Return only valid JSON for ${request.schemaName}.`,
          },
        ],
      })
      try {
        return request.parse(extractJson(retry.text))
      } catch {
        throw new InvalidStructuredResponse("The model returned an invalid structured response after one repair attempt.")
      }
    }
  }
}
