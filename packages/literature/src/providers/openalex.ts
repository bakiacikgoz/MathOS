import type { LiteratureProvider, LiteratureQuery, LiteratureSearchResult, SourceMetadata } from "../index"
import { GovernedHttpClient, type GovernedHttpOptions } from "./http-policy"

export class OpenAlexLiteratureProvider implements LiteratureProvider {
  readonly name = "openalex"
  private readonly http: GovernedHttpClient
  constructor(options: GovernedHttpOptions = {}) { this.http = new GovernedHttpClient(options) }
  async search(query: LiteratureQuery): Promise<LiteratureSearchResult[]> {
    const url = new URL("https://api.openalex.org/works")
    url.searchParams.set("search", query.text)
    url.searchParams.set("per-page", String(Math.min(query.maxResults, 100)))
    const filters: string[] = []
    if (query.yearFrom) filters.push(`from_publication_date:${query.yearFrom}-01-01`)
    if (query.yearTo) filters.push(`to_publication_date:${query.yearTo}-12-31`)
    if (filters.length) url.searchParams.set("filter", filters.join(","))
    const payload = await this.http.json(url.toString())
    return (Array.isArray(payload.results) ? payload.results : []).map((raw) => normalizeOpenAlex(raw as Record<string, unknown>)).filter((row) => row.title)
  }
  async fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata> { return { ...result, type: "PAPER" } }
}

function normalizeOpenAlex(item: Record<string, unknown>): LiteratureSearchResult {
  const authorships = Array.isArray(item.authorships) ? item.authorships as Array<{ author?: { display_name?: string } }> : []
  const primary = item.primary_location && typeof item.primary_location === "object" ? item.primary_location as Record<string, unknown> : {}
  const doi = item.doi ? String(item.doi).replace(/^https?:\/\/doi\.org\//i, "").toLowerCase() : undefined
  return { provider: "openalex", externalId: String(item.id ?? doi ?? item.display_name), title: String(item.display_name ?? item.title ?? "").trim(), authors: authorships.map((a) => a.author?.display_name).filter((v): v is string => Boolean(v)), year: typeof item.publication_year === "number" ? item.publication_year : undefined, doi, url: primary.landing_page_url ? String(primary.landing_page_url) : undefined, score: typeof item.relevance_score === "number" ? item.relevance_score : undefined }
}
