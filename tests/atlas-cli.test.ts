import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, rmSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { MathOS } from "@mathos/core"
import { atlasSessionView, atlasTextCommand } from "../apps/tui/src/ui/AtlasViews.tsx"
import { createTestWorkspace } from "./helpers/create-test-workspace.ts"

describe("atlas CLI/TUI", () => {
  test("supports snapshot open export impact and critical path", () => {
    for (const action of ["snapshot", "open", "export", "impact", "critical-path"]) {
      expect(atlasTextCommand([action]).action).toBe(action)
    }
  })

  test("normal session metadata masks token and cleanup is explicit", () => {
    let stopped = false
    const view = atlasSessionView({ url: "http://127.0.0.1:1", token: "abcdefgh", stop: () => { stopped = true } })
    expect(view.token).toBe("***efgh")
    expect(view.authority).toBe("READ_ONLY")
    view.stop()
    expect(stopped).toBe(true)
  })

  test("Atlas startup output never exposes the browser session token", async () => {
    const workspace = createTestWorkspace("mathos-atlas-cli-")
    let child: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined
    let file: string | undefined
    try {
      await MathOS.init(workspace.root, "atlas-token-safety")
      const cli = resolve(import.meta.dir, "../apps/tui/src/cli.ts")
      // Windows kill(SIGINT) terminates the process without delivering SIGINT.
      // Deliver the signal inside the real CLI process to exercise its shutdown handler.
      child = Bun.spawn([
        process.execPath,
        "--eval",
        `process.argv = [process.execPath, ${JSON.stringify(cli)}, "atlas", "--no-open"];
         process.on("message", message => { if (message === "atlas-test-stop") process.emit("SIGINT"); });
         await import(${JSON.stringify(pathToFileURL(cli).href)});`,
      ], { cwd: workspace.path("atlas-token-safety"), stdin: "ignore", stdout: "pipe", stderr: "pipe", ipc() {} })
      const reader = child.stdout.getReader()
      let output = ""
      const deadline = Date.now() + 10_000
      while (!output.includes("Ctrl+C to stop") && Date.now() < deadline) {
        const { done, value } = await reader.read()
        if (done) break
        output += new TextDecoder().decode(value)
      }

      expect(output).toMatch(/http:\/\/127\.0\.0\.1:\d+/)
      expect(output).not.toContain("?token=")
      expect(output).not.toMatch(/[?&]token=[a-f0-9]{64}/i)
      // The link is still reachable: it sits in a private file whose path is printed.
      file = /Session link \(with token, readable only by you\): (.+)/.exec(output)?.[1]?.trim()
      expect(file).toBeDefined()
      if (process.platform !== "win32") expect(statSync(file!).mode & 0o077).toBe(0)
      const link = readFileSync(file!, "utf8").trim()
      expect(link).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[a-f0-9]{64}$/)
      const response = await fetch(link)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain("MathOS Theorem Atlas")
      child.send("atlas-test-stop")
      expect(await child.exited).toBe(0)
      expect(existsSync(file!)).toBe(false)
    } finally {
      if (child && child.exitCode === null) { child.kill(); await child.exited }
      if (file) rmSync(dirname(file), { recursive: true, force: true })
      workspace.cleanup()
    }
  }, 15_000)
})
