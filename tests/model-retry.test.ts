import { describe, expect, test } from "bun:test"
import { OpenAICompatibleProvider, retryModelCall } from "@mathos/models"

describe("bounded model retry", () => {
  test("retries 429 with bounded Retry-After and transient 5xx only", async () => {
    let attempts = 0; const delays: number[] = []
    const result = await retryModelCall(async () => { attempts++; if (attempts === 1) throw Object.assign(new Error("rate limited"), { status: 429, retryAfterMs: 20 }); if (attempts === 2) throw Object.assign(new Error("transient"), { status: 503 }); return "ok" }, { sleep: async ms => { delays.push(ms) }, random: () => 0, maxTotalDelayMs: 100 })
    expect(result).toEqual({ value: "ok", retries: 2 }); expect(delays).toEqual([20, 80])
  })
  test("does not retry authentication or permanent client errors", async () => {
    let attempts = 0
    await expect(retryModelCall(async () => { attempts++; throw Object.assign(new Error("auth"), { status: 401 }) })).rejects.toThrow("auth")
    expect(attempts).toBe(1)
  })
  test("transport retries rate limits but bounds response bytes", async () => {
    let calls = 0
    const provider = new OpenAICompatibleProvider({ provider: "p", model: "m", baseUrl: "https://example.test/v1", apiKey: "secret", source: { model: "env", baseUrl: "env", apiKey: "env" }, maxResponseBytes: 40 }, (async () => {
      calls++
      if (calls === 1) return new Response("limited", { status: 429, headers: { "retry-after": "0" } })
      return new Response(JSON.stringify({ choices: [{ message: { content: "x".repeat(100) } }] }), { status: 200 })
    }) as unknown as typeof fetch)
    await expect(provider.generate({ messages: [{ role: "user", content: "q" }] })).rejects.toThrow("MODEL_RESPONSE_TOO_LARGE")
    expect(calls).toBe(2)
  })
})
