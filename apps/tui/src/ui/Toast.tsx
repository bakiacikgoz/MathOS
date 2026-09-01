import { Show } from "solid-js"
import { theme } from "../theme.ts"

export function Toast(props: { message: string | null; kind?: "info" | "success" | "error" }) {
  const color = () => {
    if (props.kind === "error") return theme.danger
    if (props.kind === "success") return theme.success
    return theme.accent
  }

  return (
    <Show when={props.message}>
      <box backgroundColor={theme.surfaceMuted} paddingLeft={1} paddingRight={1}>
        <text fg={color()}>{props.message}</text>
      </box>
    </Show>
  )
}
