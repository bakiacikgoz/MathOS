import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { LiteratureDeskView, literatureDeskSnapshot } from "../apps/tui/src/ui/LiteratureDeskViews.tsx"

describe("literature desk TUI", () => {
  test("shows source library, page excerpts, candidate queue, support matrix and trust banner", async () => {
    const snapshot = literatureDeskSnapshot({ sources: [{ id: "SRC-1", title: "Paper" }], excerpts: [{ id: "EXC-1", locator: "p. 2" }], candidates: [{ id: "XC-1", status: "SUPPORTED_BY_EXCERPT" }], assessments: [{ id: "CSA-1", relation: "DIRECT_KNOWN_RESULT" }] })
    const setup = await testRender(() => <LiteratureDeskView snapshot={snapshot} />, { width: 100, height: 18 })
    try { await setup.renderOnce(); const frame = setup.captureCharFrame(); expect(frame).toContain("LITERATURE DESK"); expect(frame).toContain("NOT A PROOF"); expect(frame).toContain("SRC-1"); expect(frame).toContain("XC-1"); expect(frame).toContain("CSA-1") } finally { setup.renderer.destroy() }
  })
})
