import { expect, test } from "bun:test"
import type { LiveTurn, Part } from "./assistant.ts"
import { buildProcess, contentParts, livePhase, messagePhase } from "./assistant-process.ts"

const readTool: Extract<Part, { type: "tool" }> = {
  type: "tool", id: "read-1", tool: "list_claims", args: {}, kind: "read", status: "done", title: "List claims",
}
const actionTool: Extract<Part, { type: "tool" }> = {
  type: "tool", id: "action-1", tool: "create_claim", args: { title: "A" }, kind: "action", status: "proposed", title: "Create claim",
}
const live: LiveTurn = { messageId: "m", parts: [], text: "", reasoning: "", startedAt: 1, firstTextAt: null, step: 0, model: null }

test("puts reasoning and tool steps under one process and leaves the answer to the message", () => {
  const parts: Part[] = [
    { type: "reasoning", text: "first thought", ms: 1200 }, readTool,
    { type: "text", text: "interim answer" },
    { type: "reasoning", text: "second thought", ms: 800 }, actionTool,
    { type: "document", id: "doc-1", title: "Report", format: "markdown", content: "# Report" },
  ]
  const view = buildProcess(parts, { phase: "approval", durationMs: 5000 })
  expect(view.entries).toEqual([
    { kind: "reasoning", text: "first thought", streaming: false },
    { kind: "steps", tools: [readTool] },
    { kind: "reasoning", text: "second thought", streaming: false },
    { kind: "steps", tools: [actionTool] },
  ])
  expect(view.steps).toBe(2)
  expect(view.reasoningMs).toBe(2000)
  expect(contentParts(parts)).toEqual([parts[2], parts[5]] as never)
})

test("a model that shares no reasoning gets no invented thoughts", () => {
  const view = buildProcess([{ type: "reasoning", text: "  ", ms: 900 }, { type: "text", text: "answer" }], { phase: "done", durationMs: 3000 })
  expect(view.entries).toEqual([])
  expect(view.reasoningMs).toBeNull()
})

test("streaming reasoning joins the stored reasoning and stops streaming once the answer is written", () => {
  const thinking = buildProcess([{ type: "reasoning", text: "step one", ms: 500 }], { phase: "thinking", durationMs: 1000, streamingReasoning: "step two" })
  expect(thinking.entries).toEqual([{ kind: "reasoning", text: "step one\n\nstep two", streaming: true }])
  expect(thinking.running).toBe(true)
  const writing = buildProcess([], { phase: "writing", durationMs: 1000, streamingReasoning: "done thinking" })
  expect(writing.entries).toEqual([{ kind: "reasoning", text: "done thinking", streaming: false }])
})

test("live phase: thinking before the answer, writing while it streams, thinking while a tool runs", () => {
  expect(livePhase(live, true, "")).toBe("thinking")
  expect(livePhase({ ...live, reasoning: "hmm" }, true, "Answer")).toBe("writing")
  expect(livePhase({ ...live, parts: [{ ...readTool, status: "running" }] }, true, "")).toBe("thinking")
  expect(livePhase(live, false, "Answer")).toBe("done")
})

test("message phase follows the saved state", () => {
  expect(messagePhase({ state: "awaiting_approval" }, true)).toBe("approval")
  expect(messagePhase({ state: "awaiting_approval" }, false)).toBe("done")
  expect(messagePhase({ state: "error" }, false)).toBe("failed")
  expect(messagePhase({ state: "stopped" }, false)).toBe("stopped")
  expect(messagePhase({ state: "done" }, false)).toBe("done")
})
