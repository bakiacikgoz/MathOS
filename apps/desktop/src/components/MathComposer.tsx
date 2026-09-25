import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { MathfieldElement } from "mathlive"
import "mathlive/fonts.css"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { QUICK, SYMBOL_GROUPS, TEMPLATES, searchMath, splitMath, toMathfieldInsert, type MathSymbol, type SearchHit } from "../lib/math-symbols.ts"
import { Icon } from "./Icon.tsx"

// Fonts come bundled through fonts.css (no network, CSP-safe); no keyboard sounds.
MathfieldElement.fontsDirectory = null
MathfieldElement.soundsDirectory = null

const ZW = "​"
const BY_SHOW = new Map(SYMBOL_GROUPS.flatMap((group) => group.items).map((item) => [item.show, item]))
type Chip = HTMLSpanElement & { field: MathfieldElement }

export interface MathComposerProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  autoFocus?: boolean
  /** Enter sends (Shift+Enter makes a new line), as in a chat box. */
  onSubmit?: () => void
  toolbar?: boolean
  minHeight?: number
  maxHeight?: number
  className?: string
}

/** Statement text: plain text with $…$ around each formula; a literal dollar is written \$. */
function serialize(root: HTMLElement): string {
  let out = ""
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out += (child.textContent ?? "").replace(/​/g, "").replace(/\$/g, "\\$")
      else if (child instanceof HTMLElement) {
        if ("chip" in child.dataset) { const latex = ((child as Chip).field?.getValue("latex") ?? "").trim(); if (latex) out += `$${latex}$` }
        else if (child.tagName === "BR") out += "\n"
        else if (child.tagName === "DIV" || child.tagName === "P") { if (out && !out.endsWith("\n")) out += "\n"; walk(child) }
        else walk(child)
      }
    }
  }
  walk(root)
  return out.replace(/\n$/, "")
}

/**
 * Writing mathematics the way it reads: text is typed as usual and each formula sits inline, typeset while you edit it.
 * `$` opens a formula (and closes it again), `\` searches symbols by name in Turkish or English, arrows move in and out,
 * and the toolbar inserts structures with placeholders to fill. The value stays plain text with $…$ formulas.
 */
export default function MathComposer({ value, onChange, label, placeholder, autoFocus, onSubmit, toolbar = true, minHeight = 96, maxHeight = 320, className = "" }: MathComposerProps) {
  const { t, lang } = useT()
  const root = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const emitted = useRef<string | null>(null)
  const active = useRef<Chip | null>(null)
  const history = useRef<{ stack: string[]; index: number; timer: number }>({ stack: [value], index: 0, timer: 0 })
  const handlers = useRef({ onChange, onSubmit })
  handlers.current = { onChange, onSubmit }
  const [empty, setEmpty] = useState(!value)
  const [palette, setPalette] = useState(false)
  const [group, setGroup] = useState<(typeof SYMBOL_GROUPS)[number]["id"]>("relations")
  const [search, setSearch] = useState<{ x: number; y: number; query: string; index: number } | null>(null)
  const saved = useRef<Range | null>(null)
  const [focusedChip, setFocusedChip] = useState(false)
  /** A formula just opened whose editor is not ready yet, and the keys typed meanwhile. */
  const opening = useRef<{ chip: Chip; keys: string } | null>(null)

  const emit = useCallback((record = true) => {
    const node = root.current
    if (!node) return
    const next = serialize(node)
    setEmpty(!next && !node.querySelector("[data-chip]"))
    if (next === emitted.current) return
    emitted.current = next
    handlers.current.onChange(next)
    if (!record) return
    const h = history.current
    window.clearTimeout(h.timer)
    h.timer = window.setTimeout(() => { if (h.stack[h.index] === next) return; h.stack = [...h.stack.slice(0, h.index + 1), next].slice(-100); h.index = h.stack.length - 1 }, 400)
  }, [])

  const placeCaret = (node: Node, offset: number) => {
    const selection = window.getSelection(), range = document.createRange()
    range.setStart(node, offset); range.collapse(true)
    selection?.removeAllRanges(); selection?.addRange(range)
  }

  /** Leaves a formula to the text beside it; an empty formula is removed on the way out. */
  const exit = useCallback((chip: Chip, direction: "forward" | "backward") => {
    const node = root.current
    if (!node) return
    node.focus({ preventScroll: true })
    const removeIfEmpty = !chip.field.getValue("latex").trim()
    if (direction === "forward") {
      let next = chip.nextSibling
      if (!next || next.nodeType !== Node.TEXT_NODE) { next = document.createTextNode(ZW); chip.after(next) }
      if (removeIfEmpty) chip.remove()
      placeCaret(next, (next.textContent ?? "").startsWith(ZW) ? 1 : 0)
    } else {
      let previous = chip.previousSibling
      if (!previous || previous.nodeType !== Node.TEXT_NODE) { previous = document.createTextNode(ZW); chip.before(previous) }
      if (removeIfEmpty) chip.remove()
      placeCaret(previous, previous.textContent?.length ?? 0)
    }
    active.current = null; setFocusedChip(false)
    emit()
  }, [emit])

  const makeChip = useCallback((latex: string): Chip => {
    const chip = document.createElement("span") as Chip
    chip.className = "mchip"; chip.contentEditable = "false"; chip.dataset.chip = ""
    const field = new MathfieldElement()
    field.mathVirtualKeyboardPolicy = "manual"
    field.smartFence = true
    field.defaultMode = "inline-math"
    field.popoverPolicy = "auto"
    field.value = latex
    field.setAttribute("aria-label", t("math.formula"))
    chip.field = field
    chip.append(field)
    field.addEventListener("input", () => emit())
    field.addEventListener("move-out", (event) => {
      const direction = (event as CustomEvent<{ direction: string }>).detail.direction
      if (direction === "forward" || direction === "backward") { event.preventDefault(); exit(chip, direction) }
    })
    field.addEventListener("keydown", (event) => {
      if (event.key === "$" || event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) { event.preventDefault(); event.stopPropagation(); exit(chip, "forward") }
      else if (event.key === "Backspace" && !field.getValue("latex")) { event.preventDefault(); event.stopPropagation(); exit(chip, "backward") }
      else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); exit(chip, "forward"); handlers.current.onSubmit?.() }
    }, { capture: true })
    field.addEventListener("focusin", () => {
      active.current = chip; setFocusedChip(true)
      const pending = opening.current
      if (pending?.chip === chip) { opening.current = null; if (pending.keys) { field.executeCommand(["typedText", pending.keys]); emit() } }
    })
    field.addEventListener("focusout", () => {
      window.setTimeout(() => {
        if (active.current === chip && document.activeElement !== field) { active.current = null; setFocusedChip(false) }
        if (chip.isConnected && !field.hasFocus() && !field.getValue("latex").trim()) { chip.remove(); emit() }
      }, 120)
    })
    return chip
  }, [emit, exit, t])

  const rebuild = useCallback((text: string) => {
    const node = root.current
    if (!node) return
    const pieces: Node[] = []
    for (const part of splitMath(text)) {
      if (part.kind === "math") { pieces.push(makeChip(part.value)); continue }
      part.value.replace(/\\\$/g, "$").split("\n").forEach((line, index) => { if (index) pieces.push(document.createElement("br")); if (line) pieces.push(document.createTextNode(line)) })
    }
    node.replaceChildren(...pieces)
    emitted.current = text
    setEmpty(!text)
  }, [makeChip])

  useLayoutEffect(() => { if (value !== emitted.current) rebuild(value) }, [value, rebuild])
  useEffect(() => { if (autoFocus) requestAnimationFrame(() => { const node = root.current; if (!node) return; node.focus(); placeCaret(node, node.childNodes.length) }) }, [autoFocus])
  useEffect(() => () => { window.clearTimeout(history.current.timer); window.mathVirtualKeyboard?.hide() }, [])

  /** The caret's range inside the text, or the end of the text when the caret is elsewhere. */
  const textRange = (): Range => {
    const node = root.current!, selection = window.getSelection()
    if (saved.current && node.contains(saved.current.startContainer)) return saved.current
    if (selection?.rangeCount && node.contains(selection.getRangeAt(0).startContainer)) return selection.getRangeAt(0)
    const range = document.createRange(); range.selectNodeContents(node); range.collapse(false); return range
  }

  /** A new formula at the caret, focused, with the caret on its first placeholder. */
  const insertFormula = useCallback((latex: string) => {
    const node = root.current
    if (!node) return
    const range = textRange()
    range.deleteContents()
    const chip = makeChip("")
    range.insertNode(chip)
    if (!chip.nextSibling || chip.nextSibling.nodeType !== Node.TEXT_NODE) chip.after(document.createTextNode(ZW))
    saved.current = null
    // The editor needs a moment to mount; keys typed meanwhile are kept and replayed into it (see onKeyDown).
    opening.current = { chip, keys: "" }
    let tries = 0
    const focus = () => {
      if (opening.current?.chip !== chip && document.activeElement !== chip.field) return
      chip.field.focus()
      if (document.activeElement !== chip.field && tries++ < 30 && chip.isConnected) { requestAnimationFrame(focus); return }
      if (latex) chip.field.insert(toMathfieldInsert(latex), { selectionMode: "placeholder", format: "latex" })
      emit()
    }
    focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeChip, emit])

  /** Toolbar and search: into the formula being edited, or as a new formula at the caret. */
  const insertLatex = (latex: string) => {
    const chip = active.current
    if (chip?.isConnected) { chip.field.insert(toMathfieldInsert(latex), { selectionMode: "placeholder", format: "latex", focus: true }); emit(); return }
    insertFormula(latex)
  }

  const neighbour = (direction: "before" | "after"): Chip | null => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || !selection.isCollapsed) return null
    const { startContainer: container, startOffset: offset } = selection.getRangeAt(0)
    const isChip = (node: Node | null | undefined): node is Chip => node instanceof HTMLElement && "chip" in node.dataset
    if (container === root.current) return (direction === "before" ? container.childNodes[offset - 1] : container.childNodes[offset]) as Chip ?? null
    if (container.nodeType !== Node.TEXT_NODE) return null
    const text = container.textContent ?? ""
    if (direction === "before") { const lead = text.slice(0, offset).replace(/​/g, ""); return !lead && isChip(container.previousSibling) ? container.previousSibling : null }
    const tail = text.slice(offset).replace(/​/g, ""); return !tail && isChip(container.nextSibling) ? container.nextSibling : null
  }

  const enterChip = (chip: Chip, at: "start" | "end") => {
    chip.field.focus()
    requestAnimationFrame(() => { chip.field.position = at === "start" ? 0 : chip.field.lastOffset })
  }

  const openSearch = () => {
    const node = root.current, box = wrap.current
    if (!node || !box) return
    const range = textRange().cloneRange()
    saved.current = range
    const rect = range.getClientRects()[0] ?? node.getBoundingClientRect(), outer = box.getBoundingClientRect()
    setSearch({ x: Math.max(0, Math.min(rect.left - outer.left, outer.width - 300)), y: rect.bottom - outer.top + 6, query: "", index: 0 })
  }

  const undo = (direction: -1 | 1) => {
    const h = history.current
    window.clearTimeout(h.timer)
    const current = serialize(root.current!)
    if (h.stack[h.index] !== current) { h.stack = [...h.stack.slice(0, h.index + 1), current]; h.index = h.stack.length - 1 }
    const index = h.index + direction
    if (index < 0 || index >= h.stack.length) return
    h.index = index
    rebuild(h.stack[index]!)
    emitted.current = h.stack[index]!
    handlers.current.onChange(h.stack[index]!)
    const node = root.current!; placeCaret(node, node.childNodes.length)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== root.current) return
    const pending = opening.current
    // MathLive reports focus before the browser has moved it, so the real test is where the key event came from.
    if (pending?.chip.isConnected) {
      if (event.key === "$" || event.key === "Escape") { event.preventDefault(); opening.current = null; if (pending.keys) pending.chip.field.value = pending.keys; exit(pending.chip, "forward"); return }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); pending.keys += event.key; return }
      if (event.key === "Backspace") { event.preventDefault(); pending.keys = pending.keys.slice(0, -1); return }
    }
    const mod = event.metaKey || event.ctrlKey
    if (event.key === "$") { event.preventDefault(); insertFormula(""); return }
    if (event.key === "\\") { event.preventDefault(); openSearch(); return }
    if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); undo(event.shiftKey ? 1 : -1); return }
    if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); undo(1); return }
    if (mod && event.key.toLowerCase() === "m") { event.preventDefault(); insertFormula(""); return }
    if (event.key === "Enter") {
      event.preventDefault()
      if (handlers.current.onSubmit && (!event.shiftKey || mod)) { handlers.current.onSubmit(); return }
      if (!handlers.current.onSubmit && mod) return
      document.execCommand("insertLineBreak"); emit(); return
    }
    if (event.key === "Backspace") { const chip = neighbour("before"); if (chip) { event.preventDefault(); enterChip(chip, "end") } return }
    if (event.key === "ArrowLeft" && !event.shiftKey) { const chip = neighbour("before"); if (chip) { event.preventDefault(); enterChip(chip, "end") } return }
    if (event.key === "ArrowRight" && !event.shiftKey) { const chip = neighbour("after"); if (chip) { event.preventDefault(); enterChip(chip, "start") } }
  }

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== root.current && !root.current?.contains(event.target as Node)) return
    event.preventDefault()
    const text = event.clipboardData.getData("text/plain")
    if (!text) return
    const range = textRange()
    range.deleteContents()
    const fragment = document.createDocumentFragment()
    let last: Node | null = null
    for (const part of splitMath(text)) {
      if (part.kind === "math") { last = makeChip(part.value); fragment.append(last); continue }
      part.value.replace(/\\\$/g, "$").split("\n").forEach((line, index) => { if (index) { last = document.createElement("br"); fragment.append(last) } if (line) { last = document.createTextNode(line); fragment.append(last) } })
    }
    const tail = document.createTextNode(ZW)
    fragment.append(tail)
    range.insertNode(fragment)
    placeCaret(tail, 1)
    emit()
  }

  const pick = (hit: SearchHit) => { setSearch(null); requestAnimationFrame(() => insertFormula(hit.latex)) }
  const results = search ? searchMath(search.query, 8) : []
  const suggestions: SearchHit[] = search && !search.query ? ["integral", "toplam", "kesir", "alt küme", "her", "vardır", "sonsuz", "reel"].map((word) => searchMath(lang === "tr" ? word : word, 1)[0]!).filter(Boolean) : results

  const toggleKeyboard = () => {
    const keyboard = window.mathVirtualKeyboard
    if (keyboard?.visible) { keyboard.hide(); return }
    if (!active.current) insertFormula("")
    requestAnimationFrame(() => window.mathVirtualKeyboard?.show({ animate: true }))
  }

  const tool = (item: { key: string; show: string; title: string; latex: string }) => (
    <button key={item.key} type="button" className="math-key" title={item.title} aria-label={item.title} onMouseDown={(event) => event.preventDefault()} onClick={() => insertLatex(item.latex)}>{item.show}</button>
  )

  return (
    <div className={`mcomposer-wrap ${className}`} ref={wrap}>
      {toolbar && (
        <div className="math-toolbar" role="toolbar" aria-label={t("math.toolbar")}>
          {TEMPLATES.map((item) => tool({ key: item.id, show: item.show, title: t(`math.tpl.${item.id}` as MessageKey), latex: item.latex }))}
          <span className="math-sep" aria-hidden />
          {QUICK.map((show) => BY_SHOW.get(show)).filter((item): item is MathSymbol => Boolean(item)).map((item) => tool({ key: item.show, show: item.show, title: item.latex, latex: item.latex }))}
          <span className="math-spacer" />
          <button type="button" className={`math-key wide ${palette ? "on" : ""}`} aria-expanded={palette} onMouseDown={(event) => event.preventDefault()} onClick={() => setPalette((open) => !open)}>{t("math.more")}</button>
          <button type="button" className="math-key wide" title={t("math.keyboard")} onMouseDown={(event) => event.preventDefault()} onClick={toggleKeyboard}><Icon name="keyboard" size={14} /></button>
        </div>
      )}
      {toolbar && palette && (
        <div className="math-palette">
          <div className="math-tabs" role="tablist">
            {SYMBOL_GROUPS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={group === item.id} className={group === item.id ? "on" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => setGroup(item.id)}>{t(`math.group.${item.id}` as MessageKey)}</button>)}
          </div>
          <div className="math-grid">
            {SYMBOL_GROUPS.find((item) => item.id === group)!.items.map((item) => tool({ key: item.show + item.latex, show: item.show, title: item.latex, latex: item.latex }))}
          </div>
        </div>
      )}
      <div
        ref={root}
        className={`mcomposer ${focusedChip ? "editing-formula" : ""}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-empty={empty ? "true" : "false"}
        data-placeholder={placeholder ?? ""}
        spellCheck={false}
        style={{ minHeight, maxHeight }}
        onKeyDown={onKeyDown}
        onInput={() => emit()}
        onPaste={onPaste}
        onDrop={(event) => event.preventDefault()}
      />
      {toolbar && <div className="math-hint"><span>{t(focusedChip ? "math.hintInside" : "math.hintComposer")}</span></div>}
      {search && (
        <div className="math-search" style={{ left: search.x, top: search.y }} role="dialog" aria-label={t("math.searchTitle")}>
          <input
            autoFocus className="input" value={search.query} placeholder={t("math.searchPlaceholder")}
            onChange={(event) => setSearch({ ...search, query: event.target.value, index: 0 })}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const count = suggestions.length || 1; setSearch({ ...search, index: (search.index + (event.key === "ArrowDown" ? 1 : count - 1)) % count }) }
              else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); const hit = suggestions[search.index]; if (hit) pick(hit) }
              else if (event.key === "Escape" || (event.key === "Backspace" && !search.query)) { event.preventDefault(); event.stopPropagation(); setSearch(null); const range = saved.current; saved.current = null; root.current?.focus(); if (range) { const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) } }
            }}
            onBlur={() => window.setTimeout(() => setSearch((current) => current && document.activeElement?.closest(".math-search") ? current : null), 150)}
          />
          <div className="math-search-list" role="listbox">
            {!search.query && <div className="math-search-head">{t("math.searchTry")}</div>}
            {suggestions.map((hit, index) => (
              <button key={hit.latex} type="button" role="option" aria-selected={index === search.index} className={index === search.index ? "on" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(hit)}>
                <span className="sym">{hit.show}</span><span className="name">{hit.label}</span><code>{hit.latex.replace(/‸/g, "…")}</code>
              </button>
            ))}
            {search.query && !suggestions.length && <div className="math-search-head">{t("math.searchNone")}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
