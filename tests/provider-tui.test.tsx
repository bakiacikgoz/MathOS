import { describe, expect, test } from "bun:test"
import { evaluateProviderPolicy, providerCatalog } from "@mathos/models"
import { PROVIDER_STATUS_LABELS, providerCenterSnapshot, providerCenterText } from "../apps/tui/src/ui/ProviderCenter.tsx"
import * as providerCenterModule from "../apps/tui/src/ui/ProviderCenter.tsx"
import { providerLoginViewModel } from "../apps/tui/src/ui/ProviderLoginView.tsx"
import { assignModelRole, filterModels } from "../apps/tui/src/ui/ModelPicker.tsx"
import { SLASH_COMMANDS } from "../apps/tui/src/slash.ts"

describe("provider TUI semantics", () => {
  test("shows provider, billing, auth, terms and policy states in wide and narrow layouts", () => {
    const rows = providerCenterSnapshot(providerCatalog.list().map(descriptor => ({ descriptor, policy: evaluateProviderPolicy(descriptor.id) })))
    const wide = providerCenterText(rows), narrow = providerCenterText(rows, true)
    expect(wide).toContain("MODEL PROVIDERS"); expect(wide).toContain("SECRET REQUIRED"); expect(wide).toContain("TERMS RESTRICTED"); expect(wide).toContain("RETIRED")
    expect(narrow).toContain("ollama · LOCAL OFFLINE")
    expect(PROVIDER_STATUS_LABELS).toEqual(["CONFIGURED", "CONNECTED", "LOGIN REQUIRED", "SECRET REQUIRED", "QUOTA EXHAUSTED", "TERMS RESTRICTED", "RETIRED", "LOCAL OFFLINE", "LIVE VERIFIED"])
  })
  test("filters model choices by provider, locality, billing, and capability", () => {
    const rows = [{ id:"local-m",provider:"ollama",remote:false,billing:"local",capabilities:["reasoning"] },{ id:"remote-m",provider:"openai",remote:true,billing:"payg",capabilities:["vision"] }]
    expect(filterModels(rows,{remote:false,capability:"reasoning"}).map(row=>row.id)).toEqual(["local-m"])
    expect(filterModels(rows,{provider:"openai",billing:"payg",query:"remote"}).map(row=>row.id)).toEqual(["remote-m"])
    let assignment: { role: string; profile: string } | undefined
    expect(assignModelRole(rows[0]!,"planner",(role,profile)=>{ assignment={role,profile} })).toEqual({role:"planner",profile:"local-m"})
    expect(assignment).toEqual({role:"planner",profile:"local-m"})
  })
  test("keeps device code out of history and exposes keyboard provider command", () => {
    const login=providerLoginViewModel({profileId:"codex-personal",deviceCode:"ABCD-1234"})
    expect(login.displayCode).toBe("ABCD-1234"); expect(`${login.historyText}${login.auditText}`).not.toContain("ABCD-1234")
    expect(SLASH_COMMANDS.map(command=>command.name)).toContain("providers")
  })
  test("provider center exposes persisted profiles and complete keyboard actions", () => {
    const providerProfileCenterSnapshot = (providerCenterModule as any).providerProfileCenterSnapshot
    const providerCenterAction = (providerCenterModule as any).providerCenterAction
    expect(typeof providerProfileCenterSnapshot).toBe("function")
    expect(typeof providerCenterAction).toBe("function")
    const descriptor = providerCatalog.get("openai-codex-chatgpt")!
    const rows = providerProfileCenterSnapshot([
      {
        schemaVersion: "mathos.model-profile.v2",
        id: "codex-subscription",
        descriptorId: descriptor.id,
        displayName: "Codex subscription",
        model: "gpt-5.6-sol",
        endpointPresetId: null,
        baseUrlOverride: null,
        auth: { kind: "upstream-client", accountAlias: null, clientHome: null },
        enabled: true,
        timeoutMs: 60_000,
        maxResponseBytes: 2_000_000,
        maxOutputTokens: null,
        reasoningEffort: null,
        allowedRoles: ["planner", "researcher", "formalizer", "prover"],
        requestConcurrency: 1,
        metadata: { createdAt: "2026-09-04T00:00:00.000Z", updatedAt: "2026-09-04T00:00:00.000Z", migratedFromV1: false },
      },
    ], new Map([[descriptor.id, descriptor]]), {
      planner: "codex-subscription",
      researcher: "codex-subscription",
    })
    expect(rows[0]).toMatchObject({ id: "codex-subscription", descriptor: descriptor.id, model: "gpt-5.6-sol", state: "CONFIGURED", roles: ["planner", "researcher"] })
    expect(providerCenterAction({ name: "down" }, 0, 3)).toEqual({ type: "select", index: 1 })
    expect(providerCenterAction({ name: "up" }, 0, 3)).toEqual({ type: "select", index: 2 })
    expect(providerCenterAction({ name: "return" }, 1, 3)).toEqual({ type: "detail", index: 1 })
    expect(providerCenterAction({ name: "escape" }, 1, 3)).toEqual({ type: "back" })
    expect(providerCenterAction({ name: "p", sequence: "p" }, 0, 1)).toEqual({ type: "assign", role: "planner", index: 0 })
    expect(providerCenterAction({ name: "r", sequence: "r" }, 0, 1)).toEqual({ type: "assign", role: "researcher", index: 0 })
    expect(providerCenterAction({ name: "f", sequence: "f" }, 0, 1)).toEqual({ type: "assign", role: "formalizer", index: 0 })
    expect(providerCenterAction({ name: "v", sequence: "v" }, 0, 1)).toEqual({ type: "assign", role: "prover", index: 0 })
  })
})
