import { afterAll, expect, mock, test } from "bun:test"

// A fake host: jobs with scripted events, answered through the same `runJson` the app uses.
const jobs = new Map<string, { key: string; state: string; startedAt: number; events: Array<Record<string, unknown>>; error: null }>()
const conversations = new Set<string>()
const calls: string[][] = []
const realBridge = { ...(await import("./bridge.ts")) }, realQuery = { ...(await import("./query.ts")) }
mock.module("./bridge.ts", () => ({
  ...realBridge,
  runJson: async (_root: string, args: string[]) => {
    calls.push(args)
    const [command, action, id] = args
    if (command === "job" && action === "poll") {
      const job = jobs.get(id!)!, since = Number(args[4] ?? 0)
      return { id, kind: "assistant", state: job.state, startedAt: job.startedAt, finishedAt: null, events: job.events.slice(since), next: job.events.length, result: null, error: job.error }
    }
    if (command === "job" && action === "list") return { jobs: [...jobs].map(([jobId, job]) => ({ id: jobId, key: job.key, state: job.state, startedAt: job.startedAt })) }
    if (command === "assistant" && action === "list") return { conversations: [...conversations].map((conversationId) => ({ id: conversationId, title: "", updatedAt: "", messages: 0, claimId: null })) }
    throw new Error(`unexpected ${args.join(" ")}`)
  },
}))
const invalidated: string[] = []
mock.module("./query.ts", () => ({ ...realQuery, invalidate: (key: string) => { invalidated.push(key); realQuery.invalidate(key) } }))
// Other test files share this process: hand the real modules back when these tests are done.
afterAll(() => { mock.module("./bridge.ts", () => realBridge); mock.module("./query.ts", () => realQuery) })
const { readTurn, resumeTurns, startTurn, messagesBeforeEdit } = await import("./assistant.ts")

test("an edited message replaces its old bubble and hides later replies during regeneration", () => {
  const first = { id: "u1", role: "user" as const, createdAt: "", content: "First" }
  const answer = { ...first, id: "a1", role: "assistant" as const, content: "Answer" }
  const later = { ...first, id: "u2", content: "Later" }
  expect(messagesBeforeEdit([first, answer, later], { ...first, content: "Edited" })).toEqual([])
  expect(messagesBeforeEdit([first, answer, later], { ...later, content: "Edited later" })).toEqual([first, answer])
  expect(messagesBeforeEdit([first, answer], { ...later, id: "pending" })).toEqual([first, answer])
  expect(messagesBeforeEdit([first, answer], null)).toEqual([first, answer])
})

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))
const assistantMessage = { id: "msg-a", role: "assistant", createdAt: "", content: "", parts: [] }

test("a turn finished while another conversation is open reloads its own conversation", async () => {
  jobs.set("job-a", { key: "assistant:conv-a", state: "running", startedAt: 1, events: [{ type: "message", message: assistantMessage }, { type: "delta", reasoning: "thinking about A" }], error: null })
  await startTurn("/ws", "conv-a", async () => ({ job: "job-a" }))
  await settle()
  expect(readTurn("/ws", "conv-a").live?.reasoning).toBe("thinking about A")
  expect(readTurn("/ws", "conv-a").running).toBe(true)
  expect(readTurn("/ws", "conv-b")).toMatchObject({ live: null, running: false })
  jobs.get("job-a")!.events.push({ type: "delta", text: "answer A" })
  jobs.get("job-a")!.state = "done"
  await settle(600)
  expect(invalidated).toContain("/ws|assistant|conv-a")
  expect(invalidated).not.toContain("/ws|assistant|conv-b")
  expect(readTurn("/ws", "conv-a").running).toBe(false)
})

test("turns still running in the host are followed again, only for this workspace", async () => {
  conversations.add("conv-c")
  jobs.set("job-c", { key: "assistant:conv-c", state: "running", startedAt: 5, events: [{ type: "delta", text: "partial" }], error: null })
  jobs.set("job-x", { key: "assistant:elsewhere", state: "running", startedAt: 5, events: [], error: null })
  calls.length = 0
  await resumeTurns("/ws")
  await settle()
  expect(calls.some((args) => args.join(" ") === "job poll job-c --since 0")).toBe(true)
  expect(calls.some((args) => args.includes("job-x"))).toBe(false)
  expect(readTurn("/ws", "conv-c")).toMatchObject({ running: true, live: { text: "partial", startedAt: 5 } })
  jobs.get("job-c")!.state = "done"
  jobs.get("job-x")!.state = "done"
  await settle(600)
})
