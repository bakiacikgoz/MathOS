import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { isTauri, showWindow } from "./lib/bridge.ts"
import "./styles.css"

if (isTauri) document.documentElement.classList.add("tauri")
// Only macOS draws the app under a transparent title bar; Windows and Linux keep the native one.
if (isTauri && !/Mac/.test(navigator.platform)) document.documentElement.classList.add("native-titlebar")
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>)
// The native window starts hidden; reveal it once the themed first frame is ready.
requestAnimationFrame(() => requestAnimationFrame(() => { void showWindow() }))
