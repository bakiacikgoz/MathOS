import { MathOS, AssistantStore, runAssistantTurn, type AssistantEffort, type AssistantEvent } from "@mathos/core"
import { basename, dirname, isAbsolute } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { configuredModelProviders } from "./model-runtime.ts"
import { jobsCanRunInBackground, runCommand, startJob } from "./jobs.ts"

const EFFORTS: AssistantEffort[] = ["auto", "low", "medium", "high", "max"]
const flag = (args: string[], name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1] }
const write = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)

/**
 * `mathos assistant …`: conversations with the workspace assistant. A turn (send, approve, reject, regenerate) runs as a
 * job in the desktop host, which the app follows event by event; in a terminal it runs in place and prints the answer.
 */
export async function assistantCommand(rest: string[]): Promise<number> {
  const root = MathOS.tryLocate(process.cwd())
  if (!root) throw new Error("WORKSPACE_NOT_FOUND: open or create a MathOS workspace first")
  const store = new AssistantStore(root), action = rest[0] ?? "list", id = rest[1] && !rest[1].startsWith("--") ? rest[1] : undefined
  const effort = (value: string | undefined): AssistantEffort | undefined => { if (value === undefined) return undefined; if (!EFFORTS.includes(value as AssistantEffort)) throw new Error(`ASSISTANT_EFFORT_INVALID: ${value}`); return value as AssistantEffort }
  const claim = (value: string | undefined) => value === undefined ? undefined : value === "none" ? null : /^[A-Z]{1,4}-\d{1,6}$/.test(value) ? value : (() => { throw new Error(`ASSISTANT_CLAIM_INVALID: ${value}`) })()

  // Saves an exported document where the user chose in the app's save dialog (the webview cannot write files itself).
  if (action === "write-file") {
    const path = flag(rest, "--path"), data = flag(rest, "--base64")
    if (!path || !isAbsolute(path) || data === undefined) throw new Error("ASSISTANT_WRITE_ARGUMENTS_INVALID")
    if (!/\.(pdf|docx|xlsx|csv|md|tex|txt|lean|json)$/i.test(path)) throw new Error("ASSISTANT_WRITE_EXTENSION_REFUSED")
    const bytes = Buffer.from(data, "base64")
    if (bytes.byteLength > 50 * 1024 * 1024) throw new Error("ASSISTANT_WRITE_TOO_LARGE")
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes)
    write({ written: path, bytes: bytes.byteLength }); return 0
  }
  if (action === "list") { write({ schemaVersion: "mathos.assistant.list.v1", conversations: store.list() }); return 0 }
  if (action === "new") { write(store.create({ profile: flag(rest, "--profile") ?? null, effort: effort(flag(rest, "--effort")) ?? "auto", claimId: claim(flag(rest, "--claim")) ?? null })); return 0 }
  if (!id) throw new Error("ASSISTANT_CONVERSATION_ID_REQUIRED")
  if (action === "show") { write(store.get(id)); return 0 }
  if (action === "delete") { store.delete(id); write({ deleted: id }); return 0 }
  if (action === "rename") { write(store.rename(id, rest.slice(2).filter((value) => value !== "--json").join(" "))); return 0 }
  if (action === "settings") {
    const conversation = store.get(id), profile = flag(rest, "--profile"), nextEffort = effort(flag(rest, "--effort")), nextClaim = claim(flag(rest, "--claim"))
    if (profile !== undefined) conversation.profile = profile === "default" ? null : profile
    if (nextEffort) conversation.effort = nextEffort
    if (nextClaim !== undefined) conversation.claimId = nextClaim
    store.save(conversation); write(conversation); return 0
  }

  if (!["send", "approve", "reject", "regenerate"].includes(action)) throw new Error(`Unknown assistant action: ${action}`)
  const conversation = store.get(id)
  const input = action === "send" ? { text: flag(rest, "--text") ?? "", attachments: parseAttachments(flag(rest, "--attachments-json")) } : undefined
  if (input && !input.text.trim()) throw new Error("ASSISTANT_MESSAGE_EMPTY")
  const resume = action === "approve" || action === "reject" ? { partId: rest[2] ?? "", approved: action === "approve" } : undefined

  const turn = async (emit: (event: AssistantEvent) => void, signal?: AbortSignal) => {
    const routes = await configuredModelProviders(root, ["researcher"], conversation.profile ? { profile: conversation.profile } : {}).catch((error: unknown) => { throw error instanceof Error ? error : new Error(String(error)) })
    const provider = routes?.providers.researcher
    if (!provider) throw new Error("MODEL_ROUTE_UNAVAILABLE: connect a model in Model Providers first")
    try {
      return await runAssistantTurn({ store, conversationId: id, input, resume, regenerate: action === "regenerate", provider, profile: conversation.profile, workspaceName: basename(root), runner: (args) => runCommand(root, args), emit, signal })
    } finally { await routes?.close() }
  }

  if (jobsCanRunInBackground() && !rest.includes("--foreground")) {
    const started = startJob("assistant", `assistant:${id}`, async (emit, signal) => turn((event) => emit(event as unknown as Record<string, unknown>), signal))
    write({ job: started.id, reused: started.reused }); return 0
  }
  // Print the answer as it streams, leaving out the tool blocks the model uses to ask for a tool.
  let printed = false, step = "", shown = 0
  const message = await turn((event) => {
    if (event.type === "step") { step = ""; shown = 0 }
    else if (event.type === "delta" && event.text) { step += event.text; const visible = step.split(/```(?:mathos-tool|tool)\b/)[0]!.replace(/`{1,2}$/, ""); if (visible.length > shown) { process.stdout.write(visible.slice(shown)); shown = visible.length; printed = true } }
    else if (event.type === "part" && event.part.type === "tool") process.stderr.write(`\n[${event.part.status}] ${event.part.title}\n`)
    else if (event.type === "part" && event.part.type === "document") process.stderr.write(`\n[document] ${event.part.title} (open it in the desktop app to download)\n`)
  })
  if (printed) process.stdout.write("\n")
  else if (message.content) process.stdout.write(`${message.content}\n`)
  if (message.state === "awaiting_approval") { const part = [...(message.parts ?? [])].reverse().find((item) => item.type === "tool" && item.status === "proposed"); if (part && part.type === "tool") process.stderr.write(`Waiting for approval: ${part.title}\n  mathos assistant approve ${id} ${part.id}\n  mathos assistant reject ${id} ${part.id}\n`) }
  if (message.state === "error") { process.stderr.write(`${message.error?.code}: ${message.error?.message}\n`); return 1 }
  return 0
}

function parseAttachments(raw: string | undefined): Array<{ name: string; text: string }> {
  if (!raw) return []
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error("ASSISTANT_ATTACHMENTS_INVALID") }
  if (!Array.isArray(value) || value.length > 8) throw new Error("ASSISTANT_ATTACHMENTS_INVALID")
  return value.map((item) => {
    const row = item as { name?: unknown; text?: unknown }
    if (typeof row.name !== "string" || typeof row.text !== "string" || row.text.length > 400_000) throw new Error("ASSISTANT_ATTACHMENTS_INVALID")
    return { name: row.name.slice(0, 200), text: row.text }
  })
}
