import { describe, expect, test } from "bun:test"
import { inspectGitHead, inspectProcessTable, revisionsMatch } from "../scripts/qualification/vscode-extension-host-inspection.ts"

const output = (value: string) => ({ toString: () => value })

describe("VS Code Extension Host qualification inspection", () => {
  test("process inspection is bounded and returns parsed rows only after ps succeeds", () => {
    let timeout = 0
    const result = inspectProcessTable((_command, options) => {
      timeout = options.timeout
      return { exitCode: 0, stdout: output(" 10  1 mathos bridge stdio\n 11  1 other\n"), stderr: output("") }
    })
    expect(timeout).toBe(5_000)
    expect(result).toEqual({ ok: true, rows: ["10  1 mathos bridge stdio", "11  1 other"] })
  })

  test("process inspection fails closed on nonzero exit and runner errors", () => {
    expect(inspectProcessTable(() => ({ exitCode: 1, stdout: output(""), stderr: output("not permitted") }))).toEqual({ ok: false, rows: [], error: "ps exited 1: not permitted" })
    expect(inspectProcessTable(() => { throw new Error("timed out") })).toEqual({ ok: false, rows: [], error: "ps inspection failed: timed out" })
  })

  test("standalone revision must exactly match a valid current git HEAD", () => {
    const head = "0123456789abcdef0123456789abcdef01234567"
    expect(inspectGitHead("/repo", () => ({ exitCode: 0, stdout: output(`${head}\n`), stderr: output("") }))).toEqual({ ok: true, revision: head })
    expect(revisionsMatch(head, head)).toBe(true)
    expect(revisionsMatch("ffffffffffffffffffffffffffffffffffffffff", head)).toBe(false)
    expect(inspectGitHead("/repo", () => ({ exitCode: 1, stdout: output(""), stderr: output("bad repo") })).ok).toBe(false)
  })
})
