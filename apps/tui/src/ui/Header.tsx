import type { StatusProjection } from "@mathos/domain"
import { theme } from "../theme.ts"

export function Header(props: { status: StatusProjection; compact: boolean }) {
  const title = () => {
    const branch = props.status.branch
    const project = props.status.projectName
    return branch ? `MathOS / ${project} · ${branch.id} ${branch.slug ?? branch.name}` : `MathOS / ${project}`
  }
  const branch = () => props.status.branch ? `${props.status.branch.id} ${props.status.branch.name}` : "—"

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
      <text fg={theme.accent}>{title()}</text>
      <ShowBranch compact={props.compact} branch={branch()} />
    </box>
  )
}

function ShowBranch(props: { compact: boolean; branch: string }) {
  if (props.compact) return <text fg={theme.textMuted}>{props.branch}</text>
  return <text fg={theme.textMuted}>{props.branch}</text>
}
