import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useApp } from "../lib/app.ts"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { readPref, writePref } from "../lib/storage.ts"
import { invalidate } from "../lib/query.ts"
import { useClaims } from "../lib/data.ts"
import { errorText } from "../lib/cli-text.ts"
import { formatDuration, useElapsed } from "../lib/jobs.ts"
import { renderMarkdown } from "../lib/markdown.ts"
import { exportDocument, revealFile, type ExportFormat } from "../lib/exports.ts"
import { useCatalog, useProfiles, useProviderStatus } from "../lib/providers.ts"
import { assistantApi, assistantKeys, messagesBeforeEdit, resumeTurns, useAssistantTurn, useConversation, useConversations, useRunningConversations, type Conversation, type Effort, type Decision, type LiveTurn, type MeaningReview, type Message, type Part } from "../lib/assistant.ts"
import { formatConversationTranscript } from "../lib/assistant-transcript.ts"
import { buildProcess, contentParts, livePhase, messagePhase, type ContentPart, type ProcessView } from "../lib/assistant-process.ts"
import { Icon } from "../components/Icon.tsx"
import { MarkGlyph } from "../components/Brand.tsx"
import { MathEditor } from "../components/MathEditor.tsx"
import { MathText } from "../components/MathText.tsx"
import { ProviderLogo } from "./Providers.tsx"

type Lang = "tr" | "en"
const EFFORTS: Effort[] = ["auto", "low", "medium", "high", "max"]
const ATTACH_TYPES = ".txt,.md,.markdown,.tex,.lean,.csv,.tsv,.json,.py,.sage,.m,.bib"
const MAX_ATTACHMENT = 400_000

const TOOL_LABEL: Record<string, [string, string]> = {
  workspace_status: ["Çalışma alanı durumu", "Workspace status"], list_claims: ["Önermeler listesi", "List of claims"], show_claim: ["{id} önermesi", "Claim {id}"],
  lean_status: ["Lean durumu", "Lean status"], search_mathlib: ["Mathlib'de arama: {query}", "Mathlib search: {query}"], research_graph: ["Araştırma grafiği", "Research graph"],
  list_branches: ["Araştırma dalları", "Research branches"], create_claim: ["Yeni önerme: {title}", "New claim: {title}"], formalize: ["{id} Lean'e çevrilsin", "Formalize {id}"],
  compare_meaning: ["{id} için anlam karşılaştırması", "Compare the meanings of {id}"], approve_meaning: ["{id}: Lean ifadesi aynı anlamı taşıyor mu?", "{id}: does the Lean statement mean the same?"], prove: ["{id} için ispat aransın", "Search a proof of {id}"], check_proof: ["{id} için yazılan ispat Lean çekirdeğinde denetlensin", "Check a written proof of {id} in the Lean kernel"], verify: ["{id} Lean çekirdeğinde doğrulansın", "Verify {id} in the Lean kernel"],
  link_claims: ["{from} → {to} bağlantısı", "Link {from} → {to}"], set_objective: ["{id} ana hedef olsun", "Make {id} the objective"], create_branch: ["Yeni araştırma dalı: {name}", "New research branch: {name}"], search_literature: ["Literatür araması: {query}", "Literature search: {query}"],
}
function toolLabel(part: Extract<Part, { type: "tool" }>, lang: Lang): string {
  const template = TOOL_LABEL[part.tool]?.[lang === "tr" ? 0 : 1]
  if (!template) return part.title
  const label = template.replace(/\{(\w+)\}/g, (_m, key: string) => String(part.args[key] ?? ""))
  return part.tool === "formalize" && part.args.lean ? (lang === "tr" ? `${part.args.id} için Lean ifadesi kaydedilsin` : `Save a Lean statement for ${part.args.id}`) : label
}

const Markdown = memo(function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const { t } = useT()
  const html = useMemo(() => renderMarkdown(text, t("common.copy")), [text, t])
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy]")
    if (!button) return
    const code = button.closest(".md-code")?.querySelector("code")?.textContent ?? ""
    void navigator.clipboard.writeText(code).then(() => { const label = button.textContent; button.textContent = t("chat.copied"); window.setTimeout(() => { button.textContent = label }, 1_400) })
  }
  return <div className={`md ${streaming ? "streaming" : ""}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
})

/** What the model is writing now, without a tool block it may be in the middle of. */
const visibleStream = (text: string) => text.split(/```(?:mathos-tool|tool)\b/)[0]!

export function Assistant() {
  const app = useApp()
  const { t, lang } = useT()
  const root = app.workspace.root
  const [activeId, setActiveId] = useState<string | null>(() => readPref<string | null>(`assistant.active.${root}`, null))
  const [draft, setDraft] = useState<{ profile: string | null; model: string | null; effort: Effort; claimId: string | null }>(() => ({ profile: readPref<string | null>("assistant.profile", null), model: readPref<string | null>("assistant.model", null), effort: readPref<Effort>("assistant.effort", "auto"), claimId: null }))
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<Array<{ name: string; text: string }>>([])
  const [showMath, setShowMath] = useState(false)
  const [listOpen, setListOpen] = useState(() => readPref<boolean>("assistant.list", true))
  const [copiedAll, setCopiedAll] = useState(false)
  const conversations = useConversations(root)
  const conversation = useConversation(root, activeId)
  const turn = useAssistantTurn(root, activeId)
  const working = useRunningConversations(root)
  // Turns started before the window reloaded, or while the chat was closed, keep running in the host: follow them again.
  useEffect(() => { void resumeTurns(root) }, [root])
  const composerKey = useRef(0)

  const select = useCallback((id: string | null) => { setActiveId(id); writePref(`assistant.active.${root}`, id); turn.clearError() }, [root, turn])
  // Opened from a claim page: start a conversation about that claim.
  useEffect(() => {
    const claimId = readPref<string | null>("assistant.claim", null)
    if (!claimId) return
    writePref("assistant.claim", null)
    select(null)
    setDraft((current) => ({ ...current, claimId }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (activeId && conversation.error) select(null) }, [activeId, conversation.error, select])

  const current: Conversation | null = activeId ? conversation.data ?? null : null
  const settings = current ? { profile: current.profile, model: current.model ?? null, effort: current.effort, claimId: current.claimId } : draft
  const updateSettings = async (next: Partial<typeof settings>) => {
    if ("profile" in next) writePref("assistant.profile", next.profile ?? null)
    if ("model" in next) writePref("assistant.model", next.model ?? null)
    if (next.effort) writePref("assistant.effort", next.effort)
    if (!current) { setDraft((value) => ({ ...value, ...next })); return }
    await assistantApi.settings(root, current.id, next)
    invalidate(assistantKeys.one(root, current.id))
  }

  const send = async (override?: string) => {
    const message = (override ?? text).trim()
    if (!message || turn.running) return
    let id = activeId
    if (!id) {
      try { const created = await assistantApi.create(root, draft); id = created.id; select(created.id) }
      catch (error) { app.toast(errorText(error, lang), "error"); return }
    }
    const files = attachments
    setText(""); setAttachments([]); composerKey.current++
    const optimistic: Message = { id: "pending", role: "user", createdAt: new Date().toISOString(), content: message, attachments: files.map((file) => ({ name: file.name, chars: file.text.length })) }
    const conversationId = id
    await turn.start(conversationId, () => assistantApi.send(root, conversationId, message, files), optimistic)
    invalidate(assistantKeys.list(root))
  }
  const regenerate = () => { if (activeId) void turn.start(activeId, () => assistantApi.regenerate(root, activeId)) }
  const decide = (partId: string, decision: Decision) => { if (activeId) void turn.start(activeId, () => assistantApi.decide(root, activeId, partId, decision)) }
  const edit = (message: Message, content: string) => {
    if (!activeId || turn.running || !content.trim()) return
    const id = activeId
    void turn.start(id, () => assistantApi.edit(root, id, message.id, content.trim()), { ...message, content: content.trim() })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && turn.running && !(event.target as Element | null)?.closest?.(".mchip, .math-search, .sheet, .menu")) void turn.stop() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [turn])

  const attach = async (files: FileList | null) => {
    if (!files) return
    const added: Array<{ name: string; text: string }> = []
    for (const file of Array.from(files).slice(0, 8)) {
      if (file.size > MAX_ATTACHMENT * 2) { app.toast(t("chat.attachTooLarge").replace("{name}", file.name), "error"); continue }
      added.push({ name: file.name, text: (await file.text()).slice(0, MAX_ATTACHMENT) })
    }
    setAttachments((value) => [...value, ...added].slice(0, 8))
  }

  const messages = current?.messages ?? []
  const showPending = turn.pending && (Boolean(turn.live) || !messages.some((message) => message.role === "user" && message.content === turn.pending!.content && message.createdAt >= turn.pending!.createdAt.slice(0, 16)))
  useEffect(() => setCopiedAll(false), [activeId])
  const copyAll = async () => {
    if (!current) return
    const shown = messagesBeforeEdit(messages, turn.pending).filter((message) => !(turn.live?.messageId && message.id === turn.live.messageId))
    if (showPending && turn.pending) shown.push(turn.pending)
    if (turn.live) {
      const text = visibleStream(turn.live.text).trim()
      const parts: Part[] = [...turn.live.parts, ...(text ? [{ type: "text" as const, text }] : [])]
      if (contentParts(parts).length) shown.push({ id: turn.live.messageId ?? "live", role: "assistant", createdAt: new Date(turn.live.startedAt).toISOString(), content: "", parts })
    }
    try {
      await navigator.clipboard.writeText(formatConversationTranscript({ title: current.title, messages: shown }, {
        user: t("chat.you"), assistant: "MathOS", attachment: t("chat.attachment"), document: t("chat.document"),
      }))
      setCopiedAll(true)
      window.setTimeout(() => setCopiedAll(false), 1_800)
    } catch { app.toast(t("chat.copyFailed"), "error") }
  }

  return (
    <div className={`chat ${listOpen ? "" : "list-closed"}`}>
      <ConversationList open={listOpen} activeId={activeId} onToggle={() => { setListOpen((value) => { writePref("assistant.list", !value); return !value }) }} onSelect={select} onNew={() => { select(null); setDraft((value) => ({ ...value, claimId: null })) }} items={conversations.data?.conversations ?? []} working={working} root={root} />
      <section className="chat-main">
        <header className="chat-head" data-tauri-drag-region>
          {!listOpen && <button className="btn btn-ghost btn-icon" onClick={() => { setListOpen(true); writePref("assistant.list", true) }} aria-label={t("chat.conversations")}><Icon name="panel" size={17} /></button>}
          <div className="chat-title" data-tauri-drag-region>{current?.title || t("chat.newTitle")}</div>
          <div className="chat-head-actions">
            <button className="btn btn-ghost chat-copy-all" onClick={() => void copyAll()} disabled={!current || (!messages.length && !showPending)} aria-label={t("chat.copyAll")} title={t("chat.copyAll")}><Icon name={copiedAll ? "check" : "copy"} size={15} /><span>{copiedAll ? t("chat.copied") : t("chat.copyAll")}</span></button>
            <ContextPicker claimId={settings.claimId} onChange={(claimId) => void updateSettings({ claimId })} />
            <ModelPicker profile={settings.profile} model={settings.model} onChange={(profile, model) => void updateSettings({ profile, model })} />
          </div>
        </header>
        <Thread
          messages={messages}
          pending={showPending ? turn.pending : null}
          live={turn.live}
          running={turn.running}
          error={turn.error}
          onRegenerate={regenerate}
          onDecide={decide}
          onEdit={edit}
          onSuggestion={(value) => void send(value)}
          root={root}
          hasConversation={Boolean(current)}
          claimId={settings.claimId}
        />
        <footer className="chat-composer">
          <div className={`composer-card ${turn.running ? "busy" : ""}`}>
            {attachments.length > 0 && (
              <div className="composer-files">
                {attachments.map((file, index) => <span key={`${file.name}-${index}`} className="file-chip"><Icon name="file" size={13} />{file.name}<button onClick={() => setAttachments((value) => value.filter((_, at) => at !== index))} aria-label={t("common.remove")}><Icon name="x" size={11} /></button></span>)}
              </div>
            )}
            <MathEditor key={composerKey.current} value={text} onChange={setText} label={t("chat.inputLabel")} placeholder={t("chat.placeholder")} autoFocus onSubmit={() => void send()} toolbar={showMath} minHeight={52} maxHeight={260} className="composer-editor" />
            <div className="composer-bar">
              <label className="btn btn-ghost btn-icon composer-tool" title={t("chat.attach")}><Icon name="paperclip" size={16} /><input type="file" multiple accept={ATTACH_TYPES} hidden onChange={(event) => { void attach(event.target.files); event.target.value = "" }} /></label>
              <button className={`btn btn-ghost btn-icon composer-tool ${showMath ? "on" : ""}`} onClick={() => setShowMath((value) => !value)} title={t("chat.mathTools")} aria-pressed={showMath}><span className="sigma">∑</span></button>
              <EffortPicker effort={settings.effort} onChange={(effort) => void updateSettings({ effort })} />
              <span className="composer-spacer" />
              {turn.running
                ? <button className="send-btn stop" onClick={() => void turn.stop()} aria-label={t("chat.stop")} title={`${t("chat.stop")} (Esc)`}><Icon name="stop" size={14} stroke={2.4} /></button>
                : <button className="send-btn" onClick={() => void send()} disabled={!text.trim()} aria-label={t("chat.send")} title={`${t("chat.send")} (Enter)`}><Icon name="send" size={16} stroke={2.4} /></button>}
            </div>
          </div>
          <p className="composer-note">{t("chat.trustNote")}</p>
        </footer>
      </section>
    </div>
  )
}

function ConversationList({ open, items, activeId, working, onSelect, onNew, onToggle, root }: { open: boolean; items: Array<{ id: string; title: string; updatedAt: string; messages: number }>; activeId: string | null; working: Set<string>; onSelect: (id: string) => void; onNew: () => void; onToggle: () => void; root: string }) {
  const { t, lang } = useT()
  const app = useApp()
  const [query, setQuery] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState("")
  const groups = useMemo(() => {
    const day = 86_400_000, today = new Date(); today.setHours(0, 0, 0, 0)
    const bucket = (iso: string) => { const at = new Date(iso).getTime(); return at >= today.getTime() ? "chat.today" : at >= today.getTime() - day ? "chat.yesterday" : at >= today.getTime() - 7 * day ? "chat.week" : "chat.older" }
    const filtered = items.filter((item) => !query.trim() || (item.title || "").toLocaleLowerCase(lang).includes(query.toLocaleLowerCase(lang)))
    const out: Array<{ label: MessageKey; items: typeof items }> = []
    for (const item of filtered) { const label = bucket(item.updatedAt) as MessageKey; let group = out.find((row) => row.label === label); if (!group) { group = { label, items: [] }; out.push(group) } group.items.push(item) }
    return out
  }, [items, query, lang])
  const remove = async (id: string) => {
    if (!window.confirm(t("chat.deleteConfirm"))) return
    try { await assistantApi.remove(root, id); if (id === activeId) onNew(); invalidate(assistantKeys.list(root)) } catch (error) { app.toast(errorText(error, lang), "error") }
  }
  const rename = async (id: string) => {
    setRenaming(null)
    if (!name.trim()) return
    try { await assistantApi.rename(root, id, name.trim()); invalidate(assistantKeys.list(root)); invalidate(assistantKeys.one(root, id)) } catch (error) { app.toast(errorText(error, lang), "error") }
  }
  if (!open) return null
  return (
    <aside className="chat-side" aria-label={t("chat.conversations")}>
      <div className="chat-side-head" data-tauri-drag-region>
        <button className="btn btn-secondary chat-new" onClick={onNew}><Icon name="plus" size={15} />{t("chat.new")}</button>
        <button className="btn btn-ghost btn-icon" onClick={onToggle} aria-label={t("chat.hideList")}><Icon name="panel" size={17} /></button>
      </div>
      <div className="chat-search"><Icon name="search" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("chat.search")} aria-label={t("chat.search")} /></div>
      <nav className="chat-list">
        {groups.map((group) => (
          <div key={group.label} className="chat-group">
            <div className="chat-group-label">{t(group.label)}</div>
            {group.items.map((item) => renaming === item.id ? (
              <input key={item.id} className="input chat-rename" autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void rename(item.id)} onKeyDown={(event) => { if (event.key === "Enter") void rename(item.id); if (event.key === "Escape") { event.stopPropagation(); setRenaming(null) } }} />
            ) : (
              <div key={item.id} className={`chat-item ${item.id === activeId ? "active" : ""}`}>
                <button className="chat-item-main" onClick={() => onSelect(item.id)} title={item.title}><span className="chat-item-title">{item.title || t("chat.untitled")}</span>{working.has(item.id) && <span className="chat-item-working" role="img" aria-label={t("chat.working")} title={t("chat.working")} />}</button>
                <span className="chat-item-actions">
                  <button onClick={() => { setRenaming(item.id); setName(item.title) }} aria-label={t("chat.rename")} title={t("chat.rename")}><Icon name="pencil" size={13} /></button>
                  <button onClick={() => void remove(item.id)} aria-label={t("chat.delete")} title={t("chat.delete")}><Icon name="trash" size={13} /></button>
                </span>
              </div>
            ))}
          </div>
        ))}
        {!items.length && <p className="chat-list-empty">{t("chat.noConversations")}</p>}
      </nav>
    </aside>
  )
}

function Thread({ messages, pending, live, running, error, onRegenerate, onDecide, onEdit, onSuggestion, root, hasConversation, claimId }: {
  messages: Message[]; pending: Message | null; live: LiveTurn | null; running: boolean; error: unknown; onRegenerate: () => void; onDecide: (partId: string, decision: Decision) => void; onEdit: (message: Message, text: string) => void; onSuggestion: (text: string) => void; root: string; hasConversation: boolean; claimId: string | null
}) {
  const { t, lang } = useT()
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const onScroll = () => { const node = scroller.current; if (!node) return; const near = node.scrollHeight - node.scrollTop - node.clientHeight < 80; stick.current = near; setAtBottom(near) }
  const toBottom = (smooth = false) => { const node = scroller.current; if (node) node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" }) }
  useLayoutEffect(() => { if (stick.current) toBottom() })
  useEffect(() => { stick.current = true; toBottom() }, [hasConversation])

  // While a turn runs, the last assistant message is shown from the live stream instead of the saved copy.
  const liveId = live?.messageId
  const shown = messagesBeforeEdit(messages, pending).filter((message) => !(live && message.id === liveId))
  const lastAssistant = [...shown].reverse().find((message) => message.role === "assistant")
  const empty = !shown.length && !pending && !live

  return (
    <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
      <div className="chat-column">
        {empty && <EmptyState onPick={onSuggestion} claimId={claimId} />}
        {shown.map((message) => message.role === "user"
          ? <UserMessage key={message.id} message={message} onEdit={onEdit} busy={running} />
          : <AssistantMessage key={message.id} message={message} last={message === lastAssistant && !live} onRegenerate={onRegenerate} onDecide={onDecide} root={root} busy={running} />)}
        {pending && <UserMessage message={pending} onEdit={onEdit} busy />}
        {live && <LiveMessage live={live} running={running} onDecide={onDecide} root={root} />}
        {Boolean(error) && !live && <div className="chat-error"><Icon name="info" size={15} /><span>{errorText(error, lang)}</span></div>}
      </div>
      {!atBottom && <button className="chat-to-bottom" onClick={() => { stick.current = true; toBottom(true) }} aria-label={t("chat.toBottom")}><Icon name="down" size={16} /></button>}
    </div>
  )
}

function EmptyState({ onPick, claimId }: { onPick: (text: string) => void; claimId: string | null }) {
  const { t } = useT()
  const app = useApp()
  const claims = useClaims(app.workspace.root)
  const first = claimId ?? claims.data?.[0]?.id ?? null
  const hour = new Date().getHours()
  const suggestions: Array<{ icon: "claims" | "sparkles" | "file" | "search"; title: string; prompt: string }> = [
    { icon: "claims", title: t("chat.s1.title"), prompt: t("chat.s1.prompt") },
    first ? { icon: "sparkles", title: t("chat.s2.title").replace("{id}", first), prompt: t("chat.s2.prompt").replace("{id}", first) } : { icon: "sparkles", title: t("chat.s2b.title"), prompt: t("chat.s2b.prompt") },
    { icon: "search", title: t("chat.s3.title"), prompt: t("chat.s3.prompt") },
    { icon: "file", title: t("chat.s4.title"), prompt: t("chat.s4.prompt") },
  ]
  return (
    <div className="chat-empty">
      <div className="chat-empty-mark"><MarkGlyph size={44} /></div>
      <h2>{t(hour < 12 ? "chat.helloMorning" : hour < 18 ? "chat.helloDay" : "chat.helloEvening")}</h2>
      <p className="subtitle">{claimId ? t("chat.aboutClaim").replace("{id}", claimId) : t("chat.intro")}</p>
      <div className="chat-suggestions">
        {suggestions.map((item) => (
          <button key={item.title} className="chat-suggestion" onClick={() => onPick(item.prompt)}>
            <Icon name={item.icon} size={16} /><span>{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function UserMessage({ message, onEdit, busy }: { message: Message; onEdit: (message: Message, text: string) => void; busy: boolean }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const save = () => { if (!draft.trim() || busy) return; setEditing(false); onEdit(message, draft) }
  if (editing) return (
    <div className="msg user">
      <div className="msg-edit" onKeyDown={(event) => { if (event.key === "Escape" && !(event.target as Element)?.closest(".mchip, .math-search")) { event.stopPropagation(); setEditing(false) } }}>
        <MathEditor value={draft} onChange={setDraft} label={t("chat.edit")} autoFocus onSubmit={save} minHeight={60} maxHeight={260} />
        <p className="muted">{t("chat.editNote")}</p>
        <div className="msg-edit-actions">
          <button className="btn btn-ghost" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !draft.trim()}>{t("chat.saveEdit")}</button>
        </div>
      </div>
    </div>
  )
  return (
    <div className="msg user">
      <div className="msg-bubble">
        {message.attachments?.length ? <div className="msg-files">{message.attachments.map((file) => <span key={file.name} className="file-chip"><Icon name="file" size={13} />{file.name}</span>)}</div> : null}
        <MathText text={message.content} />
      </div>
      <div className="msg-actions">
        <button onClick={() => { void navigator.clipboard.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1_200) }} title={t("common.copy")}><Icon name={copied ? "check" : "copy"} size={14} /></button>
        <button onClick={() => { setDraft(message.content); setEditing(true) }} title={t("chat.edit")} disabled={busy}><Icon name="pencil" size={14} /></button>
      </div>
    </div>
  )
}

function AssistantMessage({ message, last, onRegenerate, onDecide, root, busy }: { message: Message; last: boolean; onRegenerate: () => void; onDecide: (partId: string, decision: Decision) => void; root: string; busy: boolean }) {
  const { t, lang } = useT()
  const [copied, setCopied] = useState(false)
  const parts = message.parts ?? (message.content ? [{ type: "text", text: message.content } as Part] : [])
  const tokens = (message.usage?.inputTokens ?? 0) + (message.usage?.outputTokens ?? 0)
  const waiting = message.state === "awaiting_approval" && !busy
  const process = buildProcess(parts, { phase: messagePhase(message, waiting), durationMs: message.durationMs ?? null })
  const [fold] = useState(() => justAnswered.has(message.id))
  useEffect(() => { justAnswered.delete(message.id) }, [message.id])
  return (
    <div className="msg assistant">
      <div className="msg-body">
        {(process.entries.length > 0 || process.durationMs) && <TurnProcess view={process} onDecide={onDecide} waiting={waiting} fold={fold} />}
        <ContentParts parts={contentParts(parts)} root={root} />
        {message.state === "stopped" && <p className="msg-note">{t("chat.stopped")}</p>}
        {message.state === "error" && (
          <div className="chat-error"><Icon name="info" size={15} /><div><strong>{t("chat.failed")}</strong><div className="selectable">{errorText({ code: message.error?.code, message: message.error?.message }, lang)}</div></div>
            {last && <button className="btn btn-secondary btn-sm" onClick={onRegenerate}><Icon name="refresh" size={14} />{t("chat.retry")}</button>}</div>
        )}
      </div>
      {message.state !== "awaiting_approval" && (
        <div className="msg-actions left">
          <button onClick={() => { void navigator.clipboard.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1_200) }} title={t("common.copy")}><Icon name={copied ? "check" : "copy"} size={14} /></button>
          {last && <button onClick={onRegenerate} title={t("chat.regenerate")} disabled={busy}><Icon name="refresh" size={14} /></button>}
          {tokens > 0 && <span className="msg-meta">{tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} {t("chat.tokens")}</span>}
        </div>
      )}
    </div>
  )
}

/** Messages whose turn just ran on screen: their saved copy opens with the process shown, then folds it. */
const justAnswered = new Set<string>()

function LiveMessage({ live, running, onDecide, root }: { live: LiveTurn; running: boolean; onDecide: (partId: string, decision: Decision) => void; root: string }) {
  const elapsed = useElapsed(live.startedAt, running)
  const text = visibleStream(live.text)
  const process = buildProcess(live.parts, { phase: livePhase(live, running, text), durationMs: elapsed * 1000, streamingReasoning: live.reasoning })
  useEffect(() => () => { if (live.messageId) justAnswered.add(live.messageId) }, [live.messageId])
  return (
    <div className="msg assistant live">
      <div className="msg-body">
        <TurnProcess view={process} onDecide={onDecide} waiting={false} />
        <ContentParts parts={contentParts(live.parts)} root={root} />
        {text && <Markdown text={text} streaming />}
      </div>
    </div>
  )
}

function ContentParts({ parts, root }: { parts: ContentPart[]; root: string }) {
  return parts.map((part, index) => part.type === "text" ? <Markdown key={`text-${index}`} text={part.text} /> : <DocumentCard key={part.id} part={part} root={root} />)
}

const FOLD_DELAY_MS = 1_000

/**
 * The turn's process under one header, as in ImperaOS (AI Elements Reasoning and Chain of Thought): a pulsing
 * orb and shimmering label while it runs, the provider's reasoning as it streams, each tool as a step. Open
 * while running or waiting for approval, folded a second after the turn ends. Nothing here invents reasoning.
 */
function TurnProcess({ view, onDecide, waiting, fold = false }: { view: ProcessView; onDecide: (partId: string, decision: Decision) => void; waiting: boolean; fold?: boolean }) {
  const { t, lang } = useT()
  const { phase, running, entries } = view
  const expandable = entries.length > 0
  const [open, setOpen] = useState(running || fold || phase === "approval")
  useEffect(() => { if (running || phase === "approval") setOpen(true) }, [running, phase])
  useEffect(() => {
    if (!fold) return
    const timer = window.setTimeout(() => setOpen(false), FOLD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [fold])
  const seconds = (ms: number | null) => ms === null ? null : Math.max(1, Math.round(ms / 1000))
  const total = seconds(view.durationMs)
  const duration = total === null ? "" : formatDuration(running ? Math.max(0, Math.floor((view.durationMs ?? 0) / 1000)) : total, lang)
  const thought = seconds(view.reasoningMs)
  const label = {
    thinking: t("chat.thinking"),
    writing: t("chat.writingAnswer"),
    approval: t("chat.tool.waiting"),
    done: thought !== null ? t("chat.thought").replace("{time}", formatDuration(thought, lang)) : duration ? t("chat.ran").replace("{time}", duration) : t("chat.finished"),
    failed: t("chat.runFailed"),
    stopped: t("chat.stopped"),
  }[phase]
  const meta = [running ? duration : "", view.steps ? `${view.steps} ${t(view.steps === 1 ? "chat.step" : "chat.steps")}` : ""].filter(Boolean).join(" · ")
  const header = <>
    <span className="turn-orb" aria-hidden />
    {thought !== null && !running && <Icon name="brain" size={14} />}
    <span className={`turn-label ${running ? "shimmer" : ""}`}>{label}</span>
    {meta && <span className="turn-meta">{meta}</span>}
    {expandable && <Icon name="chevron" size={13} />}
  </>
  return (
    <div className={`turn-process is-${phase} ${running ? "is-running" : ""} ${open && expandable ? "is-open" : ""}`} aria-live={running ? "polite" : undefined}>
      {expandable
        ? <button className="turn-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{header}</button>
        : <div className="turn-head static">{header}</div>}
      {open && expandable && <div className="turn-body">
        {entries.map((entry, index) => entry.kind === "reasoning"
          ? <ReasoningText key={`r-${index}`} text={entry.text} streaming={entry.streaming} />
          : <ol key={`s-${index}`} className="turn-steps" aria-label={t("chat.process")}>
            {entry.tools.map((part) => <li key={part.id} className={`turn-step ${part.status}`}>
              <span className="turn-step-icon" aria-hidden>{part.status === "running" ? <span className="step-spinner" /> : <Icon name={part.status === "failed" || part.status === "rejected" ? "x" : part.status === "proposed" ? "info" : "check"} size={13} stroke={2} />}</span>
              {part.kind === "action" ? <ActionCard part={part} onDecide={onDecide} waiting={waiting} /> : <ToolRow part={part} />}
            </li>)}
          </ol>)}
      </div>}
    </div>
  )
}

/** The provider's own reasoning; follows the newest line while it streams. */
function ReasoningText({ text, streaming }: { text: string; streaming: boolean }) {
  const { t } = useT()
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (streaming && body.current) body.current.scrollTop = body.current.scrollHeight }, [streaming, text])
  return <div className={`turn-reasoning ${streaming ? "streaming" : ""}`} ref={body} aria-label={t("chat.reasoningStep")}><Markdown text={text} /></div>
}

function ToolRow({ part }: { part: Extract<Part, { type: "tool" }> }) {
  const { lang, t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className={`tool-row ${part.status}`}>
      <button className="tool-row-head" onClick={() => setOpen((value) => !value)} aria-expanded={open} disabled={part.status === "running"}>
        <span>{toolLabel(part, lang)}</span>
        <span className="tool-state">{t(`chat.tool.${part.status}` as MessageKey)}</span>
        {part.status !== "running" && <Icon name="chevron" size={12} />}
      </button>
      {open && <pre className="tool-output selectable">{part.error ?? part.summary ?? ""}</pre>}
    </div>
  )
}

function ActionCard({ part, onDecide, waiting }: { part: Extract<Part, { type: "tool" }>; onDecide: (partId: string, decision: Decision) => void; waiting: boolean }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  if (part.review) return <MeaningCard part={part} review={part.review} onDecide={onDecide} waiting={waiting} />
  const detail = part.tool === "create_claim" ? <><div className="k">{String(part.args.title ?? "")}</div><MathText text={String(part.args.statement ?? "")} /></>
    : part.tool === "formalize" && part.args.lean ? <pre className="wf-code">{String(part.args.lean)}</pre>
    : part.tool === "check_proof" && part.args.proof ? <pre className="wf-code">{String(part.args.proof)}</pre>
    : null
  const state = part.status === "proposed" ? (waiting ? "chat.tool.waiting" : "chat.tool.proposed") : `chat.tool.${part.status}`
  return (
    <div className={`action-card ${part.status}`}>
      <div className="action-head">
        <div className="action-text"><strong>{toolLabel(part, lang)}</strong><span>{t(state as MessageKey)}</span></div>
        {part.status !== "proposed" && part.status !== "running" && (part.summary || part.error) && <button className="link-btn" onClick={() => setOpen((value) => !value)}>{open ? t("chat.hideDetails") : t("chat.details")}</button>}
      </div>
      {detail && <div className="action-detail">{detail}</div>}
      {part.status === "proposed" && waiting && (
        <div className="action-buttons">
          <button className="btn btn-primary btn-sm" onClick={() => onDecide(part.id, "approve")}><Icon name="check" size={14} stroke={2.4} />{t("chat.approve")}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onDecide(part.id, "all")} title={t("chat.approveAllHint")}>{t("chat.approveAll")}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDecide(part.id, "reject")}>{t("chat.decline")}</button>
        </div>
      )}
      {open && <pre className="tool-output selectable">{part.error ?? part.summary}</pre>}
    </div>
  )
}

/** The meaning decision itself, in the chat: both statements and the model comparison, and the user's two answers. */
function MeaningCard({ part, review, onDecide, waiting }: { part: Extract<Part, { type: "tool" }>; review: MeaningReview; onDecide: (partId: string, decision: Decision) => void; waiting: boolean }) {
  const { t } = useT()
  const match = review.verdict === null ? null : review.verdict === "MATCH"
  const outcome = part.status === "done" ? "chat.meaning.approved" : part.status === "rejected" ? "chat.meaning.rejected" : part.status === "failed" ? "chat.tool.failed" : part.status === "running" ? "chat.tool.running" : waiting ? "chat.meaning.waiting" : "chat.tool.proposed"
  return (
    <div className={`action-card meaning-card ${part.status}`}>
      <div className="action-head">
        <div className="action-text"><strong>{t("chat.meaning.title").replace("{id}", review.claimId)}</strong><span>{t(outcome as MessageKey)}</span></div>
      </div>
      <div className="meaning-grid">
        <div className="meaning-side"><div className="k">{t("chat.meaning.natural")}</div><MathText text={review.natural} /></div>
        <div className="meaning-side"><div className="k">{t("chat.meaning.lean")}</div><pre className="wf-code selectable">{review.lean}</pre></div>
      </div>
      {review.reading && <div className="meaning-reading"><div className="k">{t("chat.meaning.reading")}</div><MathText text={review.reading} /></div>}
      <p className={`meaning-verdict ${match === null ? "none" : match ? "match" : "mismatch"}`}>
        <Icon name={match ? "check" : "info"} size={13} stroke={2.2} />
        {match === null ? t("chat.meaning.noReview") : match ? t("chat.meaning.match") : t("chat.meaning.mismatch")}
      </p>
      {review.findings.length > 0 && <ul className="meaning-findings">{review.findings.map((item, index) => <li key={index}><MathText text={item} /></li>)}</ul>}
      {part.error && <p className="field-hint">{part.error}</p>}
      {part.status === "proposed" && waiting && <>
        <div className="action-buttons">
          <button className="btn btn-primary btn-sm" onClick={() => onDecide(part.id, "approve")}><Icon name="check" size={14} stroke={2.4} />{t("chat.meaning.approve")}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onDecide(part.id, "reject")}>{t("chat.meaning.reject")}</button>
        </div>
        <p className="disclaimer">{t("chat.meaning.note")}</p>
      </>}
    </div>
  )
}

function DocumentCard({ part, root }: { part: Extract<Part, { type: "document" }>; root: string }) {
  const { t, lang } = useT()
  const app = useApp()
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [open, setOpen] = useState(false)
  const formats: Array<{ format: ExportFormat; label: string }> = part.format === "table"
    ? [{ format: "xlsx", label: "Excel" }, { format: "csv", label: "CSV" }, { format: "pdf", label: "PDF" }]
    : [{ format: "pdf", label: "PDF" }, { format: "docx", label: "Word" }, { format: "md", label: "Markdown" }, { format: "tex", label: "LaTeX" }]
  const run = async (format: ExportFormat) => {
    setBusy(format)
    try {
      const path = await exportDocument(root, lang, part, format)
      if (path) app.toast(t("chat.saved").replace("{path}", path.split(/[\\/]/).pop() ?? path))
      if (path && /[\\/]/.test(path)) void revealFile(path).catch(() => {})
    } catch (error) { app.toast(errorText(error, lang), "error") }
    finally { setBusy(null) }
  }
  const lines = part.content.split("\n").length
  return (
    <div className="doc-card">
      <div className="doc-head">
        <span className="doc-icon"><Icon name={part.format === "table" ? "table" : "file"} size={18} /></span>
        <div className="doc-text"><strong>{part.title}</strong><span>{part.format === "table" ? t("chat.docTable").replace("{n}", String(Math.max(0, (part.rows?.length ?? 1) - 1))) : t("chat.docText").replace("{n}", String(lines))}</span></div>
        <button className="link-btn" onClick={() => setOpen((value) => !value)}>{open ? t("chat.hidePreview") : t("chat.preview")}</button>
      </div>
      {open && (
        <div className="doc-preview">
          {part.format === "table" ? <table className="md-table"><tbody>{(part.rows ?? []).slice(0, 50).map((row, index) => <tr key={index}>{row.map((cell, at) => index === 0 ? <th key={at}>{cell}</th> : <td key={at}><MathText text={cell} /></td>)}</tr>)}</tbody></table> : <Markdown text={part.content} />}
        </div>
      )}
      <div className="doc-actions">
        {formats.map((item) => <button key={item.format} className="btn btn-secondary btn-sm" onClick={() => void run(item.format)} disabled={busy !== null}>{busy === item.format ? <span className="spinner" /> : <Icon name="download" size={13} />}{item.label}</button>)}
      </div>
    </div>
  )
}

/** One menu for choosing among the models connected in Model Providers. */
/**
 * Every model the connected providers offer, not only each profile's own: a gateway such as OpenCode Go serves dozens
 * with one key. Grouped by provider and searchable; a model picked here is used for this conversation only.
 */
function ModelPicker({ profile, model, onChange }: { profile: string | null; model: string | null; onChange: (profile: string | null, model: string | null) => void }) {
  const app = useApp()
  const { t } = useT()
  const status = useProviderStatus(app.workspace.root)
  const profiles = useProfiles(app.workspace.root)
  const catalog = useCatalog(app.workspace.root)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, open, () => setOpen(false))
  useEffect(() => { if (!open) setQuery("") }, [open])
  const rows = status.data?.profiles ?? []
  const remoteAllowed = status.data?.remoteModelsAllowed !== false
  // The assistant answers through the researcher route when one is set, not necessarily the default profile.
  const defaultProfile = profiles.data?.assistantProfile ?? profiles.data?.defaultProfile ?? null
  const describe = (id: string) => catalog.data?.providers.find((entry) => entry.descriptor.id === id)?.descriptor
  const usable = (row: (typeof rows)[number]) => (row.connection === "CONFIGURED" || row.connection === "LOCAL_OFFLINE") && !(row.remote && !remoteAllowed)
  const reason = (row: (typeof rows)[number]) => row.remote && !remoteAllowed ? t("chat.model.privacy") : row.connection === "SECRET_REQUIRED" ? t("chat.model.key") : row.connection === "LOGIN_REQUIRED" ? t("chat.model.login") : row.connection === "CLIENT_MISSING" ? t("chat.model.client") : row.connection
  const activeId = profile ?? defaultProfile
  const active = rows.find((row) => row.profile === activeId)
  const activeModel = model ?? active?.model ?? null
  const modelName = (value: string, descriptor: string) => value === "auto" ? describe(descriptor)?.displayName ?? t("chat.model.auto") : value
  const label = active && activeModel ? modelName(activeModel, active.descriptor) : t("chat.model.none")
  const needle = query.trim().toLocaleLowerCase()
  const groups = rows.map((row) => {
    const descriptor = describe(row.descriptor), name = descriptor?.displayName ?? row.descriptor, ok = usable(row)
    // The profile's own model first, then the rest its provider offers (a provider that cannot switch models lists none).
    const offered = ok ? [row.model, ...(descriptor?.defaultModels ?? []).filter((item) => item !== row.model)] : [row.model]
    const models = needle && !name.toLocaleLowerCase().includes(needle) ? offered.filter((item) => item.toLocaleLowerCase().includes(needle)) : offered
    return { row, name, ok, models }
  }).filter((group) => group.models.length)
  const pick = (row: (typeof rows)[number], value: string) => {
    // Always the explicit profile: the picked model must reach the provider that offers it.
    onChange(row.profile, value === row.model ? null : value)
    setOpen(false)
  }
  const first = groups.find((group) => group.ok)
  return (
    <div className="picker" ref={box}>
      <button className="picker-btn" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        {active && <ProviderLogo descriptor={{ id: active.descriptor, displayName: describe(active.descriptor)?.displayName ?? active.descriptor }} size={18} />}
        <span>{label}</span><Icon name="down" size={13} />
      </button>
      {open && (
        <div className="menu picker-menu model-menu" role="menu">
          {rows.length > 0 && <div className="model-search">
            <Icon name="search" size={14} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("chat.model.search")} aria-label={t("chat.model.search")}
              onKeyDown={(event) => { if (event.key === "Enter" && first) pick(first.row, first.models[0]!); if (event.key === "Escape") { event.stopPropagation(); setOpen(false) } }} />
          </div>}
          <div className="model-groups">
            {groups.map(({ row, name, ok, models }) => (
              <div key={row.profile} className="model-group" role="group" aria-label={name}>
                <div className="model-group-head">
                  <ProviderLogo descriptor={{ id: row.descriptor, displayName: name }} size={16} />
                  <span>{name}</span>
                  {row.profile === defaultProfile && <em>{t("chat.model.default")}</em>}
                  {!ok && <em>{reason(row)}</em>}
                  {ok && models.length > 1 && <small>{models.length}</small>}
                </div>
                {models.map((item) => {
                  const on = row.profile === activeId && item === activeModel
                  return (
                    <button key={item} role="menuitemradio" aria-checked={on} className={`menu-item model-item ${on ? "on" : ""}`} disabled={!ok} onClick={() => pick(row, item)}>
                      <span>{modelName(item, row.descriptor)}</span>
                      {on && <Icon name="check" size={14} stroke={2.4} />}
                    </button>
                  )
                })}
              </div>
            ))}
            {!rows.length && <p className="picker-empty">{t("chat.model.empty")}</p>}
            {rows.length > 0 && !groups.length && <p className="picker-empty">{t("chat.model.noMatch")}</p>}
          </div>
          <button className="menu-item picker-link" onClick={() => { setOpen(false); app.navigate("providers") }}><Icon name="plug" size={14} />{t("chat.model.manage")}</button>
        </div>
      )}
    </div>
  )
}

function EffortPicker({ effort, onChange }: { effort: Effort; onChange: (effort: Effort) => void }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, open, () => setOpen(false))
  return (
    <div className="picker" ref={box}>
      <button className="picker-btn subtle" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={t("chat.effort.title")}>
        <Icon name="brain" size={14} /><span>{t(`chat.effort.${effort}` as MessageKey)}</span><Icon name="down" size={12} />
      </button>
      {open && (
        <div className="menu picker-menu up" role="menu">
          <div className="picker-title">{t("chat.effort.title")}</div>
          {EFFORTS.map((value) => (
            <button key={value} role="menuitemradio" aria-checked={value === effort} className={`menu-item picker-item ${value === effort ? "on" : ""}`} onClick={() => { onChange(value); setOpen(false) }}>
              <span className="effort-bars" aria-hidden>{[1, 2, 3, 4].map((bar) => <i key={bar} className={bar <= EFFORTS.indexOf(value) ? "on" : ""} />)}</span>
              <span className="picker-item-text"><strong>{t(`chat.effort.${value}` as MessageKey)}</strong><span>{t(`chat.effort.${value}.hint` as MessageKey)}</span></span>
              {value === effort && <Icon name="check" size={14} stroke={2.4} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ContextPicker({ claimId, onChange }: { claimId: string | null; onChange: (claimId: string | null) => void }) {
  const app = useApp()
  const { t } = useT()
  const claims = useClaims(app.workspace.root)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, open, () => setOpen(false))
  const current = claims.data?.find((claim) => claim.id === claimId)
  return (
    <div className="picker" ref={box}>
      <button className={`picker-btn subtle ${claimId ? "on" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} title={t("chat.context.title")}>
        <Icon name="claims" size={14} /><span>{claimId ? `${claimId}${current ? ` · ${current.title}` : ""}` : t("chat.context.none")}</span><Icon name="down" size={12} />
      </button>
      {open && (
        <div className="menu picker-menu" role="menu">
          <div className="picker-title">{t("chat.context.title")}</div>
          <button className={`menu-item picker-item ${!claimId ? "on" : ""}`} onClick={() => { onChange(null); setOpen(false) }}><span className="picker-item-text"><strong>{t("chat.context.all")}</strong><span>{t("chat.context.allHint")}</span></span>{!claimId && <Icon name="check" size={14} stroke={2.4} />}</button>
          {(claims.data ?? []).map((claim) => (
            <button key={claim.id} className={`menu-item picker-item ${claim.id === claimId ? "on" : ""}`} onClick={() => { onChange(claim.id); setOpen(false) }}>
              <span className="picker-item-text"><strong>{claim.id} · {claim.title}</strong><span><MathText text={claim.naturalStatement.slice(0, 90)} /></span></span>
              {claim.id === claimId && <Icon name="check" size={14} stroke={2.4} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) close() }
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close() } }
    window.addEventListener("mousedown", onDown); window.addEventListener("keydown", onKey, true)
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true) }
  }, [ref, open, close])
}
