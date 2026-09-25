import { useEffect, useState } from "react"
import { useT } from "../lib/i18n.ts"
import { customTitlebar } from "../lib/bridge.ts"

// Windows draws no native title bar (see src-tauri/src/lib.rs); these are its caption buttons,
// drawn with the system's own glyph font so they look native and follow the app theme.
const GLYPH = { minimize: "", maximize: "", restore: "", close: "" }

export function WindowControls() {
  const { t } = useT()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!customTitlebar) return
    let stop: (() => void) | undefined, live = true
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow(), sync = async () => { if (live) setMaximized(await appWindow.isMaximized()) }
      await sync()
      const unlisten = await appWindow.onResized(() => { void sync() })
      if (live) stop = unlisten; else unlisten()
    })
    // Like native caption buttons, the glyphs dim while the window is in the background.
    const root = document.documentElement, focus = () => root.classList.remove("window-inactive"), blur = () => root.classList.add("window-inactive")
    window.addEventListener("focus", focus); window.addEventListener("blur", blur)
    return () => { live = false; stop?.(); window.removeEventListener("focus", focus); window.removeEventListener("blur", blur) }
  }, [])

  if (!customTitlebar) return null
  const act = (action: "minimize" | "toggleMaximize" | "close") => () => { void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow()[action]()) }
  const size = maximized ? "restore" : "maximize"
  return (
    <div className="window-controls">
      <button type="button" tabIndex={-1} onClick={act("minimize")} aria-label={t("window.minimize")} title={t("window.minimize")}>{GLYPH.minimize}</button>
      <button type="button" tabIndex={-1} onClick={act("toggleMaximize")} aria-label={t(`window.${size}`)} title={t(`window.${size}`)}>{GLYPH[size]}</button>
      <button type="button" tabIndex={-1} className="close" onClick={act("close")} aria-label={t("common.close")} title={t("common.close")}>{GLYPH.close}</button>
    </div>
  )
}
