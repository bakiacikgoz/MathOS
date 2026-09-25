import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installLean, leanInstallStatus, progressFromLine, writeFormalProject, type LeanInstallEvent, type LeanInstallRuntime } from "@mathos/lean"
import { cancelJob, pollJob, resetJobs, startJob } from "../apps/tui/src/jobs.ts"
import { blockedCommandReason } from "../apps/desktop/host/protocol.ts"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); resetJobs() })
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "mathos-lean-install-")); dirs.push(dir); return dir }

/** A machine where commands succeed by creating what the real tool would, so every step can be observed. */
function fakeRuntime(home: string, options: { git?: boolean; fail?: Record<string, { code: number; lines: string[] }>; free?: number } = {}) {
  const calls: string[][] = []
  const runtime: LeanInstallRuntime = {
    platform: "linux", home, tmp: join(home, "tmp"),
    which: (name) => name === "git" && options.git !== false ? "/usr/bin/git" : null,
    freeBytes: () => options.free ?? 100 * 1024 ** 3,
    async download(_url, destination) { writeFileSync(destination, "#!/bin/sh\n") },
    async spawn(argv, { cwd, onLine }) {
      calls.push(argv)
      const key = argv.map((part) => part.replace(/^.*\//, "")).slice(0, 4).join(" ")
      for (const [pattern, failure] of Object.entries(options.fail ?? {})) if (key.startsWith(pattern)) { failure.lines.forEach(onLine); return failure.code }
      if (argv[0] === "sh") { mkdirSync(join(home, ".elan", "bin"), { recursive: true }); writeFileSync(join(home, ".elan", "bin", "elan"), ""); writeFileSync(join(home, ".elan", "bin", "lake"), "") }
      if (key.includes("toolchain install")) { mkdirSync(join(home, ".elan", "toolchains", "leanprover--lean4---v4.33.1"), { recursive: true }); onLine("downloading 50%\r") }
      if (key.endsWith("lake update")) { mkdirSync(join(cwd!, ".lake", "packages", "mathlib"), { recursive: true }); writeFileSync(join(cwd!, ".lake", "packages", "mathlib", "Mathlib.lean"), "") }
      if (key.includes("cache get")) { onLine("Downloaded: 40 file(s) [attempted 40/80 = 50%]"); const lib = join(cwd!, ".lake", "packages", "mathlib", ".lake", "build", "lib", "lean"); mkdirSync(lib, { recursive: true }); writeFileSync(join(lib, "Mathlib.olean"), "") }
      if (key.endsWith("lake build")) onLine("✔ [3/3] Built MathosFormal")
      return 0
    },
  }
  return { runtime, calls }
}

describe("Lean install", () => {
  test("progress is read from elan, lake and Mathlib cache output", () => {
    expect(progressFromLine("✔ [12/48] Built Mathlib.Logic")).toBe(25)
    expect(progressFromLine("Downloaded: 10 file(s) [attempted 100/400 = 25%]")).toBe(25)
    expect(progressFromLine("info: downloading 73.4%")).toBe(73)
    expect(progressFromLine("no numbers here")).toBeNull()
  })

  test("installs every missing piece in order and ends ready", async () => {
    const home = temp(), workspace = temp(), { runtime, calls } = fakeRuntime(home), events: LeanInstallEvent[] = []
    const status = await installLean(workspace, (event) => events.push(event), { runtime })
    expect(status.ready).toBe(true)
    const done = events.filter((event) => event.type === "step" && event.state === "done").map((event) => event.step)
    expect(done).toEqual(["git", "elan", "project", "toolchain", "mathlib", "cache", "build"])
    expect(calls[0]).toEqual(["sh", join(home, "tmp", "elan-init.sh"), "-y", "--default-toolchain", "leanprover/lean4:v4.33.1"])
    expect(events.some((event) => event.type === "progress" && event.step === "cache" && event.percent === 50)).toBe(true)
    // Mathlib is fetched from git directly, not through the Reservoir index.
    expect(readFileSync(join(workspace, "formal", "lakefile.toml"), "utf8")).toContain('git = "https://github.com/leanprover-community/mathlib4"')
  })

  test("a second run only does what is missing", async () => {
    const home = temp(), workspace = temp(), { runtime } = fakeRuntime(home)
    await installLean(workspace, () => {}, { runtime })
    const events: LeanInstallEvent[] = []
    const again = fakeRuntime(home)
    await installLean(workspace, (event) => events.push(event), { runtime: again.runtime })
    const skipped = events.filter((event) => event.type === "step" && event.state === "skipped").map((event) => event.step)
    expect(skipped).toEqual(["elan", "toolchain", "mathlib"])
    expect(again.calls.some((argv) => argv[0] === "sh")).toBe(false)
  })

  test("missing git stops before downloading anything", async () => {
    const home = temp(), workspace = temp(), { runtime, calls } = fakeRuntime(home, { git: false }), events: LeanInstallEvent[] = []
    await expect(installLean(workspace, (event) => events.push(event), { runtime })).rejects.toThrow("LEAN_INSTALL_GIT_MISSING")
    expect(calls).toEqual([])
    expect(events.at(-1)).toMatchObject({ type: "step", step: "git", state: "failed", code: "LEAN_INSTALL_GIT_MISSING" })
  })

  test("too little disk space is refused up front", async () => {
    const home = temp(), workspace = temp(), { runtime, calls } = fakeRuntime(home, { free: 2 * 1024 ** 3 })
    await expect(installLean(workspace, () => {}, { runtime })).rejects.toThrow("LEAN_INSTALL_DISK_FULL")
    expect(calls).toEqual([])
  })

  test("network failures are named as such, with the tool's backtrace left out", async () => {
    const home = temp(), workspace = temp(), events: LeanInstallEvent[] = []
    const { runtime } = fakeRuntime(home, { fail: { "elan toolchain install": { code: 1, lines: ["error: error during download", "info: caused by: [56] Failure when receiving data from the peer", "info: backtrace:", "   0: elan_utils::fetch"] } } })
    await expect(installLean(workspace, (event) => events.push(event), { runtime })).rejects.toThrow("LEAN_INSTALL_NETWORK")
    expect(events.some((event) => event.type === "log" && /elan_utils/.test(event.line))).toBe(false)
  })

  test("an unreachable Mathlib cache fails fast instead of trying every file", async () => {
    const home = temp(), workspace = temp()
    const lines = Array.from({ length: 120 }, (_, index) => `Downloaded: 0 file(s) [attempted ${index + 1}/8690 = 0%], Decompressed: 0, ${index + 1} download failed`)
    const { runtime } = fakeRuntime(home, { fail: { "lake exe cache": { code: 0, lines } } })
    await expect(installLean(workspace, () => {}, { runtime })).rejects.toThrow("LEAN_INSTALL_NETWORK")
  })

  test("older MathOS lakefiles that used Reservoir are migrated to git", () => {
    const workspace = temp(), project = join(workspace, "formal")
    mkdirSync(project, { recursive: true })
    writeFileSync(join(project, "lakefile.toml"), 'name = "mathosFormal"\nversion = "0.1.0"\ndefaultTargets = ["MathosFormal"]\n\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\nrev = "v4.33.1"\n\n[[lean_lib]]\nname = "MathosFormal"\n')
    writeFormalProject(workspace)
    expect(readFileSync(join(project, "lakefile.toml"), "utf8")).toContain("git = ")
    // A lakefile the user wrote is left alone.
    writeFileSync(join(project, "lakefile.toml"), "custom\n")
    writeFormalProject(workspace)
    expect(readFileSync(join(project, "lakefile.toml"), "utf8")).toBe("custom\n")
  })

  test("status reports what is present", () => {
    const home = temp(), workspace = temp(), { runtime } = fakeRuntime(home)
    const status = leanInstallStatus(workspace, runtime)
    expect(status).toMatchObject({ git: true, elan: null, project: false, mathlibFetched: false, ready: false })
    expect(existsSync(join(workspace, "formal"))).toBe(false)
  })
})

describe("host jobs", () => {
  test("a job's events are polled incrementally and it ends with its result", async () => {
    const started = startJob("demo", null, async (emit) => { emit({ type: "log", line: "a" }); emit({ type: "log", line: "b" }); return { ok: true } })
    await Bun.sleep(5)
    const first = pollJob(started.id, 0)
    expect(first.events.map((event) => event.line)).toEqual(["a", "b"])
    expect(first.state).toBe("done")
    expect(first.result).toEqual({ ok: true })
    expect(pollJob(started.id, first.next).events).toEqual([])
  })

  test("a keyed job is single-flight and can be cancelled", async () => {
    const work = (_emit: unknown, signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("LEAN_INSTALL_CANCELLED: stop"))))
    const a = startJob("lean-install", "k", work), b = startJob("lean-install", "k", work)
    expect(b).toEqual({ id: a.id, reused: true })
    expect(cancelJob(a.id)).toBe(true)
    await Bun.sleep(5)
    expect(pollJob(a.id).state).toBe("cancelled")
  })

  test("the desktop host refuses a foreground install that would block every other request", () => {
    expect(blockedCommandReason(["lean", "install", "--accept-downloads=lean,mathlib"])).toMatch(/background/)
    expect(blockedCommandReason(["lean", "install", "--accept-downloads=lean,mathlib", "--background"])).toBeNull()
  })
})
