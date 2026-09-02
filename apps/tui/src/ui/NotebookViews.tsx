import type { ResearchBlock, ResearchDocument } from "@mathos/domain"
import { For, Show } from "solid-js"
import { theme } from "../theme.ts"

export const moveNotebookSelection=(current:number,delta:number,length:number)=>length?Math.max(0,Math.min(length-1,current+delta)):0
export const notebookDeepLink=(block:ResearchBlock):string|null=>block.entityId ? `${block.kind === "CLAIM_REF" || block.kind === "PROOF_SKETCH" ? "claim" : block.kind.toLowerCase()}:${block.entityId}` : null

export function NotebookView(props:{document:ResearchDocument;blocks:ResearchBlock[];selected:number;conflict?:string|null}){
  const selected=()=>props.blocks[props.selected]
  return <box flexDirection="column" padding={1}>
    <text fg={theme.accent}>NOTEBOOK · {props.document.title}</text>
    <text fg={theme.textMuted}>{props.document.sourcePath} · revision {props.document.revision}</text>
    <box flexDirection="row" gap={2}>
      <box flexDirection="column" width="40%"><For each={props.blocks}>{(block,index)=><text fg={index()===props.selected?theme.accent:theme.text}>{index()===props.selected?"› ":"  "}{block.kind}</text>}</For></box>
      <box flexDirection="column"><Show when={selected()}>{(block)=><><text fg={theme.text}>{block().markdown.slice(0,300)}</text><text fg={theme.textMuted}>Reference: {notebookDeepLink(block()) ?? "none"}</text></>}</Show></box>
    </box>
    <Show when={props.conflict}><text fg={theme.danger}>SYNC CONFLICT · {props.conflict}</text></Show>
    <text fg={theme.textMuted}>↑/↓ blocks · Enter deep link · edit in $EDITOR</text>
  </box>
}
