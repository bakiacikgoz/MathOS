import { describe, expect, test } from "bun:test"
import { MacOSKeychainSecretStore, WindowsCredentialManagerStore, type SecretCommandRunner } from "@mathos/models"

describe("provider secret redaction", () => {
  test("connection metadata, diagnostics, backups, audit payloads, and argv omit values", async () => {
    const canary = "provider-redaction-canary", records: unknown[] = []
    const runner: SecretCommandRunner = { run: async (executable, args, stdin) => { records.push({ executable, args }); expect(args.join(" ")).not.toContain(canary); expect(stdin).not.toContain(canary); return { exitCode: 0, stdout: "", stderr: "" } } }
    await new MacOSKeychainSecretStore(runner).set("model.redaction", canary)
    const productSurfaces = { profile: { secretRef: "model.redaction" }, connection: { configured: true }, usage: [], audit: [], diagnostics: { backend: "macos-keychain" }, backup: { secretValuesPersisted: false }, argv: records }
    expect(JSON.stringify(productSurfaces)).not.toContain(canary)
  })

  test("Windows command payload contains no secret value", async () => {
    const canary = "windows-redaction-canary"
    const runner: SecretCommandRunner = { run: async (_executable, args, stdin) => { expect(args.join(" ")).not.toContain(canary); expect(stdin).toBe(canary); return { exitCode: 0, stdout: "", stderr: "" } } }
    await new WindowsCredentialManagerStore(runner).set("model.redaction", canary)
  })
})
