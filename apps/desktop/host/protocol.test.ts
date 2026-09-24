import { describe, expect, test } from "bun:test"
import { blockedCommandReason, createLineSplitter, parseHostRequest } from "./protocol.ts"

describe("desktop host protocol", () => {
  test("parses well-formed requests and rejects malformed ones", () => {
    expect(parseHostRequest(JSON.stringify({ id: "1", cwd: "/tmp", args: ["status", "--json"] }))).toEqual({ id: "1", cwd: "/tmp", args: ["status", "--json"] })
    expect(() => parseHostRequest("nope")).toThrow("DESKTOP_HOST_REQUEST_INVALID")
    expect(() => parseHostRequest(JSON.stringify({ id: "1", cwd: "/tmp", args: [1] }))).toThrow("args")
    expect(() => parseHostRequest(JSON.stringify({ id: "", cwd: "/tmp", args: [] }))).toThrow("id")
  })

  test("blocks commands that need a terminal or never return", () => {
    expect(blockedCommandReason([])).not.toBeNull()
    expect(blockedCommandReason(["secrets", "set", "openai"])).not.toBeNull()
    expect(blockedCommandReason(["provider", "login", "p"])).not.toBeNull()
    expect(blockedCommandReason(["atlas", "--no-open"])).not.toBeNull()
    expect(blockedCommandReason(["bridge", "stdio"])).not.toBeNull()
    expect(blockedCommandReason(["atlas", "snapshot", "--json"])).toBeNull()
    expect(blockedCommandReason(["claims", "--json"])).toBeNull()
  })

  test("reassembles lines split across chunks", () => {
    const lines: string[] = []
    const push = createLineSplitter((line) => lines.push(line))
    push('{"a":')
    push('1}\n{"b"')
    push(':2}\r\n\n')
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })
})
