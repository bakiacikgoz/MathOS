import { runJson } from "./bridge.ts"
import { useQuery } from "./query.ts"

// Shapes of `mathos provider catalog|list|status --json`; only the fields the desktop reads.
export type WireProtocol = "openai-chat" | "openai-responses" | "anthropic-messages"
export interface ProviderDescriptor {
  id: string; displayName: string; vendor: string; category: "subscription" | "api" | "plan" | "local" | "generic"
  transport: string; authKinds: string[]; billingClass: string; remote: boolean
  terms: { policy: string; summary: string; officialSources: string[] }
  endpointPresets: Array<{ id: string; baseUrl: string; protocol: string }>
  defaultModels: string[]; modelProtocols?: Array<{ model: string; protocol: WireProtocol | "unsupported" }>
}
export interface CatalogEntry { descriptor: ProviderDescriptor; policy: { allowed: boolean; code: string; remediation: string | null } }
export interface ProfileRow { id: string; descriptorId: string; model: string; auth: { kind: string; secretRef?: string }; endpointPresetId?: string | null; baseUrlOverride?: string | null; extraHeaders?: Record<string, string> }
export interface StatusRow { profile: string; descriptor: string; connection: string; model: string; billing: string; terms: string; auth: string }

export const providerKeys = { all: "providers|", catalog: "providers|catalog", list: "providers|list", status: "providers|status" }
export const useCatalog = (root: string) => useQuery(providerKeys.catalog, () => runJson<{ providers: CatalogEntry[] }>(root, ["provider", "catalog"]), 5 * 60_000)
export const useProfiles = (root: string) => useQuery(providerKeys.list, () => runJson<{ defaultProfile: string | null; profiles: ProfileRow[] }>(root, ["provider", "list"]))
export const useProviderStatus = (root: string) => useQuery(providerKeys.status, () => runJson<{ profiles: StatusRow[] }>(root, ["provider", "status"]))

export const isGeneric = (descriptor: ProviderDescriptor) => descriptor.id.startsWith("generic-")
/** Gateways (one key, several wire protocols) and generic endpoints accept an explicit protocol. */
export const acceptsProtocol = (descriptor: ProviderDescriptor) => isGeneric(descriptor) || Boolean(descriptor.modelProtocols?.length)
/** Official-client providers (Codex, Claude Code, Copilot, Gemini/Qwen CLI) sign in through their own client. */
export const usesUpstreamLogin = (descriptor: ProviderDescriptor) => descriptor.authKinds.includes("upstream-client") || descriptor.authKinds.includes("copilot-logged-in-user")

export interface ConfigureInput { descriptor: ProviderDescriptor; profile: string; model: string; baseUrl?: string; protocol?: WireProtocol | ""; headers?: string }

/** Builds `provider configure` arguments. Secrets are never part of them; headers are validated again by the CLI. */
export function configureArgs(input: ConfigureInput): string[] {
  const args = ["provider", "configure", input.descriptor.id, "--profile", input.profile.trim(), "--model", input.model.trim() || "auto"]
  if (isGeneric(input.descriptor) && input.baseUrl?.trim()) args.push("--base-url", input.baseUrl.trim())
  if (input.protocol && acceptsProtocol(input.descriptor)) args.push("--protocol", input.protocol)
  if (isGeneric(input.descriptor)) for (const line of (input.headers ?? "").split("\n").map((value) => value.trim()).filter(Boolean)) args.push("--header", line)
  return args
}

const WIRE: readonly string[] = ["openai-chat", "openai-responses", "anthropic-messages"]
/** The wizard form for a saved profile, so returning to "Set up" shows what is stored. */
export function formFromProfile(descriptor: ProviderDescriptor, profile: ProfileRow) {
  const protocol: WireProtocol | "" = acceptsProtocol(descriptor) && profile.endpointPresetId && WIRE.includes(profile.endpointPresetId) && (isGeneric(descriptor) || profile.endpointPresetId !== descriptor.endpointPresets[0]?.id) ? profile.endpointPresetId as WireProtocol : ""
  return { profile: profile.id, model: profile.model === "auto" ? "" : profile.model, baseUrl: profile.baseUrlOverride ?? "", protocol, headers: Object.entries(profile.extraHeaders ?? {}).map(([name, value]) => `${name}: ${value}`).join("\n") }
}

export const validProfileId = (value: string) => /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value.trim())
export const suggestProfileId = (descriptor: ProviderDescriptor, taken: string[]) => {
  const base = descriptor.id.replace(/-(api|payg|account)$/, "").slice(0, 56)
  let candidate = `${base}-main`, index = 2
  while (taken.includes(candidate)) candidate = `${base}-${index++}`
  return candidate
}
/** The environment variable the Linux/CI secret fallback reads for a secret reference. */
export const secretEnvName = (ref: string) => `MATHOS_SECRET_${ref.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`

export type ProviderGroup = "plan" | "api" | "local" | "generic"
export const groupOf = (descriptor: ProviderDescriptor): ProviderGroup => descriptor.category === "generic" ? "generic" : descriptor.category === "local" ? "local" : descriptor.category === "api" ? "api" : "plan"
