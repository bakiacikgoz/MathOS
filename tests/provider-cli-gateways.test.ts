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
const configure = async (...args: string[]) => { output = ""; errors = ""; return runHeadless(["provider", "configure", ...args]) }
const run = async (...args: string[]) => { output = ""; errors = ""; return runHeadless(args) }

describe("provider CLI for gateways and generic endpoints", () => {
  test("status --json without a profile lists every profile", async () => {
    const id = `cli-go-${process.pid}`; ids.push(id)
    expect(await configure("opencode-go", "--profile", id, "--model", "kimi-k3")).toBe(0)
    expect(await run("provider", "status", "--json")).toBe(0)
    const status = JSON.parse(output)
    expect(status.schemaVersion).toBe("mathos.providers.status.v1")
    expect(status.profiles.some((row: { profile: string; descriptor: string; billing: string }) => row.profile === id && row.descriptor === "opencode-go" && row.billing === "subscription")).toBe(true)
  })

  // Linux without Secret Service reads keys from MATHOS_SECRET_* only; other platforms use the OS keychain.
  test.skipIf(process.platform !== "linux")("status reports CONFIGURED once the key exists and never prints it", async () => {
    const id = `cli-key-${process.pid}`; ids.push(id)
    expect(await configure("opencode-go", "--profile", id, "--model", "glm-5.1")).toBe(0)
    const env = `MATHOS_SECRET_MODEL_${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
    expect(await run("provider", "status", id, "--json")).toBe(0)
    expect(JSON.parse(output).profiles[0].connection).toBe("SECRET_REQUIRED")
    process.env[env] = "sk-status-canary"
    try {
      expect(await run("provider", "status", id, "--json")).toBe(0)
      expect(JSON.parse(output).profiles[0].connection).toBe("CONFIGURED")
      expect(output).not.toContain("sk-status-canary")
    } finally { delete process.env[env] }
  })

  test("gateways accept a protocol override; curated single-protocol providers refuse it", async () => {
    const id = `cli-zen-${process.pid}`; ids.push(id)
    expect(await configure("opencode-zen", "--profile", id, "--model", "glm-5.1", "--protocol", "openai-responses")).toBe(0)
    expect(JSON.parse(output).profile.endpointPresetId).toBe("openai-responses")
    expect(await configure("deepseek-api", "--profile", `cli-ds-${process.pid}`, "--model", "deepseek-v4-pro", "--protocol", "openai-responses")).not.toBe(0); expect(errors + output).toContain("PROVIDER_PROTOCOL_OVERRIDE_FORBIDDEN")
    expect(await configure("opencode-zen", "--profile", `cli-bad-${process.pid}`, "--model", "x", "--protocol", "grpc")).not.toBe(0); expect(errors + output).toContain("PROVIDER_PROTOCOL_INVALID")
  })

  test("generic profiles store their protocol, extra headers and session header", async () => {
    const id = `cli-generic-${process.pid}`; ids.push(id)
    expect(await configure("generic-anthropic-compatible", "--profile", id, "--base-url", "https://llm.example.test/v1", "--model", "m1", "--header", "X-Title: MathOS", "--session-header", "X-Session-Id")).toBe(0)
    const profile = JSON.parse(output).profile
    expect(profile.endpointPresetId).toBe("anthropic-messages")
    expect(profile.extraHeaders).toEqual({ "x-title": "MathOS" })
    expect(profile.sessionHeader).toBe("x-session-id")
    expect(await configure("generic-openai-compatible", "--profile", `cli-leak-${process.pid}`, "--base-url", "https://llm.example.test/v1", "--model", "m1", "--header", "Authorization: Bearer sk-live")).not.toBe(0); expect(errors + output).toContain("MODEL_PROFILE_SECRET_FORBIDDEN")
    expect(output + errors).not.toContain("sk-live")
  })
})
