import type { StatusProjection } from "@mathos/domain"
import { theme } from "../theme.ts"

export function Header(props: { status: StatusProjection; compact: boolean }) {
  const title = () => {
    const branch = props.status.branch
    const project = props.status.projectName
    return branch ? `MathOS / ${project} · ${branch.id} ${branch.slug ?? branch.name}` : `MathOS / ${project}`
  }
  const health = () => props.status.integrity.initialized && props.status.integrity.database === "connected" && props.status.integrity.eventLog === "ok"

  return (
    <box
      height={3}
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={1}
      paddingRight={1}
      border
      borderColor={theme.border}
      backgroundColor={theme.surface}
    >
      <text fg={theme.text}>{title()}</text>
      <ShowBranch compact={props.compact} health={health()} project={props.status.projectName} storage={props.status.integrity.database} events={props.status.integrity.eventLog} />
    </box>
  )
}

function ShowBranch(props: { compact: boolean; health: boolean; project: string; storage: string; events: string }) {
  if (props.compact) return <text fg={props.health ? theme.success : theme.warning}>{props.health ? "HEALTH OK" : "CHECK STATUS"}</text>
  return <text fg={theme.textMuted}><span style={{ fg: props.health ? theme.success : theme.warning }}>{props.health ? "HEALTH OK" : "CHECK STATUS"}</span>{` · workspace `}<span style={{ fg: theme.accent }}>{props.project}</span>{` · storage `}<span style={{ fg: props.storage === "connected" ? theme.success : theme.danger }}>{props.storage}</span>{` · events `}<span style={{ fg: props.events === "ok" ? theme.success : theme.danger }}>{props.events}</span></text>
}
