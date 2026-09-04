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
    <box width={props.width ?? 40} backgroundColor={theme.surface} border borderColor={theme.border} flexDirection="column">
      <WorkspaceInfo status={props.status} />
      <Section title="RESEARCH STATE" color={theme.blue} height={10}>
        <Row label="session" value={props.run?.id ?? "—"} />
        <Row label="state" value={props.run?.status ?? "IDLE"} color={props.run?.status === "PAUSED" ? theme.accent : theme.text} />
        <Row label="focus" value={props.status.mainObjective?.id ?? "—"} />
        <Row label="objective" value={props.status.mainObjective?.title ?? "No objective"} />
        <Row label="epistemic" value={props.status.mainObjective?.status ?? "OPEN"} color={props.status.mainObjective ? statusColor(props.status.mainObjective.status) : theme.textMuted} />
        <Row label="last activity" value={props.steps?.at(-1)?.action ?? "none"} color={props.steps?.length ? theme.success : theme.textMuted} />
      </Section>
      <Section title="SESSION TIMELINE" color={theme.violet} height={8}>
        <Row label="started" value={started()} /><Row label="paused" value={stopped()} /><Row label="elapsed" value={elapsed()} /><Row label="resumable" value={resumable() ? "yes" : "no"} color={resumable() ? theme.success : theme.textMuted} />
      </Section>
      <Section title="QUICK ACTIONS" color={theme.accent} flexGrow={1}>
        <text fg={theme.textMuted}>[1] Resume session</text><text fg={theme.textMuted}>[2] Analyze current goal</text><text fg={theme.textMuted}>[3] Show proof graph</text><text fg={theme.textMuted}>[4] List open blockers</text><text fg={theme.textMuted}>[5] Export verification capsule</text>
      </Section>
    </box>
  )
}

function Section(props: { title: string; color: string; height?: number; flexGrow?: number; children: unknown }) {
  return <box height={props.height} flexGrow={props.flexGrow} flexShrink={0} flexDirection="column" padding={1} border borderColor={theme.border}><text fg={props.color}>{props.title}</text>{props.children as never}</box>
}

function Row(props: { label: string; value: string; color?: string }) {
  return <box flexDirection="row" justifyContent="space-between"><text fg={theme.textMuted}>{props.label}</text><text fg={props.color ?? theme.text}>{props.value}</text></box>
}

function clock(value?: string | null) { return value ? value.slice(11, 19) : "—" }
function duration(start?: string | null, end?: string | null) {
  if (!start || !end) return "—"
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000))
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}
