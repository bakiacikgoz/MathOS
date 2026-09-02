import { expect, test } from "bun:test"
import { LiteratureCache, LiteratureProviderRegistry, LiteratureRuntime, type LiteratureProvider } from "@mathos/literature"

test("offline literature search performs zero provider requests and uses cache", async () => {
  let calls = 0; const provider: LiteratureProvider = { name: "p", search: async () => { calls++; return [] }, fetchMetadata: async result => result }
  const registry = new LiteratureProviderRegistry(); registry.register(provider)
  const cache = new LiteratureCache(); cache.setForQuery("p", { text: "q", maxResults: 5 }, [{ provider: "p", externalId: "1", title: "Cached", authors: [] }], 10000)
  const report = await new LiteratureRuntime(registry, cache).search({ text: "q", maxResults: 5 }, { offline: true })
  expect(calls).toBe(0); expect(report.results[0]?.result.title).toBe("Cached"); expect(report.state).toBe("OFFLINE_CACHE")
})
