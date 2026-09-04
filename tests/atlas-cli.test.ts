import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
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
    try {
      await MathOS.init(workspace.root, "atlas-token-safety")
      const child = Bun.spawn([
        process.execPath,
        resolve(import.meta.dir, "../apps/tui/src/cli.ts"),
        "atlas",
        "--no-open",
      ], { cwd: workspace.path("atlas-token-safety"), stdout: "pipe", stderr: "pipe" })
      const reader = child.stdout.getReader()
      let output = ""
      const deadline = Date.now() + 10_000
      while (!output.includes("Ctrl+C to stop") && Date.now() < deadline) {
        const { done, value } = await reader.read()
        if (done) break
        output += new TextDecoder().decode(value)
      }
      child.kill("SIGINT")
      await child.exited
      expect(output).toMatch(/http:\/\/127\.0\.0\.1:\d+/)
      expect(output).not.toContain("?token=")
      expect(output).not.toMatch(/[?&]token=[a-f0-9]{64}/i)
    } finally {
      workspace.cleanup()
    }
  }, 15_000)
})
