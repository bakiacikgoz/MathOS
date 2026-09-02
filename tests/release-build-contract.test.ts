import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

test("standalone TUI build applies the OpenTUI Solid transform", () => {
  const source = readFileSync(resolve(import.meta.dir, "../scripts/distribution/build-release.ts"), "utf8")

  expect(source).toContain('import solidPlugin from "@opentui/solid/bun-plugin"')
  expect(source).toContain("plugins:[solidPlugin]")
})
