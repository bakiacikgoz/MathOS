import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import type { AssistantConversation, AssistantConversationSummary, AssistantEffort } from "./types.ts"

const ID = /^conv_[a-z0-9]{8,40}$/

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`

/** Conversations live in `.mathos/assistant/` of the workspace, one JSON file each, written atomically. */
export class AssistantStore {
  private readonly dir: string
  constructor(workspaceRoot: string) { this.dir = join(workspaceRoot, ".mathos", "assistant") }

  create(options: { profile?: string | null; effort?: AssistantEffort; claimId?: string | null } = {}): AssistantConversation {
    const now = new Date().toISOString()
    const conversation: AssistantConversation = { schemaVersion: "mathos.assistant.conversation.v1", id: newId("conv"), title: "", createdAt: now, updatedAt: now, profile: options.profile ?? null, effort: options.effort ?? "auto", claimId: options.claimId ?? null, messages: [], scratch: [] }
    this.save(conversation)
    return conversation
  }

  get(id: string): AssistantConversation {
    if (!ID.test(id)) throw new Error(`ASSISTANT_CONVERSATION_NOT_FOUND: ${id}`)
    const path = join(this.dir, `${id}.json`)
    if (!existsSync(path)) throw new Error(`ASSISTANT_CONVERSATION_NOT_FOUND: ${id}`)
    return JSON.parse(readFileSync(path, "utf8")) as AssistantConversation
  }

  save(conversation: AssistantConversation): void {
    mkdirSync(this.dir, { recursive: true })
    const path = join(this.dir, `${conversation.id}.json`), temp = `${path}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify(conversation), { encoding: "utf8", mode: 0o600 })
    renameSync(temp, path)
  }

  list(): AssistantConversationSummary[] {
    if (!existsSync(this.dir)) return []
    return readdirSync(this.dir).filter((name) => name.endsWith(".json")).flatMap((name) => {
      try {
        const conversation = JSON.parse(readFileSync(join(this.dir, name), "utf8")) as AssistantConversation
        return [{ id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt, messages: conversation.messages.length, claimId: conversation.claimId }]
      } catch { return [] }
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  rename(id: string, title: string): AssistantConversation {
    const conversation = this.get(id)
    conversation.title = title.trim().slice(0, 120)
    conversation.updatedAt = new Date().toISOString()
    this.save(conversation)
    return conversation
  }

  delete(id: string): void {
    this.get(id)
    rmSync(join(this.dir, `${id}.json`), { force: true })
  }
}
