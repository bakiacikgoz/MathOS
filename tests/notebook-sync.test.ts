import { describe, expect, test } from "bun:test"
import { NotebookSyncEngine } from "@mathos/notebook"

describe("notebook synchronization", () => {
  test("refuses auto-apply when both canonical entity and notebook block changed", () => {
    const plan = new NotebookSyncEngine().plan({ id:"S-1", baselineSourceHash:"a", baselineTargetHash:"b", sourceHash:"changed-a", targetHash:"changed-b", fields:["caption"] })
    expect(plan.status).toBe("CONFLICT")
    expect(() => new NotebookSyncEngine().apply(plan)).toThrow("SYNC_PLAN_CONFLICT")
  })
  test("allows generated metadata only and consumes plans once", () => {
    const engine = new NotebookSyncEngine()
    const plan = engine.plan({ id:"S-1", baselineSourceHash:"a", baselineTargetHash:"b", sourceHash:"a", targetHash:"changed", fields:["status","caption"] })
    expect(plan.status).toBe("PROPOSED")
    expect(engine.apply(plan).status).toBe("APPLIED")
    expect(() => engine.apply(plan)).toThrow("SYNC_PLAN_CONSUMED")
    expect(engine.plan({ id:"S-2", baselineSourceHash:"a", baselineTargetHash:"b", sourceHash:"a", targetHash:"changed", fields:["proof"] }).status).toBe("CONFLICT")
  })
})
