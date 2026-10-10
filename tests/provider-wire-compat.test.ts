import { describe, expect, test } from "bun:test"
import { AnthropicMessagesTransport, OpenAIChatTransport, OpenAIResponsesTransport, anthropicMessagesUrl, assertSafeProviderUrl, retryModelCall, vertexOpenAIBaseUrl } from "@mathos/models"

function capture() { const bodies: any[] = [], urls: string[] = []; const fetchImpl = (async (input: any, init: any) => { urls.push(String(input)); bodies.push(JSON.parse(init.body)); return Response.json(String(input).endsWith("/messages") ? { content: [{ type: "text", text: "ok" }] } : String(input).endsWith("/responses") ? { status: "completed", output_text: "ok", output: [] } : { choices: [{ message: { content: "ok" } }] }) }) as typeof fetch; return { bodies, urls, fetchImpl } }

describe("provider wire compatibility", () => {
  test("Anthropic-compatible SDK bases reach the Messages API under /v1", () => {
    expect(anthropicMessagesUrl("https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/v1/messages")
    expect(anthropicMessagesUrl("https://api.minimax.io/anthropic")).toBe("https://api.minimax.io/anthropic/v1/messages")
    expect(anthropicMessagesUrl("https://api.z.ai/api/anthropic/")).toBe("https://api.z.ai/api/anthropic/v1/messages")
    expect(anthropicMessagesUrl("https://api.kimi.com/coding/v1")).toBe("https://api.kimi.com/coding/v1/messages")
  })
  test("thinking requests never carry a temperature the vendor rejects", async () => {
    const { bodies, fetchImpl } = capture()
    const anthropic = new AnthropicMessagesTransport({ provider: "anthropic-api", model: "m", baseUrl: "https://api.anthropic.com/v1", apiKey: "k", fetch: fetchImpl })
    await anthropic.generate({ messages: [{ role: "user", content: "x" }], temperature: 0.3, reasoningEffort: "high" })
    await anthropic.generate({ messages: [{ role: "user", content: "x" }], temperature: 0.3 })
    const chat = new OpenAIChatTransport({ provider: "openai-api", model: "gpt-5", baseUrl: "https://api.openai.com/v1", apiKey: "k", fetch: fetchImpl })
    await chat.generate({ messages: [{ role: "user", content: "x" }], temperature: 0.3, reasoningEffort: "medium" })
    expect(bodies[0]).not.toHaveProperty("temperature")
    expect(bodies[0].thinking).toEqual({ type: "adaptive" })
    expect(bodies[1].temperature).toBe(0.3)
    expect(bodies[2]).not.toHaveProperty("temperature")
  })
  test("MathOS max effort becomes a level OpenAI-style endpoints accept", async () => {
    const { bodies, fetchImpl } = capture()
    await new OpenAIResponsesTransport({ provider: "openai-api", model: "gpt-5", baseUrl: "https://api.openai.com/v1", apiKey: "k", fetch: fetchImpl }).generate({ messages: [{ role: "user", content: "x" }], reasoningEffort: "max" })
    await new OpenAIChatTransport({ provider: "openrouter", model: "m", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k", fetch: fetchImpl }).generate({ messages: [{ role: "user", content: "x" }], reasoningEffort: "max" })
    await new OpenAIChatTransport({ provider: "kimi-code-membership", model: "k3", baseUrl: "https://api.kimi.com/coding/v1", apiKey: "k", fetch: fetchImpl, supportedReasoningEfforts: ["none", "low", "medium", "high", "max"] }).generate({ messages: [{ role: "user", content: "x" }], reasoningEffort: "max" })
    expect(bodies[0].reasoning.effort).toBe("xhigh")
    expect(bodies[1].reasoning_effort).toBe("high")
    expect(bodies[2].reasoning_effort).toBe("max")
  })
  test("a 429 waits for Retry-After instead of retrying early", async () => {
    let calls = 0
    const limited = new OpenAIChatTransport({ provider: "p", model: "m", baseUrl: "https://example.com/v1", apiKey: "k", fetch: (async () => { calls++; return calls === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "2" } }) : Response.json({ choices: [{ message: { content: "ok" } }] }) }) as unknown as typeof fetch })
    const sleeps: number[] = []
    expect((await retryModelCall(() => limited.generate({ messages: [{ role: "user", content: "x" }] }), { sleep: async ms => { sleeps.push(ms) } })).value.text).toBe("ok")
    expect(sleeps).toEqual([2_000])
    calls = 0; sleeps.length = 0
    const tooLong = new OpenAIChatTransport({ provider: "p", model: "m", baseUrl: "https://example.com/v1", apiKey: "k", fetch: (async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } })) as unknown as typeof fetch })
    await expect(retryModelCall(() => tooLong.generate({ messages: [{ role: "user", content: "x" }] }), { sleep: async ms => { sleeps.push(ms) } })).rejects.toThrow()
    expect(sleeps).toEqual([])
  })
  test("IPv6 loopback is local and only real private IPv6 literals are private", () => {
    expect(assertSafeProviderUrl("http://[::1]:11434", { allowLoopback: true }).port).toBe("11434")
    expect(() => assertSafeProviderUrl("https://[fd00::1]/v1")).toThrow("PROVIDER_PRIVATE_NETWORK_FORBIDDEN")
    expect(assertSafeProviderUrl("https://fd-api.example.com/v1").hostname).toBe("fd-api.example.com")
    expect(assertSafeProviderUrl("https://fcbarcelona.example/v1").hostname).toBe("fcbarcelona.example")
  })
  test("Vertex global location uses the global host", () => {
    expect(vertexOpenAIBaseUrl("mathos-project", "global")).toBe("https://aiplatform.googleapis.com/v1beta1/projects/mathos-project/locations/global/endpoints/openapi")
    expect(vertexOpenAIBaseUrl("mathos-project", "us-central1")).toStartWith("https://us-central1-aiplatform.googleapis.com/")
  })
})
