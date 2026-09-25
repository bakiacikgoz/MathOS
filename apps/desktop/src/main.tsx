import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { customTitlebar, isTauri, nativeTitlebar, showWindow } from "./lib/bridge.ts"
import "./styles.css"

if (isTauri) document.documentElement.classList.add("tauri")
if (customTitlebar) document.documentElement.classList.add("custom-titlebar")
if (nativeTitlebar) document.documentElement.classList.add("native-titlebar")
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)
// The native window starts hidden; reveal it once the themed first frame is ready.
requestAnimationFrame(() => requestAnimationFrame(() => { void showWindow() }))
