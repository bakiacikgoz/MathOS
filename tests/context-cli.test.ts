import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS } from "@mathos/core"
import { runHeadless } from "../apps/tui/src/headless.ts"

describe("context CLI", () => {
  test("supports versioned propose, list, apply, reject and conflicts output", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-context-cli-")); await MathOS.init(root)
    const previous = process.cwd(); process.chdir(root)
    let output = ""
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
    try {
      expect(await runHeadless(["context","propose","--kind","SYMBOL","--name","x","--value","x"])).toBe(0)
      const proposal = JSON.parse(output).data; output = ""
      expect(await runHeadless(["context","list","--scope","branch","--json"])).toBe(0)
      expect(JSON.parse(output).schemaVersion).toBe("mathos.context.v1"); output = ""
      expect(await runHeadless(["context","apply",proposal.id])).toBe(0); output = ""
      expect(await runHeadless(["context","conflicts","--json"])).toBe(0)
      expect(JSON.parse(output).data).toEqual([])
    } finally { process.stdout.write = write; process.chdir(previous) }
  })
})
