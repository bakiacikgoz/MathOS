export type ModelProfileType = "openai-compatible"
export interface ModelProfile { id: string; type: ModelProfileType; baseUrl: string; model: string; secretRef: string | null; remote: boolean; timeoutMs?: number; maxResponseBytes?: number }
import type { ModelProfileV2 } from "./profiles/types.ts"
import { MODEL_PROFILE_STORE_V2_SCHEMA, MODEL_PROFILE_V2_SCHEMA } from "./profiles/types.ts"
import type { ModelRole } from "./types.ts"
const ROLES = new Set<ModelRole>(["primary","auditor","alignment","planner","repair","intake","formalizer","prover","checker","literature_synthesis","researcher"])
const FORBIDDEN = /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|session[_-]?token|password|client[_-]?secret|authorization)$/i
const LOCAL_DESCRIPTORS = new Set(["ollama", "lm-studio", "llama-cpp"])
function rejectSecrets(value: unknown): void { if (Array.isArray(value)) { value.forEach(rejectSecrets); return } if (!value || typeof value !== "object") return; for (const [key, nested] of Object.entries(value)) { if (FORBIDDEN.test(key)) throw new Error("MODEL_PROFILE_SECRET_FORBIDDEN"); rejectSecrets(nested) } }
function validId(value: string, code: string) { if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value)) throw new Error(code) }
function validateOverride(profile: ModelProfileV2): string | null { if (!profile.baseUrlOverride) return null; let url: URL; try { url = new URL(profile.baseUrlOverride) } catch { throw new Error("MODEL_PROFILE_URL_INVALID") }; const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname); if (!loopback && !LOCAL_DESCRIPTORS.has(profile.descriptorId) && url.protocol !== "https:") throw new Error("MODEL_PROFILE_URL_UNSAFE"); if (LOCAL_DESCRIPTORS.has(profile.descriptorId) && (!loopback || !["http:", "https:"].includes(url.protocol))) throw new Error("LOCAL_MODEL_MUST_USE_LOOPBACK"); return profile.baseUrlOverride.replace(/\/$/, "") }
export function validateModelProfileV2(profile: ModelProfileV2): ModelProfileV2 { rejectSecrets(profile); if (profile.schemaVersion !== MODEL_PROFILE_V2_SCHEMA) throw new Error("MODEL_PROFILE_SCHEMA_UNSUPPORTED"); validId(profile.id, "MODEL_PROFILE_ID_INVALID"); validId(profile.descriptorId, "PROVIDER_DESCRIPTOR_ID_INVALID"); if (!profile.displayName.trim()) throw new Error("MODEL_PROFILE_DISPLAY_NAME_REQUIRED"); if (!profile.model.trim()) throw new Error("MODEL_PROFILE_MODEL_REQUIRED"); if (profile.auth.kind === "secret-ref" && !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(profile.auth.secretRef)) throw new Error("MODEL_PROFILE_SECRET_REF_INVALID"); if (!Number.isInteger(profile.timeoutMs) || profile.timeoutMs < 100 || !Number.isInteger(profile.maxResponseBytes) || profile.maxResponseBytes < 1 || !Number.isInteger(profile.requestConcurrency) || profile.requestConcurrency < 1) throw new Error("MODEL_PROFILE_LIMIT_INVALID"); if (!profile.allowedRoles.every(role => ROLES.has(role))) throw new Error("MODEL_PROFILE_ROLE_INVALID"); return { ...profile, baseUrlOverride: validateOverride(profile), allowedRoles: [...new Set(profile.allowedRoles)] } }
export function serializeModelProfilesV2(profiles: ModelProfileV2[]): string { return `${JSON.stringify({ schemaVersion: MODEL_PROFILE_STORE_V2_SCHEMA, profiles: profiles.map(validateModelProfileV2).sort((a,b)=>a.id.localeCompare(b.id)) }, null, 2)}\n` }
export function parseModelProfilesV2(text: string): ModelProfileV2[] { let value: unknown; try { value = JSON.parse(text) } catch { throw new Error("MODEL_PROFILE_STORE_INVALID") }; rejectSecrets(value); if (!value || typeof value !== "object" || (value as any).schemaVersion !== MODEL_PROFILE_STORE_V2_SCHEMA || !Array.isArray((value as any).profiles)) throw new Error("MODEL_PROFILE_STORE_INVALID"); return (value as any).profiles.map(validateModelProfileV2) }

export function validateModelProfile(profile: ModelProfile): ModelProfile {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(profile.id)) throw new Error("MODEL_PROFILE_ID_INVALID")
  if (!profile.model.trim()) throw new Error("MODEL_PROFILE_MODEL_REQUIRED")
  if (profile.secretRef && !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(profile.secretRef)) throw new Error("MODEL_PROFILE_SECRET_REF_INVALID")
  let url: URL
  try { url = new URL(profile.baseUrl) } catch { throw new Error("MODEL_PROFILE_URL_INVALID") }
  if (!['http:', 'https:'].includes(url.protocol) || (profile.remote && url.protocol !== 'https:')) throw new Error("MODEL_PROFILE_URL_UNSAFE")
  if (!profile.remote && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new Error("LOCAL_MODEL_MUST_USE_LOOPBACK")
  return { ...profile, baseUrl: profile.baseUrl.replace(/\/$/, ""), timeoutMs: profile.timeoutMs ?? 60_000, maxResponseBytes: profile.maxResponseBytes ?? 2_000_000 }
}

export function serializeModelProfiles(profiles: ModelProfile[]): string { return `${JSON.stringify({ schemaVersion: "mathos-model-profiles-v1", profiles: profiles.map(validateModelProfile).sort((a, b) => a.id.localeCompare(b.id)) }, null, 2)}\n` }
export function parseModelProfiles(text: string): ModelProfile[] {
  if (/("|')(api[_-]?key|token|password|authorization|secret)("|')\s*:/i.test(text)) throw new Error("MODEL_PROFILE_SECRET_FORBIDDEN")
  let value: unknown; try { value = JSON.parse(text) } catch { throw new Error("MODEL_PROFILE_STORE_INVALID") }
  if (!value || typeof value !== "object" || !Array.isArray((value as {profiles?:unknown}).profiles)) throw new Error("MODEL_PROFILE_STORE_INVALID")
  return (value as {profiles: ModelProfile[]}).profiles.map(validateModelProfile)
}
