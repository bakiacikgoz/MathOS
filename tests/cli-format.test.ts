import { describe, expect, test } from "bun:test"
import { parseSlash, suggestCommands } from "../apps/tui/src/slash.ts"
import { formatDoctor, formatStatus } from "../apps/tui/src/format.ts"
import type { DoctorReport, StatusProjection } from "@mathos/domain"

describe("slash parser", () => {
  test("parses command names", () => {
    expect(parseSlash("/status")).toEqual({ name: "status", rest: "" })
    expect(parseSlash("  /doctor extra ")).toEqual({ name: "doctor", rest: "extra" })
    expect(parseSlash("hello")).toBeNull()
  })

  test("parses quoted claim invocations", () => {
    expect(parseSlash(`/claim conjecture "Additive energy conjecture"`)).toEqual({
      name: "claim",
      rest: "conjecture Additive energy conjecture",
    })
  })

  test("suggests research commands", () => {
    const names = suggestCommands("").map((item) => item.name)
    expect(names).toContain("claim")
    expect(names).toContain("claims")
    expect(names).toContain("objective")
    expect(suggestCommands("/cl").map((item) => item.name)).toContain("claim")
  })
})

describe("formatters", () => {
  test("status projection is readable", () => {
    const status: StatusProjection = {
      projectName: "demo",
      workspaceRoot: "/tmp/demo",
      mainObjective: { id: "C-001", title: "Main", status: "CONJECTURE" },
      research: { verified: 1, informal: 2, conjectures: 3, blocked: 0, totalClaims: 6 },
      branch: { id: "B-000", name: "MAIN", status: "ACTIVE" },
      integrity: { database: "connected", eventLog: "ok", initialized: true },
    }
    const text = formatStatus(status)
    expect(text).toContain("demo")
    expect(text).toContain("C-001")
    expect(text).toContain("verified")
  })

  test("doctor report is aligned", () => {
    const report: DoctorReport = {
      ok: true,
      checks: [{ name: "Bun", status: "PASS", detail: "1.2" }],
    }
    expect(formatDoctor(report)).toContain("PASS")
  })
})
