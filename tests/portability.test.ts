import { describe, expect, test } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { inspectPlatformCapabilities } from "@mathos/core"
import { resolveLinuxSandboxBackend } from "@mathos/computation"
import { createTestWorkspace } from "./helpers/create-test-workspace.ts"

const repositoryRoot = resolve(import.meta.dir, "..")

describe("portability", () => {
  test("tracked runtime text contains no developer home paths", () => {
    const listed = Bun.spawnSync(["git", "ls-files"], { cwd: repositoryRoot })
    expect(listed.exitCode).toBe(0)
    const files = new TextDecoder().decode(listed.stdout).trim().split("\n").filter(Boolean)
    const offenders = files.filter((file) => {
      const value = readFileSync(resolve(repositoryRoot, file))
      if (value.includes(0)) return false
      const text = value.toString("utf8")
      return /(?:\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/u.test(text)
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

  test("doctor release claims remain explicit across the platform matrix", async () => {
    const runtime = () => "/opt/bin/bun"
    const available = { available: true, backend: "macos-sandbox-exec", reason: null, networkIsolation: true }
    const unavailable = { available: false, backend: null, reason: "missing", networkIsolation: false }
    const darwin = await inspectPlatformCapabilities("darwin", { executablePath: runtime, sandboxProbe: async () => available })
    expect(darwin.releaseClaim).toBe("SUPPORTED")
    expect(darwin.ready).toBe(true)
    const degradedMac = await inspectPlatformCapabilities("darwin", { executablePath: () => null, sandboxProbe: async () => unavailable })
    expect(degradedMac.releaseClaim).toBe("SUPPORTED")
    expect(degradedMac.ready).toBe(false)
    expect((await inspectPlatformCapabilities("linux", { executablePath: runtime, sandboxProbe: async () => unavailable })).releaseClaim).toBe("UNTESTED")
    const windows = await inspectPlatformCapabilities("win32", { executablePath: runtime, sandboxProbe: async () => ({...available,backend:"docker-container"}) })
    expect(windows.releaseClaim).toBe("SUPPORTED")
    expect(windows.ready).toBe(true)
    expect((await inspectPlatformCapabilities("win32", { executablePath: runtime, sandboxProbe: async () => unavailable })).ready).toBe(false)
    const linux = await inspectPlatformCapabilities("linux", { executablePath: runtime, sandboxProbe: async () => unavailable })
    expect(linux.sandbox.available).toBe(false)
    expect(linux.sandbox.networkIsolation).toBe(false)
    expect(await resolveLinuxSandboxBackend((name) => name === "bwrap" ? "/opt/bin/bwrap" : null)).toBe("/opt/bin/bwrap")
  })
})
