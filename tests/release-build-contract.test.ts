import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolve } from "node:path"
import { prepareDevelopmentBuildOutput } from "../scripts/build-output.ts"

test("standalone TUI build applies the OpenTUI Solid transform", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/distribution/build-release.ts"), "utf8")

  expect(source).toContain('import solidPlugin from "@opentui/solid/bun-plugin"')
  expect(source).toContain("plugins:[solidPlugin]")
})

test("development CLI build applies the same OpenTUI Solid transform", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/build.ts"), "utf8")

  expect(source).toContain('import solidPlugin from "@opentui/solid/bun-plugin"')
  expect(source).toContain("plugins: [solidClientRuntimePlugin, solidPlugin]")
})

test("development CLI build cleanup preserves sibling distribution artifacts", () => {
  const outdir = mkdtempSync(join(tmpdir(), "mathos-build-output-"))
  try {
    const cli = join(outdir, "cli.js"), vsix = join(outdir, "mathos-1.0.0-rc.1.vsix")
    writeFileSync(cli, "stale cli")
    writeFileSync(vsix, "packaged extension")
    prepareDevelopmentBuildOutput(outdir)
    expect(existsSync(cli)).toBe(false)
    expect(readFileSync(vsix, "utf8")).toBe("packaged extension")
  } finally { rmSync(outdir, { recursive: true, force: true }) }
})

test("V1 qualification uses its bounded deterministic suite", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/run-v1-qualification.ts"), "utf8")

  expect(source).toContain('execFileSync(process.execPath,["test",...commands[id]!]')
  expect(source).not.toContain('execFileSync(process.execPath,["test"],')
})

test("builds refuse Bun versions that produce a broken bundle", async () => {
  const { assertSupportedBun, MINIMUM_BUN_VERSION } = await import("../scripts/build-output.ts")
  expect(MINIMUM_BUN_VERSION).toBe("1.4.1")
  expect(() => assertSupportedBun("1.3.11")).toThrow("BUN_VERSION_UNSUPPORTED")
  expect(() => assertSupportedBun("1.4.0")).toThrow("BUN_VERSION_UNSUPPORTED")
  expect(() => assertSupportedBun("1.4.1")).not.toThrow()
  const manifest = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text())
  expect(manifest.engines.bun).toBe(`>=${MINIMUM_BUN_VERSION}`)
})
