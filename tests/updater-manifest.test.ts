import { expect, test } from "bun:test"
import { checkUpdate, type UpdateManifest } from "../packages/update/src/index.ts"

const manifest = (version: string, channel: UpdateManifest["channel"] = "stable", overrides: Partial<UpdateManifest> = {}): UpdateManifest => ({
  version,
  channel,
  minimumSchema: 1,
  maximumSchema: 30,
  sha256: "a".repeat(64),
  ...overrides,
})

test("only newer compatible versions are offered", () => {
  for (const [currentVersion, latestVersion, available] of [
    ["1.0.0", "0.9.0", false],
    ["1.0.0", "1.0.0", false],
    ["1.0.0+build.1", "1.0.0+build.2", false],
    ["1.0.0", "1.0.1", true],
  ] as const) {
    expect(checkUpdate({ currentVersion, channel: "stable", manifest: manifest(latestVersion), schemaVersion: 24 })).toMatchObject({ available, compatible: true })
  }
})

test("prerelease numeric identifiers and stable promotion follow SemVer precedence", () => {
  for (const [currentVersion, latestVersion, latestChannel, available] of [
    ["1.0.0-rc.2", "1.0.0-rc.10", "rc", true],
    ["1.0.0-rc.10", "1.0.0-rc.2", "rc", false],
    ["1.0.0-rc.2", "1.0.0", "stable", true],
    ["1.0.0", "1.0.0-rc.10", "rc", false],
  ] as const) {
    expect(checkUpdate({ currentVersion, channel: "rc", manifest: manifest(latestVersion, latestChannel), schemaVersion: 24 }).available).toBe(available)
  }
})

test("stable channel rejects prereleases, RC channel permits stable release", () => {
  expect(checkUpdate({ currentVersion: "1.0.0", channel: "stable", manifest: manifest("1.1.0-rc.1", "rc"), schemaVersion: 24 }).available).toBe(false)
  expect(checkUpdate({ currentVersion: "1.0.0-rc.1", channel: "rc", manifest: manifest("1.0.0", "stable"), schemaVersion: 24 }).available).toBe(true)
})

test("malformed versions, channel mismatches and incompatible schema cannot be offered", () => {
  for (const [currentVersion, candidate] of [
    ["1.0.0", manifest("1.0.1-rc.1", "stable")],
    ["1.0.0", manifest("1.0.1", "rc")],
    ["1.0.0", manifest("01.0.1")],
    ["1.0.0", manifest("1.0.1-rc.01", "rc")],
    ["1.0", manifest("1.0.1")],
    ["1.0.0", manifest("1.0.1", "stable", { maximumSchema: 20 })],
    ["1.0.0", manifest("1.0.1", "stable", { minimumSchema: 31, maximumSchema: 30 })],
    ["1.0.0", manifest("1.0.1", "stable", { minimumSchema: Number.NaN })],
    ["1.0.0", manifest("1.0.1", "stable", { sha256: "invalid" })],
  ] as const) {
    expect(checkUpdate({ currentVersion, channel: "rc", manifest: candidate, schemaVersion: 24 }).available).toBe(false)
  }
})
