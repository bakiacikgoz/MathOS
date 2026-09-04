import type { StatusProjection } from "@mathos/domain"
import { For, Show } from "solid-js"
import { statusColor, theme } from "../theme.ts"

const quickCommands = [
  ["/research <query>", "Search theorems and local mathlib"], ["/graph [claim|session]", "Show proof graph"], ["/align", "Formal/informal alignment"],
  ["/experiment <name>", "Start a new experiment"], ["/literature <query>", "Search literature and sources"], ["/providers", "List and configure providers"],
  ["/solver", "Solver/verification lab"], ["/help", "Show all commands"], ["/quit", "Leave the session"],
] as const

export function ResearchSummary(props: { status: StatusProjection; home?: string; compact?: boolean; formalText?: string | null }) {
  const objective = () => props.status.mainObjective
  const lines = () => (props.home ?? "").split("\n").map((line) => line.trim()).filter(Boolean)
  const meaningful = () => lines().find((line) => /SUCCEEDED|completed|verified/i.test(line)) ?? "No recorded progress"
  const recent = () => lines().filter((line) => !/^(MATHOS|Workspace|Objective|Epistemic|Research state|Open blockers|Last meaningful|Environment)/i.test(line)).slice(-5)
  const gates = () => `${props.status.research.verified}/${props.status.research.totalClaims} verified claims`
  return (
    <box flexDirection="column" padding={1} flexGrow={1}>
      <box height={4} flexShrink={0} flexDirection="row" justifyContent="space-between" border borderColor={theme.border} paddingLeft={1} paddingRight={1}>
        <box flexDirection="column"><text fg={theme.blue}>OBJECTIVE</text><text fg={theme.accent}>{`${objective()?.id ?? "—"}  ${objective()?.title ?? "No main claim yet"}`}</text></box>
        <text fg={statusColor(objective()?.status ?? "OPEN")}>{objective()?.status ?? "OPEN"}</text>
      </box>
      <box height={props.compact ? 10 : 7} flexShrink={0} flexDirection={props.compact ? "column" : "row"}>
        <box flexDirection="column" paddingLeft={1} paddingRight={1} flexGrow={1}>
          <text fg={theme.blue}>RESEARCH SUMMARY</text>
          <Metric label="Claims" value={String(props.status.research.totalClaims)} /><Metric label="Verified" value={String(props.status.research.verified)} color={theme.success} />
          <Metric label="Conjectures" value={String(props.status.research.conjectures)} color={theme.warning} /><Metric label="Open blockers" value={String(props.status.research.blocked)} color={props.status.research.blocked ? theme.danger : theme.success} />
          <Metric label="Verification gates" value={gates()} color={theme.success} />
        </box>
        <box flexDirection="column" paddingLeft={1} paddingRight={1} flexGrow={1}>
          <text fg={theme.blue}>SUMMARY</text><text fg={theme.text}>{objective()?.title ?? "Create an objective to begin research."}</text>
          <text fg={theme.blue}>LEAN STATEMENT</text><text fg={props.formalText ? theme.cyan : theme.textMuted}>{props.formalText ?? "Use /formal to inspect the current Lean statement."}</text>
        </box>
      </box>
      <box height={2} flexShrink={0} flexDirection="column" paddingLeft={1} paddingRight={1}><text fg={theme.violet}>LATEST MEANINGFUL PROGRESS</text><text fg={theme.success}>{meaningful()}</text></box>
      <box height={3} flexShrink={0} flexDirection="column" paddingLeft={1} paddingRight={1}>
        <text fg={theme.violet}>RECENT ACTIVITY</text><For each={(recent().length ? recent() : ["No recent activity"]).slice(0, 2)}>{(line) => <text fg={theme.textMuted}>{line}</text>}</For>
      </box>
      <Show when={!props.compact}>
        <box height={4} flexShrink={0} flexDirection="column" paddingLeft={1} paddingRight={1}>
          <text fg={theme.violet}>QUICK COMMANDS  (Ctrl+K to toggle)</text>
          <For each={[0, 1, 2]}>{(row) => <box flexDirection="row"><For each={quickCommands.slice(row * 3, row * 3 + 3)}>{(item) => <box width="33%"><text fg={theme.violet}>{item[0]}</text></box>}</For></box>}</For>
        </box>
      </Show>
    </box>
  )
}

function Metric(props: { label: string; value: string; color?: string }) {
  return <box flexDirection="row" justifyContent="space-between"><text fg={theme.textMuted}>{props.label}</text><text fg={props.color ?? theme.text}>{props.value}</text></box>
}
