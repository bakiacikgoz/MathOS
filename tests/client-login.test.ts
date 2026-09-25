import { describe, expect, test } from "bun:test"
import { CLIENT_LOGIN, clientArgv, clientLoginFor, startClientLogin, terminalArgv, type ClientLoginRuntime } from "../packages/models/src/auth/client-login.ts"
import { providerCatalog } from "../packages/models/src/index.ts"

function fakeRuntime(options: { platform?: NodeJS.Platform; installed?: string[]; signedIn?: boolean; statusStdout?: string } = {}) {
  const calls: string[][] = []
  const runtime: ClientLoginRuntime = {
    platform: options.platform ?? "darwin",
    env: { PATH: "/usr/bin", HOME: "/home/u" },
    which: (name) => (options.installed ?? []).includes(name) ? `/opt/bin/${name}` : null,
    spawn: (argv) => {
      calls.push(argv)
      const status = argv.includes("status")
      return { exited: Promise.resolve(status ? (options.signedIn ? 0 : 1) : 0), stdout: Promise.resolve(status ? options.statusStdout ?? "" : ""), kill: () => {} }
    },
  }
  return { runtime, calls }
}

describe("official-client sign-in", () => {
  test("every subscription descriptor with a client maps to a login spec", () => {
    expect(clientLoginFor(providerCatalog.get("openai-codex-chatgpt")!)?.client).toBe("codex")
    expect(clientLoginFor(providerCatalog.get("claude-code-account")!)?.client).toBe("claude")
    expect(clientLoginFor(providerCatalog.get("github-copilot-account")!)?.client).toBe("copilot")
    expect(clientLoginFor(providerCatalog.get("gemini-cli-enterprise")!)?.client).toBe("gemini")
    expect(clientLoginFor(providerCatalog.get("qwen-code-acp")!)?.client).toBe("qwen")
    expect(clientLoginFor(providerCatalog.get("openrouter")!)).toBeNull()
  })

  test("a missing client reports the official installer for the platform", async () => {
    const { runtime, calls } = fakeRuntime({ platform: "win32" })
    const result = await startClientLogin(runtime, CLIENT_LOGIN.codex)
    expect(result.state).toBe("CLIENT_MISSING")
    if (result.state === "CLIENT_MISSING") expect(result.install.command).toContain("install.ps1")
    expect(calls).toHaveLength(0)
  })

  test("check reports signed out without starting anything; a start runs `codex login` in the background", async () => {
    const { runtime, calls } = fakeRuntime({ installed: ["codex"] })
    expect(await startClientLogin(runtime, CLIENT_LOGIN.codex, { check: true })).toMatchObject({ state: "SIGNED_OUT", mode: "background", verifiable: true })
    expect(calls).toEqual([["/opt/bin/codex", "login", "status"]])
    expect((await startClientLogin(runtime, CLIENT_LOGIN.codex)).state).toBe("LOGIN_STARTED")
    expect(calls.at(-1)).toEqual(["/opt/bin/codex", "login"])
  })

  test("an already signed-in client is reported as such and no login starts", async () => {
    const { runtime, calls } = fakeRuntime({ installed: ["codex"], signedIn: true })
    expect((await startClientLogin(runtime, CLIENT_LOGIN.codex)).state).toBe("SIGNED_IN")
    expect(calls.every((argv) => argv.includes("status"))).toBe(true)
  })

  test("claude auth status --json with loggedIn:false counts as signed out", async () => {
    const { runtime } = fakeRuntime({ installed: ["claude"], signedIn: true, statusStdout: JSON.stringify({ loggedIn: false }) })
    expect((await startClientLogin(runtime, CLIENT_LOGIN.claude, { check: true })).state).toBe("SIGNED_OUT")
  })

  test("Windows runs npm .cmd shims through cmd.exe by name", () => {
    const { runtime } = fakeRuntime({ platform: "win32", installed: ["codex"] })
    expect(clientArgv(runtime, CLIENT_LOGIN.codex, ["login"])).toEqual(["cmd.exe", "/d", "/c", "codex", "login"])
  })

  test("window-only clients open a terminal with a fixed command", async () => {
    const { runtime, calls } = fakeRuntime({ platform: "win32", installed: ["gemini"] })
    expect(await startClientLogin(runtime, CLIENT_LOGIN.gemini)).toMatchObject({ state: "LOGIN_WINDOW_OPENED", hint: "gemini-sign-in" })
    const argv = calls.at(-1)!
    expect(argv.slice(0, 6)).toEqual(["cmd.exe", "/d", "/c", "start", "", "powershell.exe"])
    expect(Buffer.from(argv.at(-1)!, "base64").toString("utf16le")).toBe("gemini")
  })

  test("macOS terminal command escapes quotes for AppleScript", () => {
    expect(terminalArgv("darwin", `echo "hi"`, () => null)).toEqual(["osascript", "-e", `tell application "Terminal" to do script "echo \\"hi\\""`, "-e", `tell application "Terminal" to activate`])
    expect(terminalArgv("linux", "gemini", () => null)).toBeNull()
  })
})
