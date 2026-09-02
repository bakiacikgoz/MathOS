import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { loadModelProfileStore, migrateModelProfileV1 } from "@mathos/models"

const dirs: string[] = []; afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const legacy = { id: "openrouter", type: "openai-compatible" as const, baseUrl: "https://openrouter.ai/api/v1", model: "openai/example", secretRef: "model.openrouter", remote: true }

describe("model profile v1 migration", () => {
  test("maps deterministically to v2", () => {
    expect(migrateModelProfileV1(legacy, "2026-09-02T00:00:00.000Z")).toMatchObject({ schemaVersion: "mathos.model-profile.v2", id: "openrouter", descriptorId: "generic-openai-compatible", displayName: "openrouter", model: "openai/example", baseUrlOverride: "https://openrouter.ai/api/v1", auth: { kind: "secret-ref", secretRef: "model.openrouter" }, enabled: true, metadata: { migratedFromV1: true } })
  })
  test("atomically migrates once and writes a redacted backup", () => {
    const dir = mkdtempSync(join(tmpdir(), "mathos-profile-migration-")); dirs.push(dir); const path = join(dir, "model-profiles.json")
    writeFileSync(path, JSON.stringify({ schemaVersion: "mathos-model-profiles-v1", profiles: [legacy] }))
    const first = loadModelProfileStore(path, { now: () => "2026-09-02T00:00:00.000Z" })
    expect(first.migrated).toBe(true); expect(first.backupPath && existsSync(first.backupPath)).toBe(true)
    expect(readFileSync(first.backupPath!, "utf8")).not.toContain("apiKey")
    const second = loadModelProfileStore(path, { now: () => "2026-09-03T00:00:00.000Z" })
    expect(second.migrated).toBe(false); expect(second.backupPath).toBeNull(); expect(second.profiles).toEqual(first.profiles)
  })
})
