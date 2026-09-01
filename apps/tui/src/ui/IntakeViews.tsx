import { For, Show } from "solid-js"
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ResearchDraft } from "@mathos/domain"
import { theme } from "../theme.ts"

export function AnalyzingView() {
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>◆ Analyzing mathematical statement</text>
      <box height={1} />
      <text fg={theme.textMuted}>extracting objects and assumptions...</text>
      <box height={1} />
      <text fg={theme.textMuted}>Esc cancel</text>
    </box>
  )
}

export function ResearchDraftView(props: {
  draft: ResearchDraft
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const actions = ["confirm", "edit", "cancel"] as const
  const [index, setIndex] = createSignal(0)

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onCancel()
      return
    }
    if (key.name === "tab") {
      key.stopPropagation()
      const delta = key.shift ? -1 : 1
      setIndex((value) => (value + delta + actions.length) % actions.length)
      return
    }
    if (key.name === "left" || key.name === "right") {
      key.stopPropagation()
      const delta = key.name === "left" ? -1 : 1
      setIndex((value) => (value + delta + actions.length) % actions.length)
      return
    }
    if (key.name === "return") {
      key.stopPropagation()
      const action = actions[index()]
      if (action === "confirm") props.onConfirm()
      else if (action === "edit") props.onEdit()
      else props.onCancel()
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>RESEARCH DRAFT</text>
      <box height={1} />
      <text fg={theme.textMuted}>TYPE</text>
      <text fg={theme.text}>{props.draft.kind}</text>
      <box height={1} />
      <text fg={theme.textMuted}>TITLE</text>
      <text fg={theme.text}>{props.draft.title}</text>
      <box height={1} />
      <text fg={theme.textMuted}>STATEMENT</text>
      <text fg={theme.text}>{props.draft.normalizedStatement}</text>
      <box height={1} />
      <text fg={theme.textMuted}>OBJECTS</text>
      <Show when={props.draft.objects.length === 0}>
        <text fg={theme.textMuted}>None extracted</text>
      </Show>
      <For each={props.draft.objects}>
        {(item) => <text fg={theme.text}>{`${item.name.padEnd(8)} ${item.description}`}</text>}
      </For>
      <box height={1} />
      <text fg={theme.textMuted}>ASSUMPTIONS</text>
      <Show when={props.draft.assumptions.length === 0}>
        <text fg={theme.textMuted}>None extracted</text>
      </Show>
      <For each={props.draft.assumptions}>
        {(item) => <text fg={theme.text}>{`${item.id}  ${item.text}`}</text>}
      </For>
      <box height={1} />
      <text fg={theme.textMuted}>GOAL</text>
      <text fg={theme.text}>{props.draft.goal ?? "—"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>AMBIGUITIES</text>
      <Show when={props.draft.ambiguities.length === 0}>
        <text fg={theme.textMuted}>None flagged</text>
      </Show>
      <For each={props.draft.ambiguities}>
        {(item) => <text fg={theme.warning}>{`${item.id}  ${item.question}`}</text>}
      </For>
      <box height={1} />
      <text fg={theme.textMuted}>
        {`${index() === 0 ? "› Confirm" : "  Confirm"}   ${index() === 1 ? "› Edit" : "  Edit"}   ${index() === 2 ? "› Cancel" : "  Cancel"}`}
      </text>
    </box>
  )
}

export function ObjectiveConfirm(props: {
  claimId: string
  onYes: () => void
  onNo: () => void
}) {
  const [yes, setYes] = createSignal(true)

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onNo()
      return
    }
    if (key.name === "left" || key.name === "right" || key.name === "tab") {
      key.stopPropagation()
      setYes((value) => !value)
      return
    }
    if (key.name === "return") {
      key.stopPropagation()
      if (yes()) props.onYes()
      else props.onNo()
    }
    if (key.name === "y") {
      key.stopPropagation()
      props.onYes()
    }
    if (key.name === "n") {
      key.stopPropagation()
      props.onNo()
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>Set {props.claimId} as main objective?</text>
      <box height={1} />
      <text fg={theme.text}>{yes() ? "› Yes    No" : "  Yes   › No"}</text>
    </box>
  )
}
