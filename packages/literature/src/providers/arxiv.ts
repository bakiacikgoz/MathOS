import type { LiteratureProvider, LiteratureQuery, LiteratureSearchResult, SourceMetadata } from "../index"
import { GovernedHttpClient, type GovernedHttpOptions } from "./http-policy"

export class ArxivLiteratureProvider implements LiteratureProvider {
  readonly name = "arxiv"
  private readonly http: GovernedHttpClient
  constructor(options: GovernedHttpOptions = {}) { this.http = new GovernedHttpClient(options) }
  async search(query: LiteratureQuery): Promise<LiteratureSearchResult[]> {
    const url = new URL("https://export.arxiv.org/api/query")
    url.searchParams.set("search_query", `all:${query.text}`); url.searchParams.set("max_results", String(Math.min(query.maxResults, 100)))
    return parseAtom(await this.http.text(url.toString()))
  }
  async fetchMetadata(result: LiteratureSearchResult): Promise<SourceMetadata> { return { ...result, type: "PREPRINT" } }
}
function value(xml: string, tag: string): string | undefined { return xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1]?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }
function parseAtom(xml: string): LiteratureSearchResult[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const body = match[1] ?? ""; const id = value(body, "id") ?? ""; const arxivId = id.split("/abs/").pop()?.trim()
    return { provider: "arxiv", externalId: id || `arxiv:${arxivId}`, title: value(body, "title") ?? "", authors: [...body.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)].map((m) => (m[1] ?? "").trim()), year: Number(value(body, "published")?.slice(0, 4)) || undefined, arxivId, url: id, abstract: value(body, "summary") }
  })
}
