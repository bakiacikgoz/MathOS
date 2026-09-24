import { describe, expect, test } from "bun:test"
import { EnvironmentSecretStore, MODEL_PROFILE_V2_SCHEMA, createDirectProvider, evaluateProviderPolicy, providerCatalog, type ModelProfileV2 } from "@mathos/models"

const secrets = new EnvironmentSecretStore({ MATHOS_SECRET_MODEL_OPENCODE: "secret" })
function profile(descriptorId: string, model: string, overrides: Partial<ModelProfileV2> = {}): ModelProfileV2 {
  return { schemaVersion: MODEL_PROFILE_V2_SCHEMA, id: "opencode", descriptorId, displayName: "OpenCode", model, endpointPresetId: null, baseUrlOverride: null, auth: { kind: "secret-ref", secretRef: "model.opencode" }, enabled: true, timeoutMs: 1000, maxResponseBytes: 10000, maxOutputTokens: null, reasoningEffort: null, allowedRoles: ["primary"], requestConcurrency: 1, metadata: { createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z", migratedFromV1: false }, ...overrides }
}
function recorder() {
  const calls: Array<{ path: string; headers: Headers }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    calls.push({ path, headers: new Headers(init?.headers) })
    if (path.endsWith("/messages")) return Response.json({ content: [{ type: "text", text: "ok" }] })
    if (path.endsWith("/responses")) return Response.json({ output_text: "ok" })
    return Response.json({ choices: [{ message: { content: "ok" } }] })
  }) as typeof fetch
  return { calls, fetchImpl }
}
const hi = [{ role: "user" as const, content: "hi" }]

describe("OpenCode gateways", () => {
  test("Go is an allowed subscription plan with the official endpoint and model list", () => {
    const go = providerCatalog.get("opencode-go")!
    expect(go.billingClass).toBe("subscription")
    expect(go.endpointPresets[0]!.baseUrl).toBe("https://opencode.ai/zen/go/v1")
    expect(go.modelDiscovery).toEqual({ kind: "openai-models", path: "/models" })
    expect(go.defaultModels).toContain("kimi-k3")
    expect(go.defaultModels).toContain("glm-5.1")
    expect(evaluateProviderPolicy("opencode-go").allowed).toBe(true)
    const zen = providerCatalog.get("opencode-zen")!
    expect(zen.billingClass).toBe("payg")
    expect(zen.defaultModels).not.toContain("gemini-3.1-pro")
  })

  test("routes each Go model over its documented wire protocol", async () => {
    const { calls, fetchImpl } = recorder()
    for (const model of ["glm-5.1", "gpt-6-luna", "minimax-m2.7", "some-future-model"]) {
      const provider = await createDirectProvider(profile("opencode-go", model), { secrets, fetch: fetchImpl })
      await provider.generate({ messages: hi })
    }
    expect(calls.map(call => call.path)).toEqual(["/zen/go/v1/chat/completions", "/zen/go/v1/responses", "/zen/go/v1/messages", "/zen/go/v1/chat/completions"])
  })

  test("routes Zen models to Responses, Messages or Chat and refuses Gemini-native models", async () => {
    const { calls, fetchImpl } = recorder()
    for (const model of ["gpt-5.5", "claude-sonnet-5", "deepseek-v4-pro"]) {
      const provider = await createDirectProvider(profile("opencode-zen", model), { secrets, fetch: fetchImpl })
      await provider.generate({ messages: hi })
    }
    expect(calls.map(call => call.path)).toEqual(["/zen/v1/responses", "/zen/v1/messages", "/zen/v1/chat/completions"])
    await expect(createDirectProvider(profile("opencode-zen", "gemini-3.1-pro"), { secrets, fetch: fetchImpl })).rejects.toThrow("PROVIDER_MODEL_PROTOCOL_UNSUPPORTED")
  })

  test("an explicit protocol preset overrides the model table", async () => {
    const { calls, fetchImpl } = recorder()
    const provider = await createDirectProvider(profile("opencode-go", "glm-5.1", { endpointPresetId: "anthropic-messages" }), { secrets, fetch: fetchImpl })
    await provider.generate({ messages: hi })
    expect(calls[0]!.path).toBe("/zen/go/v1/messages")
  })

  test("sends a truthful User-Agent and a stable per-conversation session header", async () => {
    const { calls, fetchImpl } = recorder()
    const provider = await createDirectProvider(profile("opencode-go", "glm-5.1"), { secrets, fetch: fetchImpl })
    await provider.generate({ messages: hi, researchRunId: "RR-001" })
    await provider.generate({ messages: hi, researchRunId: "RR-001" })
    await provider.generate({ messages: hi, researchRunId: "RR-002" })
    await provider.generate({ messages: hi })
    await provider.generate({ messages: hi })
    const sessions = calls.map(call => call.headers.get("x-opencode-session"))
    expect(calls[0]!.headers.get("user-agent")).toMatch(/^MathOS\/\d/)
    expect(sessions[0]).toBe(sessions[1]!)
    expect(sessions[2]).not.toBe(sessions[0]!)
    expect(sessions[3]).toBe(sessions[4]!)
    expect(sessions.every(value => typeof value === "string" && value.length >= 16)).toBe(true)
    expect(sessions[0]).not.toContain("RR-001")
  })

  test("providers without a session requirement do not receive the header", async () => {
    const { calls, fetchImpl } = recorder()
    const provider = await createDirectProvider(profile("deepseek-api", "deepseek-v4-pro"), { secrets, fetch: fetchImpl })
    await provider.generate({ messages: hi, researchRunId: "RR-001" })
    expect(calls[0]!.headers.get("x-opencode-session")).toBeNull()
  })
})
