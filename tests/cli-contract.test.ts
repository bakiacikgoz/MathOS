import { describe, expect, test } from "bun:test"
import { MathOSError, cliExitCode, formatCliError } from "@mathos/shared"

describe("CLI contract", () => {
  test("maps stable error classes to the documented 0-5 exit codes", () => {
    expect(cliExitCode(new MathOSError("CONFIG_INVALID", "bad"))).toBe(2)
    expect(cliExitCode(new MathOSError("LEAN_NOT_INSTALLED", "missing"))).toBe(3)
    expect(cliExitCode(new MathOSError("FORMAL_PROOF_FAILED", "failed"))).toBe(4)
    expect(cliExitCode(new MathOSError("WORKSPACE_CONFLICT", "conflict"))).toBe(5)
    expect(cliExitCode(new Error("boom"))).toBe(1)
  })

  test("normal diagnostics hide stacks and secret-shaped details", () => {
    const error = new MathOSError("CONFIG_INVALID", "bad token", { apiKey: "canary", safe: "visible" })
    error.stack = "SECRET STACK"
    const normal = formatCliError(error, { debug: false })
    expect(JSON.stringify(normal)).not.toContain("canary")
    expect(JSON.stringify(normal)).not.toContain("SECRET STACK")
    expect(normal.remediation).toBeTruthy()
    expect(formatCliError(error, { debug: true }).stack).toContain("SECRET STACK")
  })
})
