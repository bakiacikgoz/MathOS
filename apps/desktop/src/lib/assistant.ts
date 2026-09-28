import { useSyncExternalStore } from "react"
import { runJson } from "./bridge.ts"
import { invalidate, useQuery } from "./query.ts"
import { cancelJob, type JobEvent, type JobSnapshot } from "./jobs.ts"

// Shapes of `mathos assistant … --json` (packages/core/src/assistant/types.ts).
export type Effort = "auto" | "low" | "medium" | "high" | "max"
export type Part =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; ms: number }
  | { type: "tool"; id: string; tool: string; args: Record<string, unknown>; kind: "read" | "action"; status: "running" | "done" | "failed" | "proposed" | "rejected"; title: string; summary?: string; error?: string; review?: MeaningReview }
  | { type: "document"; id: string; title: string; format: "markdown" | "latex" | "table"; content: string; rows?: string[][] }
export interface MeaningReview { claimId: string; natural: string; lean: string; reading: string | null; verdict: string | null; findings: string[] }
/** Approve one action, approve it and let the rest of the turn run (meaning approvals still ask), or decline. */
export type Decision = "approve" | "all" | "reject"
export interface Message {
  id: string; role: "user" | "assistant"; createdAt: string; content: string; parts?: Part[]
  attachments?: Array<{ name: string; chars: number }>
  model?: { profile: string | null; provider: string; model: string } | null
  usage?: { inputTokens?: number; outputTokens?: number } | null
  thinkingMs?: number; durationMs?: number
  state?: "streaming" | "done" | "error" | "stopped" | "awaiting_approval"
  error?: { code: string; message: string } | null
}
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; profile: string | null; model?: string | null; effort: Effort; claimId: string | null; messages: Message[] }
export interface ConversationSummary { id: string; title: string; updatedAt: string; messages: number; claimId: string | null }

export const assistantKeys = { list: (root: string) => `${root}|assistant|list`, one: (root: string, id: string) => `${root}|assistant|${id}` }
export const useConversations = (root: string) => useQuery(assistantKeys.list(root), () => runJson<{ conversations: ConversationSummary[] }>(root, ["assistant", "list"]), 5_000)
export const useConversation = (root: string, id: string | null) => useQuery(id ? assistantKeys.one(root, id) : null, () => runJson<Conversation>(root, ["assistant", "show", id!]), 60_000)

export const assistantApi = {
  create: (root: string, options: { profile?: string | null; model?: string | null; effort?: Effort; claimId?: string | null }) => runJson<Conversation>(root, ["assistant", "new", ...(options.profile ? ["--profile", options.profile] : []), ...(options.model ? ["--model", options.model] : []), ...(options.effort ? ["--effort", options.effort] : []), ...(options.claimId ? ["--claim", options.claimId] : [])]),
  settings: (root: string, id: string, options: { profile?: string | null; model?: string | null; effort?: Effort; claimId?: string | null }) => runJson<Conversation>(root, ["assistant", "settings", id, ...(options.profile !== undefined ? ["--profile", options.profile ?? "default"] : []), ...(options.model !== undefined ? ["--model", options.model ?? "default"] : []), ...(options.effort ? ["--effort", options.effort] : []), ...(options.claimId !== undefined ? ["--claim", options.claimId ?? "none"] : [])]),
  rename: (root: string, id: string, title: string) => runJson<Conversation>(root, ["assistant", "rename", id, title]),
  remove: (root: string, id: string) => runJson<{ deleted: string }>(root, ["assistant", "delete", id]),
  send: (root: string, id: string, text: string, attachments: Array<{ name: string; text: string }>) => runJson<{ job: string }>(root, ["assistant", "send", id, "--text", text, ...(attachments.length ? ["--attachments-json", JSON.stringify(attachments)] : [])]),
  decide: (root: string, id: string, partId: string, decision: Decision) => runJson<{ job: string }>(root, ["assistant", decision === "reject" ? "reject" : "approve", id, partId, ...(decision === "all" ? ["--all"] : [])]),
  regenerate: (root: string, id: string) => runJson<{ job: string }>(root, ["assistant", "regenerate", id]),
  edit: (root: string, id: string, messageId: string, text: string) => runJson<{ job: string }>(root, ["assistant", "edit", id, messageId, "--text", text]),
}

/** Hide the replaced message and its obsolete replies while an edit is being regenerated. */
export function messagesBeforeEdit(messages: Message[], pending: Message | null): Message[] {
  const index = pending ? messages.findIndex(message => message.id === pending.id && message.role === "user") : -1
  return index < 0 ? messages : messages.slice(0, index)
}

/** The message being written right now: parts so far plus the text and reasoning of the current step. */
export interface LiveTurn { messageId: string | null; parts: Part[]; text: string; reasoning: string; startedAt: number; firstTextAt: number | null; step: number; model: Message["model"] }

function applyEvent(live: LiveTurn, event: JobEvent): LiveTurn {
  switch (event.type) {
    case "message": { const message = event.message as Message; return message.role === "assistant" ? { ...live, messageId: message.id, parts: message.parts ?? [], model: message.model ?? live.model } : live }
    case "delta": return { ...live, text: live.text + String(event.text ?? ""), reasoning: live.reasoning + String(event.reasoning ?? ""), firstTextAt: live.firstTextAt ?? (event.text ? Date.now() : null) }
    case "replace": return { ...live, text: String(event.text ?? "") }
    case "step": return { ...live, step: Number(event.index ?? 0), text: "", reasoning: "" }
    case "model": return { ...live, model: event.model as Message["model"] }
    case "part": {
      const part = event.part as Part
      if (part.type === "tool") { const index = live.parts.findIndex((item) => item.type === "tool" && item.id === part.id); if (index >= 0) { const parts = [...live.parts]; parts[index] = part; return { ...live, parts } } }
      return { ...live, parts: [...live.parts, part], ...(part.type === "text" ? { text: "" } : part.type === "reasoning" ? { reasoning: "" } : {}) }
    }
    default: return live
  }
}

const blankTurn = (startedAt = Date.now()): LiveTurn => ({ messageId: null, parts: [], text: "", reasoning: "", startedAt, firstTextAt: null, step: 0, model: null })

/** A conversation's turn: the job running it, what it has written so far, and how it ended. */
export interface TurnState { jobId: string | null; live: LiveTurn | null; pending: Message | null; error: unknown; running: boolean }
const IDLE: TurnState = { jobId: null, live: null, pending: null, error: null, running: false }

// Turns live here rather than in the chat view, one per conversation, so a turn keeps streaming and is saved
// while another conversation or page is open, and each turn's events only ever reach its own conversation.
const turns = new Map<string, TurnState>()
const turnListeners = new Set<() => void>()
let turnVersion = 0
const turnKey = (root: string, id: string) => `${root}|${id}`
const subscribeTurns = (listener: () => void) => { turnListeners.add(listener); return () => { turnListeners.delete(listener) } }
function setTurn(key: string, update: (state: TurnState) => TurnState | null) {
  const next = update(turns.get(key) ?? IDLE)
  if (next) turns.set(key, next); else turns.delete(key)
  turnVersion++
  for (const listener of turnListeners) listener()
}

/** Polls a turn's job until it ends, then reloads that conversation, whichever one is open by then. */
async function followTurn(root: string, conversationId: string, jobId: string) {
  const key = turnKey(root, conversationId), mine = () => turns.get(key)?.jobId === jobId
  let since = 0, delay = 250
  for (;;) {
    let snapshot: JobSnapshot
    try { snapshot = await runJson<JobSnapshot>(root, ["job", "poll", jobId, "--since", String(since)]) }
    catch (error) { if (mine()) setTurn(key, (state) => ({ ...state, running: false, live: null, pending: null, error })); return }
    if (!mine()) return
    since = snapshot.next
    if (snapshot.events.length) setTurn(key, (state) => {
      const user = [...snapshot.events].reverse().find((event) => event.type === "message" && (event.message as Message).role === "user")
      return { ...state, live: snapshot.events.reduce(applyEvent, state.live ?? blankTurn(snapshot.startedAt)), ...(user ? { pending: user.message as Message } : {}) }
    })
    if (snapshot.state !== "running") {
      invalidate(assistantKeys.one(root, conversationId)); invalidate(assistantKeys.list(root))
      setTurn(key, (state) => ({ ...state, running: false, error: snapshot.error }))
      // Keep the live view until the reloaded conversation arrives, so nothing blinks.
      setTimeout(() => { if (mine()) setTurn(key, (state) => state.error ? { ...IDLE, error: state.error } : null) }, 400)
      return
    }
    delay = snapshot.events.length ? 250 : Math.min(delay * 1.4, 1500)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

function followJob(root: string, conversationId: string, jobId: string, startedAt: number, optimistic?: Message) {
  setTurn(turnKey(root, conversationId), (state) => ({ jobId, live: state.live ?? blankTurn(startedAt), pending: optimistic ?? state.pending, error: null, running: true }))
  void followTurn(root, conversationId, jobId)
}

/** Starts a turn in a conversation; it runs as a host job and is followed here until it ends. */
export async function startTurn(root: string, conversationId: string, run: () => Promise<{ job: string }>, optimistic?: Message) {
  const key = turnKey(root, conversationId)
  setTurn(key, () => ({ jobId: null, live: blankTurn(), pending: optimistic ?? null, error: null, running: true }))
  try { const started = await run(); followJob(root, conversationId, started.job, turns.get(key)?.live?.startedAt ?? Date.now(), optimistic) }
  catch (error) { setTurn(key, () => ({ ...IDLE, error })) }
}

/** Picks up turns still running in the host (after the window reloads or the chat was closed) and follows them again. */
export async function resumeTurns(root: string) {
  const listed = await runJson<{ jobs: Array<{ id: string; key: string | null; state: string; startedAt: number }> }>(root, ["job", "list", "--kind", "assistant"]).catch(() => null)
  const running = (listed?.jobs ?? []).flatMap((job) => job.state === "running" && job.key?.startsWith("assistant:") ? [{ ...job, conversationId: job.key.slice("assistant:".length) }] : [])
    .filter((job) => !turns.get(turnKey(root, job.conversationId))?.running)
  if (!running.length) return
  // The host lists every workspace's jobs; only follow the ones whose conversation belongs to this workspace.
  const known = await runJson<{ conversations: ConversationSummary[] }>(root, ["assistant", "list"]).catch(() => null)
  const here = new Set(known?.conversations.map((item) => item.id) ?? [])
  for (const job of running) if (here.has(job.conversationId) && !turns.get(turnKey(root, job.conversationId))?.running) followJob(root, job.conversationId, job.id, job.startedAt)
}

export const readTurn = (root: string, conversationId: string): TurnState => turns.get(turnKey(root, conversationId)) ?? IDLE

/** The turn of one conversation, live wherever it was started from. */
export function useAssistantTurn(root: string, conversationId: string | null) {
  useSyncExternalStore(subscribeTurns, () => turnVersion)
  const state = conversationId ? readTurn(root, conversationId) : IDLE
  return {
    ...state,
    start: (id: string, run: () => Promise<{ job: string }>, optimistic?: Message) => startTurn(root, id, run, optimistic),
    stop: async () => { if (state.jobId) await cancelJob(root, state.jobId).catch(() => {}) },
    clearError: () => { if (conversationId && state.error) setTurn(turnKey(root, conversationId), (current) => current.running ? { ...current, error: null } : null) },
  }
}

/** Conversations of this workspace with a turn still running, for the list's working marks. */
export function useRunningConversations(root: string): Set<string> {
  useSyncExternalStore(subscribeTurns, () => turnVersion)
  const prefix = `${root}|`
  return new Set([...turns].filter(([key, state]) => state.running && key.startsWith(prefix)).map(([key]) => key.slice(prefix.length)))
}
