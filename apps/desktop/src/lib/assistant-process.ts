import type { LiveTurn, Message, Part } from "./assistant.ts"

export type ToolPart = Extract<Part, { type: "tool" }>
export type ReasoningPart = Extract<Part, { type: "reasoning" }>
export type ContentPart = Extract<Part, { type: "text" | "document" }>
/** One entry under the turn's process header: a stretch of provider reasoning, or a run of tool steps. */
export type ProcessEntry = { kind: "reasoning"; text: string; streaming: boolean } | { kind: "steps"; tools: ToolPart[] }
export type ProcessPhase = "thinking" | "writing" | "approval" | "done" | "failed" | "stopped"

export interface ProcessView {
  phase: ProcessPhase
  running: boolean
  /** Whole turn, or elapsed so far while it runs. */
  durationMs: number | null
  /** Time spent before the answer started, when the provider shared its reasoning. */
  reasoningMs: number | null
  entries: ProcessEntry[]
  steps: number
}

/**
 * How a turn reached its answer, under one header (AI Elements Reasoning and Chain of Thought, as in ImperaOS).
 * Reasoning and tool steps keep their order; answer text and documents are left for the message body.
 * Everything comes from real events; a model that shares no reasoning simply has none here.
 */
export function buildProcess(parts: Part[], options: { phase: ProcessPhase; durationMs: number | null; streamingReasoning?: string }): ProcessView {
  const entries: ProcessEntry[] = []
  let reasoningMs = 0
  const addReasoning = (text: string, streaming: boolean) => {
    if (!text.trim()) return
    const last = entries.at(-1)
    if (last?.kind === "reasoning") { last.text += `\n\n${text}`; last.streaming = streaming }
    else entries.push({ kind: "reasoning", text, streaming })
  }
  for (const part of parts) {
    if (part.type === "reasoning") { addReasoning(part.text, false); if (part.text.trim()) reasoningMs += part.ms }
    else if (part.type === "tool") {
      const last = entries.at(-1)
      if (last?.kind === "steps") last.tools.push(part)
      else entries.push({ kind: "steps", tools: [part] })
    }
  }
  if (options.streamingReasoning) addReasoning(options.streamingReasoning, options.phase === "thinking")
  return {
    phase: options.phase,
    running: options.phase === "thinking" || options.phase === "writing",
    durationMs: options.durationMs,
    reasoningMs: reasoningMs > 0 ? reasoningMs : null,
    entries,
    steps: parts.filter((part) => part.type === "tool").length,
  }
}

export const contentParts = (parts: Part[]): ContentPart[] => parts.filter((part): part is ContentPart => part.type === "text" || part.type === "document")

export function messagePhase(message: Pick<Message, "state">, waiting: boolean): ProcessPhase {
  if (message.state === "awaiting_approval") return waiting ? "approval" : "done"
  if (message.state === "error") return "failed"
  if (message.state === "stopped") return "stopped"
  return "done"
}

/** Thinking until the answer starts to arrive, writing while it streams; a running tool is thinking again. */
export function livePhase(live: LiveTurn, running: boolean, visibleText: string): ProcessPhase {
  if (!running) return "done"
  if (live.parts.some((part) => part.type === "tool" && part.status === "running")) return "thinking"
  return visibleText.trim() ? "writing" : "thinking"
}
