import { describe, expect, test } from "bun:test"
import { SetupService } from "@mathos/core"

describe("setup state", () => {
  test("reports partial honestly when required capabilities are blocked", async () => {
    const service = new SetupService({ probe: async name => ({ name, state: name === "git" ? "VERIFIED" : "BLOCKED", detail: name }), load: () => null, save: () => {} })
    const report = await service.run(["git", "lean"])
    expect(report.state).toBe("PARTIAL")
    expect(report.capabilities[1]?.state).toBe("BLOCKED")
  })
})
