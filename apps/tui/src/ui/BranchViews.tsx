import { For } from "solid-js"
import { branchGlyph, type BranchDetail, type MergePreview, type ResearchBranch } from "@mathos/domain"
import { theme } from "../theme.ts"

export function BranchList(props: { branches: ResearchBranch[]; onOpen: (id: string) => void; onCancel: () => void }) {
  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.surface} border borderColor={theme.border}>
      <text fg={theme.accent}>Switch Research Branch</text>
      <For each={props.branches}>
        {(branch) => (
          <text fg={branch.isCurrent ? theme.accent : theme.text} onMouseDown={() => props.onOpen(branch.id)}>
            {`${branchGlyph(branch.status, branch.isCurrent)} ${branch.id}  ${branch.name}`}
          </text>
        )}
      </For>
    </box>
  )
}

export function BranchDetailView(props: { detail: BranchDetail }) {
  const branch = () => props.detail.branch
  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.surface} border borderColor={theme.border}>
      <text fg={theme.accent}>{`BRANCH ${branch().id}`}</text>
      <text fg={theme.text}>{branch().name}</text>
      <text fg={theme.textMuted}>{`Parent ${props.detail.parent?.name ?? "—"}`}</text>
      <text fg={theme.textMuted}>{branch().purpose ?? ""}</text>
      <text fg={theme.text}>{`Local claims     ${props.detail.localClaims}`}</text>
      <text fg={theme.text}>{`Inherited claims ${props.detail.inheritedClaims}`}</text>
      <text fg={theme.text}>{`Proof attempts   ${props.detail.proofAttempts}`}</text>
      <text fg={theme.text}>{`Blockers         ${props.detail.blockers}`}</text>
    </box>
  )
}

export function MergePreviewView(props: { preview: MergePreview; onApply?: () => void }) {
  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.surface} border borderColor={theme.border}>
      <text fg={theme.accent}>{`MERGE ${props.preview.sourceId} → ${props.preview.targetId}`}</text>
      <text fg={theme.text}>{`✓ ${props.preview.additiveClaims} additive claims`}</text>
      <text fg={theme.text}>{`✓ ${props.preview.verifiedProofs} verified proof`}</text>
      <text fg={props.preview.conflicts ? theme.danger : theme.text}>{`${props.preview.conflicts ? "⚠️" : "✓"} ${props.preview.conflicts} formal conflict`}</text>
      <text fg={props.preview.conflicts ? theme.textMuted : theme.accent}>
        {props.preview.conflicts ? "Apply disabled (conflicts)" : "Apply safe merge?  /branch merge <id> apply"}
      </text>
    </box>
  )
}
