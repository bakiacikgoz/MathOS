import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { executeReleaseCheck, RELEASE_CHECK_ORDER, type ReleaseCommandRunner } from "../scripts/release-check.ts"
import { compareResearchBaseline } from "../scripts/research-regression.ts"
import { runRetrievalRegression } from "../scripts/retrieval-regression.ts"

const successfulRunner: ReleaseCommandRunner = async (command) => ({
  exitCode: 0,
  stdout: command[0] === "git" ? "0123456789abcdef0123456789abcdef01234567\n" : command.includes("--version") ? "MathOS 1.0.0-rc.1\n" : command.some((part) => part.endsWith("run-v1-qualification.ts")) ? "{\"ready\":true}\n" : command.some((part) => part.endsWith("-regression.ts") || part.endsWith("lean-smoke.ts")) ? "{\"passed\":true}\n" : "1 pass\n",
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
  })

  test("Windows skips only checks that require a supported OS sandbox or Lean release platform", async () => {
    const report = await executeReleaseCheck({ runner: successfulRunner, platform: "win32" })
    expect(report.checks.filter((check) => check.status === "SKIPPED_UNSUPPORTED_PLATFORM").map((check) => check.name)).toEqual([
      "sandbox-security-tests",
      "lean-smoke",
    ])
    expect(report.ready).toBe(true)
  })

  test("research and retrieval regressions run from tracked immutable fixtures", async () => {
    expect((await compareResearchBaseline()).passed).toBe(true)
    const retrieval = await runRetrievalRegression()
    expect(retrieval.passed).toBe(true)
    expect(retrieval.fixtureSource).toBe("retrieval-v3-development-frozen")
    expect(retrieval.candidateDecision).toBe("INCONCLUSIVE")
  }, 15_000)

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
