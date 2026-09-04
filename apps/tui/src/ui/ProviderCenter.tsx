/** @jsxImportSource @opentui/solid */
import { createSignal, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { evaluateProviderPolicy, type ModelProfileV2, type ProviderDescriptor, type ProviderPolicyResult } from "@mathos/models"
import { theme } from "../theme.ts"

export type ProviderStatusLabel = "CONFIGURED" | "CONNECTED" | "LOGIN REQUIRED" | "SECRET REQUIRED" | "QUOTA EXHAUSTED" | "TERMS RESTRICTED" | "RETIRED" | "LOCAL OFFLINE" | "LIVE VERIFIED"
export const PROVIDER_STATUS_LABELS: ProviderStatusLabel[] = ["CONFIGURED", "CONNECTED", "LOGIN REQUIRED", "SECRET REQUIRED", "QUOTA EXHAUSTED", "TERMS RESTRICTED", "RETIRED", "LOCAL OFFLINE", "LIVE VERIFIED"]
export interface ProviderCenterRow { id: string; name: string; state: ProviderStatusLabel; billing: string; auth: string; terms: string; remote: boolean; descriptor?: string; model?: string; roles?: string[] }
export type ProviderCenterAction = { type: "select" | "detail"; index: number } | { type: "assign"; role: "planner" | "researcher" | "formalizer" | "prover"; index: number } | { type: "back" } | { type: "none" }

function descriptorState(descriptor: ProviderDescriptor, policy: ProviderPolicyResult): ProviderStatusLabel {
  return policy.code === "PROVIDER_RETIRED" ? "RETIRED" : !policy.allowed ? "TERMS RESTRICTED" : !descriptor.remote ? "LOCAL OFFLINE" : descriptor.authKinds.includes("secret-ref") ? "SECRET REQUIRED" : "LOGIN REQUIRED"
}

export function providerCenterSnapshot(entries: Array<{ descriptor: ProviderDescriptor; policy: ProviderPolicyResult }>): ProviderCenterRow[] { return entries.map(({ descriptor, policy }) => ({ id: descriptor.id, name: descriptor.displayName, state: descriptorState(descriptor, policy), billing: descriptor.billingClass, auth: descriptor.authKinds.join(", ") || "none", terms: descriptor.terms.policy, remote: descriptor.remote, descriptor: descriptor.id })) }

export function providerProfileCenterSnapshot(profiles: ModelProfileV2[], descriptors: Map<string, ProviderDescriptor>, assignedRoles: Record<string, string>): ProviderCenterRow[] {
  return profiles.map((profile) => {
    const descriptor = descriptors.get(profile.descriptorId)
    if (!descriptor) throw new Error(`PROVIDER_DESCRIPTOR_NOT_FOUND: ${profile.descriptorId}`)
    const policy = descriptorState(descriptor, evaluateProviderPolicy(descriptor.id))
    const roles = Object.entries(assignedRoles).filter(([, id]) => id === profile.id).map(([role]) => role).sort()
    return { id: profile.id, name: profile.displayName, state: profile.enabled && policy !== "TERMS RESTRICTED" && policy !== "RETIRED" ? "CONFIGURED" : policy, billing: descriptor.billingClass, auth: profile.auth.kind, terms: descriptor.terms.policy, remote: descriptor.remote, descriptor: descriptor.id, model: profile.model, roles }
  })
}

export function providerCenterAction(key: { name?: string; sequence?: string }, index: number, count: number): ProviderCenterAction {
  if (key.name === "escape") return { type: "back" }
  if (count < 1) return { type: "none" }
  if (key.name === "up" || key.name === "down") return { type: "select", index: (index + (key.name === "up" ? -1 : 1) + count) % count }
  if (key.name === "return") return { type: "detail", index }
  const roles = { p: "planner", r: "researcher", f: "formalizer", v: "prover" } as const
  const role = roles[(key.sequence ?? key.name ?? "").toLowerCase() as keyof typeof roles]
  return role ? { type: "assign", role, index } : { type: "none" }
}

export function providerCenterText(rows: ProviderCenterRow[], compact=false): string { return ["MODEL PROVIDERS", "Keyboard: ↑/↓ select · Enter details · Esc back", ...rows.map(row => compact ? `${row.id} · ${row.state}` : `${row.id.padEnd(30)} ${row.state.padEnd(18)} ${row.billing.padEnd(12)} ${row.auth}`)].join("\n") }
export function ProviderCenter(props: { rows: ProviderCenterRow[]; compact?: boolean; onBack?: () => void; onDetail?: (row: ProviderCenterRow) => void; onAssign?: (role: "planner" | "researcher" | "formalizer" | "prover", row: ProviderCenterRow) => void }) {
  const [index, setIndex] = createSignal(0)
  const [detail, setDetail] = createSignal<ProviderCenterRow | null>(null)
  useKeyboard((key) => {
    if (key.name === "escape" && detail()) { key.stopPropagation(); setDetail(null); return }
    const action = providerCenterAction(key, index(), props.rows.length)
    if (action.type === "none") return
    key.stopPropagation()
    if (action.type === "back") props.onBack?.()
    else if (action.type === "select") setIndex(action.index)
    else if (action.type === "detail") { const row = props.rows[action.index]; if (row) { setDetail(row); props.onDetail?.(row) } }
    else if (action.type === "assign") { const row = props.rows[action.index]; if (row) props.onAssign?.(action.role, row) }
  })
  return <box flexGrow={1} padding={1} flexDirection="column"><text fg={theme.accent}>MODEL PROFILES</text><text fg={theme.textMuted}>{props.compact ? "↑/↓ select · Enter details · P/R/F/V assign · Esc" : "Keyboard: ↑/↓ select · Enter details · P planner · R researcher · F formalizer · V prover · Esc back"}</text><For each={props.rows}>{(row, rowIndex) => <text fg={rowIndex() === index() ? theme.accent : row.state === "TERMS RESTRICTED" || row.state === "RETIRED" ? theme.warning : theme.text}>{props.compact ? `${rowIndex() === index() ? ">" : " "} ${row.id} · ${row.model ?? row.state}` : `${rowIndex() === index() ? ">" : " "} ${row.id.padEnd(24)} ${(row.model ?? row.state).padEnd(22)} ${(row.roles?.join(",") || "unassigned").padEnd(30)} ${row.state}`}</text>}</For><Show when={!props.rows.length}><text fg={theme.textMuted}>No configured profiles. Use `mathos provider configure` first.</text></Show><Show when={detail()}><box marginTop={1} padding={1} border borderColor={theme.border} flexDirection="column"><text fg={theme.blue}>{detail()!.name}</text><text fg={theme.text}>{`profile ${detail()!.id} · provider ${detail()!.descriptor} · model ${detail()!.model}`}</text><text fg={theme.textMuted}>{`auth ${detail()!.auth} · billing ${detail()!.billing} · roles ${detail()!.roles?.join(", ") || "unassigned"}`}</text><text fg={theme.textMuted}>Esc closes details</text></box></Show></box>
}
