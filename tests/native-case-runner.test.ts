import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { runNativeCaseProcess, runOwnedProcess, NATIVE_CASE_ROOT } from "./helpers/native-case-runner.ts"

function removeOwnedFixture(root: string, prefix: string): void {
  const absolute = resolve(root)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith(prefix)) {
    throw new Error(`Unexpected owned-process fixture path: ${absolute}`)
  }
  rmSync(absolute, { recursive: true, force: true })
}

describe("native test process deadline", () => {
  test("stops the child and its grandchild before fixture cleanup", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-owned-process-"))
    const marker = join(root, "grandchild.pid")
    const grandchild = join(root, "grandchild.ts")
    const child = join(root, "child.ts")
    writeFileSync(grandchild, `import { openSync, writeSync } from "node:fs"\nconst fd = openSync(process.argv[2]!, "w")\nwriteSync(fd, String(process.pid))\nsetInterval(() => {}, 1000)\n`)
    writeFileSync(child, `import { spawn } from "node:child_process"\nspawn(process.execPath, [process.argv[2]!, process.argv[3]!], { stdio: "inherit", windowsHide: true })\nsetInterval(() => {}, 1000)\n`)
    let closed = false
    try {
      const result = await runOwnedProcess([process.execPath, child, grandchild, marker], {
        cwd: root,
        env: process.env,
        budgetMs: 2_000,
      })
      closed = true
      expect(result.timedOut).toBe(true)
      const grandchildPid = Number(readFileSync(marker, "utf8"))
      expect(Number.isInteger(grandchildPid)).toBe(true)
      expect(() => process.kill(grandchildPid, 0)).toThrow()
    } finally {
      if (closed) removeOwnedFixture(root, "mathos-owned-process-")
    }
  }, 15_000)

  test("retains the case fixture when process shutdown is unconfirmed", async () => {
    let caseRoot = ""
    try {
      await expect(runNativeCaseProcess("shutdown-failure", import.meta.path, 10, async (_command, options) => {
        caseRoot = options.env[NATIVE_CASE_ROOT] ?? ""
        throw new Error("Could not stop owned process tree PID 12345; shutdown is unconfirmed")
      })).rejects.toThrow(/fixture retained at .*mathos-native-case-.*PID 12345/)
      expect(existsSync(caseRoot)).toBe(true)
    } finally {
      if (caseRoot) removeOwnedFixture(caseRoot, "mathos-native-case-")
    }
  })

  test("reports the owned PID and leaves its fixture when termination fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "mathos-owned-process-"))
    const marker = join(root, "child.pid")
    const child = join(root, "child.ts")
    writeFileSync(child, `import { writeFileSync } from "node:fs"\nwriteFileSync(process.argv[2]!, String(process.pid))\nsetInterval(() => {}, 1000)\n`)
    let pid = 0
    let stopped = false
    try {
      await expect(runOwnedProcess([process.execPath, child, marker], {
        cwd: root,
        env: process.env,
        budgetMs: 2_000,
        stopTree: () => { throw new Error("injected termination failure") },
      })).rejects.toThrow(/Could not stop owned process tree PID \d+; shutdown is unconfirmed/)
      pid = Number(readFileSync(marker, "utf8"))
      expect(() => process.kill(pid, 0)).not.toThrow()
      expect(existsSync(root)).toBe(true)
    } finally {
      if (pid > 0) {
        process.kill(pid, "SIGKILL")
        for (let attempt = 0; attempt < 40; attempt++) {
          try { process.kill(pid, 0) }
          catch { stopped = true; break }
          await Bun.sleep(50)
        }
      }
      if (stopped) removeOwnedFixture(root, "mathos-owned-process-")
    }
    expect(stopped).toBe(true)
  }, 15_000)
})
