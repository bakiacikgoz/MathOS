import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { executeReleaseCheck, RELEASE_CHECK_ORDER, runReleaseCommand, type ReleaseCommandRunner } from "../scripts/release-check.ts"
import { compareResearchBaseline } from "../scripts/research-regression.ts"
import { runRetrievalRegression } from "../scripts/retrieval-regression.ts"

const successfulRunner: ReleaseCommandRunner = async (command) => ({
  exitCode: 0,
  stdout: command[0] === "git" ? "0123456789abcdef0123456789abcdef01234567\n" : command.includes("--version") ? "MathOS 1.0.0-rc.1\n" : command.some((part) => part.endsWith("run-v1-qualification.ts") || part.endsWith("final-product-capabilities.ts")) ? "{\"ready\":true}\n" : command.some((part) => part.endsWith("-regression.ts") || part.endsWith("lean-smoke.ts")) ? "{\"passed\":true}\n" : "1 pass\n",
  stderr: "",
  timedOut: false,
  durationMs: 1,
})

describe("release check contract", () => {
  test("runs every required check in order and emits provenance", async () => {
    const report = await executeReleaseCheck({ runner: successfulRunner, platform: "darwin" })
    expect(report.checks.map((check) => check.name)).toEqual([...RELEASE_CHECK_ORDER])
    expect(report.checks).toHaveLength(RELEASE_CHECK_ORDER.length)
    expect(report.version).toBe("1.0.0-rc.1")
    expect(report.gitRevision).toBe("0123456789abcdef0123456789abcdef01234567")
    expect(report.ready).toBe(true)
  })

  test("missing checks and timeouts fail closed", async () => {
    const timeoutRunner: ReleaseCommandRunner = async (command, options) => command[0] === "git"
      ? successfulRunner(command, options)
      : { exitCode: null, stdout: "", stderr: "", timedOut: true, durationMs: 1 }
    const report = await executeReleaseCheck({
      runner: timeoutRunner,
      platform: "darwin",
      commandOverrides: { "secret-redaction": [] },
    })
    expect(report.checks.find((check) => check.name === "secret-redaction")?.evidence).toContain("missing")
    expect(report.checks.filter((check) => check.name !== "secret-redaction").every((check) => check.status === "FAIL")).toBe(true)
    expect(report.ready).toBe(false)
  })

  test("only a platform limitation can be skipped", async () => {
    const report = await executeReleaseCheck({ runner: successfulRunner, platform: "linux" })
    expect(report.checks.filter((check) => check.status === "SKIPPED_UNSUPPORTED_PLATFORM").map((check) => check.name)).toEqual(["lean-smoke"])
    expect(report.checks.every((check) => ["PASS", "SKIPPED_UNSUPPORTED_PLATFORM"].includes(check.status))).toBe(true)
    expect(report.ready).toBe(false)
  })

  test("Windows runs every required check on the supported release platform", async () => {
    const report = await executeReleaseCheck({ runner: successfulRunner, platform: "win32" })
    expect(report.checks.filter((check) => check.status === "SKIPPED_UNSUPPORTED_PLATFORM").map((check) => check.name)).toEqual([])
    expect(report.ready).toBe(true)
  })

  test("research and retrieval regressions run from tracked immutable fixtures", async () => {
    expect((await compareResearchBaseline()).passed).toBe(true)
    const retrieval = await runRetrievalRegression()
    expect(retrieval.passed).toBe(true)
    expect(retrieval.fixtureSource).toBe("retrieval-v3-development-frozen")
    expect(retrieval.candidateDecision).toBe("INCONCLUSIVE")
  }, 30_000)

  test("version output must match package version", async () => {
    const runner: ReleaseCommandRunner = async (command, options) => {
      const result = await successfulRunner(command, options)
      return command.includes("--version") ? { ...result, stdout: "MathOS 9.9.9\n" } : result
    }
    const report = await executeReleaseCheck({ runner, platform: "darwin" })
    expect(report.checks[0]?.status).toBe("FAIL")
    expect(report.ready).toBe(false)
  })

  test("zero-test and malformed regression successes cannot bypass evidence checks", async () => {
    const runner: ReleaseCommandRunner = async (command, options) => {
      const result = await successfulRunner(command, options)
      if (command.includes("tests/verification-trust.test.ts")) return { ...result, stdout: "0 pass\n" }
      if (command.includes("scripts/research-regression.ts")) return { ...result, stdout: "not-json\n" }
      return result
    }
    const report = await executeReleaseCheck({ runner, platform: "darwin" })
    expect(report.checks.find((check) => check.name === "verification-trust-tests")?.status).toBe("FAIL")
    expect(report.checks.find((check) => check.name === "research-regression")?.status).toBe("FAIL")
    expect(report.ready).toBe(false)
  })

  test.skipIf(process.platform === "win32")("package script starts without a global bun on PATH", () => {
    const root = resolve(import.meta.dir, "..")
    const result = Bun.spawnSync([process.execPath, "run", "release-check", "--contract-probe"], {
      cwd: root,
      env: { ...process.env, PATH: "/usr/bin:/bin" },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.exitCode).toBe(0)
    const output = new TextDecoder().decode(result.stdout)
    expect(JSON.parse(output.slice(output.indexOf("{")))).toMatchObject({ ok: true })
  })
})

test("Windows release executes real Lean and sandbox checks", async () => {
  const executed: string[][] = []
  await executeReleaseCheck({ platform: "win32", runner: async (command, options) => { executed.push(command); return successfulRunner(command, options) } })
  expect(executed.some(command => command.includes("tests/sandbox-security.test.ts"))).toBe(true)
  expect(executed.some(command => command.includes("scripts/lean-smoke.ts"))).toBe(true)
})

test("generic pass text cannot substitute for final platform capability evidence", async () => {
  const report = await executeReleaseCheck({ platform: "darwin", runner: async (command, options) => {
    const result = await successfulRunner(command, options)
    return command.includes("scripts/final-product-capabilities.ts") ? { ...result, stdout: "1 pass\n" } : result
  } })
  expect(report.checks.find(check => check.name === "final-product-capabilities")?.status).toBe("FAIL")
  expect(report.ready).toBe(false)
})

test("release runner confirms owned tree closure and retains raw failure logs", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-release-runner-test-"))
  const child = join(root, "child.ts"), grandchild = join(root, "grandchild.ts"), childPidPath = join(root, "child.pid"), grandchildPidPath = join(root, "grandchild.pid")
  writeFileSync(child, `import { spawn } from "node:child_process"; import { writeFileSync } from "node:fs"; writeFileSync(process.argv[4]!, String(process.pid)); spawn(process.execPath, [process.argv[2]!, process.argv[3]!], { stdio: "inherit", windowsHide: true }); console.log("owned release command started"); setInterval(() => {}, 1000)`)
  writeFileSync(grandchild, `import { writeFileSync } from "node:fs"; writeFileSync(process.argv[2]!, String(process.pid)); setInterval(() => {}, 1000)`)
  const retained: string[] = []
  let shutdownConfirmed = false
  const alive = (pid: number): boolean => {
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid owned release test PID: ${pid}`)
    try { process.kill(pid, 0); return true }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false
      throw error
    }
  }
  const readPid = (path: string): number | null => existsSync(path) ? Number(readFileSync(path, "utf8")) : null
  const closedTree = async (childPid: number, grandchildPid: number): Promise<boolean> => {
    const until = Date.now() + 3_000
    while (Date.now() < until) {
      if (!alive(childPid) && !alive(grandchildPid)) return true
      await Bun.sleep(50)
    }
    return !alive(childPid) && !alive(grandchildPid)
  }
  const ownedCleanup = async (path: string, prefix: string): Promise<void> => {
    const absolute = resolve(path)
    if (!absolute.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(absolute).startsWith(prefix)) throw new Error(`Unsafe release runner test cleanup: ${absolute}`)
    for (let attempt = 0; attempt < 4; attempt++) {
      try { rmSync(absolute, { recursive: true, force: true }); return }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (attempt === 3 || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(code ?? "")) throw error
        await Bun.sleep(100)
      }
    }
  }
  try {
    const timeout = await runReleaseCommand([process.execPath, child, grandchild, grandchildPidPath, childPidPath], { cwd: root, timeoutMs: 1_500 })
    shutdownConfirmed = timeout.shutdownConfirmed === true
    if (timeout.diagnosticLogDir) retained.push(timeout.diagnosticLogDir)
    expect(timeout.timedOut).toBe(true)
    expect(timeout.exitCode).toBeNull()
    expect(shutdownConfirmed).toBe(true)
    expect(timeout.diagnosticLogDir).toBeTruthy()
    expect(readFileSync(join(timeout.diagnosticLogDir!, "stdout.log"), "utf8")).toContain("owned release command started")
    const childPid = readPid(childPidPath), grandchildPid = readPid(grandchildPidPath)
    expect(childPid).toBeGreaterThan(0)
    expect(grandchildPid).toBeGreaterThan(0)
    expect(await closedTree(childPid!, grandchildPid!)).toBe(true)
    const failed = await runReleaseCommand([process.execPath, "-e", "console.error('release failure'); process.exit(7)"], { cwd: root, timeoutMs: 5_000 })
    shutdownConfirmed &&= failed.shutdownConfirmed === true
    if (failed.diagnosticLogDir) retained.push(failed.diagnosticLogDir)
    expect(failed.exitCode).toBe(7)
    expect(failed.shutdownConfirmed).toBe(true)
    expect(failed.diagnosticLogDir).toBeTruthy()
    expect(readFileSync(join(failed.diagnosticLogDir!, "stderr.log"), "utf8")).toContain("release failure")
  } finally {
    const childPid = readPid(childPidPath), grandchildPid = readPid(grandchildPidPath)
    if (!shutdownConfirmed || childPid === null || grandchildPid === null || !Number.isInteger(childPid) || !Number.isInteger(grandchildPid) || childPid <= 0 || grandchildPid <= 0 || !await closedTree(childPid, grandchildPid)) {
      throw new Error(`Release runner shutdown unconfirmed; retained owned fixture ${root}, child PID ${childPid ?? "missing"}, grandchild PID ${grandchildPid ?? "missing"}`)
    }
    for (const path of retained) await ownedCleanup(path, "mathos-release-command-")
    await ownedCleanup(root, "mathos-release-runner-test-")
  }
}, 15_000)
