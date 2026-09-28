import { describe, expect, test } from "bun:test"
import { formatConversationTranscript } from "./assistant-transcript.ts"
import type { Conversation } from "./assistant.ts"

const tr = { user: "Sen", assistant: "MathOS", attachment: "Ek", document: "Belge" }
const en = { user: "You", assistant: "MathOS", attachment: "Attachment", document: "Document" }

const conversation: Conversation = {
  id: "chat-1", title: "Tek sayılar", createdAt: "2026-09-28T10:00:00Z", updatedAt: "2026-09-28T10:01:00Z",
  profile: null, effort: "auto", claimId: null,
  messages: [
    { id: "u1", role: "user", createdAt: "2026-09-28T10:00:00Z", content: "m tekse, $m+n$ çift mi?", attachments: [{ name: "ornek.lean", chars: 42 }] },
    { id: "a1", role: "assistant", createdAt: "2026-09-28T10:01:00Z", content: "Önce tanımlayalım.\n\nSonuç aşağıda.", parts: [
      { type: "text", text: "Önce tanımlayalım." },
      { type: "reasoning", text: "Gizli süreç", ms: 12 },
      { type: "tool", id: "tool-1", tool: "list_claims", args: {}, kind: "read", status: "done", title: "Oku" },
      { type: "document", id: "doc-1", title: "Lean örneği", format: "latex", content: "theorem example : True := by trivial" },
      { type: "text", text: "Sonuç aşağıda." },
    ] },
    { id: "u2", role: "user", createdAt: "2026-09-28T10:02:00Z", content: "Teşekkürler" },
  ],
}

describe("conversation transcript", () => {
  test("copies every visible message and document once, in order", () => {
    const result = formatConversationTranscript(conversation, tr)
    expect(result).toContain("Tek sayılar\n\nSen:\nm tekse, $m+n$ çift mi?\nEk: ornek.lean")
    expect(result).toContain("MathOS:\nÖnce tanımlayalım.\n\nBelge: Lean örneği\ntheorem example : True := by trivial\n\nSonuç aşağıda.")
    expect(result).toEndWith("Sen:\nTeşekkürler")
    expect(result.match(/Önce tanımlayalım\./g)).toHaveLength(1)
    expect(result).not.toContain("Gizli süreç")
    expect(result).not.toContain("list_claims")
  })

  test("uses message content when parts are absent and English labels when selected", () => {
    const result = formatConversationTranscript({ ...conversation, messages: [{ id: "a2", role: "assistant", createdAt: "", content: "A plain reply." }] }, en)
    expect(result).toBe("Tek sayılar\n\nMathOS:\nA plain reply.")
  })
})
