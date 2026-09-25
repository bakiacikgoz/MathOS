import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { FORMAL_PROJECT_DIR, PINNED_LEAN_TOOLCHAIN } from "./pin.ts"
import { writeFormalProject } from "./native.ts"

// Installs what formal work needs, one visible step at a time: elan (Lean's official version manager), the pinned
// Lean toolchain, the workspace's Lean project with the pinned Mathlib, Mathlib's prebuilt cache, and a first build.
// Every command is an official one; nothing is installed without the caller's explicit consent.

export type LeanInstallStep = "git" | "elan" | "toolchain" | "project" | "mathlib" | "cache" | "build"
export const LEAN_INSTALL_STEPS: LeanInstallStep[] = ["git", "elan", "project", "toolchain", "mathlib", "cache", "build"]
export type LeanInstallEvent =
  | { type: "step"; step: LeanInstallStep; state: "running" | "done" | "skipped" | "failed"; detail?: string; code?: string }
  | { type: "progress"; step: LeanInstallStep; percent: number }
  | { type: "log"; step: LeanInstallStep; line: string }

export interface LeanInstallRuntime {
  platform: NodeJS.Platform
  home: string
  tmp: string
  which(name: string): string | null
  /** Runs a command, reporting each output line (\r-separated progress lines too); resolves with the exit code. */
  spawn(argv: string[], options: { cwd?: string; env: Record<string, string | undefined>; signal?: AbortSignal; onLine(line: string): void }): Promise<number>
  download(url: string, destination: string): Promise<void>
  freeBytes(path: string): number | null
}

export interface LeanInstallStatus {
  schemaVersion: "mathos.lean-status.v1"
  pinnedToolchain: string
  git: boolean
  elan: string | null
  toolchainInstalled: boolean
  projectRoot: string
  project: boolean
  mathlibFetched: boolean
  mathlibBuilt: boolean
  ready: boolean
  freeBytes: number | null
}

/** Mathlib's cache and sources take about 6 GB; ask for some headroom before starting. */
export const LEAN_INSTALL_MIN_FREE_BYTES = 8 * 1024 ** 3
const ELAN_SH = "https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh"
const ELAN_PS1 = "https://raw.githubusercontent.com/leanprover/elan/master/elan-init.ps1"

export class LeanInstallError extends Error {
  constructor(public readonly code: string, public readonly step: LeanInstallStep, message: string) { super(`${code}: ${message}`) }
}

const exe = (runtime: LeanInstallRuntime, name: string) => runtime.platform === "win32" ? `${name}.exe` : name
const elanBin = (runtime: LeanInstallRuntime) => join(runtime.home, ".elan", "bin")
export function leanSearchPath(runtime: Pick<LeanInstallRuntime, "home"> = { home: homedir() }, path = process.env.PATH ?? ""): string {
  return `${join(runtime.home, ".elan", "bin")}${delimiter}${path}`
}
function findElan(runtime: LeanInstallRuntime): string | null {
  const local = join(elanBin(runtime), exe(runtime, "elan"))
  return existsSync(local) ? local : runtime.which("elan")
}
const toolchainDir = (runtime: LeanInstallRuntime, toolchain: string) =>
  join(runtime.home, ".elan", "toolchains", toolchain.replace("/", "--").replace(":", "---"))

function readToolchain(projectRoot: string): string {
  const path = join(projectRoot, "lean-toolchain")
  return existsSync(path) ? readFileSync(path, "utf8").trim() || PINNED_LEAN_TOOLCHAIN : PINNED_LEAN_TOOLCHAIN
}

export function leanInstallStatus(workspaceRoot: string, runtime: LeanInstallRuntime = bunInstallRuntime()): LeanInstallStatus {
  const projectRoot = join(workspaceRoot, FORMAL_PROJECT_DIR)
  const project = existsSync(join(projectRoot, "lakefile.toml")) || existsSync(join(projectRoot, "lakefile.lean"))
  const mathlibRoot = join(projectRoot, ".lake", "packages", "mathlib")
  const mathlibFetched = existsSync(join(mathlibRoot, "Mathlib.lean"))
  const mathlibBuilt = existsSync(join(mathlibRoot, ".lake", "build", "lib", "lean", "Mathlib.olean")) || existsSync(join(mathlibRoot, ".lake", "build", "lib", "Mathlib.olean"))
  const elan = findElan(runtime)
  const toolchain = readToolchain(projectRoot)
  const toolchainInstalled = Boolean(elan) && existsSync(toolchainDir(runtime, toolchain))
  const git = Boolean(runtime.which("git"))
  return {
    schemaVersion: "mathos.lean-status.v1", pinnedToolchain: toolchain, git, elan, toolchainInstalled, projectRoot, project, mathlibFetched, mathlibBuilt,
    ready: git && Boolean(elan) && toolchainInstalled && project && mathlibFetched && mathlibBuilt,
    freeBytes: runtime.freeBytes(existsSync(workspaceRoot) ? workspaceRoot : runtime.home),
  }
}

/** Percent from the progress formats elan, lake and Mathlib's cache print ("[12/340]", "attempted 120/7000", "37%"). */
export function progressFromLine(line: string): number | null {
  const ratio = /\[(\d+)\/(\d+)\]|attempted (\d+)\/(\d+)|\b(\d+)\s*\/\s*(\d+)\s+file/.exec(line)
  if (ratio) {
    const [done, total] = [ratio[1] ?? ratio[3] ?? ratio[5], ratio[2] ?? ratio[4] ?? ratio[6]].map(Number) as [number, number]
    if (total > 0 && done <= total) return Math.round((done / total) * 100)
  }
  const percent = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line)
  if (percent) { const value = Number(percent[1]); if (value >= 0 && value <= 100) return Math.round(value) }
  return null
}

function classify(step: LeanInstallStep, exitCode: number, tail: string[]): LeanInstallError {
  const text = tail.join("\n")
  if (/no space left|ENOSPC|disk full/i.test(text)) return new LeanInstallError("LEAN_INSTALL_DISK_FULL", step, "the disk is full")
  if (/could not resolve|timed out|connection (refused|reset)|failed to connect|network|SSL|TLS|curl: \(\d+\)|unable to access|error during download|CONNECT tunnel|failed to download|exited with code (6|7|28|35|56)\b|Reservoir lookup failed/i.test(text)) return new LeanInstallError("LEAN_INSTALL_NETWORK", step, tail.slice(-3).join(" ").slice(0, 300) || "network error")
  return new LeanInstallError("LEAN_INSTALL_STEP_FAILED", step, `exit ${exitCode}: ${tail.slice(-4).join(" ").slice(0, 400)}`)
}

/**
 * Runs the whole installation. Steps already satisfied are reported as skipped, so re-running after a failure
 * (or on a machine that already has Lean) only does what is missing.
 */
export async function installLean(workspaceRoot: string, emit: (event: LeanInstallEvent) => void, options: { signal?: AbortSignal; runtime?: LeanInstallRuntime } = {}): Promise<LeanInstallStatus> {
  const runtime = options.runtime ?? bunInstallRuntime(), signal = options.signal
  const env = { ...process.env, PATH: leanSearchPath(runtime), RUST_BACKTRACE: "0" }
  const run = async (step: LeanInstallStep, argv: string[], cwd?: string) => {
    const tail: string[] = []
    // Mathlib's cache tool tries every file even when the server is unreachable, which takes an hour to fail;
    // when the first hundred downloads all fail, stop and say the network is the problem.
    const local = new AbortController(), stop = () => local.abort()
    signal?.addEventListener("abort", stop)
    let unreachable = false
    const code = await runtime.spawn(argv, { cwd, env, signal: local.signal, onLine: (line) => {
      const clean = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trimEnd()
      const cache = /Downloaded:\s*(\d+)\s*file\(s\)\s*\[attempted (\d+)\//.exec(clean)
      if (cache && Number(cache[1]) === 0 && Number(cache[2]) >= 100 && !unreachable) { unreachable = true; local.abort() }
      if (!clean.trim()) return
      if (/^\s*(\d+:\s|at\s)|backtrace:/.test(clean)) return
      tail.push(clean); if (tail.length > 12) tail.shift()
      emit({ type: "log", step, line: clean.slice(0, 400) })
      const percent = progressFromLine(clean); if (percent !== null) emit({ type: "progress", step, percent })
    } })
    signal?.removeEventListener("abort", stop)
    if (signal?.aborted) throw new LeanInstallError("LEAN_INSTALL_CANCELLED", step, "cancelled")
    if (unreachable) throw new LeanInstallError("LEAN_INSTALL_NETWORK", step, "Mathlib's cache server could not be reached")
    if (code !== 0) throw classify(step, code, tail)
  }
  const step = async (name: LeanInstallStep, skip: string | null, body: () => Promise<string | void>) => {
    if (signal?.aborted) throw new LeanInstallError("LEAN_INSTALL_CANCELLED", name, "cancelled")
    if (skip !== null) { emit({ type: "step", step: name, state: "skipped", detail: skip }); return }
    emit({ type: "step", step: name, state: "running" })
    try { const detail = await body(); emit({ type: "step", step: name, state: "done", ...(detail ? { detail } : {}) }) }
    catch (error) {
      const failure = error instanceof LeanInstallError ? error : new LeanInstallError("LEAN_INSTALL_STEP_FAILED", name, error instanceof Error ? error.message : String(error))
      emit({ type: "step", step: name, state: "failed", code: failure.code, detail: failure.message.replace(/^[A-Z_]+:\s*/, "") })
      throw failure
    }
  }

  const before = leanInstallStatus(workspaceRoot, runtime)
  const free = before.freeBytes
  if (!before.mathlibFetched && free !== null && free < LEAN_INSTALL_MIN_FREE_BYTES) {
    const error = new LeanInstallError("LEAN_INSTALL_DISK_FULL", "git", `${Math.round(free / 1024 ** 3)} GB free; Mathlib needs about 8 GB`)
    emit({ type: "step", step: "git", state: "failed", code: error.code, detail: error.message.replace(/^[A-Z_]+:\s*/, "") }); throw error
  }

  // Lake fetches Mathlib with git, so it is a prerequisite rather than something MathOS installs itself.
  await step("git", null, async () => {
    if (!runtime.which("git")) throw new LeanInstallError("LEAN_INSTALL_GIT_MISSING", "git", "git is required to download Mathlib")
  })

  await step("elan", before.elan ? "already installed" : null, async () => {
    mkdirSync(runtime.tmp, { recursive: true })
    if (runtime.platform === "win32") {
      const script = join(runtime.tmp, "elan-init.ps1")
      await runtime.download(ELAN_PS1, script)
      await run("elan", ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-NoPrompt", "1", "-DefaultToolchain", PINNED_LEAN_TOOLCHAIN])
    } else {
      const script = join(runtime.tmp, "elan-init.sh")
      await runtime.download(ELAN_SH, script)
      await run("elan", ["sh", script, "-y", "--default-toolchain", PINNED_LEAN_TOOLCHAIN])
    }
    if (!findElan(runtime)) throw new LeanInstallError("LEAN_INSTALL_STEP_FAILED", "elan", "elan finished but was not found in ~/.elan/bin")
  })

  const projectRoot = before.projectRoot
  await step("project", null, async () => { writeFormalProject(workspaceRoot, projectRoot); return projectRoot })

  const toolchain = readToolchain(projectRoot)
  const elan = findElan(runtime) ?? exe(runtime, "elan")
  await step("toolchain", before.toolchainInstalled && before.pinnedToolchain === toolchain ? toolchain : null, async () => {
    await run("toolchain", [elan, "toolchain", "install", toolchain]); return toolchain
  })

  const lake = join(elanBin(runtime), exe(runtime, "lake"))
  const lakeCmd = existsSync(lake) ? lake : "lake"
  await step("mathlib", leanInstallStatus(workspaceRoot, runtime).mathlibFetched ? "already downloaded" : null, async () => {
    await run("mathlib", [lakeCmd, "update"], projectRoot)
  })
  await step("cache", null, async () => { await run("cache", [lakeCmd, "exe", "cache", "get"], projectRoot) })
  await step("build", null, async () => { await run("build", [lakeCmd, "build"], projectRoot) })

  return leanInstallStatus(workspaceRoot, runtime)
}

export function bunInstallRuntime(): LeanInstallRuntime {
  const home = homedir()
  return {
    platform: process.platform, home, tmp: join(tmpdir(), "mathos-lean-install"),
    which: (name) => Bun.which(name, { PATH: leanSearchPath({ home }) }),
    async spawn(argv, { cwd, env, signal, onLine }) {
      const proc = Bun.spawn(argv, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
      // lake runs Mathlib's cache tool as a child; stop the whole tree, not just lake.
      const abort = () => {
        try { if (process.platform === "win32") Bun.spawnSync(["taskkill", "/T", "/F", "/PID", String(proc.pid)]); else Bun.spawnSync(["pkill", "-TERM", "-P", String(proc.pid)]) } catch {}
        proc.kill()
      }
      signal?.addEventListener("abort", abort)
      const pump = async (stream: ReadableStream<Uint8Array>) => {
        const decoder = new TextDecoder(); let buffer = ""
        for await (const chunk of stream) {
          buffer += decoder.decode(chunk, { stream: true })
          const parts = buffer.split(/\r\n|\n|\r/); buffer = parts.pop() ?? ""
          for (const part of parts) onLine(part)
        }
        if (buffer) onLine(buffer)
      }
      try { await Promise.all([pump(proc.stdout), pump(proc.stderr)]); return await proc.exited }
      finally { signal?.removeEventListener("abort", abort) }
    },
    async download(url, destination) {
      const response = await fetch(url)
      if (!response.ok) throw new LeanInstallError("LEAN_INSTALL_NETWORK", "elan", `${url} returned ${response.status}`)
      rmSync(destination, { force: true })
      writeFileSync(destination, new Uint8Array(await response.arrayBuffer()))
    },
    freeBytes(path) { try { const stats = statfsSync(path); return Number(stats.bavail) * Number(stats.bsize) } catch { return null } },
  }
}
