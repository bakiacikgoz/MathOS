import type { ModelProfile } from "./profile.ts"
import type { SecretStore } from "./secret-store.ts"
export interface ModelProfileHealth { id: string; state: "VERIFIED" | "BLOCKED" | "UNAVAILABLE"; detail: string }
export async function probeModelProfile(profile: ModelProfile, secrets: SecretStore, fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch): Promise<ModelProfileHealth> {
  const secret = profile.secretRef ? await secrets.get(profile.secretRef) : "local"
  if (!secret) return { id: profile.id, state: "BLOCKED", detail: "secret reference is not configured" }
  try { const response = await fetchImpl(`${profile.baseUrl.replace(/\/$/, "")}/models`, { method: "GET", headers: profile.secretRef ? { authorization: `Bearer ${secret}` } : {}, signal: AbortSignal.timeout(Math.min(profile.timeoutMs ?? 2_000, 2_000)) }); if (response.status === 401 || response.status === 403) return { id: profile.id, state: "BLOCKED", detail: "authentication failed" }; return response.ok || response.status === 404 ? { id: profile.id, state: "VERIFIED", detail: "endpoint smoke succeeded" } : { id: profile.id, state: "UNAVAILABLE", detail: `HTTP ${response.status}` } } catch { return { id: profile.id, state: "UNAVAILABLE", detail: "endpoint unreachable" } }
}
