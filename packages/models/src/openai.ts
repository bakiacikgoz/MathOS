import {
  InvalidStructuredResponse,
  ModelAuthenticationFailed,
  ModelNotConfigured,
  ModelTimeout,
  ModelUnavailable,
} from "./errors.ts"
import { extractJson } from "./json.ts"
import type { ModelConfig, ModelProvider, ModelRequest, ModelResponse, StructuredModelRequest } from "./types.ts"

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
  ) {
    this.id = config.provider
    this.model = config.model
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.config.apiKey || !this.config.model) {
      throw new ModelNotConfigured("Set MATHOS_API_KEY and MATHOS_MODEL to enable research intake.")
    }

    const url = `${this.config.baseUrl}/chat/completions`
    let response: Response
    try {
      response = await this.fetchImpl(url, {
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
        signal: request.signal,
      })
    } catch (error) {
      if (request.signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("aborted")) {
        throw new ModelTimeout()
      }
      throw new ModelUnavailable(message)
    }

    if (response.status === 401 || response.status === 403) {
      throw new ModelAuthenticationFailed()
    }
    if (!response.ok) {
      throw new ModelUnavailable(`Model endpoint returned ${response.status}.`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = payload.choices?.[0]?.message?.content
    if (!text) throw new InvalidStructuredResponse("Model response had no content.")
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
