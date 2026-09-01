import { For, Show } from "solid-js"
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { Claim } from "@mathos/domain"
import { statusColor, theme } from "../theme.ts"

export function ClaimsList(props: {
  claims: Claim[]
  selectedId?: string | null
  onOpen: (id: string) => void
  onCancel: () => void
}) {
  const [index, setIndex] = createSignal(
    Math.max(0, props.claims.findIndex((claim) => claim.id === props.selectedId)),
  )

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onCancel()
      return
    }
    if (props.claims.length === 0) return
    if (key.name === "up") {
      key.stopPropagation()
      setIndex((value) => Math.max(0, value - 1))
    }
    if (key.name === "down") {
      key.stopPropagation()
      setIndex((value) => Math.min(props.claims.length - 1, value + 1))
    }
    if (key.name === "return") {
      key.stopPropagation()
      const claim = props.claims[index()]
      if (claim) props.onOpen(claim.id)
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>CLAIMS</text>
      <box height={1} />
      <text fg={theme.textMuted}>{`${"ID".padEnd(8)} ${"TYPE".padEnd(12)} ${"STATUS".padEnd(22)} TITLE`}</text>
      <text fg={theme.border}>{"─".repeat(64)}</text>
      <Show when={props.claims.length === 0}>
        <text fg={theme.textMuted}>No claims yet. Use /claim to create one.</text>
      </Show>
      <For each={props.claims}>
        {(claim, i) => (
          <text fg={i() === index() ? theme.accent : statusColor(claim.status)}>
            {`${i() === index() ? "›" : " "} ${claim.id.padEnd(7)} ${claim.kind.padEnd(12)} ${claim.status.padEnd(22)} ${claim.title}`}
          </text>
        )}
      </For>
      <box height={1} />
      <text fg={theme.textMuted}>↑↓ move   Enter open   Esc back</text>
    </box>
  )
}

export function ClaimDetailView(props: {
  id: string
  kind: string
  title: string
  status: string
  statement: string
  evidence: string
  dependencies: string
  branchName: string
  createdAt: string
  trustExplanation: string
  onBack: () => void
}) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "return") {
      key.stopPropagation()
      props.onBack()
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>{props.id}</text>
      <text fg={theme.text}>{props.title}</text>
      <box height={1} />
      <text fg={theme.textMuted}>TYPE</text>
      <text fg={theme.text}>{props.kind}</text>
      <box height={1} />
      <text fg={theme.textMuted}>STATUS</text>
      <text fg={statusColor(props.status)}>{props.status}</text>
      <box height={1} />
      <text fg={theme.textMuted}>STATEMENT</text>
      <text fg={theme.text}>{props.statement}</text>
      <box height={1} />
      <text fg={theme.textMuted}>EVIDENCE</text>
      <text fg={theme.textMuted}>{props.evidence}</text>
      <box height={1} />
      <text fg={theme.textMuted}>DEPENDENCIES</text>
      <text fg={theme.textMuted}>{props.dependencies}</text>
      <box height={1} />
      <text fg={theme.textMuted}>{props.status === "KERNEL_VERIFIED" ? "WHY VERIFIED" : "WHY NOT VERIFIED"}</text>
      <text fg={theme.text}>{props.trustExplanation}</text>
      <box height={1} />
      <text fg={theme.textMuted}>BRANCH</text>
      <text fg={theme.text}>{props.branchName}</text>
      <box height={1} />
      <text fg={theme.textMuted}>CREATED</text>
      <text fg={theme.textMuted}>{props.createdAt}</text>
      <box height={1} />
      <text fg={theme.textMuted}>Esc back</text>
    </box>
  )
}

export function ObjectivePicker(props: {
  claims: Claim[]
  currentId?: string | null
  onSelect: (id: string) => void
  onCancel: () => void
}) {
  const [index, setIndex] = createSignal(
    Math.max(0, props.claims.findIndex((claim) => claim.id === props.currentId)),
  )

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onCancel()
      return
    }
    if (props.claims.length === 0) return
    if (key.name === "up") {
      key.stopPropagation()
      setIndex((value) => Math.max(0, value - 1))
    }
    if (key.name === "down") {
      key.stopPropagation()
      setIndex((value) => Math.min(props.claims.length - 1, value + 1))
    }
    if (key.name === "return") {
      key.stopPropagation()
      const claim = props.claims[index()]
      if (claim) props.onSelect(claim.id)
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>SET MAIN OBJECTIVE</text>
      <box height={1} />
      <Show when={props.claims.length === 0}>
        <text fg={theme.textMuted}>Create a claim first with /claim.</text>
      </Show>
      <For each={props.claims}>
        {(claim, i) => (
          <text fg={i() === index() ? theme.accent : theme.text}>
            {`${i() === index() ? "›" : " "} ${claim.id.padEnd(7)} ${claim.title}`}
          </text>
        )}
      </For>
      <box height={1} />
      <text fg={theme.textMuted}>↑↓ move   Enter set   Esc cancel</text>
    </box>
  )
}
