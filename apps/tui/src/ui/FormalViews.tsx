import { For, Show } from "solid-js"
import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { FormalizationSession, FormalStatement, FidelityReview } from "@mathos/domain"
import { theme } from "../theme.ts"

export function FormalizingView() {
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>◆ Preparing formalization...</text>
      <box height={1} />
      <text fg={theme.textMuted}>statement only — no proof search</text>
      <box height={1} />
      <text fg={theme.textMuted}>Esc cancel</text>
    </box>
  )
}

export function FormalizationDraftView(props: {
  session: FormalizationSession
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
}) {
  const actions = ["approve", "reject", "cancel"] as const
  const [index, setIndex] = createSignal(0)
  const verdict = () => props.session.fidelity?.verdict ?? "—"

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.stopPropagation()
      props.onCancel()
      return
    }
    if (key.name === "tab" || key.name === "left" || key.name === "right") {
      key.stopPropagation()
      const delta = key.name === "left" || key.shift ? -1 : 1
      setIndex((value) => (value + delta + actions.length) % actions.length)
      return
    }
    if (key.name === "return") {
      key.stopPropagation()
      const action = actions[index()]
      if (action === "approve") props.onApprove()
      else if (action === "reject") props.onReject()
      else props.onCancel()
    }
  })

  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>FORMALIZATION DRAFT</text>
      <box height={1} />
      <text fg={theme.textMuted}>DECLARATION</text>
      <text fg={theme.text}>{props.session.formalStatement.declarationName}</text>
      <box height={1} />
      <text fg={theme.textMuted}>FORMAL</text>
      <text fg={theme.text}>{props.session.formalStatement.sourceText}</text>
      <box height={1} />
      <text fg={theme.textMuted}>LEAN</text>
      <text fg={theme.success}>✓ ELABORATES</text>
      <box height={1} />
      <text fg={theme.textMuted}>STATEMENT FIDELITY</text>
      <text fg={verdict() === "MATCH" ? theme.success : theme.warning}>
        {verdict() === "MATCH" ? "✓ MATCH" : `⚠ ${verdict()}`}
      </text>
      <Show when={props.session.fidelity}>
        <For each={props.session.fidelity!.findings}>
          {(item) => <text fg={theme.warning}>{`- ${item.message}`}</text>}
        </For>
        <box height={1} />
        <text fg={theme.textMuted}>BACK-TRANSLATION</text>
        <text fg={theme.text}>{props.session.fidelity!.formalBackTranslation || "—"}</text>
      </Show>
      <box height={1} />
      <text fg={theme.textMuted}>PROOF</text>
      <text fg={theme.textMuted}>— NOT ATTEMPTED</text>
      <box height={1} />
      <text fg={theme.textMuted}>
        {`${index() === 0 ? "› Approve" : "  Approve"}   ${index() === 1 ? "› Reject" : "  Reject"}   ${index() === 2 ? "› Cancel" : "  Cancel"}`}
      </text>
    </box>
  )
}

export function FormalView(props: {
  claimId: string
  statement: FormalStatement
  fidelity: FidelityReview | null
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
      <text fg={theme.accent}>{props.claimId}</text>
      <box height={1} />
      <text fg={theme.textMuted}>FORMAL STATEMENT</text>
      <text fg={theme.text}>{props.statement.id}</text>
      <box height={1} />
      <text fg={theme.textMuted}>LANGUAGE</text>
      <text fg={theme.text}>Lean 4</text>
      <box height={1} />
      <text fg={theme.textMuted}>LEAN STATUS</text>
      <text fg={theme.success}>{props.statement.verificationStatus}</text>
      <box height={1} />
      <text fg={theme.textMuted}>FIDELITY</text>
      <text fg={props.statement.fidelityStatus === "HUMAN_APPROVED" ? theme.success : theme.warning}>
        {props.statement.fidelityStatus}
      </text>
      <box height={1} />
      <text fg={theme.textMuted}>DECLARATION</text>
      <text fg={theme.text}>{props.statement.declarationName}</text>
      <box height={1} />
      <text fg={theme.textMuted}>SOURCE</text>
      <text fg={theme.text}>{props.statement.sourceText}</text>
      <Show when={props.fidelity}>
        <box height={1} />
        <text fg={theme.textMuted}>BACK-TRANSLATION</text>
        <text fg={theme.text}>{props.fidelity!.formalBackTranslation || "—"}</text>
      </Show>
      <box height={1} />
      <text fg={theme.textMuted}>PROOF</text>
      <text fg={theme.textMuted}>— NOT ATTEMPTED</text>
    </box>
  )
}
