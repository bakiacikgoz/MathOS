import { describe, expect, test } from "bun:test"
import {
  ArxivLiteratureProvider,
  CrossrefLiteratureProvider,
  GovernedHttpClient,
  OpenAlexLiteratureProvider,
  deduplicateLiteratureResults,
} from "@mathos/literature"

const json = (value: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } })

describe("governed scholarly providers", () => {
  test("OpenAlex maps queries and normalizes metadata", async () => {
    let requested = ""
    const provider = new OpenAlexLiteratureProvider({ fetch: async (input) => {
      requested = String(input)
      return json({ results: [{ id: "https://openalex.org/W1", display_name: "A theorem", publication_year: 2024, doi: "https://doi.org/10.1/X", authorships: [{ author: { display_name: "Ada" } }], primary_location: { landing_page_url: "https://example.org/a" } }] })
    } })
    const hits = await provider.search({ text: "fixed point", authors: ["Ada"], yearFrom: 2020, yearTo: 2025, maxResults: 4 })
    expect(requested).toContain("search=fixed+point")
    expect(requested).toContain("from_publication_date%3A2020-01-01")
    expect(hits[0]).toMatchObject({ doi: "10.1/x", authors: ["Ada"], year: 2024 })
  })

  test("Crossref and arXiv normalize provider payloads", async () => {
    const crossref = new CrossrefLiteratureProvider({ fetch: async () => json({ message: { items: [{ DOI: "10.2/ABC", title: ["Crossref title"], author: [{ given: "A", family: "B" }], published: { "date-parts": [[2021]] } }] } }) })
    const arxiv = new ArxivLiteratureProvider({ fetch: async () => new Response(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2401.01234v2</id><title>  Arxiv title </title><summary> result </summary><published>2024-01-03T00:00:00Z</published><author><name>C D</name></author></entry></feed>`) })
    expect((await crossref.search({ text: "x", maxResults: 2 }))[0]).toMatchObject({ doi: "10.2/abc", title: "Crossref title", authors: ["A B"] })
    expect((await arxiv.search({ text: "x", maxResults: 2 }))[0]).toMatchObject({ arxivId: "2401.01234v2", title: "Arxiv title", authors: ["C D"] })
  })

  test("deduplicates DOI and arXiv identities deterministically", () => {
    const base = { title: "T", authors: ["A"], externalId: "1", provider: "a" }
    const rows = deduplicateLiteratureResults([
      { ...base, doi: "10.1/X" }, { ...base, provider: "b", externalId: "2", doi: "https://doi.org/10.1/x" },
      { ...base, externalId: "3", arxivId: "2401.1v1" }, { ...base, externalId: "4", arxivId: "arXiv:2401.1v1" },
    ])
    expect(rows.map((row) => row.externalId)).toEqual(["1", "3"])
  })

  test("retries 429 once and honors offline mode", async () => {
    let calls = 0
    const client = new GovernedHttpClient({ fetch: async () => ++calls === 1 ? new Response("busy", { status: 429, headers: { "retry-after": "0" } }) : json({ ok: true }), sleep: async () => {} })
    expect(await client.json("https://api.openalex.org/works")).toEqual({ ok: true })
    expect(calls).toBe(2)
    await expect(new GovernedHttpClient({ offline: true }).json("https://api.openalex.org/works")).rejects.toThrow("PROVIDER_OFFLINE")
  })

  test("enforces timeout and rejects redirects to private addresses", async () => {
    const timeout = new GovernedHttpClient({ timeoutMs: 5, fetch: async (_url, init) => await new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) })
    await expect(timeout.json("https://api.openalex.org/works")).rejects.toThrow("PROVIDER_TIMEOUT")
    const redirect = new GovernedHttpClient({ fetch: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } }) })
    await expect(redirect.json("https://api.openalex.org/works")).rejects.toThrow("PROVIDER_URL_REJECTED")
  })
})
