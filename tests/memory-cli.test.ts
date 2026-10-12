import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { MathOS } from "@mathos/core"
import { resolveRuntimeLayout } from "@mathos/shared"
import { runHeadless } from "../apps/tui/src/headless.ts"

/** Runs CLI commands inside a fresh workspace and collects what they print. */
async function inWorkspace(work: (cli: (args: string[]) => Promise<{ code: number; out: string; err: string }>) => Promise<void>) {
  const parent = mkdtempSync(join(tmpdir(), "mathos-memory-cli-")), created = await MathOS.init(parent, "memory-cli")
  const previous = process.cwd(), stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr)
  let out = "", err = ""
  process.stdout.write = ((chunk: string | Uint8Array) => { out += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { err += String(chunk); return true }) as typeof process.stderr.write
  process.chdir(created.root)
  try { await work(async (args) => { out = ""; err = ""; const code = await runHeadless(args); return { code, out, err } }) }
  finally { process.chdir(previous); process.stdout.write = stdout; process.stderr.write = stderr; rmSync(parent, { recursive: true, force: true }) }
}

describe("memory CLI", () => {
  test("notes, conventions and failed attempts are kept, labelled and briefed", async () => {
    await inWorkspace(async (cli) => {
      expect((await cli(["claim", "create", "--type", "conjecture", "--title", "Odd sums", "--statement", "The sum of the first $n$ odd numbers is $n^2$."])).code).toBe(0)
      const own = await cli(["memory", "add", "--kind", "dead_end", "--text", "Güçlü tümevarım gereksiz", "--claim", "C-001", "--json"])
      expect(JSON.parse(own.out).data).toMatchObject({ id: "MEM-001", kind: "DEAD_END", basis: "USER", status: "ACTIVE", claimId: "C-001" })
      expect(JSON.parse((await cli(["memory", "add", "--kind", "IDEA", "--text", "Telescoping", "--origin-model", "--propose", "--json"])).out).data).toMatchObject({ status: "PROPOSED", basis: "MODEL" })
      expect(JSON.parse((await cli(["memory", "add", "--kind", "INSIGHT", "--text", "Approved on the card", "--origin-model", "--scope", "workspace", "--json"])).out).data).toMatchObject({ status: "ACTIVE", basis: "MODEL", scopeKind: "WORKSPACE" })
      expect(JSON.parse((await cli(["memory", "search", "tumevarim", "--json"])).out).data.map((note: { id: string }) => note.id)).toEqual(["MEM-001"])
      expect((await cli(["memory", "list"])).out).toContain("MEM-003  INSIGHT")
      expect((await cli(["memory", "accept", "MEM-002"])).out).toContain("a model's suggestion the user kept")
      expect((await cli(["memory", "refute", "MEM-002", "--reason", "n = 0"])).out).toContain("REFUTED")
      const refused = await cli(["memory", "add", "--kind", "INSIGHT", "--text", "x", "--basis", "lean", "--claim", "C-001"])
      expect(refused.code).not.toBe(0)
      expect(refused.err).toContain("MEMORY_LEAN_BASIS_NEEDS_VERIFIED_CLAIM")
      const convention = JSON.parse((await cli(["context", "propose", "--kind", "CONVENTION", "--name", "naturals", "--value", "ℕ starts at 0", "--scope", "workspace", "--origin-model", "--apply"])).out).data
      expect(convention).toMatchObject({ status: "ACTIVE", scopeKind: "WORKSPACE", origin: "MODEL" })
      const brief = JSON.parse((await cli(["memory", "brief", "--claim", "C-001", "--json"])).out).data.text
      expect(brief).toContain("naturals: ℕ starts at 0")
      expect(brief).toContain("MEM-001 DEAD_END [C-001] (the user's own note)")
      expect((await cli(["failures", "list", "--claim", "C-001"])).out).toContain("No failed proof attempts recorded for C-001")
      const library = await cli(["library", "add", "C-001"])
      expect(library.code).not.toBe(0)
      expect(library.err).toContain("LIBRARY_CLAIM_NOT_VERIFIED")
    })
  }, 20_000)

  test("preferences go to the user's own memory file and come back out", async () => {
    // The personal file is the developer's real one; whatever was there is restored afterwards.
    const path = join(resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env }).userConfigRoot, "personal-memory.json")
    const saved = existsSync(path) ? readFileSync(path) : null
    try {
      await inWorkspace(async (cli) => {
        const added = JSON.parse((await cli(["profile", "add", "Answer in Turkish", "--json"])).out).data
        expect(added.text).toBe("Answer in Turkish")
        expect(JSON.parse((await cli(["memory", "brief", "--json"])).out).data.text).toContain("- Answer in Turkish")
        expect(JSON.parse((await cli(["profile", "show", "--json"])).out).data).toMatchObject({ path, preferences: expect.arrayContaining([expect.objectContaining({ id: added.id })]) })
        expect((await cli(["profile", "remove", added.id])).code).toBe(0)
        expect((await cli(["library", "list"])).code).toBe(0)
      })
    } finally { if (saved) writeFileSync(path, saved); else rmSync(path, { force: true }) }
  }, 20_000)
})
