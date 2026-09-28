import type { Conversation, Message } from "./assistant.ts"

interface TranscriptLabels { user: string; assistant: string; attachment: string; document: string }

/** The readable conversation, in the same order as the chat. Internal reasoning and tool calls are omitted. */
export function formatConversationTranscript(conversation: Pick<Conversation, "title" | "messages">, labels: TranscriptLabels): string {
  const entries = conversation.messages.map((message: Message) => {
    const body: string[] = []
    if (message.role === "assistant" && message.parts?.length) {
      for (const part of message.parts) {
        if (part.type === "text" && part.text.trim()) body.push(part.text.trim())
        if (part.type === "document") {
          const content = part.content.trim() || part.rows?.map((row) => row.join("\t")).join("\n") || ""
          body.push(`${labels.document}: ${part.title}${content ? `\n${content}` : ""}`)
        }
      }
    }
    if (!body.length && message.content.trim()) body.push(message.content.trim())
    const attachments = message.attachments?.length ? `\n${labels.attachment}: ${message.attachments.map((file) => file.name).join(", ")}` : ""
    return `${message.role === "user" ? labels.user : labels.assistant}:\n${body.join("\n\n")}${attachments}`.trimEnd()
  })
  return [conversation.title.trim(), ...entries].filter(Boolean).join("\n\n").trim()
}
