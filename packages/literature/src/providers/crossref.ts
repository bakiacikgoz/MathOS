import type { LiteratureProvider, LiteratureQuery, LiteratureSearchResult, SourceMetadata } from "../index"
import { GovernedHttpClient, type GovernedHttpOptions } from "./http-policy"

export class CrossrefLiteratureProvider implements LiteratureProvider {
  readonly name = "crossref"
  private readonly http: GovernedHttpClient
  constructor(options: GovernedHttpOptions = {}) { this.http = new GovernedHttpClient(options) }
  async search(query: LiteratureQuery): Promise<LiteratureSearchResult[]> {
    const url = new URL("https://api.crossref.org/works")
    url.searchParams.set("query", query.text); url.searchParams.set("rows", String(Math.min(query.maxResults, 100)))
    const payload = await this.http.json(url.toString())
    const message = payload.message && typeof payload.message === "object" ? payload.message as Record<string, unknown> : {}
    return (Array.isArray(message.items) ? message.items : []).map((raw) => normalizeCrossref(raw as Record<string, unknown>)).filter((row) => row.title)
  }
  async fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata> { return { ...result, type: "PAPER" } }
}
function normalizeCrossref(item: Record<string, unknown>): LiteratureSearchResult {
  const title = Array.isArray(item.title) ? String(item.title[0] ?? "") : String(item.title ?? "")
  const authors = Array.isArray(item.author) ? (item.author as Array<Record<string, unknown>>).map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).filter(Boolean) : []
  const published = item.published && typeof item.published === "object" ? item.published as Record<string, unknown> : {}
  const parts = Array.isArray(published["date-parts"]) ? published["date-parts"] as unknown[][] : []
  const doi = item.DOI ? String(item.DOI).toLowerCase() : undefined
  return { provider: "crossref", externalId: doi ?? String(item.URL ?? title), title: title.trim(), authors, year: typeof parts[0]?.[0] === "number" ? parts[0][0] : undefined, doi, url: item.URL ? String(item.URL) : undefined, abstract: item.abstract ? String(item.abstract) : undefined }
}
