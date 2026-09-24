import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS } from "@mathos/core"
import { runHeadless } from "../apps/tui/src/headless.ts"

describe("claims JSON CLI", () => {
  test("claims, claim create/show and objective set emit JSON with --json and keep text output otherwise", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-claims-json-")); await MathOS.init(root)
    const previous = process.cwd(); process.chdir(root)
    let output = ""
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
    try {
      expect(await runHeadless(["claim", "create", "--type", "lemma", "--title", "Positivity", "--statement", "w > 0", "--json"])).toBe(0)
      const created = JSON.parse(output); output = ""
      expect(created).toMatchObject({ kind: "lemma", title: "Positivity", naturalStatement: "w > 0" })
      expect(await runHeadless(["claims", "--json"])).toBe(0)
      expect(JSON.parse(output).map((claim: { id: string }) => claim.id)).toEqual([created.id]); output = ""
      expect(await runHeadless(["claim", "show", created.id, "--json"])).toBe(0)
      const shown = JSON.parse(output); output = ""
      expect(shown.claim.id).toBe(created.id)
      expect(shown.page).toContain("WHY NOT VERIFIED?")
      expect(await runHeadless(["objective", "set", created.id, "--json"])).toBe(0)
      expect(JSON.parse(output).id).toBe(created.id); output = ""
      expect(await runHeadless(["claims"])).toBe(0)
      expect(output).toContain("CLAIMS")
      expect(output).toContain(created.id)
    } finally { process.stdout.write = write; process.chdir(previous) }
  })
})
