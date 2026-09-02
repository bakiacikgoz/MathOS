import { expect, test } from "bun:test"
import { leanSetupPlan } from "@mathos/core"

test("Lean downloads require explicit consent", () => {
  expect(leanSetupPlan({ install: false, acceptedDownloads: [] }).commands).toEqual([])
  expect(leanSetupPlan({ install: true, acceptedDownloads: ["lean", "mathlib"] }).commands.map(command => command.join(" ")).join("; ")).toContain("lake build")
})
