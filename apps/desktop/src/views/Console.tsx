import { useEffect, useRef, useState } from "react"
import { useApp } from "../lib/app.ts"
import { exec } from "../lib/bridge.ts"
import { splitArgs } from "../lib/args.ts"
import { invalidate } from "../lib/query.ts"
import { readPref, writePref } from "../lib/storage.ts"
import { useT } from "../lib/i18n.ts"
import { HelpButton, useAutoTour } from "../components/Tour.tsx"
import { Icon } from "../components/Icon.tsx"

interface Entry { id: number; command: string; code: number | null; stdout: string; stderr: string; ms: number }
const EXAMPLES = ["status", "claims", "branch list", "doctor", "research start", "literature search \"prime gaps\"", "help"]
const READ_ONLY = new Set(["status", "claims", "doctor", "help", "why", "ledger", "events", "workspace", "graph"])

export function Console() {
  const app = useApp()
  const { t } = useT()
  const [entries, setEntries] = useState<Entry[]>([])
  const [value, setValue] = useState("")
  const [running, setRunning] = useState(false)
  const history = useRef<string[]>(readPref("consoleHistory", []))
  const cursor = useRef(-1)
  const out = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const submit = async (command: string) => {
    const args = splitArgs(command)
    if (!args.length || running) return
    history.current = [command, ...history.current.filter((item) => item !== command)].slice(0, 100)
    writePref("consoleHistory", history.current)
    cursor.current = -1
    const id = ++seq.current
    setEntries((rows) => [...rows, { id, command, code: null, stdout: "", stderr: "", ms: 0 }])
    setValue("")
    setRunning(true)
    try {
      const result = await exec(app.workspace.root, args)
      setEntries((rows) => rows.map((row) => row.id === id ? { ...row, ...result } : row))
      if (!READ_ONLY.has(args[0]!)) invalidate(app.workspace.root)
    } catch (error) {
      setEntries((rows) => rows.map((row) => row.id === id ? { ...row, code: 1, stderr: (error as Error).message } : row))
    } finally {
      setRunning(false)
      requestAnimationFrame(() => input.current?.focus())
    }
  }

  useEffect(() => { if (app.pendingConsole) { const command = app.pendingConsole; app.consumeConsole(); void submit(command) } })
  useEffect(() => { out.current?.scrollTo({ top: out.current.scrollHeight, behavior: "smooth" }) }, [entries])
  useEffect(() => { input.current?.focus() }, [])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      const next = Math.max(-1, Math.min(history.current.length - 1, cursor.current + (event.key === "ArrowUp" ? 1 : -1)))
      cursor.current = next
      setValue(next === -1 ? "" : history.current[next]!)
    }
    if (event.key === "l" && event.ctrlKey) { event.preventDefault(); setEntries([]) }
  }

  useAutoTour("console", true, "app")
  return (
    <div className="console">
      <div className="console-head">
        <div><div className="eyebrow eyebrow-name">{app.workspace.name}</div><h1 className="title">{t("console.title")}</h1><p className="subtitle">{t("console.hint")}</p></div>
        <div className="head-actions">{entries.length > 0 && <button className="btn btn-ghost" onClick={() => setEntries([])}>{t("console.clear")}</button>}<HelpButton tour="console" /></div>
      </div>
      <div className="console-out" ref={out}>
        {entries.length === 0 && (
          <div className="view-enter" style={{ fontFamily: "var(--font)" }}>
            <div className="field-label">{t("console.examples")}</div>
            <div className="examples" data-tour="console-examples">{EXAMPLES.map((example) => <button key={example} className="chip" onClick={() => submit(example)}>{example}</button>)}</div>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="console-entry">
            <div className="cmd"><span style={{ color: "var(--text-3)" }}>›</span><span className="selectable">{entry.command}</span>
              <span className="ms">{entry.code === null ? <span className="spinner" /> : `${entry.code === 0 ? "✓" : `exit ${entry.code}`} · ${entry.ms} ms`}</span>
            </div>
            {entry.stdout && <pre>{entry.stdout.trimEnd()}</pre>}
            {entry.stderr && <pre className="err">{entry.stderr.trimEnd()}</pre>}
          </div>
        ))}
      </div>
      <form className="console-input" data-tour="console-input" onSubmit={(event) => { event.preventDefault(); void submit(value) }}>
        <span className="prompt">mathos</span>
        <input ref={input} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={onKeyDown} placeholder={t("console.placeholder")} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label={t("console.title")} />
        <button className="btn btn-primary btn-icon" disabled={running || !value.trim()} aria-label={t("console.run")}>{running ? <span className="spinner" /> : <Icon name="arrow" size={16} />}</button>
      </form>
    </div>
  )
}
