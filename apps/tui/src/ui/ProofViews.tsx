import { For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ProofAttempt, ProofSession, VerificationReport } from "@mathos/domain"
import { theme } from "../theme.ts"

export function ProvingView(props: { attempt?: number }) {
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>◆ PROOF ATTEMPT</text>
      <box height={1} />
      <text fg={theme.text}>{`Attempt ${props.attempt ?? 1}/3`}</text>
      <box height={1} />
      <text fg={theme.textMuted}>Esc cancel</text>
    </box>
  )
}

export function ProofResultView(props: {
  session: ProofSession
  onBack: () => void
}) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "return") {
      key.stopPropagation()
      props.onBack()
    }
  })
  const accepted = () => Boolean(props.session.accepted)
  const verified = () => props.session.verification?.passed === true
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>{accepted() ? "PROOF ATTEMPT" : "PROOF ATTEMPT FAILED"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>LEAN</text>
      <text fg={accepted() ? theme.success : theme.danger}>{accepted() ? "✓ KERNEL ACCEPTED" : "✗ FAILED"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>FIDELITY</text>
      <text fg={theme.text}>{props.session.formalStatement.fidelityStatus}</text>
      <box height={1} />
      <text fg={theme.textMuted}>AXIOM AUDIT</text>
      <text fg={theme.text}>{(props.session.verification?.axioms ?? []).join(", ") || "—"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>VERIFICATION GATE</text>
      <text fg={verified() ? theme.success : theme.warning}>{verified() ? "✓ PASS" : "— NOT PROMOTED"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>CLAIM</text>
      <text fg={verified() ? theme.success : theme.text}>{props.session.verification?.claimStatus ?? "unchanged"}</text>
      <Show when={!accepted()}>
        <box height={1} />
        <text fg={theme.textMuted}>3 attempts exhausted. Claim is not KERNEL_VERIFIED.</text>
      </Show>
    </box>
  )
}

export function ProofView(props: {
  claimId: string
  formalId: string
  attempts: ProofAttempt[]
  verification: VerificationReport | null
  fidelity: string
  leanVersion: string | null
  onBack: () => void
}) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "return") {
      key.stopPropagation()
      props.onBack()
    }
  })
  const accepted = () => props.attempts.find((item) => item.status === "KERNEL_ACCEPTED")
  return (
    <box flexGrow={1} padding={1} flexDirection="column">
      <text fg={theme.accent}>{props.claimId}</text>
      <box height={1} />
      <text fg={theme.textMuted}>FORMAL</text>
      <text fg={theme.text}>{props.formalId}</text>
      <box height={1} />
      <text fg={theme.textMuted}>PROOF</text>
      <text fg={accepted() ? theme.success : theme.warning}>
        {accepted() ? `${accepted()!.id}  KERNEL ACCEPTED` : "— none"}
      </text>
      <box height={1} />
      <text fg={theme.textMuted}>VERIFICATION</text>
      <text fg={props.verification?.passed ? theme.success : theme.text}>
        {props.verification?.claimStatus ?? "—"}
      </text>
      <box height={1} />
      <text fg={theme.textMuted}>LEAN</text>
      <text fg={theme.text}>{props.leanVersion ?? "—"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>FIDELITY</text>
      <text fg={theme.text}>{props.fidelity}</text>
      <box height={1} />
      <text fg={theme.textMuted}>AXIOMS</text>
      <text fg={theme.text}>{(props.verification?.axioms ?? []).join(", ") || "—"}</text>
      <box height={1} />
      <text fg={theme.textMuted}>ATTEMPTS</text>
      <For each={props.attempts}>
        {(item) => <text fg={theme.textMuted}>{`${item.id} ${item.status}`}</text>}
      </For>
    </box>
  )
}
