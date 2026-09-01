import { For, Show } from "solid-js"
import type { ResearchRun, ResearchStep } from "@mathos/domain"
import { theme } from "../theme.ts"

export function ResearchPanel(props: {
  run: ResearchRun
  steps: ResearchStep[]
  verified: number
  openBlockers: number
  humanRequired: boolean
}) {
  const recent = () => props.steps.slice(-4)
  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.surface} border borderColor={theme.border}>
      <text fg={theme.accent}>{`RESEARCH  ${props.run.id} · ${props.run.status}`}</text>
      <text fg={theme.textMuted}>{props.run.branchId}</text>
      <box height={1} />
      <text fg={theme.textMuted}>Objective</text>
      <text fg={theme.text}>{props.run.objectiveClaimId ?? "none"}</text>
      <text fg={theme.textMuted}>Focus</text>
      <text fg={theme.text}>{props.run.strategy.focusClaimId ?? "none"}</text>
      <box height={1} />
      <text fg={theme.text}>{`Progress  ${props.run.usage.steps} / ${props.run.limits.maxSteps} steps`}</text>
      <text fg={theme.text}>{`Verified  ${props.verified}`}</text>
      <text fg={theme.text}>{`Open blockers  ${props.openBlockers}`}</text>
      <text fg={theme.textMuted}>{`Model ${props.run.usage.modelCalls}/${props.run.limits.maxModelCalls}   Lean ${props.run.usage.leanCalls}/${props.run.limits.maxLeanCalls}`}</text>
      <Show when={props.humanRequired}>
        <text fg={theme.danger}>Human input required</text>
      </Show>
      <box height={1} />
      <text fg={theme.textMuted}>RECENT</text>
      <For each={recent()}>
        {(step) => <text fg={step.status === "FAILED" ? theme.danger : theme.text}>{`${step.status === "FAILED" ? "×" : "✓"} ${step.action}`}</text>}
      </For>
      <box height={1} />
      <text fg={theme.textMuted}>p pause   r resume   s step</text>
    </box>
  )
}
