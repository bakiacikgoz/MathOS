export function createId(prefix = ""): string {
  const raw = crypto.randomUUID().replaceAll("-", "")
  return prefix ? `${prefix}_${raw}` : raw
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function padSeq(n: number, width = 3): string {
  return String(n).padStart(width, "0")
}
