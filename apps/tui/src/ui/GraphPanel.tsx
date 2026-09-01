import { For, Show } from "solid-js"
import type { ResearchGraph, ResearchGraphNode } from "@mathos/graph"
import { formatClaimDetail, formatGraphTree } from "@mathos/graph"
import { theme } from "../theme.ts"

export function GraphPanel(props: {
  graph: ResearchGraph
  focusId: string | null
  selectedId: string | null
  nodes: ResearchGraphNode[]
  detailOn: boolean
  filter: string
  query?: string
  searchOn?: boolean
}) {
  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.surface} border borderColor={theme.border}>
      <text fg={theme.accent}>{`PROOF GRAPH · ${props.focusId ?? "none"}`}</text>
      <text fg={theme.textMuted}>{`filter ${props.filter}   nodes ${props.nodes.length}${props.searchOn ? `   /${props.query ?? ""}` : ""}`}</text>
      <Show when={props.detailOn && props.selectedId} fallback={
        <box flexDirection="column">
          <text fg={theme.text}>{formatGraphTree(props.graph, props.focusId, 2)}</text>
          <box height={1} />
          <For each={props.nodes.slice(0, 16)}>
            {(node) => (
              <text fg={node.id === props.selectedId ? theme.accent : theme.text}>{`${node.id === props.selectedId ? ">" : " "} ${node.id} ${node.epistemicStatus ?? node.kind}`}</text>
            )}
          </For>
          <text fg={theme.textMuted}>↑↓ select   Enter inspect   / search   a/p/b/v/l filter   Esc back</text>
        </box>
      }>
        <text fg={theme.text}>{formatClaimDetail(props.graph, props.selectedId!)}</text>
        <text fg={theme.textMuted}>Esc back</text>
      </Show>
    </box>
  )
}
