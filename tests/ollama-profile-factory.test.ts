import { afterEach, expect, test } from "bun:test"
import { createProviderFromProfile, EnvironmentSecretStore, ModelTimeout, type ModelProfileV2 } from "@mathos/models"
const servers: Bun.Server<unknown>[] = []
afterEach(() => servers.splice(0).forEach(server => server.stop(true)))
const profile = (baseUrl: string, extra: Partial<ModelProfileV2> = {}): ModelProfileV2 => ({
  schemaVersion: "mathos.model-profile.v2", id: "local-ollama", descriptorId: "ollama", displayName: "Local Ollama", model: "existing-chat", endpointPresetId: "default", baseUrlOverride: baseUrl,
  auth: { kind: "none" }, enabled: true, timeoutMs: 1000, maxResponseBytes: 10000, maxOutputTokens: null, reasoningEffort: null, allowedRoles: ["primary"], requestConcurrency: 1,
  metadata: { createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", migratedFromV1: false }, ...extra,
})
const secrets = new EnvironmentSecretStore({})
test("registered Ollama profile uses native chat with structured schema and no credential header", async () => {
  const requests: any[] = []
  const server = Bun.serve({ port: 0, async fetch(request) {
    requests.push({ path: new URL(request.url).pathname, auth: request.headers.get("authorization"), body: await request.json() })
    return Response.json({ message: { content: '{"ok":true}' }, prompt_eval_count: 12, eval_count: 4 })
  } })
  servers.push(server)
  const provider = await createProviderFromProfile(profile(`http://127.0.0.1:${server.port}`), { secrets })
  const schema = { name: "check", jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } }
  const response = await provider.generate({ messages: [{ role: "user", content: "check" }], responseSchema: schema })
  expect(response.text).toBe('{"ok":true}')
  expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 4 })
  expect(requests).toEqual([{ path: "/api/chat", auth: null, body: { model: "existing-chat", messages: [{ role: "user", content: "check" }], stream: false, format: schema.jsonSchema } }])
})
test("Ollama profile preserves its timeout and response byte limit", async () => {
  const server = Bun.serve({ port: 0, async fetch() { await Bun.sleep(80); return Response.json({ message: { content: "x".repeat(200) } }) } })
  servers.push(server)
  const baseUrl = `http://127.0.0.1:${server.port}`
  const short = await createProviderFromProfile(profile(baseUrl, { timeoutMs: 20 }), { secrets })
  await expect(short.generate({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(ModelTimeout)
  const bounded = await createProviderFromProfile(profile(baseUrl, { maxResponseBytes: 32 }), { secrets })
  await expect(bounded.generate({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("MODEL_RESPONSE_TOO_LARGE")
})
test("local profile factory rejects remote endpoints before any request", async () => {
  for (const descriptorId of ["ollama", "lm-studio", "llama-cpp"]) {
    await expect(createProviderFromProfile(profile("https://remote.example/v1", { descriptorId }), { secrets })).rejects.toThrow("LOCAL_PROVIDER_LAN_REQUIRES_POLICY")
  }
})
