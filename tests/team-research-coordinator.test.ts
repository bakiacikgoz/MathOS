import { describe, expect, test } from "bun:test"
import { TeamResearchCoordinator } from "../packages/core/src/services/team-research-coordinator.ts"

describe("TeamResearchCoordinator", () => {
  test("owns team session lookup and preserves normalized identifiers", () => {
    const session = { id: "MR-001" }
    const coordinator = new TeamResearchCoordinator({
      stores: () => ({ sessions: { get: (id: string) => id === "MR-001" ? session : null } }),
    } as never)

    expect(coordinator.getTeam("mr-001")).toBe(session)
    expect(() => coordinator.getTeam("missing")).toThrow("Team session missing was not found.")
  })
})
