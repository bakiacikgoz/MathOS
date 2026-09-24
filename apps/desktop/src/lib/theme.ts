import { useEffect, useState } from "react"

export type ThemePref = "system" | "light" | "dark"
const media = () => window.matchMedia("(prefers-color-scheme: dark)")
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function readThemePref(): ThemePref {
  try { const value = localStorage.getItem("mathos.theme"); return value === "light" || value === "dark" ? value : "system" } catch { return "system" }
}
const resolve = (pref: ThemePref) => pref === "system" ? (media().matches ? "dark" : "light") : pref

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }

/** Applies a theme; when an origin point is given it grows the new theme out of it as a circle. */
export function applyTheme(pref: ThemePref, origin?: { x: number; y: number }) {
  const next = resolve(pref)
  const root = document.documentElement
  if (root.dataset.theme === next) return
  const doc = document as ViewTransitionDocument
  if (!origin || !doc.startViewTransition || reducedMotion()) { root.dataset.theme = next; return }
  const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y))
  root.classList.add("theme-transition")
  const transition = doc.startViewTransition(() => { root.dataset.theme = next })
  transition.ready.then(() => {
    const animation = root.animate(
      { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${radius}px at ${origin.x}px ${origin.y}px)`] },
      { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
    )
    animation.finished.finally(() => root.classList.remove("theme-transition"))
  }).catch(() => root.classList.remove("theme-transition"))
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readThemePref)
  useEffect(() => {
    if (pref !== "system") return
    const mq = media(), onChange = () => applyTheme("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [pref])
  const set = (next: ThemePref, origin?: { x: number; y: number }) => {
    try { localStorage.setItem("mathos.theme", next) } catch {}
    setPref(next)
    applyTheme(next, origin)
  }
  return { pref, resolved: resolve(pref), set }
}
