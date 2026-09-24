export function readPref<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(`mathos.${key}`); return raw === null ? fallback : JSON.parse(raw) as T } catch { return fallback }
}
export function writePref(key: string, value: unknown) {
  try { localStorage.setItem(`mathos.${key}`, JSON.stringify(value)) } catch {}
}
