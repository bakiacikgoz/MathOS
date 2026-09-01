import type { KeyEvent } from "@opentui/core"

export type AppCommand = "quit" | "palette" | "escape"

export interface KeyBinding {
  command: AppCommand
  match: (key: KeyEvent) => boolean
}

export const APP_KEYMAP: KeyBinding[] = [
  {
    command: "quit",
    match: (key) => key.name === "c" && key.ctrl,
  },
  {
    command: "palette",
    match: (key) => (key.name === "p" && key.ctrl) || (key.name === "p" && key.meta) || (key.name === "k" && key.ctrl),
  },
  {
    command: "escape",
    match: (key) => key.name === "escape",
  },
]

export function resolveCommand(key: KeyEvent): AppCommand | null {
  return APP_KEYMAP.find((binding) => binding.match(key))?.command ?? null
}
