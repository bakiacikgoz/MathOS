import { describe, expect, test } from "bun:test"
import { evaluateProviderPolicy, providerCatalog } from "@mathos/models"
import { PROVIDER_STATUS_LABELS, providerCenterSnapshot, providerCenterText } from "../apps/tui/src/ui/ProviderCenter.tsx"
import { providerLoginViewModel } from "../apps/tui/src/ui/ProviderLoginView.tsx"
import { assignModelRole, filterModels } from "../apps/tui/src/ui/ModelPicker.tsx"
import { SLASH_COMMANDS } from "../apps/tui/src/slash.ts"

describe("provider TUI semantics", () => {
  test("shows provider, billing, auth, terms and policy states in wide and narrow layouts", () => {
    const rows = providerCenterSnapshot(providerCatalog.list().map(descriptor => ({ descriptor, policy: evaluateProviderPolicy(descriptor.id) })))
    const wide = providerCenterText(rows), narrow = providerCenterText(rows, true)
    expect(wide).toContain("MODEL PROVIDERS"); expect(wide).toContain("SECRET REQUIRED"); expect(wide).toContain("TERMS RESTRICTED"); expect(wide).toContain("RETIRED")
    expect(narrow).toContain("ollama · LOCAL OFFLINE")
    expect(PROVIDER_STATUS_LABELS).toEqual(["CONNECTED", "LOGIN REQUIRED", "SECRET REQUIRED", "QUOTA EXHAUSTED", "TERMS RESTRICTED", "RETIRED", "LOCAL OFFLINE", "LIVE VERIFIED"])
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
})
