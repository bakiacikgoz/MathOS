import { createSignal, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { SLASH_COMMANDS, suggestCommands, type SlashCommand } from "../slash.ts"
import { theme } from "../theme.ts"

export function CommandPalette(props: {
  open: boolean
  onClose: () => void
  onSelect: (name: string) => void
}) {
  const [query, setQuery] = createSignal("")
  const [index, setIndex] = createSignal(0)

  const items = () => suggestCommands(query()).slice(0, 6)

  useKeyboard((key) => {
    if (!props.open) return
    if (key.name === "escape") {
      key.stopPropagation()
      props.onClose()
      return
    }
    if (key.name === "up") {
      key.stopPropagation()
      setIndex((value) => Math.max(0, value - 1))
      return
    }
    if (key.name === "down") {
      key.stopPropagation()
      setIndex((value) => Math.min(items().length - 1, value + 1))
      return
    }
    if (key.name === "return") {
      key.stopPropagation()
      const selected = items()[index()]
      if (selected) props.onSelect(selected.name)
      return
    }
    if (key.name === "backspace") {
      key.stopPropagation()
      setQuery((value) => value.slice(0, -1))
      setIndex(0)
      return
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      key.stopPropagation()
      setQuery((value) => value + key.sequence)
      setIndex(0)
    }
  })

  return (
    <Show when={props.open}>
      <box
        position="absolute"
        left={4}
        top={3}
        width="70%"
        maxWidth={64}
        backgroundColor={theme.surface}
        border
        borderColor={theme.accent}
        flexDirection="column"
        padding={1}
        zIndex={20}
      >
        <text fg={theme.textMuted}>Command palette</text>
        <text fg={theme.accent}>/{query()}</text>
        <For each={items()}>
          {(command: SlashCommand, i) => (
            <text fg={i() === index() ? theme.accent : theme.text}>
              {i() === index() ? "› " : "  "}
              {command.name.padEnd(10)} {command.description}
            </text>
          )}
        </For>
      </box>
    </Show>
  )
}
