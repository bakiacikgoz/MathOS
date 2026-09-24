import { describe, expect, test } from "bun:test"
import { EnvironmentSecretStore, MODEL_PROFILE_V2_SCHEMA, createDirectProvider, validateModelProfileV2, type ModelProfileV2 } from "@mathos/models"

const secrets = new EnvironmentSecretStore({ MATHOS_SECRET_MODEL_GW: "secret" })
function profile(overrides: Partial<ModelProfileV2> = {}): ModelProfileV2 {
  return { schemaVersion: MODEL_PROFILE_V2_SCHEMA, id: "gw", descriptorId: "generic-openai-compatible", displayName: "Gateway", model: "m1", endpointPresetId: "openai-chat", baseUrlOverride: "https://llm.example.test/v1", auth: { kind: "secret-ref", secretRef: "model.gw" }, enabled: true, timeoutMs: 1000, maxResponseBytes: 10000, maxOutputTokens: null, reasoningEffort: null, allowedRoles: ["primary"], requestConcurrency: 1, metadata: { createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z", migratedFromV1: false }, ...overrides }
}

describe("generic provider headers", () => {
  test("sends validated extra headers and a stable session header", async () => {
    const seen: Headers[] = []
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Headers(init?.headers)); return Response.json({ choices: [{ message: { content: "ok" } }] }) }) as typeof fetch
    const valid = validateModelProfileV2(profile({ extraHeaders: { "X-Title": "MathOS" }, sessionHeader: "X-Session-Id" }))
    expect(valid.extraHeaders).toEqual({ "x-title": "MathOS" })
    const provider = await createDirectProvider(valid, { secrets, fetch: fetchImpl })
    await provider.generate({ messages: [{ role: "user", content: "hi" }], researchRunId: "RR-9" })
    await provider.generate({ messages: [{ role: "user", content: "hi" }], researchRunId: "RR-9" })
    expect(seen[0]!.get("x-title")).toBe("MathOS")
    expect(seen[0]!.get("authorization")).toBe("Bearer secret")
    expect(seen[0]!.get("x-session-id")).toBe(seen[1]!.get("x-session-id")!)
  })

  test("refuses headers that could carry credentials or break the request", () => {
    for (const name of ["Authorization", "X-Api-Key", "x-auth-token", "Cookie", "Proxy-Authorization"]) expect(() => validateModelProfileV2(profile({ extraHeaders: { [name]: "v" } }))).toThrow("MODEL_PROFILE_SECRET_FORBIDDEN")
    expect(() => validateModelProfileV2(profile({ extraHeaders: { Host: "evil.test" } }))).toThrow("MODEL_PROFILE_HEADER_RESERVED")
    expect(() => validateModelProfileV2(profile({ extraHeaders: { "X-Title": "a\r\nInjected: 1" } }))).toThrow("MODEL_PROFILE_HEADER_INVALID")
    expect(() => validateModelProfileV2(profile({ extraHeaders: { "bad header": "v" } }))).toThrow("MODEL_PROFILE_HEADER_INVALID")
  })

  test("curated providers keep their own identity headers", () => {
    expect(() => validateModelProfileV2(profile({ descriptorId: "deepseek-api", baseUrlOverride: null, extraHeaders: { "X-Title": "x" } }))).toThrow("MODEL_PROFILE_HEADERS_GENERIC_ONLY")
    expect(() => validateModelProfileV2(profile({ descriptorId: "deepseek-api", baseUrlOverride: null, sessionHeader: "x-session" }))).toThrow("MODEL_PROFILE_HEADERS_GENERIC_ONLY")
  })
})
