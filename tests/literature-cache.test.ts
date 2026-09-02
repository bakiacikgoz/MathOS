import { expect, test } from "bun:test"
import { LiteratureCache } from "@mathos/literature"

test("literature cache expires entries by TTL", () => {
  let now = 1000; const cache = new LiteratureCache({ now: () => now })
  cache.set("k", [{ provider: "p", externalId: "1", title: "T", authors: [] }], 50)
  expect(cache.get("k")).toHaveLength(1); now = 1051; expect(cache.get("k")).toBeNull()
})
