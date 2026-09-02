import { describe, expect, test } from "bun:test"
import { EnvironmentSecretStore, LinuxSecretServiceStore, MacOSKeychainSecretStore, WindowsCredentialManagerStore, createSecretStore, type SecretCommandRunner } from "@mathos/models"

class MemoryRunner implements SecretCommandRunner {
  calls: Array<{ executable: string; args: string[]; stdin?: string }> = []
  value: string | null = null
  async run(executable: string, args: string[], stdin?: string) {
    this.calls.push({ executable, args: [...args], ...(stdin === undefined ? {} : { stdin }) })
    if (args.includes("-i") && stdin) {
      const hex = stdin.match(/-X ([0-9a-f]+)/)?.[1]
      if (hex) this.value = Buffer.from(hex, "hex").toString("utf8")
    } else if (args.includes("store") || executable.includes("powershell")) {
      if (stdin !== undefined) this.value = stdin.replace(/\n$/, "")
    }
    if (args.includes("find-generic-password") || args.includes("lookup")) return this.value === null ? { exitCode: 44, stdout: "", stderr: "" } : { exitCode: 0, stdout: `${this.value}\n`, stderr: "" }
    if (args.includes("delete-generic-password") || args.includes("clear")) this.value = null
    return { exitCode: 0, stdout: "", stderr: "" }
  }
}

describe("native secret store contract", () => {
  test("macOS sends values through stdin and exposes metadata only", async () => {
    const runner = new MemoryRunner(), store = new MacOSKeychainSecretStore(runner)
    await store.set("model.test", "contract-canary")
    expect(runner.calls[0]!.args.join(" ")).not.toContain("contract-canary")
    expect(runner.calls[0]!.stdin).not.toContain("contract-canary")
    expect(await store.get("model.test")).toBe("contract-canary")
    expect(JSON.stringify(await store.listMetadata(["model.test"]))).not.toContain("contract-canary")
    await store.delete("model.test")
    expect(await store.get("model.test")).toBeNull()
  })

  test("Linux sends values through stdin", async () => {
    const runner = new MemoryRunner(), store = new LinuxSecretServiceStore(runner)
    await store.set("model.test", "linux-canary")
    expect(runner.calls[0]!.args).not.toContain("linux-canary")
    expect(runner.calls[0]!.stdin).toBe("linux-canary")
  })

  test("Windows never places values in PowerShell arguments", async () => {
    const runner = new MemoryRunner(), store = new WindowsCredentialManagerStore(runner)
    await store.set("model.test", "windows-canary")
    expect(runner.calls[0]!.args.join(" ")).not.toContain("windows-canary")
    expect(runner.calls[0]!.stdin).toBe("windows-canary")
  })

  test("factory selects native stores and environment fallback", async () => {
    expect((await createSecretStore({ platform: "darwin", which: () => "/usr/bin/security" }).capability()).backend).toBe("macos-keychain")
    expect((await createSecretStore({ platform: "linux", which: () => null, env: { MATHOS_SECRET_MODEL_TEST: "env-value" } }).capability()).backend).toBe("environment")
    expect(await new EnvironmentSecretStore({ MATHOS_SECRET_MODEL_TEST: "env-value" }).get("model.test")).toBe("env-value")
  })

  test("rejects invalid references on every backend", async () => {
    await expect(new EnvironmentSecretStore({}).get("../bad ref")).rejects.toThrow("SECRET_REF_INVALID")
    await expect(new MacOSKeychainSecretStore(new MemoryRunner()).set("../bad ref", "x")).rejects.toThrow("SECRET_REF_INVALID")
  })
})
