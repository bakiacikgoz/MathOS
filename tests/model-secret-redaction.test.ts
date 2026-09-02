import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { FileModelUsageLedger, ModelUsageLedger, OpenAICompatibleProvider } from "@mathos/models"

test("usage telemetry is local metadata without secret or invented cost", () => {
  const ledger = new ModelUsageLedger()
  ledger.record({ profileId: "p", model: "m", role: "planner", durationMs: 10, retries: 1, success: true, inputTokens: 4, outputTokens: 2, secret: "canary" } as never)
  const serialized = JSON.stringify(ledger.current())
  expect(serialized).not.toContain("canary")
  expect(serialized).not.toContain("cost")
})

test("provider records reported token metadata without calculating price", async () => {
  const ledger = new ModelUsageLedger()
  const provider = new OpenAICompatibleProvider({ provider: "p", model: "m", baseUrl: "https://example.test/v1", apiKey: "secret", source: { model: "env", baseUrl: "env", apiKey: "env" } }, (async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }))) as unknown as typeof fetch, ledger)
  await provider.generate({ role: "planner", messages: [{ role: "user", content: "q" }] })
  expect(ledger.current()[0]).toMatchObject({ profileId: "p", role: "planner", inputTokens: 7, outputTokens: 3, success: true })
  expect(JSON.stringify(ledger.current())).not.toContain("cost")
})

test("file usage ledger survives restart and stores no unknown fields", () => {
  const path = join(mkdtempSync(join(tmpdir(), "mathos-usage-")), "usage.jsonl")
  new FileModelUsageLedger(path).record({ profileId: "p", model: "m", role: "planner", durationMs: 1, retries: 0, success: false, errorClass: "RATE_LIMIT", secret: "canary" } as never)
  expect(new FileModelUsageLedger(path).current()).toHaveLength(1)
  expect(readFileSync(path, "utf8")).not.toContain("canary")
})
