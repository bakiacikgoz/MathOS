import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createLogger } from "@mathos/shared"
import { redactValue } from "@mathos/models"

describe("secret redaction boundary", () => {
  test("removes canaries recursively from logs, errors, and diagnostics payloads", () => {
    const canary = "mathos-canary-secret-847392"
    const previous = process.env.MATHOS_SECRET_MODEL_OPENROUTER
    process.env.MATHOS_SECRET_MODEL_OPENROUTER = canary
    try {
      const path = join(mkdtempSync(join(tmpdir(), "mathos-redact-")), "debug.log")
      createLogger(path).error(`provider failed: ${canary}`, { nested: { authorization: `Bearer ${canary}` } })
      expect(readFileSync(path, "utf8")).not.toContain(canary)
      expect(JSON.stringify(redactValue({ error: canary, nested: { token: canary } }))).not.toContain(canary)
    } finally {
      if (previous === undefined) delete process.env.MATHOS_SECRET_MODEL_OPENROUTER
      else process.env.MATHOS_SECRET_MODEL_OPENROUTER = previous
    }
  })
})
