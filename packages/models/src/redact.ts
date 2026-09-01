const SECRET_KEYS = ["apiKey", "api_key", "authorization", "MATHOS_API_KEY", "token", "password"]

export function collectKnownSecrets(extra: string[] = []): string[] {
  const values = [...extra]
  const envKey = process.env.MATHOS_API_KEY
  if (envKey) values.push(envKey)
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
      if (SECRET_KEYS.includes(key)) {
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
