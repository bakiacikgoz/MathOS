import { describe, expect, test } from "bun:test"
import { AnthropicMessagesTransport, OpenAIChatTransport, OpenAIResponsesTransport, type ModelDelta } from "@mathos/models"

const sse = (events: Array<unknown | string>) => new Response(events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } })
const config = (response: () => Response, seen: Array<Record<string, unknown>> = []) => ({ provider: "p", model: "m", baseUrl: "https://example.test/v1", apiKey: "k", fetch: (async (_url: string, init: RequestInit) => { seen.push(JSON.parse(String(init.body))); return response() }) as unknown as typeof fetch })

describe("streamed answers", () => {
  test("chat completions stream text and reasoning deltas, with usage", async () => {
    const seen: Array<Record<string, unknown>> = [], deltas: ModelDelta[] = []
    const transport = new OpenAIChatTransport(config(() => sse([
      { id: "c1", choices: [{ delta: { reasoning_content: "Let me " } }] },
      { choices: [{ delta: { reasoning_content: "think." } }] },
      { choices: [{ delta: { content: "The answer " } }] },
      { choices: [{ delta: { content: "is $2$." } }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } },
      "[DONE]",
    ]), seen))
    const result = await transport.generate({ messages: [{ role: "user", content: "1+1?" }], onDelta: (delta) => deltas.push(delta) })
    expect(seen[0]).toMatchObject({ stream: true, stream_options: { include_usage: true } })
    expect(result).toMatchObject({ text: "The answer is $2$.", reasoning: "Let me think.", usage: { inputTokens: 12, outputTokens: 7 }, rawResponseId: "c1" })
    expect(deltas.map((delta) => delta.text ?? `[${delta.reasoning}]`).join("")).toBe("[Let me ][think.]The answer is $2$.")
  })

  test("a provider that ignores stream: true still answers, and the text arrives as one delta", async () => {
    const deltas: ModelDelta[] = []
    const transport = new OpenAIChatTransport(config(() => Response.json({ choices: [{ message: { content: "plain" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })))
    const result = await transport.generate({ messages: [{ role: "user", content: "x" }], onDelta: (delta) => deltas.push(delta) })
    expect(result.text).toBe("plain")
    expect(deltas).toEqual([{ text: "plain" }])
  })

  test("structured requests never stream", async () => {
    const seen: Array<Record<string, unknown>> = []
    const transport = new OpenAIChatTransport(config(() => Response.json({ choices: [{ message: { content: "{}" } }] }), seen))
    await transport.generate({ messages: [{ role: "user", content: "x" }], responseSchema: { name: "s", jsonSchema: {} }, onDelta: () => {} })
    expect(seen[0]!.stream).toBeUndefined()
  })

  test("anthropic messages stream text and thinking", async () => {
    const deltas: ModelDelta[] = []
    const transport = new AnthropicMessagesTransport(config(() => sse([
      { type: "message_start", message: { id: "m1", usage: { input_tokens: 5 } } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hi" } },
      { type: "message_delta", usage: { output_tokens: 3 } },
      { type: "message_stop" },
    ])))
    const result = await transport.generate({ messages: [{ role: "user", content: "x" }], onDelta: (delta) => deltas.push(delta) })
    expect(result).toMatchObject({ text: "Hi", reasoning: "hmm", usage: { inputTokens: 5, outputTokens: 3 }, rawResponseId: "m1" })
    expect(deltas).toEqual([{ reasoning: "hmm" }, { text: "Hi" }])
  })

  test("responses stream output text and reasoning summaries", async () => {
    const seen: Array<Record<string, unknown>> = []
    const transport = new OpenAIResponsesTransport(config(() => sse([
      { type: "response.reasoning_summary_text.delta", delta: "Plan." },
      { type: "response.output_text.delta", delta: "Done" },
      { type: "response.completed", response: { id: "r1", usage: { input_tokens: 2, output_tokens: 1 } } },
    ]), seen))
    const result = await transport.generate({ messages: [{ role: "user", content: "x" }], reasoningEffort: "high", onDelta: () => {} })
    expect(seen[0]).toMatchObject({ stream: true, reasoning: { effort: "high", summary: "auto" } })
    expect(result).toMatchObject({ text: "Done", reasoning: "Plan.", usage: { inputTokens: 2, outputTokens: 1 }, rawResponseId: "r1" })
  })

  test("a stream that reports an error fails instead of returning partial text", async () => {
    const transport = new OpenAIChatTransport(config(() => sse([{ choices: [{ delta: { content: "par" } }] }, { error: { message: "overloaded" } }])))
    await expect(transport.generate({ messages: [{ role: "user", content: "x" }], onDelta: () => {} })).rejects.toThrow("overloaded")
  })
})
