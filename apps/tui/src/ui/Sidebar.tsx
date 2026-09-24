import type { ResearchRun, ResearchStep, StatusProjection } from "@mathos/domain"
import { statusColor, theme } from "../theme.ts"
import { WorkspaceInfo } from "./WorkspaceInfo.tsx"

export function Sidebar(props: { status: StatusProjection; visible: boolean; width?: number; run?: ResearchRun | null; steps?: ResearchStep[] }) {
  if (!props.visible) return null
  const started = () => clock(props.run?.startedAt ?? props.run?.createdAt)
  const stopped = () => clock(props.run?.stoppedAt)
  const elapsed = () => duration(props.run?.startedAt, props.run?.stoppedAt ?? props.run?.updatedAt)
  const resumable = () => props.run?.status === "PAUSED"
  return (
    <box width={props.width ?? 40} backgroundColor={theme.surface} flexDirection="column" overflow="hidden">
      <WorkspaceInfo status={props.status} />
      <Section title="RESEARCH STATE" color={theme.blue}>
        <Row label="session" value={props.run?.id ?? "—"} />
        <Row label="state" value={props.run?.status ?? "IDLE"} color={props.run?.status === "PAUSED" ? theme.accent : theme.text} />
        <Row label="focus" value={props.status.mainObjective?.id ?? "—"} />
        <Row label="objective" value={props.status.mainObjective?.title ?? "No objective"} />
        <Row label="epistemic" value={props.status.mainObjective?.status ?? "OPEN"} color={props.status.mainObjective ? statusColor(props.status.mainObjective.status) : theme.textMuted} />
        <Row label="last activity" value={props.steps?.at(-1)?.action ?? "none"} color={props.steps?.length ? theme.success : theme.textMuted} />
      </Section>
      <Section title="SESSION TIMELINE" color={theme.violet}>
        <Row label="started" value={started()} /><Row label="paused" value={stopped()} /><Row label="elapsed" value={elapsed()} /><Row label="resumable" value={resumable() ? "yes" : "no"} color={resumable() ? theme.success : theme.textMuted} />
      </Section>
      <Section title="QUICK ACTIONS" color={theme.accent} flexGrow={1} shrink>
        {QUICK_ACTIONS.map((label) => <text height={1} flexShrink={0} fg={theme.textMuted}>{label}</text>)}
      </Section>
    </box>
  )
}

// Sections size to their rows; only the last one may shrink (and clip) when the terminal is short.
const QUICK_ACTIONS = ["[1] Resume session", "[2] Analyze current goal", "[3] Show proof graph", "[4] List open blockers", "[5] Export verification capsule"]

function Section(props: { title: string; color: string; flexGrow?: number; shrink?: boolean; children: unknown }) {
  return <box flexGrow={props.flexGrow} flexShrink={props.shrink ? 1 : 0} minHeight={props.shrink ? 0 : undefined} overflow="hidden" flexDirection="column" paddingLeft={1} paddingRight={1} border borderColor={theme.border}><text height={1} flexShrink={0} fg={props.color}>{props.title}</text>{props.children as never}</box>
}

function Row(props: { label: string; value: string; color?: string }) {
  return <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={theme.textMuted}>{props.label}</text><text fg={props.color ?? theme.text}>{props.value}</text></box>
}

function clock(value?: string | null) { return value ? value.slice(11, 19) : "—" }
function duration(start?: string | null, end?: string | null) {
  if (!start || !end) return "—"
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000))
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}
