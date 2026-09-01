import { useKeyboard } from "@opentui/solid"
import { theme } from "../theme.ts"

export function TextPanel(props: { title?: string; text: string; hint?: string; onBack?: () => void }) {
  useKeyboard((key) => {
    if ((key.name === "escape" || key.name === "return") && props.onBack) {
      key.stopPropagation()
      props.onBack()
    }
  })
  return (
    <box flexGrow={1} padding={1} flexDirection="column" backgroundColor={theme.surface}>
      {props.title ? <text fg={theme.accent}>{props.title}</text> : null}
      <text fg={theme.text}>{props.text}</text>
      <text fg={theme.textMuted}>{props.hint ?? "Esc back"}</text>
    </box>
  )
}
