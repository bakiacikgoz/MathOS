import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test("standalone TUI build applies the OpenTUI Solid transform", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/distribution/build-release.ts"), "utf8")

  expect(source).toContain('import solidPlugin from "@opentui/solid/bun-plugin"')
  expect(source).toContain("plugins:[solidPlugin]")
})

test("development CLI build applies the same OpenTUI Solid transform", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/build.ts"), "utf8")

  expect(source).toContain('import solidPlugin from "@opentui/solid/bun-plugin"')
  expect(source).toContain("plugins: [solidPlugin]")
})

test("V1 qualification uses its bounded deterministic suite", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/run-v1-qualification.ts"), "utf8")

  expect(source).toContain('execFileSync(process.execPath,["test",...commands[id]!]')
  expect(source).not.toContain('execFileSync(process.execPath,["test"],')
})
