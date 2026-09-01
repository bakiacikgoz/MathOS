import { createHash } from "node:crypto"
import { normalizeQuery } from "@mathos/domain"

export interface LiteratureQuery {
  text: string
  authors?: string[]
  yearFrom?: number
  yearTo?: number
  maxResults: number
}

export interface LiteratureSearchResult {
  provider: string
  externalId: string
  title: string
  authors: string[]
  year?: number
  doi?: string
  arxivId?: string
  url?: string
  abstract?: string
  score?: number
}

export interface SourceMetadata {
  title: string
  authors: string[]
  year?: number
  doi?: string
  arxivId?: string
  url?: string
  venue?: string
  type?: "PAPER" | "BOOK" | "PREPRINT" | "THESIS" | "WEB" | "DOCUMENT" | "OTHER"
}

export interface LiteratureProvider {
  name: string
  search(query: LiteratureQuery): Promise<LiteratureSearchResult[]>
  fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata>
}

export function queryFingerprint(provider: string, query: LiteratureQuery): string {
  return createHash("sha256").update(`${provider}|${normalizeQuery(query.text)}|${query.maxResults}`).digest("hex")
}

export function sourceFingerprint(input: { doi?: string | null; arxivId?: string | null; isbn?: string | null; url?: string | null; title: string; authors: string[]; year?: number | null; fileHash?: string | null }): string {
  if (input.doi) return `doi:${input.doi.trim().toLowerCase()}`
  if (input.arxivId) return `arxiv:${input.arxivId.trim().toLowerCase()}`
  if (input.isbn) return `isbn:${input.isbn.replace(/[^0-9xX]/g, "").toLowerCase()}`
  if (input.fileHash) return `file:${input.fileHash}`
  if (input.url) return `url:${canonicalizeUrl(input.url)}`
  const authors = input.authors.map((item) => item.trim().toLowerCase()).sort().join(",")
  return `fallback:${normalizeQuery(input.title)}|${authors}|${input.year ?? ""}`
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    parsed.hostname = parsed.hostname.toLowerCase()
    if (parsed.pathname.endsWith("/")) parsed.pathname = parsed.pathname.slice(0, -1)
    return parsed.toString()
  } catch {
    return url.trim().toLowerCase()
  }
}

export function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    const host = parsed.hostname.toLowerCase()
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return false
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
    return true
  } catch {
    return false
  }
}

const ALLOWED_HOSTS = new Set(["api.openalex.org", "api.crossref.org", "export.arxiv.org", "arxiv.org"])

export class FakeLiteratureProvider implements LiteratureProvider {
  name = "fake"

  constructor(public results: LiteratureSearchResult[] = [
    {
      provider: "fake",
      externalId: "fake:banach-1922",
      title: "Sur les opérations dans les ensembles abstraits",
      authors: ["Stefan Banach"],
      year: 1922,
      doi: "10.4064/sm-3-1-133-181",
      url: "https://example.invalid/banach-1922",
      abstract: "Fixed point theorem for contractions on complete metric spaces.",
      score: 0.9,
    },
    {
      provider: "fake",
      externalId: "fake:fta",
      title: "Fundamental theorem of arithmetic",
      authors: ["Euclid"],
      year: -300,
      url: "https://example.invalid/fta",
      abstract: "Every integer greater than 1 is a product of primes uniquely.",
      score: 0.8,
    },
  ]) {}

  async search(query: LiteratureQuery): Promise<LiteratureSearchResult[]> {
    const needle = normalizeQuery(query.text)
    const matched = this.results.filter((item) => `${item.title} ${item.abstract ?? ""}`.toLowerCase().includes(needle.split(" ")[0] ?? needle) || needle.split(" ").some((token) => item.title.toLowerCase().includes(token)))
    return (matched.length ? matched : this.results).slice(0, query.maxResults)
  }

  async fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata> {
    return {
      title: result.title,
      authors: result.authors,
      year: result.year,
      doi: result.doi,
      arxivId: result.arxivId,
      url: result.url,
      type: "PAPER",
    }
  }
}

export class OpenAlexLiteratureProvider implements LiteratureProvider {
  name = "openalex"

  async search(query: LiteratureQuery): Promise<LiteratureSearchResult[]> {
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query.text)}&per-page=${Math.min(query.maxResults, 10)}`
    const payload = await getJson(url)
    const results = Array.isArray(payload.results) ? payload.results : []
    return results.map((item: Record<string, unknown>) => {
      const ids = (item.ids && typeof item.ids === "object" ? item.ids : {}) as Record<string, string>
      const authorships = Array.isArray(item.authorships) ? item.authorships as Array<{ author?: { display_name?: string } }> : []
      return {
        provider: "openalex",
        externalId: String(item.id ?? ids.openalex ?? item.doi ?? item.display_name),
        title: String(item.display_name ?? item.title ?? ""),
        authors: authorships.map((row) => row.author?.display_name).filter((name): name is string => Boolean(name)),
        year: typeof item.publication_year === "number" ? item.publication_year : undefined,
        doi: item.doi ? String(item.doi).replace("https://doi.org/", "") : undefined,
        url: ids.landing_page ?? (item.doi ? String(item.doi) : undefined),
        abstract: undefined,
        score: typeof item.relevance_score === "number" ? item.relevance_score : undefined,
      } satisfies LiteratureSearchResult
    }).filter((item) => item.title)
  }

  async fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata> {
    return {
      title: result.title,
      authors: result.authors,
      year: result.year,
      doi: result.doi,
      arxivId: result.arxivId,
      url: result.url,
      type: "PAPER",
    }
  }
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const parsed = new URL(url)
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) throw new Error("PROVIDER_HOST_NOT_ALLOWED")
  if (!isPublicHttpUrl(url)) throw new Error("PROVIDER_URL_REJECTED")
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MathOS-literature/0.1 (mailto:research@localhost)" },
  })
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`)
  return await response.json() as Record<string, unknown>
}
