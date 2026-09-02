import { expect, test } from "bun:test"
import { probeSetupCapability } from "@mathos/core"

test("setup probes distinguish detection from verified smoke", async () => {
  const result = await probeSetupCapability("lean", { which: () => "lean", run: async () => ({ exitCode: 1, output: "broken" }) })
  expect(result.state).toBe("BLOCKED")
  expect(result.detail).toContain("smoke")
})
