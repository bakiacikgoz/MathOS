import { describe, expect, test } from "bun:test"
import { FileModelUsageLedger, ModelProfileRegistry, ModelRouter, ProviderProfileRegistry, ProviderProfileRouter, connectModelRoutes, createModelRequestSnapshot, loadMathOSConfig, type ModelProfileV2, type ModelRole } from "@mathos/models"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const profile = (id: string, remote = true) => ({ id, type: "openai-compatible" as const, baseUrl: remote ? `https://${id}.test/v1` : "http://127.0.0.1:11434/v1", model: id, secretRef: remote ? `model.${id}` : null, remote })
const providerProfile = (id: string, descriptorId: string, roles: ModelRole[], enabled = true): ModelProfileV2 => ({
  schemaVersion: "mathos.model-profile.v2", id, descriptorId, displayName: id, model: `${id}-model`, endpointPresetId: null, baseUrlOverride: null,
  auth: { kind: "none" }, enabled, timeoutMs: 1_000, maxResponseBytes: 100_000, maxOutputTokens: null, reasoningEffort: null,
  allowedRoles: roles, requestConcurrency: 1, metadata: { createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z", migratedFromV1: false },
})

describe("safe model routing v2", () => {
  test("parses per-role fallback policy", () => {
    const { config } = loadMathOSConfig({ workspaceToml: `[model]\ndefault_profile = "codex-personal"\n[model.roles]\nplanner = "codex-personal"\n[model.fallback.planner]\nprofiles = ["codex-personal", "ollama-local"]\nallow_billing_transition = false\nallow_local_to_remote_transition = false\n` })
    expect(config.model.fallback.planner).toEqual({ profiles: ["codex-personal", "ollama-local"], allow_billing_transition: false, allow_local_to_remote_transition: false })
  })
  test("uses a safe fallback and exposes quota exhaustion", () => {
    const registry = new ModelProfileRegistry([profile("primary"), profile("backup")])
    const router = new ModelRouter(registry, { defaultProfile: "primary", fallback: { planner: { profiles: ["backup"] } }, metadata: { primary: { billingClass: "subscription", remote: true, connectionState: "QUOTA_EXHAUSTED" }, backup: { billingClass: "subscription", remote: true, connectionState: "CONNECTED" } } })
    expect(router.resolveWithState("planner")).toMatchObject({ state: "FALLBACK", selected: { profileId: "backup" } })
    const exhausted = new ModelRouter(registry, { defaultProfile: "primary", metadata: { primary: { billingClass: "subscription", remote: true, connectionState: "QUOTA_EXHAUSTED" } } })
    expect(exhausted.resolveWithState("planner").state).toBe("QUOTA_EXHAUSTED")
  })
  test("resolves configured v2 profiles by role and rejects disabled or disallowed profiles", () => {
    const registry = new ProviderProfileRegistry([
      providerProfile("default", "openai-codex-chatgpt", ["primary", "formalizer"]),
      providerProfile("planner", "openai-codex-chatgpt", ["planner"]),
      providerProfile("researcher", "openai-codex-chatgpt", ["researcher"]),
      providerProfile("disabled", "openai-codex-chatgpt", ["prover"], false),
    ])
    const router = new ProviderProfileRouter(registry, { defaultProfile: "default", roles: { planner: "planner", researcher: "researcher", prover: "disabled" } })
    expect(router.resolve("planner").model).toBe("planner-model")
    expect(router.resolve("researcher").model).toBe("researcher-model")
    expect(router.resolve("formalizer").model).toBe("default-model")
    expect(() => router.resolve("prover")).toThrow("MODEL_ROUTE_UNAVAILABLE: prover")
    expect(() => router.resolve("checker")).toThrow("MODEL_ROUTE_UNAVAILABLE: checker")
  })
  test("uses only explicitly configured v2 fallbacks and keeps billing transitions blocked by default", () => {
    const registry = new ProviderProfileRegistry([
      providerProfile("offline", "openai-codex-chatgpt", ["planner"], false),
      providerProfile("subscription-backup", "openai-codex-chatgpt", ["planner"]),
      providerProfile("payg-backup", "openai-api", ["planner"]),
      providerProfile("terms-blocked", "zai-coding-plan", ["researcher"]),
    ])
    const safe = new ProviderProfileRouter(registry, { defaultProfile: "offline", fallback: { planner: { profiles: ["subscription-backup"] } } })
    expect(safe.resolveWithState("planner")).toMatchObject({ state: "FALLBACK", selected: { profileId: "subscription-backup" } })
    const billingBlocked = new ProviderProfileRouter(registry, { defaultProfile: "offline", fallback: { planner: { profiles: ["payg-backup"] } } })
    expect(billingBlocked.resolveWithState("planner")).toMatchObject({ state: "UNAVAILABLE", selected: null })
    const policyBlocked = new ProviderProfileRouter(registry, { roles: { researcher: "terms-blocked" } })
    expect(policyBlocked.resolveWithState("researcher")).toMatchObject({ state: "UNAVAILABLE", selected: null })
  })
  test("connects and closes each selected profile once when roles share it", async () => {
    const registry = new ProviderProfileRegistry([providerProfile("shared", "openai-codex-chatgpt", ["planner", "researcher"])])
    const router = new ProviderProfileRouter(registry, { defaultProfile: "shared" })
    let created = 0, connected = 0, closed = 0
    const routed = await connectModelRoutes(router, ["planner", "researcher"], async profile => {
      created++
      return { id: profile.id, model: profile.model, capabilities: { structuredOutput: true, toolCalling: false, reasoning: true, streaming: false, vision: false }, generate: async () => { throw new Error("unused") }, generateStructured: async () => { throw new Error("unused") }, connect: async () => { connected++ }, close: async () => { closed++ } }
    })
    expect(routed.providers.planner).toBe(routed.providers.researcher)
    expect({ created, connected }).toEqual({ created: 1, connected: 1 })
    await routed.close()
    await routed.close()
    expect(closed).toBe(1)
  })
  test("upgrades old usage rows and strips unsafe snapshot fields", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mathos-ledger-v2-")), "usage.jsonl")
    writeFileSync(path, `${JSON.stringify({ profileId: "p", model: "m", role: "planner", durationMs: 1, retries: 0, success: true })}\n`)
    const ledger = new FileModelUsageLedger(path)
    expect(ledger.current()[0]?.schemaVersion).toBe("mathos.model-usage.v2")
    const snapshot = createModelRequestSnapshot({ researchRunId: "RR-1", profileId: "p", descriptorId: "openai-api", model: "m", catalogRevision: "2026-09-02", role: "planner", apiKey: "secret", accountEmail: "x@example.test" } as never)
    expect(snapshot).toEqual({ researchRunId: "RR-1", profileId: "p", descriptorId: "openai-api", model: "m", catalogRevision: "2026-09-02", role: "planner" })
  })
})
