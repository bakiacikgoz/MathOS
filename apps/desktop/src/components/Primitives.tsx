import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { statusMeta } from "../lib/status.ts"
import { useT } from "../lib/i18n.ts"
import { Icon } from "./Icon.tsx"
import { errorText } from "../lib/cli-text.ts"
import type { MathosError } from "../lib/bridge.ts"

export function StatusPill({ status }: { status: string }) {
  const { lang } = useT()
  const meta = statusMeta(status, lang)
  return <span className={`pill pill-${meta.variant}`} title={meta.hint}>{meta.label}</span>
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (value: T, event: React.MouseEvent) => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const button = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    if (button) setThumb({ x: button.offsetLeft - 3, w: button.offsetWidth })
  }, [value, options.length])
  return (
    <div className="segmented" ref={ref} role="group" aria-label={label}>
      {thumb && <span className="segmented-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={(event) => onChange(option.value, event)}>{option.label}</button>
      ))}
    </div>
  )
}

export function Empty({ glyph = "∅", title, children }: { glyph?: string; title: string; children?: ReactNode }) {
  return <div className="empty"><div className="glyph">{glyph}</div><h3>{title}</h3>{children}</div>
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, lang } = useT()
  const typed = error as Partial<MathosError>
  return (
    <div className="error-box">
      <Icon name="info" />
      <div style={{ flex: 1 }}>
        <strong>{t("common.error")}</strong>
        <div className="selectable">{errorText(error, lang)}</div>
        {typed?.code && <code>{typed.code}</code>}
      </div>
      {onRetry && <button className="btn btn-secondary" onClick={onRetry}>{t("common.retry")}</button>}
    </div>
  )
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} />
}

/** Counts up from 0 on first render; cheap rAF tween that respects reduced motion. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return }
    const start = performance.now(), origin = from.current, duration = 700
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(origin + (value - origin) * eased))
      if (p < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <>{shown}</>
}
