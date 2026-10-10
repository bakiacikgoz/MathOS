import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { resolveRuntimeLayout } from "@mathos/shared"
import { runHeadless } from "../apps/tui/src/headless.ts"

let output = "", errors = ""
const stdout = process.stdout.write.bind(process.stdout), stderr = process.stderr.write.bind(process.stderr)
const ids: string[] = []

beforeEach(() => {
  output = ""; errors = ""
  process.stdout.write = ((chunk: string | Uint8Array) => { output += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { errors += String(chunk); return true }) as typeof process.stderr.write
})
afterEach(async () => {
  for (const id of ids.splice(0)) await runHeadless(["provider", "remove", id])
  process.stdout.write = stdout; process.stderr.write = stderr
})

describe("provider center CLI", () => {
  test("publishes versioned catalog, status, models, and quota contracts", async () => {
    expect(await runHeadless(["provider", "catalog", "--json"])).toBe(0)
    expect(JSON.parse(output).schemaVersion).toBe("mathos.providers.catalog.v1")
    const id = `cli-openai-${process.pid}`; ids.push(id); output = ""
    expect(await runHeadless(["provider", "configure", "openai-api", "--profile", id, "--model", "gpt-5"])).toBe(0)
    output = ""; expect(await runHeadless(["provider", "status", id, "--json"])).toBe(0); expect(JSON.parse(output)).toMatchObject({ schemaVersion: "mathos.providers.status.v1", profiles: [{ profile: id, billing: "payg", auth: "secret-ref" }] })
    output = ""; expect(await runHeadless(["provider", "models", id, "--json"])).toBe(0); expect(JSON.parse(output).schemaVersion).toBe("mathos.providers.models.v1")
    output = ""; expect(await runHeadless(["provider", "quota", id, "--json"])).toBe(0); expect(JSON.parse(output)).toMatchObject({ schemaVersion: "mathos.providers.quota.v1", quota: { state: "unknown" } })
  })

  test("keeps legacy add as a deprecated generic configuration", async () => {
    const id = `cli-legacy-${process.pid}`; ids.push(id)
    expect(await runHeadless(["provider", "add", id, "--base-url", "http://127.0.0.1:11434/v1", "--model", "local", "--local"])).toBe(0)
    expect(JSON.parse(output)).toMatchObject({ profile: { descriptorId: "generic-openai-compatible", auth: { kind: "none" } } })
    expect(output).toContain("DEPRECATED")
  })

  test("blocks argv secrets and billable live tests without consent", async () => {
    expect(await runHeadless(["provider", "configure", "openai-api", "--profile", "bad", "--api-key", "canary"])).toBe(2)
    expect(errors).toContain("PROVIDER_SECRET_ARG_FORBIDDEN")
    const id = `cli-billing-${process.pid}`; ids.push(id); output = ""; errors = ""
    expect(await runHeadless(["provider", "configure", "openai-api", "--profile", id, "--model", "gpt-5"])).toBe(0)
    expect(await runHeadless(["provider", "test", id, "--live"])).toBe(2)
    expect(errors).toContain("LIVE_USAGE_ACCEPTANCE_REQUIRED")
  })

  test("routes provider tests through the truthful live-smoke contract", async () => {
    const id = `cli-codex-${process.pid}`; ids.push(id)
    expect(await runHeadless(["provider", "configure", "openai-codex-chatgpt", "--profile", id, "--model", "codex-test"])).toBe(0)
    output = ""; expect(await runHeadless(["provider", "test", id])).toBe(0)
    expect(JSON.parse(output)).toMatchObject({ schemaVersion:"mathos.provider-live-smoke.v1", connection:"NOT_CONFIGURED", liveRequest:"NOT_REQUESTED" })
    // Finding the client on Windows reads the machine and user PATH through PowerShell (up to 4s on a cold runner).
  }, 20_000)
  test("removing the default profile clears the default and role routes that named it", async () => {
    // `provider use` writes the real user config; the developer's own default and role routes come back afterwards.
    const configPath = join(resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env }).userConfigRoot, "config.toml")
    const saved = existsSync(configPath) ? readFileSync(configPath) : null
    const id = `cli-default-${process.pid}`; ids.push(id)
    try {
      expect(await runHeadless(["provider", "configure", "openai-api", "--profile", id, "--model", "gpt-5"])).toBe(0)
      expect(await runHeadless(["provider", "use", id])).toBe(0)
      expect(await runHeadless(["provider", "use", id, "--role", "researcher"])).toBe(0)
      output = ""; expect(await runHeadless(["provider", "remove", id])).toBe(0)
      expect(JSON.parse(output)).toEqual({ removed: id, unrouted: ["model.default_profile", "model.roles.researcher"] })
      output = ""; expect(await runHeadless(["provider", "list", "--json"])).toBe(0)
      expect(JSON.parse(output)).toMatchObject({ defaultProfile: null, assistantProfile: null })
    } finally {
      if (saved) writeFileSync(configPath, saved); else rmSync(configPath, { force: true })
    }
  }, 20_000)
})
