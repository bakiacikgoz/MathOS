/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import { theme } from "../theme.ts"

export function providerLoginViewModel(input: { profileId: string; deviceCode?: string }) { return { profileId: input.profileId, displayCode: input.deviceCode ?? null, historyText: `Login requested for ${input.profileId}`, auditText: `Login requested for ${input.profileId}` } }
export function ProviderLoginView(props: { profileId: string; deviceCode?: string; onSecret?: (value: string) => void }) { const [secret, setSecret] = createSignal(""); return <box flexGrow={1} padding={1} flexDirection="column"><text fg={theme.accent}>PROVIDER LOGIN</text><text fg={theme.text}>Profile {props.profileId}</text>{props.deviceCode ? <text fg={theme.warning}>Device code {props.deviceCode}</text> : <input placeholder="Paste secret (masked)" value={"•".repeat(secret().length)} onInput={(value: string) => { setSecret(value); props.onSecret?.(value) }} /> }<text fg={theme.textMuted}>The device code and secret are never written to history, toast, or audit logs.</text></box> }
