export type ModelProfileType = "openai-compatible"
export interface ModelProfile { id: string; type: ModelProfileType; baseUrl: string; model: string; secretRef: string | null; remote: boolean; timeoutMs?: number; maxResponseBytes?: number }

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
