import { describe, expect, test } from "bun:test"
import { FileModelUsageLedger, ModelProfileRegistry, ModelRouter, createModelRequestSnapshot, loadMathOSConfig } from "@mathos/models"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const profile = (id: string, remote = true) => ({ id, type: "openai-compatible" as const, baseUrl: remote ? `https://${id}.test/v1` : "http://127.0.0.1:11434/v1", model: id, secretRef: remote ? `model.${id}` : null, remote })

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
  test("upgrades old usage rows and strips unsafe snapshot fields", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mathos-ledger-v2-")), "usage.jsonl")
    writeFileSync(path, `${JSON.stringify({ profileId: "p", model: "m", role: "planner", durationMs: 1, retries: 0, success: true })}\n`)
    const ledger = new FileModelUsageLedger(path)
    expect(ledger.current()[0]?.schemaVersion).toBe("mathos.model-usage.v2")
    const snapshot = createModelRequestSnapshot({ researchRunId: "RR-1", profileId: "p", descriptorId: "openai-api", model: "m", catalogRevision: "2026-09-02", role: "planner", apiKey: "secret", accountEmail: "x@example.test" } as never)
    expect(snapshot).toEqual({ researchRunId: "RR-1", profileId: "p", descriptorId: "openai-api", model: "m", catalogRevision: "2026-09-02", role: "planner" })
  })
})
