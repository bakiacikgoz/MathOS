import type { StatusProjection } from "@mathos/domain"
import { theme } from "../theme.ts"

export function WorkspaceInfo(props: { status: StatusProjection }) {
  return (
    <box height={11} flexShrink={0} flexDirection="column" padding={1}>
      <text fg={theme.blue}>WORKSPACE</text>
      <Row label="branch" value={props.status.branch?.name ?? "—"} />
      <Row label="integrity" value={props.status.integrity.initialized ? "ok" : "missing"} color={props.status.integrity.initialized ? theme.success : theme.danger} />
      <Row label="storage" value={props.status.integrity.database} color={props.status.integrity.database === "connected" ? theme.success : theme.danger} />
      <Row label="events" value={props.status.integrity.eventLog} color={props.status.integrity.eventLog === "ok" ? theme.success : theme.danger} />
      <Row label="open blockers" value={String(props.status.research.blocked)} color={props.status.research.blocked ? theme.danger : theme.success} />
    </box>
  )
}

function Row(props: { label: string; value: string; color?: string }) {
  return <box flexDirection="row" justifyContent="space-between"><text fg={theme.textMuted}>{props.label}</text><text fg={props.color ?? theme.text}>{props.value}</text></box>
}
