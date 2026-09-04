import { theme } from "../theme.ts"

export function StatusBar(props: { hint: string; mode: string; compact?: boolean }) {
  return (
    <box height={1} flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <text fg={theme.textMuted}>{props.compact ? "Ctrl+K commands  Ctrl+R research  Ctrl+G graph  Ctrl+H help" : props.hint}</text>
      <text fg={theme.textMuted}>{props.mode}</text>
    </box>
  )
}
