import { For } from "solid-js"
import type { StatusProjection } from "@mathos/domain"
import { branchGlyph } from "@mathos/domain"
import { theme } from "../theme.ts"
import { WorkspaceInfo } from "./WorkspaceInfo.tsx"

export function Sidebar(props: { status: StatusProjection; visible: boolean; branches?: Array<{ id: string; name: string; status: string; isCurrent: boolean }> }) {
  if (!props.visible) return null
  return (
    <box width={28} backgroundColor={theme.surface} border borderColor={theme.border} flexDirection="column">
      <WorkspaceInfo status={props.status} />
      <box flexDirection="column" padding={1}>
        <text fg={theme.textMuted}>BRANCHES</text>
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
