import { For, Show } from "solid-js"
import { CLAIM_KINDS, type ClaimKind } from "@mathos/domain"
import type { TextareaRenderable } from "@opentui/core"
import { createSignal, onMount } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { theme } from "../theme.ts"

type Field = "type" | "title" | "statement" | "submit"

export function ClaimForm(props: {
  initialKind?: ClaimKind
  initialTitle?: string
  initialStatement?: string
  onSubmit: (draft: { kind: ClaimKind; title: string; statement: string }) => void
  onCancel: () => void
}) {
  const kinds = [...CLAIM_KINDS]
  const [kindIndex, setKindIndex] = createSignal(
    Math.max(0, kinds.indexOf(props.initialKind ?? "conjecture")),
  )
  const [title, setTitle] = createSignal(props.initialTitle ?? "")
  const [statement, setStatement] = createSignal(props.initialStatement ?? "")
  const [field, setField] = createSignal<Field>(props.initialTitle ? "statement" : props.initialKind ? "title" : "type")
  const [error, setError] = createSignal<string | null>(null)
  let titleEditor: TextareaRenderable | undefined
  let statementEditor: TextareaRenderable | undefined

  const kind = () => kinds[kindIndex()] ?? "conjecture"

  onMount(() => {
    focusField(field())
  })

  function focusField(next: Field) {
    setField(next)
    if (next === "title") titleEditor?.focus()
    else if (next === "statement") statementEditor?.focus()
    else {
      titleEditor?.blur()
      statementEditor?.blur()
    }
  }

  function submit() {
    const nextTitle = (titleEditor?.plainText ?? title()).trim()
    const nextStatement = (statementEditor?.plainText ?? statement()).trim()
    if (!nextTitle) {
      setError("Title is required.")
      focusField("title")
      return
    }
    if (!nextStatement) {
      setError("Statement is required.")
      focusField("statement")
      return
    }
    props.onSubmit({ kind: kind(), title: nextTitle, statement: nextStatement })
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onCancel()
      return
    }
    if (key.name === "tab") {
      key.stopPropagation()
      const order: Field[] = ["type", "title", "statement", "submit"]
      const current = order.indexOf(field())
      const delta = key.shift ? -1 : 1
      const next = order[(current + delta + order.length) % order.length] ?? "type"
      focusField(next)
      return
    }
    if (field() === "type") {
      if (key.name === "left" || key.name === "up") {
        key.stopPropagation()
        setKindIndex((value) => (value + kinds.length - 1) % kinds.length)
      }
      if (key.name === "right" || key.name === "down") {
        key.stopPropagation()
        setKindIndex((value) => (value + 1) % kinds.length)
      }
      if (key.name === "return") {
        key.stopPropagation()
        focusField("title")
      }
    }
    if (field() === "submit" && key.name === "return") {
      key.stopPropagation()
      submit()
    }
    if (key.name === "return" && key.ctrl) {
      key.stopPropagation()
      submit()
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column" backgroundColor={theme.background}>
      <text fg={theme.accent}>Create claim</text>
      <box height={1} />
      <text fg={theme.textMuted}>TYPE</text>
      <box flexDirection="row" gap={1}>
        <For each={kinds}>
          {(item, index) => (
            <text fg={index() === kindIndex() && field() === "type" ? theme.accent : index() === kindIndex() ? theme.text : theme.textMuted}>
              {index() === kindIndex() ? `› ${item}` : `  ${item}`}
            </text>
          )}
        </For>
      </box>
      <box height={1} />
      <text fg={theme.textMuted}>TITLE</text>
      <box border borderColor={field() === "title" ? theme.accent : theme.border} backgroundColor={theme.surface}>
        <textarea
          ref={(node: TextareaRenderable) => {
            titleEditor = node
          }}
          height={1}
          initialValue={props.initialTitle ?? ""}
          placeholder="Short claim title"
          placeholderColor={theme.textMuted}
          textColor={theme.text}
          backgroundColor={theme.surface}
          focusedBackgroundColor={theme.surface}
          cursorColor={theme.accent}
          keyBindings={[{ name: "return", action: "submit" }]}
          onContentChange={() => setTitle(titleEditor?.plainText ?? "")}
          onSubmit={() => focusField("statement")}
        />
      </box>
      <box height={1} />
      <text fg={theme.textMuted}>STATEMENT</text>
      <box border borderColor={field() === "statement" ? theme.accent : theme.border} backgroundColor={theme.surface} flexGrow={1}>
        <textarea
          ref={(node: TextareaRenderable) => {
            statementEditor = node
          }}
          flexGrow={1}
          placeholder="For every finite set A ..."
          initialValue={props.initialStatement ?? ""}
          placeholderColor={theme.textMuted}
          textColor={theme.text}
          backgroundColor={theme.surface}
          focusedBackgroundColor={theme.surface}
          cursorColor={theme.accent}
          wrapMode="word"
          keyBindings={[
            { name: "return", action: "newline" },
            { name: "return", ctrl: true, action: "submit" },
          ]}
          onContentChange={() => setStatement(statementEditor?.plainText ?? "")}
          onSubmit={() => submit()}
        />
      </box>
      <Show when={error()}>
        <text fg={theme.danger}>{error()}</text>
      </Show>
      <text fg={field() === "submit" ? theme.accent : theme.textMuted}>
        {field() === "submit" ? "› Create" : "  Create"}   Tab next   Ctrl+Enter save   Esc cancel
      </text>
    </box>
  )
}
