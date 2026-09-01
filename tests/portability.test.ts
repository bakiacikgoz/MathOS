import { describe, expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { inspectPlatformCapabilities } from "@mathos/core"
import { createTestWorkspace } from "./helpers/create-test-workspace.ts"

const repositoryRoot = resolve(import.meta.dir, "..")

describe("portability", () => {
  test("tracked runtime text contains no developer home paths", () => {
    const listed = Bun.spawnSync(["git", "ls-files", "packages", "scripts", "tests"], { cwd: repositoryRoot })
    expect(listed.exitCode).toBe(0)
    const files = new TextDecoder().decode(listed.stdout).trim().split("\n").filter(Boolean)
    const homePrefix = ["", "Users", ""].join("/")
    const offenders = files.filter((file) => {
      if (!/\.(?:ts|tsx|js|mjs|cjs|json)$/u.test(file)) return false
      return readFileSync(resolve(repositoryRoot, file), "utf8").includes(homePrefix)
    })
    expect(offenders).toEqual([])
  })

  test("test workspaces are outside the checkout and cleanup is idempotent", () => {
    const workspace = createTestWorkspace()
    const marker = workspace.path("nested", "marker.txt")
    try {
      expect(workspace.root.startsWith(repositoryRoot)).toBe(false)
      writeFileSync(marker, "portable")
      expect(readFileSync(marker, "utf8")).toBe("portable")
    } finally {
      workspace.cleanup()
      workspace.cleanup()
    }
  })

  test("doctor release claims remain explicit across the platform matrix", () => {
    expect(inspectPlatformCapabilities("darwin").releaseClaim).toBe("SUPPORTED")
    expect(inspectPlatformCapabilities("linux").releaseClaim).toBe("UNTESTED")
    expect(inspectPlatformCapabilities("win32").releaseClaim).toBe("NOT_TESTED")
    const linux = inspectPlatformCapabilities("linux")
    expect(linux.sandbox.available).toBe(false)
    expect(linux.sandbox.networkIsolation).toBe(false)
  })
})
