import { describe, expect, test } from "bun:test"
import { runHeadless } from "../apps/tui/src/headless.ts"

describe("headless JSON contract", () => {
  test("unknown commands emit one versioned JSON error and no human text", async () => {
    let out = "", err = ""
    const stdout = process.stdout.write, stderr = process.stderr.write
    process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
    process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
    try {
      expect(await runHeadless(["definitely-unknown", "--json"])).toBe(2)
      expect(out).toBe("")
      const value = JSON.parse(err)
      expect(value.schemaVersion).toBe("mathos.cli-error.v1")
      expect(value.error.code).toBe("USAGE_UNKNOWN_COMMAND")
    } finally { process.stdout.write = stdout; process.stderr.write = stderr }
  })
})
