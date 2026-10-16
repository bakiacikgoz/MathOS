export interface ModelRetryOptions { maxAttempts?: number; maxTotalDelayMs?: number; sleep?: (ms: number) => Promise<void>; random?: () => number; signal?: AbortSignal }
function statusOf(error: unknown): number | null { return typeof error === "object" && error !== null && "status" in error && typeof (error as {status?:unknown}).status === "number" ? (error as {status:number}).status : null }
function retryable(error: unknown): boolean { const status = statusOf(error); if (status !== null) return status === 429 || status >= 500; const text = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : String(error).toLowerCase(); return /timeout|timed out|econnreset|connection reset|temporar|rate[_ ]?limited|providerratelimited/.test(text) }
/**
 * A failure that is about the provider being busy rather than about the request: worth waiting a little and asking again.
 * Wider than the transport's own retry, because gateways report an overloaded upstream inside a successful stream
 * ("[rate_limit_error] upstream model is overloaded"), which only the caller that owns the stream can safely repeat.
 */
export function isTransientModelError(error: unknown): boolean {
  // A timeout already waited the whole budget; asking again would only make the user wait that long once more.
  const status = statusOf(error)
  if (status !== null) return status === 429 || status >= 500
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name?: unknown }).name) : ""
  if (name === "ProviderRateLimited") return true
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return /overload|rate[_ ]?limit|too many requests|try again later|at capacity|server_error|service unavailable|bad gateway|econnreset|connection reset|temporar|\b(?:429|500|502|503|504|529)\b/.test(text)
}
export async function retryModelCall<T>(operation: () => Promise<T>, options: ModelRetryOptions = {}): Promise<{ value: T; retries: number }> {
  const maxAttempts = options.maxAttempts ?? 3, maxTotal = options.maxTotalDelayMs ?? 5_000, sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))), random = options.random ?? Math.random; let delayed = 0
  for (let attempt = 1; ; attempt++) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("aborted", "AbortError")
    try { return { value: await operation(), retries: attempt - 1 } } catch (error) {
      if (options.signal?.aborted || attempt >= maxAttempts || !retryable(error)) throw error
      const explicit = typeof error === "object" && error !== null && "retryAfterMs" in error ? Number((error as {retryAfterMs:unknown}).retryAfterMs) : NaN
      const exponential = Math.min(100 * 2 ** (attempt - 1), 2_000), requested = Number.isFinite(explicit) && explicit >= 0 ? explicit : exponential + Math.floor(random() * 100), remaining = maxTotal - delayed, delay = Math.min(requested, remaining)
      // A server-requested wait longer than the remaining budget would only hit the limit again.
      if ((remaining <= 0 && requested > 0) || (Number.isFinite(explicit) && requested > remaining)) throw error
      await sleep(delay); delayed += delay
    }
  }
}
