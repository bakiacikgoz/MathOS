import { describe, expect, test } from "bun:test"
import { EnvironmentSecretStore, ModelProfileRegistry, createProfiledModelProvider, parseModelProfiles, probeModelProfile, serializeModelProfiles } from "@mathos/models"

describe("named model profiles", () => {
  test("stores only validated non-secret profile metadata", () => {
    const registry = new ModelProfileRegistry()
    registry.add({ id: "openrouter", type: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model: "m", secretRef: "model.openrouter", remote: true })
    expect(registry.get("openrouter")?.secretRef).toBe("model.openrouter")
    expect(JSON.stringify(registry.list())).not.toContain("api-key-value")
    expect(() => registry.add({ id: "bad", type: "openai-compatible", baseUrl: "file:///tmp/x", model: "m", secretRef: "model.bad", remote: true })).toThrow("MODEL_PROFILE_URL_UNSAFE")
  })
  test("round-trips persistent metadata and rejects secret-shaped fields", () => {
    const profile = { id: "local", type: "openai-compatible" as const, baseUrl: "http://127.0.0.1:1234/v1", model: "m", secretRef: null, remote: false }
    expect(parseModelProfiles(serializeModelProfiles([profile]))).toEqual([{ ...profile, timeoutMs: 60000, maxResponseBytes: 2000000 }])
    expect(() => parseModelProfiles('{"profiles":[{"id":"x","apiKey":"secret"}]}')).toThrow("MODEL_PROFILE_SECRET_FORBIDDEN")
  })
  test("resolves SecretRef at runtime and blocks missing credentials", async () => {
    const profile = { id: "remote", type: "openai-compatible" as const, baseUrl: "https://example.test/v1", model: "m", secretRef: "model.remote", remote: true }
    const provider = await createProfiledModelProvider(profile, new EnvironmentSecretStore({ MATHOS_SECRET_MODEL_REMOTE: "runtime-only" }), { allowRemoteModels: true })
    expect(provider.id).toBe("remote")
    await expect(createProfiledModelProvider(profile, new EnvironmentSecretStore({}), { allowRemoteModels: true })).rejects.toThrow("MODEL_SECRET_MISSING")
  })
  test("health probe distinguishes configured metadata from reachable endpoint", async () => {
    const profile = { id: "local", type: "openai-compatible" as const, baseUrl: "http://127.0.0.1:1234/v1", model: "m", secretRef: null, remote: false }
    expect((await probeModelProfile(profile, new EnvironmentSecretStore({}), async () => new Response("{}"))).state).toBe("VERIFIED")
    const remote = { ...profile, id: "remote", baseUrl: "https://example.test/v1", secretRef: "model.remote", remote: true }
    expect((await probeModelProfile(remote, new EnvironmentSecretStore({}), async () => new Response("{}"))).state).toBe("BLOCKED")
  })
})
