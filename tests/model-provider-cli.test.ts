import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { runHeadless } from "../apps/tui/src/headless.ts"

test("provider CLI persists metadata without accepting argv secrets", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-provider-cli-")), oldAppData = process.env.APPDATA, oldLocal = process.env.LOCALAPPDATA
  const first = `test-local-${process.pid}`, second = `test-local2-${process.pid}`
  process.env.APPDATA = root; process.env.LOCALAPPDATA = root
  let output = ""; const write = process.stdout.write.bind(process.stdout); process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
  try {
    expect(await runHeadless(["provider", "add", first, "--type", "openai-compatible", "--base-url", "http://127.0.0.1:1234/v1", "--model", "local-m", "--local"])).toBe(0)
    output = ""; expect(await runHeadless(["provider", "add", second, "--base-url", "http://localhost:1235/v1", "--model", "local-m2", "--local"])).toBe(0)
    output = ""; expect(await runHeadless(["provider", "list", "--json"])).toBe(0); expect(JSON.parse(output).profiles.map((profile: {id: string}) => profile.id)).toContain(first); expect(JSON.parse(output).profiles.map((profile: {id: string}) => profile.id)).toContain(second)
    await expect(runHeadless(["provider", "add", "bad", "--base-url", "https://x.test", "--model", "m", "--api-key", "secret"])).resolves.toBe(2)
  } finally { await runHeadless(["provider", "remove", first]); await runHeadless(["provider", "remove", second]); process.stdout.write = write; if (oldAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = oldAppData; if (oldLocal === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = oldLocal }
})
