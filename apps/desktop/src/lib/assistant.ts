import { useCallback, useEffect, useRef, useState } from "react"
import { runJson } from "./bridge.ts"
import { invalidate, useQuery } from "./query.ts"
import { cancelJob, useJob, type JobEvent } from "./jobs.ts"

// Shapes of `mathos assistant … --json` (packages/core/src/assistant/types.ts).
export type Effort = "auto" | "low" | "medium" | "high" | "max"
export type Part =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; ms: number }
  | { type: "tool"; id: string; tool: string; args: Record<string, unknown>; kind: "read" | "action"; status: "running" | "done" | "failed" | "proposed" | "rejected"; title: string; summary?: string; error?: string }
  | { type: "document"; id: string; title: string; format: "markdown" | "latex" | "table"; content: string; rows?: string[][] }
export interface Message {
  id: string; role: "user" | "assistant"; createdAt: string; content: string; parts?: Part[]
  attachments?: Array<{ name: string; chars: number }>
  model?: { profile: string | null; provider: string; model: string } | null
  usage?: { inputTokens?: number; outputTokens?: number } | null
  thinkingMs?: number; durationMs?: number
  state?: "streaming" | "done" | "error" | "stopped" | "awaiting_approval"
  error?: { code: string; message: string } | null
}
export interface Conversation { id: string; title: string; createdAt: string; updatedAt: string; profile: string | null; effort: Effort; claimId: string | null; messages: Message[] }
export interface ConversationSummary { id: string; title: string; updatedAt: string; messages: number; claimId: string | null }

export const assistantKeys = { list: (root: string) => `${root}|assistant|list`, one: (root: string, id: string) => `${root}|assistant|${id}` }
export const useConversations = (root: string) => useQuery(assistantKeys.list(root), () => runJson<{ conversations: ConversationSummary[] }>(root, ["assistant", "list"]), 5_000)
export const useConversation = (root: string, id: string | null) => useQuery(id ? assistantKeys.one(root, id) : null, () => runJson<Conversation>(root, ["assistant", "show", id!]), 60_000)

export const assistantApi = {
  create: (root: string, options: { profile?: string | null; effort?: Effort; claimId?: string | null }) => runJson<Conversation>(root, ["assistant", "new", ...(options.profile ? ["--profile", options.profile] : []), ...(options.effort ? ["--effort", options.effort] : []), ...(options.claimId ? ["--claim", options.claimId] : [])]),
  settings: (root: string, id: string, options: { profile?: string | null; effort?: Effort; claimId?: string | null }) => runJson<Conversation>(root, ["assistant", "settings", id, ...(options.profile !== undefined ? ["--profile", options.profile ?? "default"] : []), ...(options.effort ? ["--effort", options.effort] : []), ...(options.claimId !== undefined ? ["--claim", options.claimId ?? "none"] : [])]),
  rename: (root: string, id: string, title: string) => runJson<Conversation>(root, ["assistant", "rename", id, title]),
  remove: (root: string, id: string) => runJson<{ deleted: string }>(root, ["assistant", "delete", id]),
  send: (root: string, id: string, text: string, attachments: Array<{ name: string; text: string }>) => runJson<{ job: string }>(root, ["assistant", "send", id, "--text", text, ...(attachments.length ? ["--attachments-json", JSON.stringify(attachments)] : [])]),
  decide: (root: string, id: string, partId: string, approved: boolean) => runJson<{ job: string }>(root, ["assistant", approved ? "approve" : "reject", id, partId]),
  regenerate: (root: string, id: string) => runJson<{ job: string }>(root, ["assistant", "regenerate", id]),
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

/**
 * Runs assistant turns for one conversation and follows them live. Starting a turn returns at once; the answer
 * arrives through job events (text as it is written, reasoning, tool cards), and the saved conversation is
 * reloaded when the turn ends.
 */
export function useAssistantTurn(root: string, conversationId: string | null) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [live, setLive] = useState<LiveTurn | null>(null)
  const [pending, setPending] = useState<Message | null>(null)
  const [error, setError] = useState<unknown>(null)
  const liveRef = useRef<LiveTurn | null>(null)
  const onEvent = useCallback((event: JobEvent) => {
    if (event.type === "message" && (event.message as Message).role === "user") setPending(event.message as Message)
    setLive((current) => { const next = applyEvent(current ?? { messageId: null, parts: [], text: "", reasoning: "", startedAt: Date.now(), firstTextAt: null, step: 0, model: null }, event); liveRef.current = next; return next })
  }, [])
  const job = useJob(root, jobId, onEvent)

  useEffect(() => {
    if (!job || job.state === "running" || !conversationId) return
    const finished = job.id
    void Promise.resolve(invalidate(assistantKeys.one(root, conversationId))).then(() => invalidate(assistantKeys.list(root)))
    if (job.error) setError(job.error)
    // Keep the live view until the reloaded conversation arrives, so nothing blinks.
    const timer = window.setTimeout(() => { setJobId((current) => current === finished ? null : current); setLive(null); setPending(null) }, 400)
    return () => window.clearTimeout(timer)
  }, [job?.state, job?.id, job?.error, root, conversationId])

  const start = useCallback(async (run: () => Promise<{ job: string }>, optimistic?: Message) => {
    setError(null)
    setLive({ messageId: null, parts: [], text: "", reasoning: "", startedAt: Date.now(), firstTextAt: null, step: 0, model: null })
    if (optimistic) setPending(optimistic)
    try { const started = await run(); setJobId(started.job) }
    catch (caught) { setError(caught); setLive(null); setPending(null) }
  }, [])
  const stop = useCallback(async () => { if (jobId) await cancelJob(root, jobId).catch(() => {}) }, [root, jobId])
  return { live, pending, running: Boolean(live) && (!job || job.state === "running"), error, start, stop, clearError: () => setError(null), job }
}
