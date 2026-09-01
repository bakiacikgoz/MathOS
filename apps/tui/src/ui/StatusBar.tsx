import { theme } from "../theme.ts"

export function StatusBar(props: { hint: string; mode: string }) {
  return (
    <box height={1} flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
      <text fg={theme.textMuted}>{props.hint}</text>
      <text fg={theme.textMuted}>{props.mode}</text>
    </box>
  )
}
