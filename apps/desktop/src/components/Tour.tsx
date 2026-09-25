import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { driver, type Driver } from "driver.js"
import "driver.js/dist/driver.css"
import { readPref, writePref } from "../lib/storage.ts"
import { translate, useT, type Lang } from "../lib/i18n.ts"
import { DEFAULT_TOUR_PREFS, TOURS, markSeen, normalizeTourPrefs, shouldAutoStart, type TourId, type TourPrefs } from "../lib/tours.ts"

interface TourApi { start: (id: TourId) => void; prefs: TourPrefs; setAuto: (auto: boolean) => void; reset: () => void; active: boolean }
const TourContext = createContext<TourApi>({ start: () => {}, prefs: DEFAULT_TOUR_PREFS, setAuto: () => {}, reset: () => {}, active: false })
export const useTours = () => useContext(TourContext)

export function TourProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [prefs, setPrefs] = useState<TourPrefs>(() => normalizeTourPrefs(readPref<unknown>("tours", null)))
  const [active, setActive] = useState(false)
  const current = useRef<Driver | null>(null)
  const save = useCallback((update: (value: TourPrefs) => TourPrefs) => setPrefs((value) => { const next = update(value); writePref("tours", next); return next }), [])

  const start = useCallback((id: TourId) => {
    current.current?.destroy()
    const steps = TOURS[id].filter((step) => document.querySelector(`[data-tour="${step.anchor}"]`))
    if (!steps.length) return
    const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)
    const tour: Driver = driver({
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      popoverClass: "mathos-tour",
      overlayOpacity: 0.35,
      stagePadding: 6,
      stageRadius: 12,
      showProgress: steps.length > 1,
      progressText: "{{current}} / {{total}}",
      nextBtnText: t("tour.next"),
      prevBtnText: t("tour.prev"),
      doneBtnText: t("tour.done"),
      showButtons: ["next", "previous"],
      allowClose: true,
      steps: steps.map((step) => ({ element: `[data-tour="${step.anchor}"]`, popover: { title: step.title[lang], description: step.body[lang], side: step.side ?? "bottom", align: "start" } })),
      // "Skip" ends this section's guide; "Turn off guides" also stops them opening on their own.
      onPopoverRender: (popover) => {
        const skip = document.createElement("button")
        skip.type = "button"; skip.className = "mathos-tour-skip"; skip.textContent = t("tour.skip")
        skip.addEventListener("click", () => tour.destroy())
        const off = document.createElement("button")
        off.type = "button"; off.className = "mathos-tour-off"; off.textContent = t("tour.off")
        off.addEventListener("click", () => { save((value) => ({ ...value, auto: false })); tour.destroy() })
        popover.footer.prepend(skip, off)
        // Keyboard focus starts on the primary action, not on "Skip".
        requestAnimationFrame(() => popover.nextButton.focus())
      },
      onDestroyed: () => { save((value) => markSeen(value, id)); current.current = null; setActive(false) },
    })
    current.current = tour
    setActive(true)
    tour.drive()
  }, [lang, save])

  useEffect(() => () => current.current?.destroy(), [])
  const api = useMemo<TourApi>(() => ({ start, prefs, active, setAuto: (auto) => save((value) => ({ ...value, auto })), reset: () => save(() => ({ ...DEFAULT_TOUR_PREFS })) }), [start, prefs, active, save])
  return <TourContext.Provider value={api}>{children}</TourContext.Provider>
}

/** Opens a section's guide the first time the section is shown, once its content has rendered. */
export function useAutoTour(id: TourId, ready = true, after?: TourId) {
  const tours = useTours()
  useEffect(() => {
    if (!ready || tours.active || !shouldAutoStart(tours.prefs, id) || (after && !tours.prefs.seen.includes(after))) return
    const timer = window.setTimeout(() => tours.start(id), 700)
    return () => window.clearTimeout(timer)
  }, [id, ready, after, tours])
}

/** The "?" button: replays this section's guide on demand. */
export function HelpButton({ tour }: { tour: TourId }) {
  const tours = useTours()
  const { t } = useT()
  return <button type="button" className="help-btn" data-tour="help" onClick={() => tours.start(tour)} title={t("tour.help")} aria-label={t("tour.help")}>?</button>
}
