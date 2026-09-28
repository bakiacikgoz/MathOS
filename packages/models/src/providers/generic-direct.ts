import { InvalidStructuredResponse } from "../errors.ts"
import { extractJson } from "../json.ts"
import type { ModelProvider, ModelRequest, ModelResponse, StructuredModelRequest } from "../types.ts"
import type { NormalizedTransport } from "../transports/types.ts"

export class GenericDirectProvider implements ModelProvider {
  get capabilities() {
    return { structuredOutput: true, toolCalling: this.transport.protocol === "openai-responses", reasoning: true, streaming: true, vision: false }
  }

  constructor(readonly id: string, readonly model: string, private readonly transport: NormalizedTransport) {}

  toJSON() { return { id: this.id, model: this.model, capabilities: this.capabilities, protocol: this.transport.protocol } }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.transport.generate(request)
    return { text: response.text, provider: this.id, model: this.model, usage: response.usage, ...(response.toolCalls?.length ? { toolCalls: response.toolCalls } : {}), ...(response.reasoning ? { reasoning: response.reasoning } : {}) }
  }

  async generateStructured<T>(request: StructuredModelRequest<T>): Promise<T> {
    // An arbitrary object schema is not a valid strict JSON schema for Responses APIs. Only send
    // native schema mode when the caller supplies an actual schema; otherwise request JSON in text.
    const messages = request.responseSchema ? request.messages : [
      ...request.messages,
      { role: "user" as const, content: `Return only a valid JSON value for ${request.schemaName}. Do not include markdown or explanation.` },
    ]
    const first = await this.generate({ ...request, messages })
    try { return request.parse(extractJson(first.text)) }
    catch (error) {
      const repair = await this.generate({
        ...request,
        messages: [...messages, { role: "assistant", content: first.text }, { role: "user", content: `Return only repaired JSON for ${request.schemaName}: ${error instanceof Error ? error.message : "invalid"}` }],
      })
      try { return request.parse(extractJson(repair.text)) }
      catch { throw new InvalidStructuredResponse("The model returned an invalid structured response after one repair attempt.") }
    }
  }
}

export function assertLiveUsageAccepted(input: { live?: boolean; acceptUsage?: boolean }, billingClass: string): void {
  if (input.live && billingClass === "payg" && !input.acceptUsage) throw new Error("LIVE_USAGE_ACCEPTANCE_REQUIRED")
}
