import { describe, expect, test } from "bun:test"
import { createProviderFromProfile, MODEL_PROFILE_V2_SCHEMA, type ClaudeCommandRunner, type ModelProfileV2 } from "@mathos/models"
import { runProviderLiveSmoke } from "../scripts/providers/live-smoke.ts"

// "auto" on an official-client profile means "the client's own default model"; direct API profiles still need a concrete model.
const profile = (id: string, descriptorId: string, auth: ModelProfileV2["auth"]): ModelProfileV2 => { const now = new Date().toISOString(); return { schemaVersion: MODEL_PROFILE_V2_SCHEMA, id, descriptorId, displayName: id, model: "auto", endpointPresetId: null, baseUrlOverride: null, auth, enabled: true, timeoutMs: 1000, maxResponseBytes: 1000, maxOutputTokens: 8, reasoningEffort: null, allowedRoles: ["planner"], requestConcurrency: 1, metadata: { createdAt: now, updatedAt: now, migratedFromV1: false } } }
const upstream = { kind: "upstream-client", accountAlias: null, clientHome: null } as const

class Runner implements ClaudeCommandRunner {
  calls: string[][] = []
  async run(_executable: string, args: string[]) { this.calls.push(args); return { exitCode: 0, stdout: `${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "answer" }] } })}\n${JSON.stringify({ type: "result" })}\n`, stderr: "" } }
}

describe("client default model", () => {
  test("an official client profile set to auto lets the client choose its model", async () => {
    const runner = new Runner()
    const provider = await createProviderFromProfile(profile("claude", "claude-code-account", upstream), { secrets: {} as any, claude: { executable: "claude", runner } })
    expect((await provider.generate({ messages: [{ role: "user", content: "hi" }] })).text).toBe("answer")
    expect(runner.calls.flat()).not.toContain("--model")
  })

  test("a direct API profile set to auto is still unresolved", async () => {
    await expect(createProviderFromProfile(profile("api", "openai-api", { kind: "secret-ref", secretRef: "model.api" }), { secrets: {} as any })).rejects.toThrow("PROFILE_MODEL_AUTO_UNRESOLVED")
    const result = await runProviderLiveSmoke(["api", "--live", "--accept-usage"], { profiles: [profile("api", "openai-api", { kind: "secret-ref", secretRef: "model.api" })] })
    expect(result).toMatchObject({ connection: "NOT_CONFIGURED", liveRequest: "MODEL_UNRESOLVED" })
  })

  test("the live test runs an official client profile set to auto", async () => {
    const result = await runProviderLiveSmoke(["codex", "--live"], { profiles: [profile("codex", "openai-codex-chatgpt", upstream)], createProvider: async () => ({ id: "fake", model: "auto", capabilities: {} as any, generate: async () => ({ text: '{"mathos_live_provider_smoke":true}', provider: "fake", model: "auto" }), generateStructured: async () => ({}) as any }) })
    expect(result).toMatchObject({ connection: "CONNECTED", liveRequest: "PASS" })
  })
})
