import type { StatusProjection } from "@mathos/domain"
import { statusColor, theme } from "../theme.ts"

export function ResearchSummary(props: { status: StatusProjection; home?: string }) {
  const objective = () => props.status.mainObjective
  const color = () => (objective() ? statusColor(objective()!.status) : theme.textMuted)

  if (props.home) {
    return (
      <box flexDirection="column" padding={1} flexGrow={1}>
        <text fg={theme.text}>{props.home}</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" padding={1} flexGrow={1}>
      <text fg={theme.textMuted}>MAIN OBJECTIVE</text>
      <box height={1} />
      <text fg={theme.text}>{objective()?.id ?? "—"}</text>
      <text fg={theme.text}>{objective()?.title ?? "No main claim yet. Use /claim then /objective."}</text>
      <text fg={color()}>{objective()?.status ?? "OPEN"}</text>

      <box height={1} />
      <text fg={theme.textMuted}>RESEARCH STATE</text>
      <Metric label="Claims" value={props.status.research.totalClaims} color={theme.text} />
      <Metric label="Verified claims" value={props.status.research.verified} color={theme.status.verified} />
      <Metric label="Informal claims" value={props.status.research.informal} color={theme.status.informal} />
      <Metric label="Conjectures" value={props.status.research.conjectures} color={theme.status.conjecture} />
      <Metric label="Critical blockers" value={props.status.research.blocked} color={theme.status.blocked} />
    </box>
  )
}

function Metric(props: { label: string; value: number; color: string }) {
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.text}>{props.label}</text>
      <text fg={props.color}>{String(props.value)}</text>
    </box>
  )
}
