import { describe, expect, test } from "bun:test"
import { SetupService, type SetupReport } from "@mathos/core"

describe("setup resume", () => {
  test("preserves verified capabilities and probes unfinished steps", async () => {
    let calls = 0
    const prior: SetupReport = { state: "PARTIAL", updatedAt: "before", capabilities: [{ name: "git", state: "VERIFIED", detail: "ok" }] }
    const service = new SetupService({ probe: async name => { calls++; return { name, state: "VERIFIED", detail: "now" } }, load: () => prior, save: () => {} })
    const report = await service.run(["git", "lean"])
    expect(calls).toBe(1); expect(report.state).toBe("READY")
  })
})
