import { For, Show } from "solid-js"
import type { MultiAgentResearchSession, ResearchAgentWorker, ResearchRun, ResearchStep } from "@mathos/domain"
import { theme } from "../theme.ts"

export function TeamPanel(props: {
  session: MultiAgentResearchSession
  rows: Array<{ agent: ResearchAgentWorker; run: ResearchRun; localStatus: string; verified: boolean }>
  importCount: number
  solutions: number
  selectedIndex?: number
  detail?: { agent: ResearchAgentWorker; run: ResearchRun; steps: ResearchStep[] } | null
}) {
  const s = () => props.session
  return (
    <box flexDirection="column" padding={1} backgroundColor={theme.surface} border borderColor={theme.border}>
      <Show when={props.detail} fallback={
        <box flexDirection="column">
          <text fg={theme.accent}>{`MULTI-AGENT · ${s().id}`}</text>
          <text fg={theme.text}>{`Execution ${s().executionMode === "BOUNDED_PARALLEL" ? `Parallel · ${s().maxParallelWorkers} workers` : "Sequential"}`}</text>
          <text fg={theme.text}>{`Objective ${s().objectiveClaimId}   Source ${s().sourceBranchId}`}</text>
          <text fg={theme.text}>{`Status ${s().status}   Round ${s().currentRound} / ${s().limits.maxRounds}`}</text>
          <box height={1} />
          <text fg={theme.success}>VERIFIED FINDINGS</text>
          <For each={props.rows.filter((row) => row.verified)}>
            {(row, i) => (
              <box flexDirection="column" marginBottom={1}>
                <text fg={theme.success}>{`${(props.selectedIndex ?? 0) === props.rows.indexOf(row) ? ">" : " "} ${row.agent.id} · ${row.agent.role} · KERNEL_VERIFIED`}</text>
                <text fg={theme.textMuted}>{`  ${row.agent.branchId}  ${row.agent.researchRunId}  ${row.agent.status}`}</text>
                <text fg={theme.textMuted}>{`  Lean ${row.run.usage.leanCalls}/${row.run.limits.maxLeanCalls}  Model ${row.run.usage.modelCalls}/${row.run.limits.maxModelCalls}  ${row.run.stopReason ?? row.localStatus}`}</text>
              </box>
            )}
          </For>
          <Show when={props.rows.filter((row) => row.verified).length === 0}><text fg={theme.textMuted}>none</text></Show>
          <box height={1} />
          <text fg={theme.warning}>UNVERIFIED FINDINGS</text>
          <For each={props.rows.filter((row) => !row.verified)}>
            {(row) => (
              <box flexDirection="column" marginBottom={1}>
                <text fg={theme.warning}>{`${(props.selectedIndex ?? 0) === props.rows.indexOf(row) ? ">" : " "} ${row.agent.id} · ${row.agent.role} · UNVERIFIED`}</text>
                <text fg={theme.textMuted}>{`  ${row.agent.branchId}  ${row.agent.researchRunId}  ${row.agent.status}`}</text>
                <text fg={theme.textMuted}>{`  Lean ${row.run.usage.leanCalls}/${row.run.limits.maxLeanCalls}  Model ${row.run.usage.modelCalls}/${row.run.limits.maxModelCalls}  ${row.run.stopReason ?? row.localStatus}`}</text>
              </box>
            )}
          </For>
          <Show when={props.rows.filter((row) => !row.verified).length === 0}><text fg={theme.textMuted}>none</text></Show>
          <text fg={theme.text}>{`Shared verified ${(props.rows.filter((row) => row.verified).length)}   Open imports ${props.importCount}   Solutions ${props.solutions}`}</text>
          <text fg={theme.textMuted}>{`TOTAL  Steps ${s().usage.steps}/${s().limits.maxTotalSteps}  Lean ${s().usage.leanCalls}/${s().limits.maxTotalLeanCalls}`}</text>
          <box height={1} />
          <text fg={theme.textMuted}>↑↓ select   Enter detail   s round   p pause   r resume</text>
        </box>
      }>
        <box flexDirection="column">
          <text fg={theme.accent}>{`${props.detail!.agent.id} · ${props.detail!.agent.role}`}</text>
          <text fg={theme.text}>{`Branch ${props.detail!.agent.branchId}   Run ${props.detail!.agent.researchRunId}`}</text>
          <text fg={theme.text}>{`Assignment ${props.detail!.agent.assignment.goalSummary}`}</text>
          <text fg={theme.text}>{`Status ${props.detail!.agent.status}   Focus ${props.detail!.run.strategy.focusClaimId ?? props.detail!.run.objectiveClaimId}`}</text>
          <text fg={theme.textMuted}>{`Steps ${props.detail!.run.usage.steps}/${props.detail!.run.limits.maxSteps}  Lean ${props.detail!.run.usage.leanCalls}/${props.detail!.run.limits.maxLeanCalls}`}</text>
          <For each={props.detail!.steps.slice(-6)}>
            {(step) => <text fg={theme.textMuted}>{`  ${step.sequence} ${step.action} ${step.status}`}</text>}
          </For>
          <text fg={theme.textMuted}>Esc back</text>
        </box>
      </Show>
    </box>
  )
}
