import { afterEach, beforeEach, describe, expect, test } from "bun:test"
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
})
