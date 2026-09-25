import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
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
import { assistantApi, assistantKeys, useAssistantTurn, useConversation, useConversations, type Conversation, type Effort, type LiveTurn, type Message, type Part } from "../lib/assistant.ts"
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
  compare_meaning: ["{id} için anlam karşılaştırması", "Compare the meanings of {id}"], prove: ["{id} için ispat aransın", "Search a proof of {id}"], verify: ["{id} Lean çekirdeğinde doğrulansın", "Verify {id} in the Lean kernel"],
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
  const [draft, setDraft] = useState<{ profile: string | null; effort: Effort; claimId: string | null }>(() => ({ profile: readPref<string | null>("assistant.profile", null), effort: readPref<Effort>("assistant.effort", "auto"), claimId: null }))
  const [text, setText] = useState("")
  const [attachments, setAttachments] = useState<Array<{ name: string; text: string }>>([])
  const [showMath, setShowMath] = useState(false)
  const [listOpen, setListOpen] = useState(() => readPref<boolean>("assistant.list", true))
  const conversations = useConversations(root)
  const conversation = useConversation(root, activeId)
  const turn = useAssistantTurn(root, activeId)
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
  const settings = current ? { profile: current.profile, effort: current.effort, claimId: current.claimId } : draft
  const updateSettings = async (next: Partial<typeof settings>) => {
    if ("profile" in next) writePref("assistant.profile", next.profile ?? null)
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
    await turn.start(() => assistantApi.send(root, conversationId, message, files), optimistic)
    invalidate(assistantKeys.list(root))
  }
  const regenerate = () => { if (activeId) void turn.start(() => assistantApi.regenerate(root, activeId)) }
  const decide = (partId: string, approved: boolean) => { if (activeId) void turn.start(() => assistantApi.decide(root, activeId, partId, approved)) }
  const edit = (content: string) => { setText(content); composerKey.current++ }

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
  const showPending = turn.pending && !messages.some((message) => message.role === "user" && message.content === turn.pending!.content && message.createdAt >= turn.pending!.createdAt.slice(0, 16))

  return (
    <div className={`chat ${listOpen ? "" : "list-closed"}`}>
      <ConversationList open={listOpen} activeId={activeId} onToggle={() => { setListOpen((value) => { writePref("assistant.list", !value); return !value }) }} onSelect={select} onNew={() => { select(null); setDraft((value) => ({ ...value, claimId: null })) }} items={conversations.data?.conversations ?? []} root={root} />
      <section className="chat-main">
        <header className="chat-head" data-tauri-drag-region>
          {!listOpen && <button className="btn btn-ghost btn-icon" onClick={() => { setListOpen(true); writePref("assistant.list", true) }} aria-label={t("chat.conversations")}><Icon name="panel" size={17} /></button>}
          <div className="chat-title" data-tauri-drag-region>{current?.title || t("chat.newTitle")}</div>
          <div className="chat-head-actions">
            <ContextPicker claimId={settings.claimId} onChange={(claimId) => void updateSettings({ claimId })} />
            <ModelPicker profile={settings.profile} onChange={(profile) => void updateSettings({ profile })} />
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

function ConversationList({ open, items, activeId, onSelect, onNew, onToggle, root }: { open: boolean; items: Array<{ id: string; title: string; updatedAt: string; messages: number }>; activeId: string | null; onSelect: (id: string) => void; onNew: () => void; onToggle: () => void; root: string }) {
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
                <button className="chat-item-main" onClick={() => onSelect(item.id)} title={item.title}>{item.title || t("chat.untitled")}</button>
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
  messages: Message[]; pending: Message | null; live: LiveTurn | null; running: boolean; error: unknown; onRegenerate: () => void; onDecide: (partId: string, approved: boolean) => void; onEdit: (text: string) => void; onSuggestion: (text: string) => void; root: string; hasConversation: boolean; claimId: string | null
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
  const shown = messages.filter((message) => !(live && message.id === liveId))
  const lastAssistant = [...shown].reverse().find((message) => message.role === "assistant")
  const empty = !shown.length && !pending && !live

  return (
    <div className="chat-scroll" ref={scroller} onScroll={onScroll}>
      <div className="chat-column">
        {empty && <EmptyState onPick={onSuggestion} claimId={claimId} />}
        {shown.map((message) => message.role === "user"
          ? <UserMessage key={message.id} message={message} onEdit={onEdit} />
          : <AssistantMessage key={message.id} message={message} last={message === lastAssistant && !live} onRegenerate={onRegenerate} onDecide={onDecide} root={root} busy={running} />)}
        {pending && <UserMessage message={pending} onEdit={onEdit} />}
        {live && <LiveMessage live={live} onDecide={onDecide} root={root} />}
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

function UserMessage({ message, onEdit }: { message: Message; onEdit: (text: string) => void }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  return (
    <div className="msg user">
      <div className="msg-bubble">
        {message.attachments?.length ? <div className="msg-files">{message.attachments.map((file) => <span key={file.name} className="file-chip"><Icon name="file" size={13} />{file.name}</span>)}</div> : null}
        <MathText text={message.content} />
      </div>
      <div className="msg-actions">
        <button onClick={() => { void navigator.clipboard.writeText(message.content); setCopied(true); window.setTimeout(() => setCopied(false), 1_200) }} title={t("common.copy")}><Icon name={copied ? "check" : "copy"} size={14} /></button>
        <button onClick={() => onEdit(message.content)} title={t("chat.edit")}><Icon name="pencil" size={14} /></button>
      </div>
    </div>
  )
}

function Avatar() { return <span className="msg-avatar"><MarkGlyph size={18} /></span> }

function ModelLine({ model, children }: { model: Message["model"]; children?: ReactNode }) {
  return <div className="msg-head"><Avatar /><span className="msg-model">{model ? model.model : "MathOS"}</span>{children}</div>
}

function AssistantMessage({ message, last, onRegenerate, onDecide, root, busy }: { message: Message; last: boolean; onRegenerate: () => void; onDecide: (partId: string, approved: boolean) => void; root: string; busy: boolean }) {
  const { t, lang } = useT()
  const [copied, setCopied] = useState(false)
  const parts = message.parts ?? (message.content ? [{ type: "text", text: message.content } as Part] : [])
  const tokens = (message.usage?.inputTokens ?? 0) + (message.usage?.outputTokens ?? 0)
  return (
    <div className="msg assistant">
      <ModelLine model={message.model ?? null} />
      <div className="msg-body">
        {parts.map((part, index) => <PartView key={part.type === "tool" || part.type === "document" ? part.id : `${part.type}-${index}`} part={part} onDecide={onDecide} root={root} waiting={message.state === "awaiting_approval" && !busy} />)}
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
          {(message.durationMs || tokens) ? <span className="msg-meta">{message.durationMs ? formatDuration(Math.max(1, Math.round(message.durationMs / 1000)), lang) : ""}{tokens ? ` · ${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} ${t("chat.tokens")}` : ""}</span> : null}
        </div>
      )}
    </div>
  )
}

function LiveMessage({ live, onDecide, root }: { live: LiveTurn; onDecide: (partId: string, approved: boolean) => void; root: string }) {
  const { t, lang } = useT()
  const thinking = !live.text && !live.parts.some((part) => part.type === "text")
  const elapsed = useElapsed(live.startedAt, true)
  const text = visibleStream(live.text)
  const runningTool = live.parts.some((part) => part.type === "tool" && part.status === "running")
  return (
    <div className="msg assistant live">
      <ModelLine model={live.model} />
      <div className="msg-body">
        {live.parts.map((part, index) => <PartView key={part.type === "tool" || part.type === "document" ? part.id : `${part.type}-${index}`} part={part} onDecide={onDecide} root={root} waiting={false} />)}
        {(thinking || live.reasoning) && !text && !runningTool && <Thinking seconds={elapsed} reasoning={live.reasoning} active />}
        {text && <Markdown text={text} streaming />}
        {!thinking && !text && !runningTool && !live.reasoning && <span className="typing" aria-label={t("chat.writing")}><i /><i /><i /></span>}
        <span className="sr-only" aria-live="polite">{thinking ? `${t("chat.thinking")} ${formatDuration(elapsed, lang)}` : ""}</span>
      </div>
    </div>
  )
}

/** "Thinking · 12 s", with the model's own reasoning when the provider shares it. */
function Thinking({ seconds, reasoning, active, ms }: { seconds?: number; reasoning: string; active?: boolean; ms?: number }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { if (active && body.current) body.current.scrollTop = body.current.scrollHeight })
  const label = active ? `${t("chat.thinking")} · ${formatDuration(seconds ?? 0, lang)}` : t("chat.thought").replace("{time}", formatDuration(Math.max(1, Math.round((ms ?? 0) / 1000)), lang))
  return (
    <div className={`thinking ${active ? "active" : ""} ${open ? "open" : ""}`}>
      <button className="thinking-head" onClick={() => reasoning && setOpen((value) => !value)} aria-expanded={open} disabled={!reasoning}>
        <span className="thinking-orb" aria-hidden><Icon name="brain" size={14} /></span>
        <span className="thinking-label">{label}</span>
        {reasoning && <Icon name="chevron" size={13} />}
      </button>
      {reasoning && (open || active) && <div className={`thinking-body ${active && !open ? "peek" : ""}`} ref={body}><MathText text={reasoning} /></div>}
    </div>
  )
}

function PartView({ part, onDecide, root, waiting }: { part: Part; onDecide: (partId: string, approved: boolean) => void; root: string; waiting: boolean }) {
  if (part.type === "text") return <Markdown text={part.text} />
  if (part.type === "reasoning") return <Thinking reasoning={part.text} ms={part.ms} />
  if (part.type === "document") return <DocumentCard part={part} root={root} />
  return part.kind === "action" ? <ActionCard part={part} onDecide={onDecide} waiting={waiting} /> : <ToolRow part={part} />
}

function ToolRow({ part }: { part: Extract<Part, { type: "tool" }> }) {
  const { lang, t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className={`tool-row ${part.status}`}>
      <button className="tool-row-head" onClick={() => setOpen((value) => !value)} aria-expanded={open} disabled={part.status === "running"}>
        <span className="tool-icon">{part.status === "running" ? <span className="spinner" /> : part.status === "failed" ? <Icon name="x" size={12} stroke={2.4} /> : <Icon name="check" size={12} stroke={2.4} />}</span>
        <span>{toolLabel(part, lang)}</span>
        {part.status === "failed" && <span className="tool-state">{t("chat.tool.failed")}</span>}
        {part.status !== "running" && <Icon name="chevron" size={12} />}
      </button>
      {open && <pre className="tool-output selectable">{part.error ?? part.summary ?? ""}</pre>}
    </div>
  )
}

function ActionCard({ part, onDecide, waiting }: { part: Extract<Part, { type: "tool" }>; onDecide: (partId: string, approved: boolean) => void; waiting: boolean }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const detail = part.tool === "create_claim" ? <><div className="k">{String(part.args.title ?? "")}</div><MathText text={String(part.args.statement ?? "")} /></>
    : part.tool === "formalize" && part.args.lean ? <pre className="wf-code">{String(part.args.lean)}</pre>
    : part.tool === "search_literature" || part.tool === "create_branch" ? null : null
  const state = part.status === "proposed" ? (waiting ? "chat.tool.waiting" : "chat.tool.proposed") : `chat.tool.${part.status}`
  return (
    <div className={`action-card ${part.status}`}>
      <div className="action-head">
        <span className="action-icon">{part.status === "running" ? <span className="spinner" /> : <Icon name={part.status === "done" ? "check" : part.status === "failed" || part.status === "rejected" ? "x" : "sparkles"} size={14} stroke={2} />}</span>
        <div className="action-text"><strong>{toolLabel(part, lang)}</strong><span>{t(state as MessageKey)}</span></div>
        {part.status !== "proposed" && part.status !== "running" && (part.summary || part.error) && <button className="link-btn" onClick={() => setOpen((value) => !value)}>{open ? t("chat.hideDetails") : t("chat.details")}</button>}
      </div>
      {detail && <div className="action-detail">{detail}</div>}
      {part.status === "proposed" && waiting && (
        <div className="action-buttons">
          <button className="btn btn-primary btn-sm" onClick={() => onDecide(part.id, true)}><Icon name="check" size={14} stroke={2.4} />{t("chat.approve")}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onDecide(part.id, false)}>{t("chat.decline")}</button>
        </div>
      )}
      {open && <pre className="tool-output selectable">{part.error ?? part.summary}</pre>}
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
function ModelPicker({ profile, onChange }: { profile: string | null; onChange: (profile: string | null) => void }) {
  const app = useApp()
  const { t } = useT()
  const status = useProviderStatus(app.workspace.root)
  const profiles = useProfiles(app.workspace.root)
  const catalog = useCatalog(app.workspace.root)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(box, open, () => setOpen(false))
  const rows = status.data?.profiles ?? []
  const remoteAllowed = status.data?.remoteModelsAllowed !== false
  const defaultProfile = profiles.data?.defaultProfile ?? null
  const describe = (id: string) => catalog.data?.providers.find((entry) => entry.descriptor.id === id)?.descriptor
  const usable = (row: (typeof rows)[number]) => (row.connection === "CONFIGURED" || row.connection === "LOCAL_OFFLINE") && !(row.remote && !remoteAllowed)
  const reason = (row: (typeof rows)[number]) => row.remote && !remoteAllowed ? t("chat.model.privacy") : row.connection === "SECRET_REQUIRED" ? t("chat.model.key") : row.connection === "LOGIN_REQUIRED" ? t("chat.model.login") : row.connection === "CLIENT_MISSING" ? t("chat.model.client") : row.connection
  const activeId = profile ?? defaultProfile
  const active = rows.find((row) => row.profile === activeId)
  const label = active ? (active.model === "auto" ? describe(active.descriptor)?.displayName ?? active.profile : active.model) : t("chat.model.none")
  return (
    <div className="picker" ref={box}>
      <button className="picker-btn" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        {active && <ProviderLogo descriptor={{ id: active.descriptor, displayName: describe(active.descriptor)?.displayName ?? active.descriptor }} size={18} />}
        <span>{label}</span><Icon name="down" size={13} />
      </button>
      {open && (
        <div className="menu picker-menu" role="menu">
          <div className="picker-title">{t("chat.model.title")}</div>
          {rows.map((row) => {
            const descriptor = describe(row.descriptor), ok = usable(row)
            return (
              <button key={row.profile} role="menuitemradio" aria-checked={row.profile === activeId} className={`menu-item picker-item ${row.profile === activeId ? "on" : ""}`} disabled={!ok} onClick={() => { onChange(row.profile === defaultProfile ? null : row.profile); setOpen(false) }}>
                <ProviderLogo descriptor={{ id: row.descriptor, displayName: descriptor?.displayName ?? row.descriptor }} size={24} />
                <span className="picker-item-text"><strong>{row.model === "auto" ? t("chat.model.auto") : row.model}</strong><span>{descriptor?.displayName ?? row.descriptor}{row.profile === defaultProfile ? ` · ${t("chat.model.default")}` : ""}{ok ? "" : ` · ${reason(row)}`}</span></span>
                {row.profile === activeId && <Icon name="check" size={14} stroke={2.4} />}
              </button>
            )
          })}
          {!rows.length && <p className="picker-empty">{t("chat.model.empty")}</p>}
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
