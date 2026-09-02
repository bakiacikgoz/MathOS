import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ContextView, contextTrustLabel, moveContextSelection } from "../apps/tui/src/ui/ContextViews.tsx"
import type { MathematicalContextItem } from "@mathos/domain"

const proposal: MathematicalContextItem = { id:"CTX-1", workspaceId:"W-1", branchId:"B-1", scopeKind:"CLAIM", scopeId:"C-1", kind:"SYMBOL", canonicalName:"x", displayText:"x", normalizedValue:"x", leanExpression:null, sourceClaimId:null, status:"PROPOSED", origin:"MODEL", revision:1, contentHash:"h", createdAt:"now", updatedAt:"now" }

describe("context TUI", () => {
  test("separates proposals from active context and shows scope/conflicts", async () => {
    const setup = await testRender(() => <ContextView items={[proposal]} conflicts={[{ kind:"INCOMPATIBLE_KIND", itemIds:["CTX-1"], message:"collision" }]} />, { width:90, height:20 })
    try { await setup.renderOnce(); const frame = setup.captureCharFrame(); expect(frame).toContain("PROPOSAL — NOT ACTIVE"); expect(frame).toContain("CLAIM"); expect(frame).toContain("CONFLICTS 1") } finally { setup.renderer.destroy() }
  })
  test("keyboard selection remains bounded", () => {
    expect(moveContextSelection(0, 1, 2)).toBe(1)
    expect(moveContextSelection(1, 1, 2)).toBe(1)
    expect(moveContextSelection(0, -1, 2)).toBe(0)
    expect(contextTrustLabel(proposal)).toBe("PROPOSAL — NOT ACTIVE")
  })
})
