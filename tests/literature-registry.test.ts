import { expect, test } from "bun:test"
import { FakeLiteratureProvider, LiteratureProviderRegistry, createProductionLiteratureProvider } from "@mathos/literature"
import { runHeadless } from "../apps/tui/src/headless.ts"

test("production literature registry rejects test-only providers", () => {
  expect(() => new LiteratureProviderRegistry().register(new FakeLiteratureProvider())).toThrow("TEST_PROVIDER_FORBIDDEN")
  expect(new LiteratureProviderRegistry({ allowTestProviders: true }).register(new FakeLiteratureProvider()).name).toBe("fake")
})

test("production aggregate contains only real built-in adapters", () => {
  expect(createProductionLiteratureProvider().providerNames).toEqual(["arxiv", "crossref", "openalex"])
})

test("literature doctor never reports fake as production evidence", async () => {
  let output = ""; const write = process.stdout.write.bind(process.stdout); process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
  try { expect(await runHeadless(["literature", "doctor", "--json"])).toBe(0); expect(output).not.toContain("fake"); expect(JSON.parse(output).providers).toHaveLength(3) } finally { process.stdout.write = write }
})
