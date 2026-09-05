import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { createTestWorkspace } from "./helpers/create-test-workspace.ts"

test("development CLI bundle renders in an external workspace and accepts the quit key", async () => {
  const repoRoot = resolve(import.meta.dir, "..")
  const cli = resolve(repoRoot, "dist", "cli.js")
  const workspace = createTestWorkspace("mathos-built-tui-")
  try {
    const build = Bun.spawnSync([process.execPath, resolve(repoRoot, "scripts", "build.ts")], { cwd: repoRoot, stdout: "pipe", stderr: "pipe" })
    expect(build.exitCode).toBe(0)

    const init = Bun.spawnSync([process.execPath, cli, "init"], { cwd: workspace.root, stdout: "pipe", stderr: "pipe" })
    expect(init.exitCode).toBe(0)

    let output = ""
    let quitSent = false
    const decoder = new TextDecoder()
    const proc = Bun.spawn([process.execPath, cli], {
      cwd: workspace.root,
      env: { ...Bun.env, TERM: "xterm-256color" },
      terminal: {
        cols: 100,
        rows: 30,
        data(terminal, data) {
          output += decoder.decode(data, { stream: true })
          if (!quitSent && output.includes("MathOS>")) {
            quitSent = true
            terminal.write("\u0003")
          }
        },
      },
    })
    const timeout = setTimeout(() => proc.kill("SIGKILL"), 8_000)
    const exitCode = await proc.exited
    clearTimeout(timeout)
    proc.terminal?.close()

    expect(quitSent).toBe(true)
    expect(exitCode).toBe(0)
    expect(output).toContain("HEALTH OK")
    expect(output).not.toContain("Orphan text error")
    expect(output).not.toContain("solid-js/dist/server.js")
  } finally {
    workspace.cleanup()
  }
}, 15_000)
