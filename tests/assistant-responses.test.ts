import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AssistantStore, runAssistantTurn, splitToolCall } from "@mathos/core"
import { OpenAIResponsesTransport } from "@mathos/models"
import { GenericDirectProvider } from "../packages/models/src/providers/generic-direct.ts"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const call = { type: "function_call", id: "fc1", call_id: "call1", name: "mathos_tool", arguments: JSON.stringify({ tool: "create_claim", args: { kind: "theorem", title: "Parity", statement: "Two odd integers sum to an even integer." } }) }
const message = (id: string, text: string, phase = "commentary") => ({ type: "message", id, phase, content: [{ type: "output_text", text }] })
const sse = (events: unknown[]) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } })
const transport = (response: () => Response, seen: any[] = []) => new OpenAIResponsesTransport({ provider: "test", model: "gpt-6-luna", apiKey: "test", baseUrl: "https://example.test", fetch: (async (_url: unknown, init: RequestInit) => { seen.push(JSON.parse(String(init.body))); return response() }) as typeof fetch })

test("native Responses calls reach the assistant approval gate exactly once, then execute on approval", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-response-test-")); dirs.push(root)
  const store = new AssistantStore(root), conversation = store.create(), requests: any[] = [], commands: string[][] = []
  let generation = 0
  const provider = new GenericDirectProvider("test", "gpt-6-luna", transport(() => ++generation === 1 ? sse([
    { type: "response.output_item.done", output_index: 0, item: call },
    { type: "response.completed", response: { status: "completed", output: [call] } },
  ]) : sse([
    { type: "response.output_text.delta", item_id: "m1", delta: "Created T-001." },
    { type: "response.completed", response: { output: [message("m1", "Created T-001.", "final_answer")] } },
  ]), requests))
  const runner = async (args: string[]) => { commands.push(args); return { code: 0, stdout: JSON.stringify(args[0] === "claim" ? { id: "T-001", title: "Parity" } : args[0] === "claims" ? [] : { ready: true }), stderr: "" } }
  const options = { store, conversationId: conversation.id, provider, profile: null, workspaceName: "test", runner, emit: () => {} }
  const waiting = await runAssistantTurn({ ...options, input: { text: "Add the theorem" } })
  expect(waiting.state).toBe("awaiting_approval")
  expect(requests[0].tools[0].name).toBe("mathos_tool")
  expect(requests[0].parallel_tool_calls).toBe(false)
  const part = waiting.parts!.find(p => p.type === "tool")!
  expect(part).toMatchObject({ tool: "create_claim", status: "proposed" })
  expect(commands.filter(c => c[0] === "claim")).toHaveLength(0)
  const done = await runAssistantTurn({ ...options, resume: { partId: (part as { id: string }).id, approved: true } })
  expect(done.state).toBe("done")
  expect(commands.filter(c => c[0] === "claim")).toHaveLength(1)
  expect(store.get(conversation.id).messages.at(-1)?.content).toBe("Created T-001.")
  expect(requests[1].input.some((m: any) => m.content?.includes("TOOL_RESULT create_claim (ok)"))).toBe(true)
})

test("separate repeated commentary items are not concatenated into a duplicate answer", async () => {
  const result = await transport(() => sse([
    { type: "response.output_text.delta", item_id: "m1", delta: "Adding it." },
    { type: "response.output_item.done", output_index: 0, item: message("m1", "Adding it.") },
    { type: "response.output_text.delta", item_id: "m2", delta: "Adding it." },
    { type: "response.output_item.done", output_index: 1, item: message("m2", "Adding it.") },
    { type: "response.output_item.done", output_index: 2, item: call },
    { type: "response.completed", response: { output: [message("m1", "Adding it."), message("m2", "Adding it."), call] } },
  ])).generate({ messages: [], onDelta: () => {} })
  expect(result.text).toBe("Adding it.")
  expect((result as any).toolCalls).toHaveLength(1)
})

test("JSON Responses preserve all message parts and tool calls", async () => {
  const result = await transport(() => Response.json({ output: [message("m1", "First"), message("m2", "Second"), call] })).generate({ messages: [] })
  expect(result.text).toBe("First\n\nSecond")
  expect((result as any).toolCalls).toEqual([{ id: "call1", name: "mathos_tool", arguments: call.arguments }])
})

test("an interrupted or incomplete Responses stream never completes as a successful answer", async () => {
  for (const ending of [[], [{ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } }]]) {
    await expect(transport(() => sse([{ type: "response.output_text.delta", delta: "Adding it." }, ...ending])).generate({ messages: [], onDelta: () => {} })).rejects.toThrow()
  }
})

test("tool arguments must be an object, including explicit null", () => {
  expect(splitToolCall('```mathos-tool\n{"tool":"create_claim","args":null}\n```').invalid).not.toBeNull()
})

test("commentary without a final answer or tool call is not a completed response", async () => {
  await expect(transport(() => sse([
    { type: "response.output_text.delta", item_id: "m1", delta: "Adding it." },
    { type: "response.completed", response: { output: [message("m1", "Adding it."), message("m2", "", "final_answer")] } },
  ])).generate({ messages: [], onDelta: () => {} })).rejects.toThrow("MODEL_RESPONSE_INCOMPLETE")
})

test("native document arguments can contain Markdown code fences", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-response-doc-")); dirs.push(root)
  const store = new AssistantStore(root), conversation = store.create()
  let step = 0
  const provider = new GenericDirectProvider("test", "gpt-6-luna", transport(() => Response.json({ output: ++step === 1 ? [{ ...call, arguments: JSON.stringify({ tool: "create_document", args: { title: "Proof", content: "```lean\nexample : 1 = 1 := rfl\n```" } }) }] : [message("m1", "Ready.", "final_answer")] })))
  const result = await runAssistantTurn({ store, conversationId: conversation.id, provider, profile: null, workspaceName: "test", runner: async () => ({ code: 0, stdout: "{}", stderr: "" }), emit: () => {}, input: { text: "Export the proof" } })
  expect(result.parts?.find(p => p.type === "document")).toMatchObject({ content: "```lean\nexample : 1 = 1 := rfl\n```" })
})
