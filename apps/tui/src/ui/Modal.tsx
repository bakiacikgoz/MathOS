import { Show } from "solid-js"
import { theme } from "../theme.ts"

export function Modal(props: {
  open: boolean
  title: string
  children: unknown
  onClose?: () => void
}) {
  return (
    <Show when={props.open}>
      <box
        position="absolute"
        left={6}
        top={4}
        width="80%"
        backgroundColor={theme.surface}
        border
        borderColor={theme.border}
        padding={1}
        flexDirection="column"
        zIndex={15}
      >
        <text fg={theme.accent}>{props.title}</text>
        {props.children}
      </box>
    </Show>
  )
}
