import type { ContextConflict, MathematicalContextItem } from "@mathos/domain"
import { For, Show } from "solid-js"
import { theme } from "../theme.ts"

export const moveContextSelection = (current: number, delta: number, length: number) => length ? Math.max(0, Math.min(length - 1, current + delta)) : 0
export const contextTrustLabel = (item: MathematicalContextItem) => item.status === "PROPOSED" ? "PROPOSAL — NOT ACTIVE" : item.status

export function ContextView(props: { items: MathematicalContextItem[]; conflicts: ContextConflict[]; selected?: number }) {
  return <box flexDirection="column" padding={1}>
    <text fg={theme.accent}>MATHEMATICAL CONTEXT</text>
    <text fg={theme.textMuted}>Scope precedence: workspace → branch → document → claim</text>
    <For each={props.items}>{(item, index) => <text fg={item.status === "PROPOSED" ? theme.warning : theme.text}>{index() === (props.selected ?? 0) ? "› " : "  "}{item.scopeKind} · {item.canonicalName} · {contextTrustLabel(item)}</text>}</For>
    <Show when={props.conflicts.length}><text fg={theme.danger}>CONFLICTS {props.conflicts.length}</text></Show>
    <text fg={theme.textMuted}>↑/↓ navigate · apply/reject requires explicit action</text>
  </box>
}
