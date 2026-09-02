import { expect, test } from "bun:test"
import { mergeLiteratureResults } from "@mathos/literature"

test("canonical literature merge preserves provider provenance", () => {
  const merged = mergeLiteratureResults([{ provider: "openalex", externalId: "a", title: "Fixed Point", authors: ["A"], year: 2020, doi: "https://doi.org/10.1/X" }, { provider: "crossref", externalId: "b", title: "Fixed Point", authors: ["A"], year: 2020, doi: "10.1/x", abstract: "detail" }])
  expect(merged).toHaveLength(1)
  expect(merged[0]?.canonicalKey).toBe("doi:10.1/x")
  expect(merged[0]?.provenance.map(item => item.provider)).toEqual(["openalex", "crossref"])
  expect(merged[0]?.result.abstract).toBe("detail")
})
