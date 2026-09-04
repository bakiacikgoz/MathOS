import { For, Show, createEffect, createSignal, onMount } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { theme } from "../theme.ts"
import { suggestCommands } from "../slash.ts"

export function PromptInput(props: {
  onSubmit: (value: string) => void
  history: string[]
  inactive?: boolean
}) {
  let editor: InputRenderable | undefined
  const [draft, setDraft] = createSignal("")
  const [historyIndex, setHistoryIndex] = createSignal<number | null>(null)
  const [selected, setSelected] = createSignal(0)

  const completions = () => visibleCommandSuggestions(draft())

  onMount(() => {
    if (!props.inactive) editor?.focus()
  })

  createEffect(() => {
    if (props.inactive) editor?.blur()
    else editor?.focus()
  })

  function clearEditor() {
    if (!editor) return
    editor.selectAll()
    editor.deleteSelection()
    setDraft("")
    setHistoryIndex(null)
    setSelected(0)
  }

  function applyText(text: string) {
    if (!editor) return
    editor.selectAll()
    editor.deleteSelection()
    if (text) editor.insertText(text)
    setDraft(text)
  }

  return (
    <box flexDirection="column" backgroundColor={theme.surface} border borderColor={props.inactive ? theme.border : theme.accent} paddingLeft={1} paddingRight={1}>
      <Show when={!props.inactive && completions().length > 0}>
        <box flexDirection="column" border borderColor={theme.border} backgroundColor={theme.surfaceMuted} paddingLeft={1} paddingRight={1}>
          <For each={completions()}>
            {(command, i) => (
              <text fg={i() === selected() ? theme.accent : theme.textMuted}>
                {`${i() === selected() ? "›" : " "} /${command.name.padEnd(10)} ${command.description}`}
              </text>
            )}
          </For>
        </box>
      </Show>
      <box height={3} flexDirection="row" alignItems="center">
        <text fg={theme.text}>MathOS&gt; </text>
      <input
        ref={(node: InputRenderable) => {
          editor = node
        }}
        flexGrow={1}
        placeholder="Type a command or ask MathOS..."
        placeholderColor={theme.textMuted}
        textColor={theme.text}
        backgroundColor={theme.surface}
        focusedBackgroundColor={theme.surface}
        cursorColor={theme.accent}
        focusedTextColor={theme.text}
        onInput={(value: string) => {
          setDraft(value)
          setSelected(0)
        }}
        onSubmit={() => {
          const value = (editor?.plainText ?? "").trim()
          if (!value) return
          props.onSubmit(value)
          clearEditor()
        }}
        onKeyDown={(event: { name: string; preventDefault: () => void }) => {
          if (props.inactive) {
            event.preventDefault()
            return
          }
          const items = completions()
          if (draft().startsWith("/") && !draft().includes(" ") && items.length > 0) {
            if (event.name === "up") {
              event.preventDefault()
              setSelected((value) => Math.max(0, value - 1))
              return
            }
            if (event.name === "down") {
              event.preventDefault()
              setSelected((value) => Math.min(items.length - 1, value + 1))
              return
            }
            if (event.name === "tab") {
              event.preventDefault()
              const item = items[selected()]
              if (item) applyText(`/${item.name}`)
              return
            }
          }
          if (event.name === "up" && props.history.length > 0 && !draft().includes("\n")) {
            event.preventDefault()
            const current = historyIndex()
            const next = current === null ? props.history.length - 1 : Math.max(0, current - 1)
            applyText(props.history[next] ?? "")
            setHistoryIndex(next)
          }
          if (event.name === "down" && historyIndex() !== null && !draft().includes("\n")) {
            event.preventDefault()
            const current = historyIndex() ?? props.history.length
            const next = current + 1
            if (next >= props.history.length) {
              applyText("")
              setHistoryIndex(null)
            } else {
              applyText(props.history[next] ?? "")
              setHistoryIndex(next)
            }
          }
        }}
      />
      </box>
    </box>
  )
}

export function visibleCommandSuggestions(value: string) {
  if (!value.startsWith("/") || value.includes(" ")) return []
  return suggestCommands(value).slice(0, 6)
}
