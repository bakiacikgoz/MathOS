import { describe, expect, test } from "bun:test"
import { parseModelProfilesV2, ProviderProfileRegistry, serializeModelProfilesV2, validateModelProfileV2, type ModelProfileV2 } from "@mathos/models"

const profile: ModelProfileV2 = {
  schemaVersion: "mathos.model-profile.v2", id: "openrouter-research", descriptorId: "openrouter", displayName: "OpenRouter Research",
  model: "openai/example", endpointPresetId: "global", baseUrlOverride: null, auth: { kind: "secret-ref", secretRef: "model.openrouter-research" },
  enabled: true, timeoutMs: 60_000, maxResponseBytes: 2_000_000, maxOutputTokens: 4096, reasoningEffort: "high",
  allowedRoles: ["planner", "prover"], requestConcurrency: 1,
  metadata: { createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", migratedFromV1: false },
}

describe("model profile v2", () => {
  test("round-trips canonical metadata", () => expect(parseModelProfilesV2(serializeModelProfilesV2([profile]))).toEqual([profile]))
  test("registry isolates stored profiles from caller mutation", () => { const registry=new ProviderProfileRegistry([profile]);const read=registry.get(profile.id)!;read.auth={kind:"none"};expect(registry.get(profile.id)?.auth).toEqual(profile.auth) })
  test("rejects recursively nested secret-shaped fields", () => {
    const raw = JSON.parse(serializeModelProfilesV2([profile])); raw.profiles[0].metadata.nested = { accessToken: "forbidden" }
    expect(() => parseModelProfilesV2(JSON.stringify(raw))).toThrow("MODEL_PROFILE_SECRET_FORBIDDEN")
  })
  test("rejects unsafe endpoint overrides", () => {
    expect(() => validateModelProfileV2({ ...profile, baseUrlOverride: "http://remote.example/v1" })).toThrow("MODEL_PROFILE_URL_UNSAFE")
    expect(validateModelProfileV2({ ...profile, descriptorId: "ollama", baseUrlOverride: "http://127.0.0.1:11434" }).baseUrlOverride).toBe("http://127.0.0.1:11434")
  })
})
