const SECRET_KEYS = ["apiKey", "api_key", "authorization", "MATHOS_API_KEY", "token", "password", "cookie", "set-cookie", "deviceCode", "device_code"]
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
  result = result.replace(/(?:set-)?cookie\s*[:=]\s*[^\s;,]+/gi, "cookie=[redacted]")
  result = result.replace(/device(?:_|-)?code\s*[:=]\s*[A-Za-z0-9_-]+/gi, "device_code=[redacted]")
  return result
}

export function redactValue(value: unknown, secrets: string[] = collectKnownSecrets(), seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value, secrets)
  if (Array.isArray(value)) { if (seen.has(value)) return "[circular]"; seen.add(value); return value.map((item) => redactValue(item, secrets, seen)) }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[circular]"; seen.add(value)
    const output: Record<string, unknown> = Object.create(null)
    for (const [key, nested] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) continue
      if (SECRET_KEYS.includes(key) || /(api[_-]?key|secret|token|password|authorization|credential|cookie|device[_-]?code)/i.test(key)) {
        output[key] = nested ? "[redacted]" : ""
      } else {
        output[key] = redactValue(nested, secrets, seen)
      }
    }
    return output
  }
  return value
}

export function containsSecret(haystack: string, secrets: string[] = collectKnownSecrets()): boolean {
  return secrets.some((secret) => secret.length > 0 && haystack.includes(secret))
}

export function assertSafeProviderUrl(raw: string, options: { allowLoopback?: boolean } = {}): URL { let url:URL;try{url=new URL(raw)}catch{throw new Error("PROVIDER_URL_INVALID")}if(url.username||url.password)throw new Error("PROVIDER_URL_CREDENTIALS_FORBIDDEN");if(!["http:","https:"].includes(url.protocol))throw new Error("PROVIDER_URL_UNSAFE");const host=url.hostname.toLowerCase(),loopback=["localhost","127.0.0.1","::1"].includes(host),privateIp=/^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)||host==="::"||host.startsWith("fc")||host.startsWith("fd")||host.startsWith("fe80:")||host.endsWith(".local");if((loopback||privateIp)&&!options.allowLoopback)throw new Error("PROVIDER_PRIVATE_NETWORK_FORBIDDEN");if(!loopback&&url.protocol!=="https:")throw new Error("PROVIDER_URL_UNSAFE");return url }
