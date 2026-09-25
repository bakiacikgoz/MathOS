import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Icon } from "./Icon.tsx"
import { useT } from "../lib/i18n.ts"

/** Keeps an overlay mounted for its exit animation. */
export function usePresence(open: boolean, exitMs = 160) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return }
    if (!mounted) return
    setClosing(true)
    const timer = setTimeout(() => { setMounted(false); setClosing(false) }, exitMs)
    return () => clearTimeout(timer)
  }, [open, mounted, exitMs])
  return { mounted, closing }
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useT()
  const { mounted, closing } = usePresence(open)
  const ref = useRef<HTMLDivElement>(null)
  const restore = useRef<Element | null>(null)
  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement
    // Escape inside a formula or the symbol search only leaves that; it must not close the whole sheet.
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !(event.target as Element | null)?.closest?.(".mchip, .math-search")) { event.stopPropagation(); onClose() } }
    window.addEventListener("keydown", onKey, true)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("input, textarea, button.autofocus")?.focus())
    return () => { window.removeEventListener("keydown", onKey, true); (restore.current as HTMLElement | null)?.focus?.() }
  }, [open, onClose])
  if (!mounted) return null
  return createPortal(
    <>
      <div className={`scrim ${closing ? "closing" : ""}`} onClick={onClose} />
      <div className={`sheet ${closing ? "closing" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="sheet-head"><h2>{title}</h2><button className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t("common.close")}><Icon name="x" size={16} /></button></div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}

export interface Toast { id: number; text: string; kind: "ok" | "error"; leaving?: boolean }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = ++seq.current
    setToasts((rows) => [...rows.slice(-2), { id, text, kind }])
    setTimeout(() => setToasts((rows) => rows.map((row) => row.id === id ? { ...row, leaving: true } : row)), kind === "error" ? 5200 : 2600)
    setTimeout(() => setToasts((rows) => rows.filter((row) => row.id !== id)), kind === "error" ? 5500 : 2900)
  }, [])
  return { toasts, push }
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind === "error" ? "error" : ""} ${toast.leaving ? "leaving" : ""}`}>
          <Icon name={toast.kind === "error" ? "info" : "check"} size={16} />{toast.text}
        </div>
      ))}
    </div>,
    document.body,
  )
}
