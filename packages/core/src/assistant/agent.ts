import type { ModelMessage, ModelProvider } from "@mathos/models"
import { AssistantStore, newId } from "./store.ts"
import { ASSISTANT_TOOLS, assistantTool, leanSummary } from "./tools.ts"
import type { AssistantCommandRunner, AssistantConversation, AssistantEvent, AssistantMessage, AssistantPart, MeaningReview } from "./types.ts"

const TOOL_BLOCK = /```(?:mathos-tool|tool)[^\n]*\n([\s\S]*?)(?:```|$)/
const MAX_STEPS = 12
const HISTORY_MESSAGES = 24
const HISTORY_CHARS = 80_000
const NATIVE_TOOL = {
  name: "mathos_tool",
  description: "Request one MathOS tool. Mutations wait for user approval; results arrive as TOOL_RESULT messages.",
  parameters: {
    type: "object", additionalProperties: false, required: ["tool", "args"],
    properties: { tool: { type: "string", enum: ASSISTANT_TOOLS.map(tool => tool.name) }, args: { type: "object", additionalProperties: true } },
  },
}

export interface AssistantTurnOptions {
  store: AssistantStore
  conversationId: string
  /** A new user message; or `resume` an action waiting for approval; or `regenerate` the last answer. */
  input?: { text: string; attachments?: Array<{ name: string; text: string }> }
  resume?: { partId: string; approved: boolean; /** Also run this turn's later actions without asking (meaning approvals still ask). */ all?: boolean }
  regenerate?: boolean
  /** Replace this user message and regenerate the conversation from that point. Attachments are retained. */
  edit?: { messageId: string; text: string }
  provider: ModelProvider
  profile: string | null
  workspaceName: string
  runner: AssistantCommandRunner
  emit: (event: AssistantEvent) => void
  signal?: AbortSignal
  maxSteps?: number
  now?: () => number
}

/** The part of an answer before a tool block: what the user should read while the tool runs. */
export function splitToolCall(text: string): { visible: string; call: { tool: string; args: Record<string, unknown> } | null; invalid: string | null } {
  const match = TOOL_BLOCK.exec(text)
  if (!match) return { visible: text.trim(), call: null, invalid: null }
  const visible = text.slice(0, match.index).trim()
  return parseToolCall(match[1]!.trim(), visible)
}

function parseToolCall(raw: string, visible = ""): ReturnType<typeof splitToolCall> {
  try {
    const value = JSON.parse(raw) as { tool?: unknown; name?: unknown; args?: unknown; arguments?: unknown }
    const tool = typeof value.tool === "string" ? value.tool : typeof value.name === "string" ? value.name : ""
    const args = (value.args !== undefined ? value.args : value.arguments !== undefined ? value.arguments : {}) as Record<string, unknown>
    if (!tool || !args || typeof args !== "object" || Array.isArray(args)) return { visible, call: null, invalid: "The tool block needs {\"tool\": name, \"args\": {…}}." }
    return { visible, call: { tool, args }, invalid: null }
  } catch { return { visible, call: null, invalid: "The tool block was not valid JSON." } }
}

export function assistantSystemPrompt(workspaceName: string, snapshot: string, nativeTools = false): string {
  const tools = ASSISTANT_TOOLS.map((tool) => `- ${tool.name} (${tool.kind === "read" ? "runs immediately" : tool.human ? "the user decides on a card" : tool.kind === "action" ? "needs the user's approval" : "shown as a download card"}): ${tool.description} Args: ${tool.args}`).join("\n")
  return `You are the MathOS assistant, working with a mathematician inside their MathOS research workspace "${workspaceName}". Reply in the language the user writes in.

MathOS trust rules — never break them:
- Only the Lean kernel, through VerificationGate, makes a claim verified. Your own reasoning, any model output, numerical experiments and citations are never proof. Call a claim verified only when the workspace reports it verified.
- Whether a Lean statement means the same as the natural-language statement is the user's decision. You can explain differences and run the comparison; to get the decision, propose approve_meaning, which shows the user both statements on a card. Chat messages such as "ok" or "continue" are not an approval. Never say the meaning is approved unless the workspace shows it.
- Separate what is established from what is conjectured, and say when you are unsure.

How to help with mathematics:
- When the user asks you to solve or prove something, answer it yourself first: a complete, careful argument in the chat. Do not create claims or start the Lean workflow unless they ask for it or it is clearly what they want.
- After a proof, you may offer once, in one sentence, to check it formally with Lean (create a claim, formalize, prove, verify). Say plainly that until Lean accepts it, your proof is an argument, not a verification.
- When the user asks you to check a claim with Lean, carry the whole workflow yourself, one tool per step and without asking in text first: create_claim if needed, formalize, compare_meaning, approve_meaning, prove. If prove finds no proof, write one yourself from its Lean errors and submit it with check_proof, fixing it from Lean's errors up to three times; a proof shown only in the chat is never checked. An accepted proof verifies the claim. Never send the user to another page for a step a tool can do. If you have to stop, say in one sentence what you are waiting for and why.
- Lean's state is in the snapshot below. formalize, prove and verify need Lean and Mathlib; while they are not ready, do not propose these tools. Say how far the automatic install is instead. Never say a tool will install or set up Lean; installing happens on its own in the background.

Formatting: Markdown. Math in $…$ inline and $$…$$ on its own line. Lean in \`\`\`lean blocks, other code in fenced blocks with a language. Be direct; use headings and lists only when they help.

${nativeTools ? 'Tools. To use one, call the native mathos_tool function with {"tool": name, "args": {…}}, then stop and wait. Do not print tool calls as text or code blocks.' : `Tools. To use one, end your reply with exactly one block like this, then stop and wait:
\`\`\`mathos-tool
{"tool": "show_claim", "args": {"id": "C-001"}}
\`\`\``}
The result comes back in a message that starts with TOOL_RESULT. Before requesting a tool, tell the user in one short sentence what you are about to do. Use tools when the answer depends on the workspace, one per step; do not call them needlessly or repeat one that already answered.
${tools}

Workspace snapshot (may be slightly out of date after actions):
${snapshot}`
}

async function snapshot(runner: AssistantCommandRunner, claimId: string | null): Promise<string> {
  const run = async (args: string[], summarize: (out: string) => string) => { try { const result = await runner(args); return result.code === 0 ? summarize(result.stdout) : `(unavailable: ${(result.stderr || result.stdout).trim().split("\n")[0]})` } catch (error) { return `(unavailable: ${error instanceof Error ? error.message : String(error)})` } }
  const parts = [`Status:\n${await run(["status", "--json"], assistantTool("workspace_status")!.summarize!)}`, `Lean: ${await run(["lean", "status"], leanSummary)}`, `Claims:\n${await run(["claims", "--json"], assistantTool("list_claims")!.summarize!)}`]
  if (claimId) parts.push(`The user opened this conversation from ${claimId}:\n${await run(["claim", "show", claimId, "--json"], assistantTool("show_claim")!.summarize!)}`)
  return parts.join("\n\n")
}

async function leanState(runner: AssistantCommandRunner): Promise<{ ready: boolean; summary: string }> {
  try {
    const result = await runner(["lean", "status"])
    const value = JSON.parse(result.stdout) as { ready?: unknown }
    return { ready: value.ready === true, summary: leanSummary(result.stdout) }
  } catch { return { ready: true, summary: "" } }
}

const claimIdOf = (args: Record<string, unknown>) => String(args.id ?? "").trim().toUpperCase()

/** The claim's statements and comparison for a meaning card, or why there is nothing to approve yet. */
async function meaningReview(runner: AssistantCommandRunner, claimId: string): Promise<MeaningReview | string> {
  let value: any
  try {
    const result = await runner(["claim", "show", claimId, "--json"])
    if (result.code !== 0) return `${claimId} could not be read: ${(result.stderr || result.stdout).trim().split("\n")[0]}`
    value = JSON.parse(result.stdout)
  } catch (error) { return `${claimId} could not be read: ${error instanceof Error ? error.message : String(error)}` }
  const workflow = value?.workflow, lean = workflow?.formal?.statement
  if (workflow?.approved) return `${claimId}'s meaning is already approved; continue with prove.`
  if (typeof lean !== "string" || !lean.trim()) return `${claimId} has no Lean statement yet; run formalize first.`
  const alignment = workflow.alignment
  return {
    claimId, natural: String(value.claim?.naturalStatement ?? ""), lean,
    reading: typeof alignment?.backTranslation === "string" ? alignment.backTranslation : null,
    verdict: typeof alignment?.verdict === "string" ? alignment.verdict : null,
    findings: Array.isArray(alignment?.findings) ? alignment.findings.slice(0, 8).map((item: any) => typeof item === "string" ? item : String(item?.message ?? item?.summary ?? JSON.stringify(item))) : [],
  }
}

/** What the model sees: the conversation so far (recent turns), with the current turn's tool calls and results. */
function transcript(conversation: AssistantConversation, current: AssistantMessage): ModelMessage[] {
  const out: ModelMessage[] = []
  const recent = conversation.messages.slice(-HISTORY_MESSAGES)
  let chars = 0
  for (const message of recent.reverse()) {
    const scratch = conversation.scratch.filter((entry) => entry.messageId === message.id)
    const rows: ModelMessage[] = message.role === "user"
      ? [{ role: "user", content: message.hidden ? `${message.content}\n\n${message.hidden}` : message.content }]
      : message.id === current.id
        ? scratch.map((entry) => ({ role: entry.role, content: entry.content }))
        : [...scratch.map((entry) => ({ role: entry.role, content: entry.content.length > 1_500 ? `${entry.content.slice(0, 1_500)}…` : entry.content })), ...(message.content ? [{ role: "assistant" as const, content: message.content }] : [])]
    const size = rows.reduce((sum, row) => sum + row.content.length, 0)
    if (chars + size > HISTORY_CHARS && out.length) break
    chars += size
    out.unshift(...rows)
  }
  return out
}

const visibleText = (parts: AssistantPart[]) => parts.filter((part): part is Extract<AssistantPart, { type: "text" }> => part.type === "text").map((part) => part.text).join("\n\n")
const titleFrom = (text: string) => { const line = text.replace(/\$([^$]*)\$/g, "$1").replace(/\s+/g, " ").trim(); return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line }

/**
 * One assistant turn: answer the user, reading the workspace as needed, until the answer is complete or an action
 * waits for approval. Everything is saved as it happens, so a closed window or a crash loses at most one step.
 */
export async function runAssistantTurn(options: AssistantTurnOptions): Promise<AssistantMessage> {
  const { store, provider, runner, emit, signal } = options
  const now = options.now ?? Date.now
  const conversation = store.get(options.conversationId)
  const started = now()
  let assistant: AssistantMessage

  if (options.resume) {
    const last = conversation.messages[conversation.messages.length - 1]
    const part = last?.parts?.find((item): item is Extract<AssistantPart, { type: "tool" }> => item.type === "tool" && item.id === options.resume!.partId)
    if (!last || last.state !== "awaiting_approval" || !part || part.status !== "proposed") throw new Error("ASSISTANT_NOTHING_TO_APPROVE")
    assistant = last
    assistant.state = "streaming"
    if (options.resume.approved && options.resume.all) assistant.autoApprove = true
    const stale = options.resume.approved && part.review ? await staleReview(part.review) : null
    if (!options.resume.approved) {
      part.status = "rejected"
      conversation.scratch.push({ role: "user", messageId: assistant.id, content: part.tool === "approve_meaning"
        ? "TOOL_RESULT approve_meaning: the user says the Lean statement does not mean the same as the natural statement. Ask what differs or propose a corrected statement with formalize (lean argument); do not propose approve_meaning again for the same statement."
        : `TOOL_RESULT ${part.tool}: the user declined this action. Do not retry it unless they ask; continue without it.` })
    } else if (stale) {
      part.status = "failed"; part.error = stale
      conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT approve_meaning (not run): ${stale} Propose approve_meaning again so the user sees the current statement.` })
      emit({ type: "part", part: { ...part } })
    } else {
      part.status = "running"; emit({ type: "part", part: { ...part } }); store.save(conversation)
      await runTool(part)
    }
  } else {
    if (options.edit) {
      const text = options.edit.text.trim()
      if (!text) throw new Error("ASSISTANT_MESSAGE_EMPTY")
      const index = conversation.messages.findIndex(message => message.id === options.edit!.messageId && message.role === "user")
      if (index < 0) throw new Error("ASSISTANT_MESSAGE_NOT_FOUND")
      const user = conversation.messages[index]!
      user.content = text
      conversation.messages = conversation.messages.slice(0, index + 1)
      const retained = new Set(conversation.messages.map(message => message.id))
      conversation.scratch = conversation.scratch.filter(entry => retained.has(entry.messageId))
      emit({ type: "message", message: user })
    } else if (options.regenerate) {
      const last = conversation.messages[conversation.messages.length - 1]
      if (last?.role === "assistant") { conversation.messages.pop(); conversation.scratch = conversation.scratch.filter((entry) => entry.messageId !== last.id) }
      if (conversation.messages[conversation.messages.length - 1]?.role !== "user") throw new Error("ASSISTANT_NOTHING_TO_REGENERATE")
    } else {
      const text = options.input?.text.trim() ?? ""
      if (!text) throw new Error("ASSISTANT_MESSAGE_EMPTY")
      const attachments = options.input?.attachments ?? []
      const user: AssistantMessage = { id: newId("msg"), role: "user", createdAt: new Date(now()).toISOString(), content: text, ...(attachments.length ? { attachments: attachments.map((file) => ({ name: file.name, chars: file.text.length })), hidden: attachments.map((file) => `Attached file ${file.name}:\n\`\`\`\n${file.text.slice(0, 60_000)}\n\`\`\``).join("\n\n") } : {}) }
      conversation.messages.push(user)
      if (!conversation.title) conversation.title = titleFrom(text)
      emit({ type: "message", message: user })
    }
    assistant = { id: newId("msg"), role: "assistant", createdAt: new Date(now()).toISOString(), content: "", parts: [], state: "streaming", usage: null, model: null }
    conversation.messages.push(assistant)
  }
  conversation.updatedAt = new Date(now()).toISOString()
  store.save(conversation)
  emit({ type: "message", message: assistant })
  const parts = assistant.parts ??= []

  async function runTool(part: Extract<AssistantPart, { type: "tool" }>) {
    const tool = assistantTool(part.tool)!
    try {
      const result = await runner(tool.argv!(part.args))
      const output = (result.stdout || result.stderr).trim()
      if (result.code === 0) { part.status = "done"; part.summary = tool.summarize ? tool.summarize(result.stdout) : output.slice(0, 6_000) }
      else {
        part.status = "failed"
        // A command that failed with a JSON report (a proof that Lean rejected) is summarized like a success.
        const report = result.stdout.trim().startsWith("{") && tool.summarize ? tool.summarize(result.stdout) : null
        part.error = report ?? (result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ").slice(0, 400)
      }
      conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT ${part.tool} (${part.status === "done" ? "ok" : `failed, exit ${result.code}`}):\n${part.status === "done" ? part.summary : `${part.error}\n${output.slice(0, 2_000)}`}` })
    } catch (error) {
      part.status = "failed"; part.error = error instanceof Error ? error.message : String(error)
      conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT ${part.tool} (failed): ${part.error}` })
    }
    emit({ type: "part", part: { ...part } })
    store.save(conversation)
  }

  /** The meaning the user approves must be the one on the card: a statement changed since then needs a new look. */
  async function staleReview(review: MeaningReview): Promise<string | null> {
    const current = await meaningReview(runner, review.claimId)
    if (typeof current === "string") return current
    return current.lean === review.lean && current.natural === review.natural ? null : "The statement changed after the card was shown, so this approval would not match what the user read."
  }

  const finish = (state: NonNullable<AssistantMessage["state"]>, error?: { code: string; message: string }) => {
    assistant.state = state
    assistant.content = visibleText(parts)
    assistant.durationMs = (assistant.durationMs ?? 0) + (now() - started)
    if (error) assistant.error = error
    conversation.updatedAt = new Date(now()).toISOString()
    store.save(conversation)
    emit({ type: "done", message: assistant })
    return assistant
  }

  let context: string | null = null
  const steps = options.maxSteps ?? MAX_STEPS
  for (let step = 0; step < steps; step++) {
    if (signal?.aborted) return finish("stopped")
    emit({ type: "step", index: step })
    context ??= await snapshot(runner, conversation.claimId)
    const nativeTools = provider.capabilities.toolCalling
    const messages: ModelMessage[] = [{ role: "system", content: assistantSystemPrompt(options.workspaceName, context, nativeTools) }, ...transcript(conversation, assistant)]
    let streamed = "", thought = "", firstText: number | null = null
    const stepStarted = now()
    let response
    try {
      response = await provider.generate({
        messages, role: "researcher", signal, temperature: 0.3,
        ...(nativeTools ? { tools: [NATIVE_TOOL] } : {}),
        ...(conversation.effort !== "auto" ? { reasoningEffort: conversation.effort } : {}),
        onDelta: (delta) => {
          if (delta.reasoning) { thought += delta.reasoning; emit({ type: "delta", reasoning: delta.reasoning }) }
          if (delta.text) { firstText ??= now(); streamed += delta.text; emit({ type: "delta", text: delta.text }) }
        },
      })
    } catch (error) {
      if (thought) parts.push({ type: "reasoning", text: thought, ms: (firstText ?? now()) - stepStarted })
      const visible = splitToolCall(streamed).visible
      if (visible) parts.push({ type: "text", text: visible })
      if (signal?.aborted) return finish("stopped")
      const message = error instanceof Error ? error.message : String(error)
      return finish("error", { code: /^([A-Z][A-Z0-9_]{3,})[:\s]/.exec(message)?.[1] ?? (error instanceof Error && error.name !== "Error" ? error.name : "MODEL_ERROR"), message })
    }
    if (step === 0 && !assistant.model) { assistant.model = { profile: options.profile, provider: response.provider, model: response.model }; emit({ type: "model", model: assistant.model }) }
    if (assistant.thinkingMs === undefined) assistant.thinkingMs = (firstText ?? now()) - started
    if (response.usage) assistant.usage = { inputTokens: (assistant.usage?.inputTokens ?? 0) + (response.usage.inputTokens ?? 0), outputTokens: (assistant.usage?.outputTokens ?? 0) + (response.usage.outputTokens ?? 0) }
    const reasoning = response.reasoning ?? thought
    if (reasoning) { const part: AssistantPart = { type: "reasoning", text: reasoning, ms: (firstText ?? now()) - stepStarted }; parts.push(part); emit({ type: "part", part }) }
    // Native and text-only providers share the same validation, approval and execution path.
    const native = response.toolCalls?.[0]
    const nativeText = native ? `\n\`\`\`mathos-tool\n${native.arguments}\n\`\`\`` : ""
    const parsed = native ? parseToolCall(native.arguments) : splitToolCall(response.text)
    const { call } = parsed
    const visible = native ? splitToolCall(response.text).visible : parsed.visible
    const invalid = (response.toolCalls?.length ?? 0) > 1 ? "Request exactly one tool per step." : native && native.name !== NATIVE_TOOL.name ? `Unknown function: ${native.name}. Use mathos_tool.` : parsed.invalid
    if (streamed !== response.text) emit({ type: "replace", text: response.text })
    if (visible) { const part: AssistantPart = { type: "text", text: visible }; parts.push(part); emit({ type: "part", part }) }
    if (!call && !invalid) return finish("done")

    conversation.scratch.push({ role: "assistant", messageId: assistant.id, content: native ? `${visible}${nativeText}` : response.text })
    if (invalid) { conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT error: ${invalid}` }); store.save(conversation); continue }
    const tool = assistantTool(call!.tool)
    if (!tool) { conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT error: there is no tool named ${call!.tool}. Available: ${ASSISTANT_TOOLS.map((item) => item.name).join(", ")}.` }); store.save(conversation); continue }

    if (tool.kind === "document") {
      const args = call!.args, format = args.format === "latex" || args.format === "table" ? args.format : "markdown"
      const rows = Array.isArray(args.rows) ? (args.rows as unknown[]).filter(Array.isArray).map((row) => (row as unknown[]).map((cell) => String(cell ?? ""))) : undefined
      const content = typeof args.content === "string" ? args.content : ""
      if (!content && !rows?.length) { conversation.scratch.push({ role: "user", messageId: assistant.id, content: "TOOL_RESULT error: create_document needs content (or rows for a table)." }); continue }
      const part: AssistantPart = { type: "document", id: newId("doc"), title: String(args.title ?? "Document").slice(0, 160), format, content, ...(rows ? { rows } : {}) }
      parts.push(part); emit({ type: "part", part })
      conversation.scratch.push({ role: "user", messageId: assistant.id, content: "TOOL_RESULT create_document: shown to the user as a download card. Continue; do not repeat the document's content in full." })
      store.save(conversation)
      continue
    }

    try { tool.argv!(call!.args) }
    catch (error) { conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT error: ${error instanceof Error ? error.message : String(error)}` }); store.save(conversation); continue }
    const part: Extract<AssistantPart, { type: "tool" }> = { type: "tool", id: newId("tool"), tool: tool.name, args: call!.args, kind: tool.kind === "read" ? "read" : "action", status: tool.kind === "read" ? "running" : "proposed", title: tool.title(call!.args) }
    // Asking the user to approve something that cannot run yet only wastes their click: say why instead.
    const lean = tool.needsLean ? await leanState(runner) : null
    if (lean && !lean.ready) {
      part.status = "failed"; part.error = lean.summary
      parts.push(part); emit({ type: "part", part: { ...part } })
      conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT ${tool.name} (not run, LEAN_NOT_READY): ${lean.summary} Tell the user this plainly and continue without it.` })
      context = null
      store.save(conversation)
      continue
    }
    if (tool.human) {
      const review = await meaningReview(runner, claimIdOf(call!.args))
      if (typeof review === "string") { conversation.scratch.push({ role: "user", messageId: assistant.id, content: `TOOL_RESULT ${tool.name} (not proposed): ${review}` }); store.save(conversation); continue }
      part.review = review
    }
    parts.push(part); emit({ type: "part", part: { ...part } })
    if (tool.kind === "action" && (tool.human || !assistant.autoApprove)) return finish("awaiting_approval")
    if (tool.kind === "action") { part.status = "running"; emit({ type: "part", part: { ...part } }) }
    store.save(conversation)
    await runTool(part)
    if (tool.kind === "action") context = null
  }
  parts.push({ type: "text", text: "(Stopped after the maximum number of steps. Ask me to continue if needed.)" })
  return finish("done")
}
