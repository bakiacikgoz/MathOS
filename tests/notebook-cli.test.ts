import { describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS } from "@mathos/core"
import { runHeadless } from "../apps/tui/src/headless.ts"

describe("notebook CLI", () => {
  test("supports init/open, dry-run import, export and conflict-safe sync", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-notebook-cli-")); await MathOS.init(root)
    writeFileSync(join(root,"incoming.md"),'# Imported\n\n:::claim-ref id="C-001"\nClaim\n:::\n')
    const app = MathOS.open(root); app.createClaim({ kind:"lemma", title:"Claim", statement:"Claim" }); app.close()
    const previous = process.cwd(); process.chdir(root); let output = ""
    const write = process.stdout.write.bind(process.stdout); process.stdout.write = ((chunk:string|Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
    try {
      expect(await runHeadless(["notebook","init","research-notes","--title","Research Notes"])).toBe(0)
      const created = JSON.parse(output).data; output = ""
      expect(await runHeadless(["notebook","open",created.id])).toBe(0); expect(JSON.parse(output).data.slug).toBe("research-notes"); output = ""
      expect(await runHeadless(["notebook","parse","incoming.md","--dry-run","--json"])).toBe(0); expect(JSON.parse(output).data.applied).toBe(false); output = ""
      expect(await runHeadless(["notebook","import","incoming.md","--format","markdown"])).toBe(0); expect(JSON.parse(output).data.status).toBe("PROPOSED"); output = ""
      expect(await runHeadless(["notebook","export",created.id,"--format","latex"])).toBe(0); expect(JSON.parse(output).data.path).toEndWith(".tex"); output = ""
      expect(await runHeadless(["notebook","sync",created.id,"--dry-run"])).toBe(0); expect(["PROPOSED","CONFLICT"]).toContain(JSON.parse(output).data.status)
    } finally { process.stdout.write = write; process.chdir(previous) }
  })
})
