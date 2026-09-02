const SECRET_KEYS = ["apiKey", "api_key", "authorization", "MATHOS_API_KEY", "token", "password"]
import type { ProviderDescriptor } from "./catalog/types.ts"
import type { ModelProfileV2 } from "./profiles/types.ts"

export interface RedactedProviderSummary { profile: string; descriptor: string; connection: string; model: string; billing: string; terms: string; quota: string; roles: string[] }
export function redactedProviderSummary(profile: ModelProfileV2, descriptor: ProviderDescriptor, input: { connection?: string; quota?: string } = {}): RedactedProviderSummary { return { profile: profile.id, descriptor: descriptor.id, connection: input.connection ?? (profile.enabled ? "CONFIGURED" : "DISCONNECTED"), model: profile.model, billing: descriptor.billingClass, terms: descriptor.terms.policy, quota: input.quota ?? "unknown", roles: [...profile.allowedRoles] } }

export function collectKnownSecrets(extra: string[] = []): string[] {
  const values = [...extra]
  for (const [name, value] of Object.entries(process.env)) {
    if (/(api[_-]?key|secret|token|password|authorization|credential)/i.test(name) && value) values.push(value)
  }
  return values.filter((item) => item.length > 0)
}

export function redactText(text: string, secrets: string[] = collectKnownSecrets()): string {
  let result = text
  for (const secret of secrets) {
    if (!secret) continue
    result = result.split(secret).join("[redacted]")
  }
  result = result.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  result = result.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
  return result
}

export function redactValue(value: unknown, secrets: string[] = collectKnownSecrets()): unknown {
  if (typeof value === "string") return redactText(value, secrets)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets))
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_KEYS.includes(key) || /(api[_-]?key|secret|token|password|authorization|credential)/i.test(key)) {
        output[key] = nested ? "[redacted]" : ""
      } else {
        output[key] = redactValue(nested, secrets)
      }
    }
    return output
  }
  return value
}

export function containsSecret(haystack: string, secrets: string[] = collectKnownSecrets()): boolean {
  return secrets.some((secret) => secret.length > 0 && haystack.includes(secret))
}
