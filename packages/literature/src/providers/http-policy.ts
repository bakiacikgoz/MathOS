export type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface GovernedHttpOptions {
  fetch?: ProviderFetch
  timeoutMs?: number
  offline?: boolean
  maxRetries?: number
  sleep?: (milliseconds: number) => Promise<void>
}

const ALLOWED_HOSTS = new Set(["api.openalex.org", "api.crossref.org", "export.arxiv.org", "arxiv.org"])

export function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const host = parsed.hostname.toLowerCase()
    if (!ALLOWED_HOSTS.has(host)) return false
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return false
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    return true
  } catch { return false }
}

export class GovernedHttpClient {
  private readonly fetcher: ProviderFetch
  private readonly timeoutMs: number
  private readonly offline: boolean
  private readonly maxRetries: number
  private readonly sleep: (milliseconds: number) => Promise<void>

  constructor(options: GovernedHttpOptions = {}) {
    this.fetcher = options.fetch ?? ((input, init) => fetch(input, init))
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.offline = options.offline ?? false
    this.maxRetries = options.maxRetries ?? 1
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  async json(url: string): Promise<Record<string, unknown>> {
    const response = await this.request(url)
    return await response.json() as Record<string, unknown>
  }

  async text(url: string): Promise<string> { return await (await this.request(url)).text() }

  private async request(url: string): Promise<Response> {
    if (this.offline) throw new Error("PROVIDER_OFFLINE")
    if (!isPublicHttpUrl(url)) throw new Error("PROVIDER_URL_REJECTED")
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      let response: Response
      try {
        response = await this.fetcher(url, { redirect: "manual", signal: controller.signal, headers: { Accept: "application/json, application/atom+xml", "User-Agent": "MathOS-literature/1.0" } })
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new Error("PROVIDER_TIMEOUT")
        throw error
      } finally { clearTimeout(timer) }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location")
        if (!location || !isPublicHttpUrl(new URL(location, url).toString())) throw new Error("PROVIDER_URL_REJECTED")
        throw new Error("PROVIDER_REDIRECT_REJECTED")
      }
      if (response.status === 429 && attempt < this.maxRetries) {
        const seconds = Number(response.headers.get("retry-after") ?? "0")
        await this.sleep(Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : 0)
        continue
      }
      if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`)
      return response
    }
  }
}
