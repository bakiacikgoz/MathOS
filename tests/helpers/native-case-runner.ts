import { spawn, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { test } from "bun:test"

const CHILD_CASE = "MATHOS_NATIVE_CASE_CHILD"
export const NATIVE_CASE_ROOT = "MATHOS_NATIVE_CASE_ROOT"

export interface OwnedProcessResult {
  exitCode: number | null
  output: string
  timedOut: boolean
}

type OwnedProcessOptions = {
  cwd: string
  env: NodeJS.ProcessEnv
  budgetMs: number
  /** Injected only by the termination-failure regression test. */
  stopTree?: (pid: number) => void
}

function stopProcessTree(pid: number): void {
  if (process.platform === "win32") {
    const killed = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      timeout: 30_000,
      encoding: "utf8",
    })
    if (killed.status !== 0) {
      throw new Error(String(killed.stderr || killed.error || `taskkill exited ${killed.status}`))
    }
  } else {
    try { process.kill(-pid, "SIGKILL") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error }
  }
}

/** The deadline owns the entire subprocess tree, not merely the Bun test process. */
export async function runOwnedProcess(
  command: readonly string[],
  options: OwnedProcessOptions,
): Promise<OwnedProcessResult> {
  if (!command[0] || !Number.isFinite(options.budgetMs) || options.budgetMs <= 0) {
    throw new Error("An owned process needs a command and a positive deadline")
  }
  const child = spawn(command[0], command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  const append = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-128_000) }
  child.stdout?.on("data", append)
  child.stderr?.on("data", append)
  let settled = false
  const closed = new Promise<number | null>((resolveClosed, rejectClosed) => {
    child.once("error", rejectClosed)
    child.once("close", (exitCode) => { settled = true; resolveClosed(exitCode) })
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<"timeout">((resolveDeadline) => {
    timer = setTimeout(() => resolveDeadline("timeout"), options.budgetMs)
  })
  try {
    const first = await Promise.race([closed, deadline])
    if (first !== "timeout") return { exitCode: first, output, timedOut: false }
    if (!settled) {
      if (!child.pid) throw new Error("Owned process exceeded its deadline without a process ID; shutdown is unconfirmed")
      try { (options.stopTree ?? stopProcessTree)(child.pid) }
      catch (error) {
        if (!settled) throw new Error(`Could not stop owned process tree PID ${child.pid}; shutdown is unconfirmed`, { cause: error })
      }
    }
    // Cleanup belongs after the process has released its file handles.
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        closed,
        new Promise<never>((_, reject) => {
          closeTimer = setTimeout(() => reject(new Error(`Owned process PID ${child.pid ?? "unknown"} did not close after termination; shutdown is unconfirmed`)), 30_000)
        }),
      ])
    } finally {
      if (closeTimer) clearTimeout(closeTimer)
    }
    return { exitCode: child.exitCode, output, timedOut: true }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function removeCaseRoot(root: string): void {
  const absolute = resolve(root)
  const systemTemp = resolve(tmpdir())
  if (!absolute.startsWith(systemTemp + sep) || !basename(absolute).startsWith("mathos-native-case-")) {
    throw new Error(`Refusing to remove unexpected native test root: ${absolute}`)
  }
  rmSync(absolute, { recursive: true, force: true })
}

export function nativeCase(name: string, file: string, budgetMs: number, body: () => Promise<void>): void {
  const register = Bun.which("lake") ? test : test.skip
  register(name, async () => {
    if (process.env[CHILD_CASE] === name) {
      await body()
      return
    }
    await runNativeCaseProcess(name, file, budgetMs)
  }, budgetMs + 90_000)
}

/** Fixture deletion is allowed only after the owned process reports a confirmed close. */
export async function runNativeCaseProcess(
  name: string,
  file: string,
  budgetMs: number,
  runner: typeof runOwnedProcess = runOwnedProcess,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "mathos-native-case-"))
  let closed = false
  try {
    const result = await runner(
      [process.execPath, "test", file, "--test-name-pattern", name],
      {
        cwd: process.cwd(),
        env: { ...process.env, [CHILD_CASE]: name, [NATIVE_CASE_ROOT]: root },
        budgetMs,
      },
    )
    closed = true
    if (result.timedOut) throw new Error(`Native case ${name} exceeded ${budgetMs}ms:\n${result.output}`)
    if (result.exitCode !== 0 || !result.output.includes(name) || !/\b1 pass\b/.test(result.output)) {
      throw new Error(`Native case ${name} failed (${result.exitCode}):\n${result.output}`)
    }
  } catch (error) {
    if (!closed) throw new Error(`Native case ${name} has unconfirmed process shutdown; fixture retained at ${root}: ${String(error)}`, { cause: error })
    throw error
  } finally {
    if (closed) removeCaseRoot(root)
  }
}
