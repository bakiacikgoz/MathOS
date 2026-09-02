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

export { GovernedHttpClient, isPublicHttpUrl } from "./providers/http-policy"
export type { GovernedHttpOptions } from "./providers/http-policy"
export { OpenAlexLiteratureProvider } from "./providers/openalex"
export { CrossrefLiteratureProvider } from "./providers/crossref"
export { ArxivLiteratureProvider } from "./providers/arxiv"
export { LiteratureProviderRegistry } from "./registry.ts"
export { LiteratureCache } from "./cache.ts"
export { LiteratureRuntime, ProductionLiteratureProvider, createProductionLiteratureProvider, type LiteratureProviderHealth, type LiteratureRuntimeReport } from "./runtime.ts"
export { canonicalLiteratureKey, mergeLiteratureResults, type CanonicalLiteratureResult } from "./dedupe.ts"

export function deduplicateLiteratureResults(results: LiteratureSearchResult[]): LiteratureSearchResult[] {
  const identities = new Set<string>()
  return results.filter((result) => {
    const doi = result.doi?.replace(/^https?:\/\/doi\.org\//i, "").trim().toLowerCase()
    const arxiv = result.arxivId?.replace(/^arxiv:/i, "").trim().toLowerCase()
    const identity = doi ? `doi:${doi}` : arxiv ? `arxiv:${arxiv}` : `${result.provider}:${result.externalId}`
    if (identities.has(identity)) return false
    identities.add(identity)
    return true
  })
}

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

