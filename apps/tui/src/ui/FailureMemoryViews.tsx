import { For } from "solid-js"
import { theme } from "../theme.ts"
type Row={id:string;[key:string]:unknown}
export function failureMemorySnapshot(failure:Row,occurrences:Row[],changed:string[]=[]){return{schemaVersion:"mathos.failure-memory.v1" as const,failure,occurrenceCount:occurrences.length,changedSince:changed,occurrences:occurrences.map(({environmentFingerprint,...safe})=>({...safe,environmentFingerprint}))}}
export function FailureMemoryView(props:{snapshot:ReturnType<typeof failureMemorySnapshot>}){return <box flexGrow={1} padding={1} flexDirection="column"><text fg={theme.accent}>FAILURE MEMORY  {props.snapshot.failure.id}</text><text fg={theme.warning}>{String(props.snapshot.failure.failureClass)}</text><text fg={theme.text}>{String(props.snapshot.failure.normalizedDiagnostic)}</text><text fg={theme.textMuted}>OCCURRENCES {props.snapshot.occurrenceCount}</text><text fg={theme.textMuted}>CHANGED SINCE {props.snapshot.changedSince.join(", ")||"nothing"}</text><For each={props.snapshot.occurrences}>{item=><text fg={theme.textMuted}>{String(item.id)}</text>}</For></box>}
/** @jsxImportSource @opentui/solid */
