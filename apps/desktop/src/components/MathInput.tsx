import { lazy, Suspense, useDeferredValue, useRef, useState } from "react"
import { useT, type MessageKey } from "../lib/i18n.ts"
import { SYMBOL_GROUPS, TEMPLATES, QUICK, completions, insertion, insideMath, leanAbbreviation, type MathSymbol } from "../lib/math-symbols.ts"
import { MathText } from "./MathText.tsx"
import { Icon } from "./Icon.tsx"

const EquationEditor = lazy(() => import("./EquationEditor.tsx"))
const TOKEN = /\\([A-Za-z0-9_^<>=.\-]*)$/
const BY_SHOW = new Map(SYMBOL_GROUPS.flatMap((group) => group.items).map((item) => [item.show, item]))

/**
 * A text box that makes mathematics easy to type:
 * - a toolbar of common symbols and structures (fraction, power, sum…), inserted where the cursor is;
 * - typing \ offers matching commands (Tab or Enter completes);
 * - `latex` mode writes LaTeX inside $…$ and shows a live preview, with a visual equation editor;
 * - `lean` mode writes Unicode as Lean expects, and \forall + space becomes ∀ as in Lean's editors.
 */
export function MathInput({ value, onChange, mode = "latex", placeholder, label, rows = 4, autoFocus, preview = true }: {
  value: string; onChange: (value: string) => void; mode?: "latex" | "lean"; placeholder?: string; label: string; rows?: number; autoFocus?: boolean; preview?: boolean
}) {
  const { t } = useT()
  const area = useRef<HTMLTextAreaElement>(null)
  const [caret, setCaret] = useState(0)
  const [palette, setPalette] = useState(false)
  const [group, setGroup] = useState<(typeof SYMBOL_GROUPS)[number]["id"]>("relations")
  const [highlight, setHighlight] = useState(0)
  const [editor, setEditor] = useState(false)
  const deferred = useDeferredValue(value)

  const token = TOKEN.exec(value.slice(0, caret))
  const suggestions = token && token[1] ? completions(token[1], mode) : []
  const active = suggestions.length ? Math.min(highlight, suggestions.length - 1) : 0

  const place = (next: string, position: number) => {
    onChange(next)
    requestAnimationFrame(() => { const node = area.current; if (!node) return; node.focus(); node.setSelectionRange(position, position); setCaret(position) })
  }
  /** Inserts a symbol or template at the cursor (replacing a selection, or `from` characters before it). */
  const insert = (latex: string, lean?: string, from?: number) => {
    const node = area.current
    const start = from ?? node?.selectionStart ?? value.length, end = node?.selectionEnd ?? start
    const base = value.slice(0, start) + value.slice(end)
    const { insert: text, caret: at } = insertion(base, start, latex, mode, lean)
    place(base.slice(0, start) + text + base.slice(start), start + at)
    setHighlight(0)
  }
  const accept = (item: MathSymbol) => { if (token) insert(item.latex, item.lean, caret - token[0].length) }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (event.key === "Tab" || (event.key === "Enter" && !event.metaKey && !event.ctrlKey)) { event.preventDefault(); accept(suggestions[active]!); return }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setHighlight((index) => (index + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length); return }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); place(value, caret); setCaret(-1); return }
    }
    // Lean's input method: an exact abbreviation turns into its symbol when a space is typed.
    if (mode === "lean" && event.key === " " && token?.[1]) {
      const symbol = leanAbbreviation(token[1])
      if (symbol) { event.preventDefault(); const start = caret - token[0].length; place(value.slice(0, start) + symbol + " " + value.slice(caret), start + symbol.length + 1) }
    }
  }
  const track = (event: React.SyntheticEvent<HTMLTextAreaElement>) => setCaret(event.currentTarget.selectionStart)
  const symbols = (items: MathSymbol[]) => items.filter((item) => mode === "latex" || item.lean)
  const showPreview = mode === "latex" && preview && /\$|\\\(|\\\[/.test(deferred)

  return (
    <div className="math-input">
      <div className="math-toolbar" role="toolbar" aria-label={t("math.toolbar")}>
        {TEMPLATES.map((item) => (
          <button key={item.id} type="button" className="math-key tpl" title={t(`math.tpl.${item.id}` as MessageKey)} aria-label={t(`math.tpl.${item.id}` as MessageKey)}
            onMouseDown={(event) => event.preventDefault()} onClick={() => insert(item.latex, item.lean)}>{item.show}</button>
        ))}
        <span className="math-sep" aria-hidden />
        {QUICK.map((show) => BY_SHOW.get(show)).filter((item): item is MathSymbol => Boolean(item && (mode === "latex" || item.lean))).map((item) => (
          <button key={item.show} type="button" className="math-key" title={mode === "latex" ? item.latex : `\\${item.names[0]}`}
            onMouseDown={(event) => event.preventDefault()} onClick={() => insert(item.latex, item.lean)}>{item.show}</button>
        ))}
        <span className="math-spacer" />
        <button type="button" className={`math-key wide ${palette ? "on" : ""}`} aria-expanded={palette} onClick={() => setPalette((open) => !open)}>{t("math.more")}</button>
        {mode === "latex" && <button type="button" className="math-key wide" onClick={() => setEditor(true)}><Icon name="sparkles" size={13} /> {t("math.visual")}</button>}
      </div>

      {palette && (
        <div className="math-palette">
          <div className="math-tabs" role="tablist">
            {SYMBOL_GROUPS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={group === item.id} className={group === item.id ? "on" : ""} onClick={() => setGroup(item.id)}>{t(`math.group.${item.id}` as MessageKey)}</button>)}
          </div>
          <div className="math-grid">
            {symbols(SYMBOL_GROUPS.find((item) => item.id === group)!.items).map((item) => (
              <button key={item.show + item.latex} type="button" className="math-key" title={mode === "latex" ? item.latex : `\\${item.names[0]}`}
                onMouseDown={(event) => event.preventDefault()} onClick={() => insert(item.latex, item.lean)}>{item.show}</button>
            ))}
          </div>
        </div>
      )}

      <textarea ref={area} className={`textarea ${mode === "lean" ? "mono" : ""}`} value={value} rows={rows} autoFocus={autoFocus} placeholder={placeholder} aria-label={label} spellCheck={false}
        onChange={(event) => { onChange(event.target.value); setCaret(event.target.selectionStart); setHighlight(0) }} onKeyDown={onKeyDown} onSelect={track} onClick={track} />

      <div className="math-hint" aria-live="polite">
        {suggestions.length ? (
          <div className="math-suggest" role="listbox" aria-label={t("math.suggestions")}>
            {suggestions.map((item, index) => (
              <button key={item.latex} type="button" role="option" aria-selected={index === active} className={index === active ? "on" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => accept(item)}>
                <span className="sym">{item.show}</span><span className="cmd">{mode === "latex" ? item.latex.replace(/‸/g, "…") : `\\${item.names[0]}`}</span>
              </button>
            ))}
            <span className="key">{t("math.tabToComplete")}</span>
          </div>
        ) : <span>{t(mode === "latex" ? "math.hintLatex" : "math.hintLean")}</span>}
      </div>

      {showPreview && <div className="preview-box math-preview"><MathText text={deferred} /></div>}

      {editor && <Suspense fallback={null}><EquationEditor onClose={() => setEditor(false)} onInsert={(latex) => {
        setEditor(false)
        const node = area.current, at = node?.selectionStart ?? value.length
        const before = value.slice(0, at), gap = before && !/\s$/.test(before) ? " " : ""
        const wrapped = gap + (insideMath(value, at) ? latex : `$${latex}$`)
        place(value.slice(0, at) + wrapped + value.slice(node?.selectionEnd ?? at), at + wrapped.length)
      }} /></Suspense>}
    </div>
  )
}
