import { For, Show } from "solid-js"
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { PremiseCandidate } from "@mathos/retrieval"
import { theme } from "../theme.ts"

export function PreparingContextView(props: {
  localCount?: number
  mathlibCount?: number
  topNames?: string[]
}) {
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>◆ PREPARING PROOF CONTEXT</text>
      <box height={1} />
      <text fg={theme.text}>{`Local lemmas        ${props.localCount ?? 0}`}</text>
      <text fg={theme.text}>{`Mathlib candidates  ${props.mathlibCount ?? 0}`}</text>
      <box height={1} />
      <text fg={theme.textMuted}>Top matches:</text>
      <For each={props.topNames ?? []}>{(name) => <text fg={theme.text}>{name}</text>}</For>
    </box>
  )
}

export function TheoremSearchView(props: {
  title: string
  candidates: PremiseCandidate[]
  onOpen: (name: string) => void
  onCancel: () => void
}) {
  const [index, setIndex] = createSignal(0)
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onCancel()
      return
    }
    if (key.name === "up" || key.name === "down") {
      key.stopPropagation()
      const delta = key.name === "up" ? -1 : 1
      setIndex((value) => (value + delta + props.candidates.length) % Math.max(props.candidates.length, 1))
      return
    }
    if (key.name === "return" && props.candidates[index()]) {
      key.stopPropagation()
      props.onOpen(props.candidates[index()]!.declaration.name)
    }
  })
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>{props.title}</text>
      <box height={1} />
      <Show when={props.candidates.length === 0}>
        <text fg={theme.textMuted}>No premises ranked.</text>
      </Show>
      <For each={props.candidates}>
        {(item, i) => (
          <text fg={i() === index() ? theme.accent : theme.text}>
            {`${i() + 1}. ${item.declaration.name}  ${item.declaration.origin}${item.declaration.module ? `  ${item.declaration.module}` : ""}`}
          </text>
        )}
      </For>
    </box>
  )
}

export function TheoremDetailView(props: { candidate: PremiseCandidate; onBack: () => void }) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "return") {
      key.stopPropagation()
      props.onBack()
    }
  })
  const decl = props.candidate.declaration
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>THEOREM</text>
      <box height={1} />
      <text fg={theme.textMuted}>NAME</text>
      <text fg={theme.text}>{decl.name}</text>
      <box height={1} />
      <text fg={theme.textMuted}>MODULE</text>
      <text fg={theme.text}>{decl.module ?? "—"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>ORIGIN</text>
      <text fg={theme.text}>{decl.origin}</text>
      <box height={1} />
      <text fg={theme.textMuted}>TYPE</text>
      <text fg={theme.text}>{decl.signature}</text>
    </box>
  )
}

export function IndexStatusView(props: { text: string; onBack: () => void }) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "return") {
      key.stopPropagation()
      props.onBack()
    }
  })
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>PREMISE INDEX</text>
      <box height={1} />
      <text fg={theme.text}>{props.text}</text>
    </box>
  )
}
