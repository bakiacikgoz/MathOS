import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AssistantStore, assistantSystemPrompt, runAssistantTurn, splitToolCall, type AssistantEvent } from "@mathos/core"
import type { ModelProvider, ModelRequest } from "@mathos/models"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** A model that answers from a script, streaming each answer in two pieces. */
function scripted(answers: Array<string | Error>, seen: ModelRequest[] = []): ModelProvider {
  return {
    id: "fake", model: "fake-1", capabilities: { structuredOutput: false, toolCalling: false, reasoning: true, streaming: true, vision: false },
    async generate(request) {
      seen.push(request)
      const next = answers.shift()
      if (next === undefined) throw new Error("script exhausted")
      if (next instanceof Error) throw next
      const half = Math.floor(next.length / 2)
      request.onDelta?.({ reasoning: "thinking…" })
      request.onDelta?.({ text: next.slice(0, half) }); request.onDelta?.({ text: next.slice(half) })
      return { text: next, provider: "fake", model: "fake-1", usage: { inputTokens: 10, outputTokens: 5 }, reasoning: "thinking…" }
    },
    async generateStructured() { throw new Error("unused") },
  }
}
const tool = (name: string, args: Record<string, unknown>) => `\n\`\`\`mathos-tool\n${JSON.stringify({ tool: name, args })}\n\`\`\``

function setup(answers: Array<string | Error>) {
  const root = mkdtempSync(join(tmpdir(), "mathos-assistant-")); dirs.push(root)
  const store = new AssistantStore(root), conversation = store.create()
  const commands: string[][] = [], events: AssistantEvent[] = [], seen: ModelRequest[] = []
  const runner = async (args: string[]) => {
    commands.push(args)
    if (args[0] === "claims") return { code: 0, stdout: JSON.stringify([{ id: "C-001", kind: "conjecture", status: "CONJECTURE", title: "Odd sums", naturalStatement: "$\\sum$ odd = $n^2$" }]), stderr: "" }
    if (args[0] === "status") return { code: 0, stdout: JSON.stringify({ text: "Objective: none" }), stderr: "" }
    if (args[0] === "claim" && args[1] === "show") return { code: 0, stdout: JSON.stringify({ claim: { id: "C-001", kind: "conjecture", title: "Odd sums", naturalStatement: "…", status: "CONJECTURE" }, workflow: { next: "formalize", formal: null, approved: false, proofs: [], verified: false } }), stderr: "" }
    if (args[0] === "claim" && args[1] === "create") return { code: 0, stdout: JSON.stringify({ id: "C-002", title: "New" }), stderr: "" }
    return { code: 1, stdout: "", stderr: "unexpected" }
  }
  const turn = (extra: Partial<Parameters<typeof runAssistantTurn>[0]> = {}) => runAssistantTurn({ store, conversationId: conversation.id, provider: scripted(answers, seen), profile: null, workspaceName: "demo", runner, emit: (event) => events.push(event), ...extra })
  return { store, conversation, commands, events, seen, turn }
}

describe("assistant turns", () => {
  test("a plain answer streams, is saved with its model, usage and thinking time, and titles the conversation", async () => {
    const { store, conversation, events, turn, seen } = setup(["Sum of the first $n$ odd numbers is $n^2$."])
    const message = await turn({ input: { text: "What is the sum of the first n odd numbers?" } })
    expect(message).toMatchObject({ state: "done", content: "Sum of the first $n$ odd numbers is $n^2$.", model: { provider: "fake", model: "fake-1" }, usage: { inputTokens: 10, outputTokens: 5 } })
    expect(message.parts?.map((part) => part.type)).toEqual(["reasoning", "text"])
    expect(events.filter((event) => event.type === "delta" && event.text).map((event) => (event as { text: string }).text).join("")).toBe(message.content)
    const saved = store.get(conversation.id)
    expect(saved.title).toBe("What is the sum of the first n odd numbers?")
    expect(saved.messages.map((row) => row.role)).toEqual(["user", "assistant"])
    // The model sees the trust rules and a snapshot of the workspace.
    expect(seen[0]!.messages[0]!.content).toContain("Only the Lean kernel, through VerificationGate")
    expect(seen[0]!.messages[0]!.content).toContain("C-001 [conjecture, CONJECTURE] Odd sums")
  })

  test("read tools run at once and their result goes back to the model", async () => {
    const { commands, turn, seen } = setup([`Let me look at it.${tool("show_claim", { id: "c-001" })}`, "C-001 still needs a Lean statement."])
    const message = await turn({ input: { text: "Where is C-001?" } })
    expect(commands).toContainEqual(["claim", "show", "C-001", "--json"])
    expect(message.state).toBe("done")
    expect(message.parts?.filter((part) => part.type !== "reasoning").map((part) => part.type === "tool" ? `tool:${part.status}` : part.type)).toEqual(["text", "tool:done", "text"])
    expect(message.content).toBe("Let me look at it.\n\nC-001 still needs a Lean statement.")
    expect(seen[1]!.messages.at(-1)!.content).toStartWith("TOOL_RESULT show_claim (ok)")
  })

  test("actions wait for approval, run only when approved, and the turn continues", async () => {
    const { store, conversation, commands, turn } = setup([`I will record it.${tool("create_claim", { kind: "lemma", title: "New", statement: "$a<b$" })}`, "Created C-002."])
    const waiting = await turn({ input: { text: "Add a lemma a<b" } })
    expect(waiting.state).toBe("awaiting_approval")
    expect(commands.some((args) => args[1] === "create")).toBe(false)
    const part = waiting.parts!.find((item) => item.type === "tool")!
    expect(part).toMatchObject({ kind: "action", status: "proposed", title: "Create claim “New”" })
    const done = await turn({ resume: { partId: (part as { id: string }).id, approved: true } })
    expect(commands).toContainEqual(["claim", "create", "--type", "lemma", "--title", "New", "--statement", "$a<b$", "--json"])
    expect(done.state).toBe("done")
    expect(done.content).toEndWith("Created C-002.")
    expect(store.get(conversation.id).messages).toHaveLength(2)
  })

  test("a declined action is not run and the model is told", async () => {
    const { commands, turn, seen } = setup([`${tool("set_objective", { id: "C-001" })}`, "Understood, I left the objective alone."])
    const waiting = await turn({ input: { text: "make it the objective" } })
    const part = waiting.parts!.find((item) => item.type === "tool") as { id: string }
    const done = await turn({ resume: { partId: part.id, approved: false } })
    expect(commands.some((args) => args[0] === "objective")).toBe(false)
    expect(done.parts!.find((item) => item.type === "tool")).toMatchObject({ status: "rejected" })
    expect(seen[1]!.messages.at(-1)!.content).toContain("declined")
  })

  test("documents become download cards; unknown tools and bad arguments are reported back to the model", async () => {
    const { turn, seen } = setup([
      `${tool("delete_everything", {})}`,
      `${tool("show_claim", { id: "not an id" })}`,
      `Here is your summary.${tool("create_document", { title: "Notes", format: "markdown", content: "# Notes\n$x^2$" })}`,
      "Done.",
    ])
    const message = await turn({ input: { text: "Write notes" } })
    expect(seen[1]!.messages.at(-1)!.content).toContain("there is no tool named delete_everything")
    expect(seen[2]!.messages.at(-1)!.content).toContain("claim id like C-001")
    expect(message.parts!.find((part) => part.type === "document")).toMatchObject({ title: "Notes", format: "markdown", content: "# Notes\n$x^2$" })
  })

  test("model errors are saved on the message, and regenerate replaces the last answer", async () => {
    const { store, conversation, turn } = setup([Object.assign(new Error("MODEL_ROUTE_BLOCKED: remote models are disabled"), { name: "Error" }), "Second try."])
    const failed = await turn({ input: { text: "hi" } })
    expect(failed).toMatchObject({ state: "error", error: { code: "MODEL_ROUTE_BLOCKED" } })
    const again = await turn({ regenerate: true })
    expect(again.content).toBe("Second try.")
    expect(store.get(conversation.id).messages.map((row) => row.role)).toEqual(["user", "assistant"])
  })

  test("stopping keeps what was written so far", async () => {
    const controller = new AbortController()
    const { turn } = setup([])
    const provider: ModelProvider = { id: "slow", model: "s", capabilities: { structuredOutput: false, toolCalling: false, reasoning: false, streaming: true, vision: false }, async generate(request) { request.onDelta?.({ text: "Partial answer" }); controller.abort(); throw new Error("aborted") }, async generateStructured() { throw new Error("unused") } }
    const message = await turn({ input: { text: "long question" }, provider, signal: controller.signal })
    expect(message).toMatchObject({ state: "stopped", content: "Partial answer" })
  })

  test("tool blocks are split from the visible text, tolerating a missing closing fence while streaming", () => {
    expect(splitToolCall("Checking.\n```mathos-tool\n{\"tool\":\"lean_status\",\"args\":{}}\n```")).toEqual({ visible: "Checking.", call: { tool: "lean_status", args: {} }, invalid: null })
    expect(splitToolCall("Checking.\n```mathos-tool\n{\"tool\":")).toMatchObject({ visible: "Checking.", call: null })
    expect(splitToolCall("no tools")).toEqual({ visible: "no tools", call: null, invalid: null })
    expect(assistantSystemPrompt("w", "snap")).toContain("never say the meaning is approved")
  })
})

test("the assistant links claims only with the relations the graph draws", async () => {
  const { assistantTool } = await import("@mathos/core")
  const link = assistantTool("link_claims")!
  expect(link.kind).toBe("action")
  expect(link.argv!({ from: "t-001", to: "L-002" })).toEqual(["claim", "depend", "T-001", "--on", "L-002", "--relation", "depends_on", "--json"])
  expect(() => link.argv!({ from: "T-001", to: "T-001" })).toThrow("cannot depend on itself")
  expect(() => link.argv!({ from: "T-001", to: "L-002", relation: "loves" })).toThrow("relation must be")
})
