import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { hostReleaseTarget, standaloneCompileOptions } from "../scripts/distribution/build-release.ts"

const roots: string[] = []

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("standalone release runtime isolation", () => {
  test("does not load bunfig.toml from the launch directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-standalone-cwd-"))
    roots.push(root)
    const entry = join(root, "entry.ts")
    const executable = join(root, "mathos-mini")
    const hostileCwd = join(root, "hostile-cwd")
    mkdirSync(hostileCwd)
    writeFileSync(entry, `process.stdout.write("standalone-ok\\n")\n`)
    writeFileSync(join(hostileCwd, "bunfig.toml"), `preload = ["missing-release-preload"]\n`)

    const result = await Bun.build({ entrypoints: [entry], compile: standaloneCompileOptions(hostReleaseTarget(), executable) })
    expect(result.success).toBe(true)
    const run = Bun.spawnSync([executable], { cwd: hostileCwd, stdout: "pipe", stderr: "pipe" })
    expect({ exitCode: run.exitCode, stdout: run.stdout.toString(), stderr: run.stderr.toString() }).toEqual({
      exitCode: 0,
      stdout: "standalone-ok\n",
      stderr: "",
    })
  })
})
