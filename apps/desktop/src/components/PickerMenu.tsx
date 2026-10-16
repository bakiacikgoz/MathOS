import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

const GAP = 6, EDGE = 8

/**
 * A picker's menu, drawn above the whole window and placed next to its button.
 * Rendered in place it would be clipped by any scrolling parent (the composer scrolls when the math toolbar is open),
 * so it lives in a portal and opens towards the side with room, never larger than the window.
 */
export function PickerMenu({ anchor, menuRef, placement = "down", align = "start", className = "", label, children }: {
  anchor: RefObject<HTMLElement | null>; menuRef: RefObject<HTMLDivElement | null>; placement?: "up" | "down"; align?: "start" | "end"; className?: string; label?: string; children: ReactNode
}) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" })
  const [side, setSide] = useState(placement)
  const own = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const button = anchor.current, menu = own.current
      if (!button || !menu) return
      const rect = button.getBoundingClientRect(), width = menu.offsetWidth, height = menu.scrollHeight
      const above = rect.top - GAP - EDGE, below = window.innerHeight - rect.bottom - GAP - EDGE
      // Keep the asked side unless the menu does not fit there and the other side has more room.
      const up = placement === "up" ? !(height > above && below > above) : height > below && above > below
      const left = Math.max(EDGE, Math.min(align === "end" ? rect.right - width : rect.left, window.innerWidth - width - EDGE))
      setSide(up ? "up" : "down")
      setStyle(up
        ? { left, bottom: window.innerHeight - rect.top + GAP, "--room": `${Math.max(120, above)}px` } as React.CSSProperties
        : { left, top: rect.bottom + GAP, "--room": `${Math.max(120, below)}px` } as React.CSSProperties)
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [anchor, placement, align])
  return createPortal(
    <div ref={(node) => { own.current = node; menuRef.current = node }} className={`menu picker-menu floating ${side} ${className}`} role="menu" aria-label={label} style={style}>
      {children}
    </div>,
    document.body,
  )
}
