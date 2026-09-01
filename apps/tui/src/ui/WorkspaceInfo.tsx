import type { StatusProjection } from "@mathos/domain"
import { theme } from "../theme.ts"

export function WorkspaceInfo(props: { status: StatusProjection }) {
  return (
    <box flexDirection="column" padding={1} flexGrow={1}>
      <text fg={theme.textMuted}>WORKSPACE</text>
      <text fg={theme.textMuted}>branch</text>
      <text fg={theme.text}>{props.status.branch?.name ?? "—"}</text>
      <text fg={theme.textMuted}>integrity</text>
      <text fg={theme.success}>{props.status.integrity.initialized ? "initialized" : "missing"}</text>
      <text fg={theme.textMuted}>storage</text>
      <text fg={props.status.integrity.database === "connected" ? theme.success : theme.danger}>
        {props.status.integrity.database}
      </text>
      <text fg={theme.textMuted}>events</text>
      <text fg={props.status.integrity.eventLog === "ok" ? theme.success : theme.danger}>
        {props.status.integrity.eventLog}
      </text>
    </box>
  )
}
