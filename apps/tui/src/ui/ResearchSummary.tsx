import type { ResearchRun, ResearchStep, StatusProjection } from "@mathos/domain"
import { createSignal, For, Show } from "solid-js"
import { statusColor, theme } from "../theme.ts"

const quickCommands = [
  ["/research <query>", "Search theorems and local mathlib"], ["/graph [claim|session]", "Show proof graph"], ["/align", "Formal/informal alignment"],
  ["/experiment <name>", "Start a new experiment"], ["/literature <query>", "Search literature & sources"], ["/solver", "Solver/verification lab"],
  ["/providers", "List & configure providers"], ["/help", "Show all commands"], ["/quit", "Leave the session"],
] as const

export function ResearchSummary(props: { status: StatusProjection; home?: string; compact?: boolean; dashboardWidth?: number; naturalStatement?: string; formalText?: string | null; run?: ResearchRun | null; steps?: ResearchStep[] }) {
  const objective = () => props.status.mainObjective
  const lines = () => (props.home ?? "").split("\n").map((line) => line.trim()).filter(Boolean)
  const meaningful = () => props.steps?.slice().reverse().find((step) => step.status === "SUCCEEDED")?.summary ?? lines().find((line) => /SUCCEEDED|completed|verified/i.test(line)) ?? "No recorded progress"
  const activities = () => props.steps?.length ? props.steps.slice(-5).reverse() : lines().filter((line) => !/^(MATHOS|Workspace|Objective|Epistemic|Research state|Open blockers|Last meaningful|Environment|Primary)/i.test(line)).slice(-5).reverse()
  const [measuredWidth, setMeasuredWidth] = createSignal(props.dashboardWidth ?? 100)
  const commandGridWidth = () => Math.max(42, measuredWidth() - 6)
  const commandColumns = () => distributeColumns(commandGridWidth())
  return (
    <Show when={!props.compact} fallback={<CompactDashboard status={props.status} formalText={props.formalText} meaningful={meaningful()} dashboardWidth={props.dashboardWidth} />}>
    <box flexDirection="column" paddingLeft={1} paddingRight={1} flexGrow={1} gap={1} onSizeChange={function () { setMeasuredWidth(this.width) }}>
      <box height={5} flexShrink={0} flexDirection="row" alignItems="center" justifyContent="space-between" border borderColor={theme.border} paddingLeft={1} paddingRight={1}>
        <box flexDirection="column"><text fg={theme.blue}>OBJECTIVE</text><text fg={theme.accent}>{`${objective()?.id ?? "—"}  `}<span style={{ fg: theme.text }}>{objective()?.title ?? "No main claim yet"}</span></text></box>
        <text fg={statusColor(objective()?.status ?? "OPEN")}>{`[ ${objective()?.status ?? "OPEN"} ]`}</text>
      </box>

      <box height={10} flexShrink={0} flexDirection={props.compact ? "column" : "row"} gap={1}>
        <box width={props.compact ? "100%" : "44%"} flexDirection="column" border borderColor={theme.border}>
          <Title text="RESEARCH SUMMARY" color={theme.blue} />
          <Metric label="Session" value={props.run?.id ?? "—"} /><Metric label="State" value={props.run?.status ?? "IDLE"} color={props.run?.status === "PAUSED" ? theme.accent : theme.text} />
          <Metric label="Focus" value={objective()?.id ?? "—"} /><Metric label="Epistemic status" value={objective()?.status ?? "OPEN"} color={statusColor(objective()?.status ?? "OPEN")} />
          <Metric label="Last activity" value={props.steps?.at(-1)?.action ?? "none"} color={props.steps?.length ? theme.success : theme.textMuted} />
          <Metric label="Verified claims" value={`${props.status.research.verified}/${props.status.research.totalClaims}`} color={theme.success} />
        </box>
        <box flexGrow={1} flexDirection="column" border borderColor={theme.border}>
          <Title text="SUMMARY" color={theme.blue} />
          <text width={Math.min(75, Math.max(28, Math.floor((measuredWidth() - 7) * .56) - 2))} fg={theme.text}>{props.naturalStatement ?? objective()?.title ?? "Create an objective to begin research."}</text>
          <text fg={theme.textMuted}>{`Open blockers: ${props.status.research.blocked}`}</text>
          <text fg={theme.blue}>LEAN STATEMENT</text>
          <LeanStatement text={props.formalText} />
        </box>
      </box>

      <box height={4} flexShrink={0} flexDirection="column" border borderColor={theme.border}>
        <Title text="LATEST MEANINGFUL PROGRESS" color={theme.violet} /><text fg={theme.success}>{`✓  ${clock(props.steps?.at(-1)?.finishedAt)}  ${meaningful()}`}</text>
      </box>

      <box minHeight={4} flexGrow={1} flexDirection="column" border borderColor={theme.border}>
        <Title text="RECENT ACTIVITY" color={theme.violet} />
        <For each={activities().length ? activities() : ["No recent activity"]}>{(item) => typeof item === "string" ? <text fg={theme.textMuted}>{item}</text> : <Activity step={item} />}</For>
      </box>

        <box height={12} flexShrink={0} flexDirection="column" border borderColor={theme.border}>
          <Title text="QUICK COMMANDS  (Ctrl+K to toggle)" color={theme.violet} />
          <text fg={theme.border}>{gridRule(commandColumns())}</text>
          <For each={[0, 1, 2]}>{(row) => <><CommandRow items={quickCommands.slice(row * 3, row * 3 + 3)} columns={commandColumns()} /><Show when={row < 2}><text fg={theme.border}>{gridRule(commandColumns())}</text></Show></>}</For>
        </box>
    </box>
    </Show>
  )
}

function CompactDashboard(props: { status: StatusProjection; formalText?: string | null; meaningful: string; dashboardWidth?: number }) {
  const objective = () => props.status.mainObjective
  return <box flexDirection="column" paddingLeft={1} paddingRight={1} flexGrow={1}>
    <box height={4} flexShrink={0} flexDirection="column" border borderColor={theme.border} paddingLeft={1}><text fg={theme.blue}>OBJECTIVE</text><text fg={theme.accent}>{`${objective()?.id ?? "—"}  ${objective()?.title ?? "No main claim"}`}</text></box>
    <box height={6} flexShrink={0} flexDirection="column" border borderColor={theme.border}><Title text="RESEARCH SUMMARY" color={theme.blue} /><Metric label="Epistemic status" value={objective()?.status ?? "OPEN"} color={statusColor(objective()?.status ?? "OPEN")} /><Metric label="Verified claims" value={`${props.status.research.verified}/${props.status.research.totalClaims}`} color={theme.success} /><Metric label="Open blockers" value={String(props.status.research.blocked)} color={props.status.research.blocked ? theme.danger : theme.success} /></box>
    <box height={4} flexShrink={0} flexDirection="column" border borderColor={theme.border}><Title text="LATEST MEANINGFUL PROGRESS" color={theme.violet} /><text fg={theme.success}>{props.meaningful}</text></box>
    <box minHeight={4} flexGrow={1} flexDirection="column" border borderColor={theme.border} paddingLeft={1} paddingRight={1} paddingBottom={1}><Title text="LEAN STATEMENT" color={theme.blue} /><LeanStatement text={props.formalText} width={Math.max(24, (props.dashboardWidth ?? 70) - 8)} /></box>
  </box>
}

function Title(props: { text: string; color: string }) { return <box height={1} flexShrink={0} flexDirection="row" alignItems="center" paddingLeft={1}><text fg={props.color}>{props.text}</text></box> }
function Metric(props: { label: string; value: string; color?: string }) { return <box flexDirection="row" paddingLeft={1} paddingRight={1}><text width="42%" fg={theme.textMuted}>{props.label}</text><text fg={props.color ?? theme.text}>{props.value}</text></box> }
function Activity(props: { step: ResearchStep }) { return <box flexDirection="row" paddingLeft={1} paddingRight={1}><text width={10} fg={theme.textMuted}>{clock(props.step.finishedAt ?? props.step.startedAt)}</text><text flexGrow={1} fg={props.step.status === "SUCCEEDED" ? theme.text : theme.warning}>{props.step.summary ?? props.step.action}</text><text fg={theme.textMuted}>{`[${props.step.action}]`}</text></box> }
function GridSeparator() { return <box height={2} flexShrink={0} flexDirection="column"><text fg={theme.border}>│</text><text fg={theme.border}>│</text></box> }
function CommandRow(props: { items: readonly (readonly [string, string])[]; columns: number[] }) { return <box height={2} flexShrink={0} flexDirection="row"><GridSeparator /><For each={props.items}>{(item, index) => <><box width={props.columns[index()]} flexDirection="column" paddingLeft={1}><text fg={theme.violet}>{item[0]}</text><text fg={theme.textMuted}>{item[1]}</text></box><GridSeparator /></>}</For></box> }
function distributeColumns(width: number) {
  const content = Math.max(3, width - 4)
  const base = Math.floor(content / 3)
  return [base, base, content - base * 2]
}
function gridRule(columns: number[]) { return `├${"─".repeat(columns[0] ?? 1)}┼${"─".repeat(columns[1] ?? 1)}┼${"─".repeat(columns[2] ?? 1)}┤` }
function LeanStatement(props: { text?: string | null; width?: number }) {
  if (!props.text) return <text width={props.width} wrapMode="word" fg={theme.textMuted}>Use /formal to inspect the current Lean statement.</text>
  const match = /^(theorem|lemma|example|def)\s+(\S+)([\s\S]*)$/.exec(props.text)
  if (!match) return <text width={props.width} wrapMode="word" fg={theme.cyan}>{props.text}</text>
  return <text width={props.width} wrapMode="word"><span style={{ fg: theme.violet }}>{match[1]}</span>{" "}<span style={{ fg: theme.accent }}>{match[2]}</span><span style={{ fg: theme.cyan }}>{match[3]}</span></text>
}
function clock(value?: string | null) { return value ? value.slice(11, 19) : "--:--:--" }
