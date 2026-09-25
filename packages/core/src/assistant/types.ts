// A conversation with the MathOS assistant, stored in the workspace so it stays with the research it is about.

export type AssistantEffort = "auto" | "low" | "medium" | "high" | "max"

export type AssistantPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; ms: number }
  | { type: "tool"; id: string; tool: string; args: Record<string, unknown>; kind: "read" | "action"; status: "running" | "done" | "failed" | "proposed" | "rejected"; title: string; summary?: string; error?: string }
  | { type: "document"; id: string; title: string; format: "markdown" | "latex" | "table"; content: string; rows?: string[][] }

export interface AssistantMessage {
  id: string
  role: "user" | "assistant"
  createdAt: string
  /** The user's text, or the assistant's final answer (markdown with $…$ math). */
  content: string
  parts?: AssistantPart[]
  attachments?: Array<{ name: string; chars: number }>
  /** Model-only text sent with the message (attached files); not shown in the thread. */
  hidden?: string
  model?: { profile: string | null; provider: string; model: string } | null
  usage?: { inputTokens?: number; outputTokens?: number } | null
  /** Time until the first answer text, and in total. */
  thinkingMs?: number
  durationMs?: number
  state?: "streaming" | "done" | "error" | "stopped" | "awaiting_approval"
  error?: { code: string; message: string } | null
}

export interface AssistantConversation {
  schemaVersion: "mathos.assistant.conversation.v1"
  id: string
  title: string
  createdAt: string
  updatedAt: string
  profile: string | null
  effort: AssistantEffort
  /** A claim the conversation is about (opened from the claim page, or picked). */
  claimId: string | null
  messages: AssistantMessage[]
  /** Model-facing transcript of tool calls and results, so a resumed turn keeps its working memory. */
  scratch: Array<{ role: "assistant" | "user"; content: string; messageId: string }>
}

export interface AssistantConversationSummary { id: string; title: string; updatedAt: string; messages: number; claimId: string | null }

/** Runs a MathOS CLI command in the workspace and returns its exit code and output (the desktop host queues it). */
export type AssistantCommandRunner = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>

export type AssistantEvent =
  | { type: "message"; message: AssistantMessage }
  | { type: "delta"; text?: string; reasoning?: string }
  | { type: "replace"; text: string }
  | { type: "step"; index: number }
  | { type: "part"; part: AssistantPart }
  | { type: "model"; model: NonNullable<AssistantMessage["model"]> }
  | { type: "done"; message: AssistantMessage }
