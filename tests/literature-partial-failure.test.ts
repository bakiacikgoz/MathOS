import { expect, test } from "bun:test"
import { LiteratureCache, LiteratureProviderRegistry, LiteratureRuntime, type LiteratureProvider } from "@mathos/literature"

test("aggregate literature search returns healthy results with partial health", async () => {
  const ok: LiteratureProvider = { name: "ok", search: async () => [{ provider: "ok", externalId: "1", title: "T", authors: [] }], fetchMetadata: async result => result }
  const down: LiteratureProvider = { name: "down", search: async () => { throw new Error("offline") }, fetchMetadata: async result => result }
  const registry = new LiteratureProviderRegistry(); registry.register(ok); registry.register(down)
  const report = await new LiteratureRuntime(registry, new LiteratureCache()).search({ text: "q", maxResults: 5 })
  expect(report.state).toBe("PARTIAL"); expect(report.results).toHaveLength(1); expect(report.providers).toEqual([{ name: "down", state: "UNAVAILABLE", detail: "offline" }, { name: "ok", state: "VERIFIED", detail: "1 result(s)" }])
})
