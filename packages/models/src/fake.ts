import { InvalidStructuredResponse, ModelNotConfigured } from "./errors.ts"
import { extractJson } from "./json.ts"
import type { ModelProvider, ModelRequest, ModelResponse, StructuredModelRequest } from "./types.ts"

export class FakeModelProvider implements ModelProvider {
  readonly id = "fake"
  readonly model: string
  readonly capabilities = {
    structuredOutput: true,
    toolCalling: false,
    reasoning: false,
    streaming: false,
    vision: false,
  }

  private queue: Array<string | Error> = []
  generateCalls = 0

  constructor(model = "fake-intake") {
    this.model = model
  }

  enqueue(value: string | Error | object): void {
    this.queue.push(typeof value === "string" || value instanceof Error ? value : JSON.stringify(value))
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.generateCalls += 1
    if (request.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    const next = this.queue.shift()
    if (!next) throw new ModelNotConfigured("Fake provider has no queued responses.")
    if (next instanceof Error) throw next
    return { text: next, provider: this.id, model: this.model }
  }

  async generateStructured<T>(request: StructuredModelRequest<T>): Promise<T> {
    const first = await this.generate(request)
    try {
      return request.parse(extractJson(first.text))
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid"
      const retry = await this.generate({
        ...request,
        messages: [
          ...request.messages,
          { role: "user", content: `Repair JSON: ${reason}` },
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
