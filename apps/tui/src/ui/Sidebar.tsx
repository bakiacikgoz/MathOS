import { For } from "solid-js"
import type { StatusProjection } from "@mathos/domain"
import { branchGlyph } from "@mathos/domain"
import { statusColor, theme } from "../theme.ts"
import { WorkspaceInfo } from "./WorkspaceInfo.tsx"

export function Sidebar(props: { status: StatusProjection; visible: boolean; branches?: Array<{ id: string; name: string; status: string; isCurrent: boolean }> }) {
  if (!props.visible) return null
  return (
    <box width={32} backgroundColor={theme.surface} border borderColor={theme.border} flexDirection="column">
      <WorkspaceInfo status={props.status} />
      <box flexDirection="column" padding={1}>
        <text fg={theme.border}>────────────────────────────</text>
        <text fg={theme.violet}>RESEARCH STATE</text>
        <text fg={theme.textMuted}>{`objective  ${props.status.mainObjective?.id ?? "—"}`}</text>
        <text fg={props.status.mainObjective ? statusColor(props.status.mainObjective.status) : theme.textMuted}>{`epistemic ${props.status.mainObjective?.status ?? "OPEN"}`}</text>
        <text fg={theme.textMuted}>{`claims     ${props.status.research.totalClaims}`}</text>
        <text fg={props.status.research.blocked ? theme.danger : theme.success}>{`blockers   ${props.status.research.blocked}`}</text>
      </box>
      <box flexDirection="column" padding={1}>
        <text fg={theme.border}>────────────────────────────</text>
        <text fg={theme.accent}>QUICK ACTIONS</text>
        <text fg={theme.textMuted}>1  Resume research</text>
        <text fg={theme.textMuted}>2  Analyze current goal</text>
        <text fg={theme.textMuted}>3  Show proof graph</text>
        <text fg={theme.textMuted}>4  List open blockers</text>
        <text fg={theme.textMuted}>5  Export capsule</text>
      </box>
      <box flexDirection="column" padding={1}>
        <text fg={theme.border}>────────────────────────────</text>
        <text fg={theme.blue}>BRANCH</text>
        <For each={props.branches ?? []}>
          {(branch) => (
            <text fg={branch.isCurrent ? theme.accent : theme.textMuted}>
              {`${branchGlyph(branch.status as "ACTIVE" | "PAUSED" | "MERGED" | "ABANDONED" | "ARCHIVED", branch.isCurrent)} ${branch.id === "B-000" ? "MAIN" : branch.name}`}
            </text>
          )}
        </For>
      </box>
    </box>
  )
}
