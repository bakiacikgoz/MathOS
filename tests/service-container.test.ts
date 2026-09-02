import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS, type ArtifactStorePort, type ClockPort } from "@mathos/core"

describe("v1 service container", () => {
  test("MathOS.open composes repository-aware services and accepts fake ports", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-container-"))
    await MathOS.init(root)
    const clock: ClockPort = { now: () => "2040-01-02T03:04:05.000Z" }
    const values = new Map<string, Uint8Array>()
    const artifacts: ArtifactStorePort = {
      put: (key, value) => { values.set(key, value); return key },
      get: (key) => values.get(key) ?? null,
      exists: (key) => values.has(key),
    }
    const mathos = MathOS.open(root, { serviceOverrides: { clock, artifacts } })
    expect(mathos.services.clock).toBe(clock)
    expect(mathos.services.artifacts).toBe(artifacts)
    expect(mathos.services.repositories.contextItems).toBeDefined()
    expect(mathos.services.claims.list("W-1")).toEqual([])
    mathos.close()
  })

  test("core services depend on ports, not one another's concrete classes", () => {
    const services = join(import.meta.dir, "../packages/core/src/services")
    for (const file of readdirSync(services).filter((name) => name.endsWith(".ts"))) {
      const source = readFileSync(join(services, file), "utf8")
      expect(source).not.toMatch(/from ["'].+\/services\//)
    }
  })
})
