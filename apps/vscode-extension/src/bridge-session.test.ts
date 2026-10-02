import { describe, expect, test } from "bun:test"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { BridgeClient } from "./bridge-client.ts"
import { BridgeSession } from "./extension.ts"

const childClosed = new WeakMap<BridgeSession, Promise<void>>()

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`Bridge child did not become ready: ${path}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

function scriptedSession(root: string, script: string): BridgeSession {
  const node = Bun.which("node")
  if (!node) throw new Error("Node executable required for bridge pipe regression")
  class ScriptedClient extends BridgeClient {
    override spawnSpec() { return { ...super.spawnSpec(), command: node!, args: ["-e", script] } }
  }
  const session = new BridgeSession(new ScriptedClient({ workspaceRoot: root, trusted: true }))
  childClosed.set(session, new Promise(resolve => childOf(session).once("close", () => resolve())))
  return session
}

function childOf(session: BridgeSession): ChildProcessWithoutNullStreams {
  return (session as unknown as { process: ChildProcessWithoutNullStreams }).process
}

async function disposeAndWait(session: BridgeSession): Promise<void> {
  const closed = childClosed.get(session)
  if (!closed) throw new Error("Bridge fixture close event was not observed")
  session.dispose()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Bridge fixture child did not close")), 2_000) })])
  } finally { if (timer) clearTimeout(timer) }
}

function removeTestRoot(root: string, prefix: string): void {
  const target = resolve(root), tempRoot = resolve(tmpdir())
  if (!target.startsWith(`${tempRoot}${sep}`) || !basename(target).startsWith(prefix)) throw new Error(`Unsafe bridge test cleanup: ${target}`)
  rmSync(target, { recursive: true, force: true, ...(process.platform === "win32" ? { maxRetries: 3, retryDelay: 100 } : {}) })
}

describe("VS Code bridge session", () => {
  test("surfaces child stderr when the bridge exits before handshake", async () => {
    const session = new BridgeSession(new BridgeClient({ workspaceRoot: process.cwd(), trusted: true, executablePath: process.execPath }))
    try {
      await expect(session.start()).rejects.toThrow(/Script not found.*bridge/u)
    } finally {
      session.dispose()
    }
  })

  test("keeps the spawn cause when the configured bridge executable is missing", async () => {
    const executablePath = join(tmpdir(), `mathos-bridge-missing-${randomUUID()}`)
    const session = new BridgeSession(new BridgeClient({ workspaceRoot: process.cwd(), trusted: true, executablePath }))
    try {
      await expect(session.start()).rejects.toThrow(/MathOS bridge failed to start: (?=.*mathos-bridge-missing-)(?=.*ENOENT)/u)
    } finally { session.dispose() }
  })

  test("waits for delayed child stderr after a stdin write callback failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-bridge-race-"))
    const ready = join(root, "ready"), release = join(root, "release")
    const script = `const fs = require("node:fs"); fs.closeSync(0); fs.writeFileSync(${JSON.stringify(ready)}, "ready"); const timer = setInterval(() => { if (fs.existsSync(${JSON.stringify(release)})) { clearInterval(timer); setTimeout(() => { console.error("BRIDGE_DELAYED_DIAGNOSTIC"); process.exit(17) }, 75) } }, 5)`
    const session = scriptedSession(root, script)
    try {
      await waitForFile(ready)
      const child = childOf(session)
      child.stdin.write = ((_chunk: unknown, callback?: (error?: Error) => void) => {
        queueMicrotask(() => callback?.(new Error("EPIPE: broken pipe, write")))
        return false
      }) as typeof child.stdin.write
      const starting = session.start()
      writeFileSync(release, "go")
      await expect(starting).rejects.toThrow(/BRIDGE_DELAYED_DIAGNOSTIC/u)
    } finally {
      await disposeAndWait(session)
      removeTestRoot(root, "mathos-bridge-race-")
    }
  }, 10_000)

  test("a broken stdin pipe without child close fails within a bound and reaps the child", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-bridge-stuck-"))
    const ready = join(root, "ready")
    const script = `const fs = require("node:fs"); fs.closeSync(0); fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid)); setInterval(() => {}, 1000)`
    const session = scriptedSession(root, script)
    try {
      await waitForFile(ready)
      const starting = session.start()
      childOf(session).stdin.emit("error", new Error("EPIPE: broken pipe, write"))
      await expect(starting).rejects.toThrow(/MathOS bridge stdin/u)
      const pid = Number(readFileSync(ready, "utf8"))
      expect(Number.isSafeInteger(pid) && pid > 0).toBe(true)
      const deadline = Date.now() + 2_000
      let alive = true
      while (Date.now() < deadline) {
        try { process.kill(pid, 0) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
          alive = false
          break
        }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      expect(alive).toBe(false)
    } finally {
      await disposeAndWait(session)
      removeTestRoot(root, "mathos-bridge-stuck-")
    }
  }, 10_000)
})
