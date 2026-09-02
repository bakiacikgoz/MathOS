import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

test("clean-room gate clones committed source and uses isolated HOME with frozen install", () => {
  const source = readFileSync(new URL("../scripts/clean-room-release.ts", import.meta.url), "utf8")
  expect(source).toContain('"git", "clone", "--no-local", "--no-hardlinks"')
  expect(source).toContain('"install", "--frozen-lockfile"')
  expect(source).toContain("HOME: cleanHome")
  expect(source).toContain('"release:build"')
  expect(source).toContain('"release:verify"')
})
