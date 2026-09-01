import type {
  Claim,
  ClaimDetail,
  ClaimKind,
  DoctorReport,
  FidelityReview,
  FormalizationSession,
  FormalStatement,
  ProofAttempt,
  ProofSession,
  ResearchDraft,
  StatusProjection,
  VerificationReport,
} from "@mathos/domain"
import { For, Show } from "solid-js"
import { HELP_TEXT } from "../format.ts"
import { theme } from "../theme.ts"
import { ClaimForm } from "./ClaimForm.tsx"
import { ClaimDetailView, ClaimsList, ObjectivePicker } from "./ClaimsViews.tsx"
import { BranchDetailView, BranchList, MergePreviewView } from "./BranchViews.tsx"
import { ResearchPanel } from "./ResearchPanel.tsx"
import { TeamPanel } from "./TeamPanel.tsx"
import { GraphPanel } from "./GraphPanel.tsx"
import { FormalizationDraftView, FormalizingView, FormalView } from "./FormalViews.tsx"
import { AnalyzingView, ObjectiveConfirm, ResearchDraftView } from "./IntakeViews.tsx"
import { ProofResultView, ProofView, ProvingView } from "./ProofViews.tsx"
import { IndexStatusView, TheoremDetailView, TheoremSearchView } from "./SearchViews.tsx"
import { ResearchSummary } from "./ResearchSummary.tsx"
import { TextPanel } from "./ProductViews.tsx"

export type MainView =
  | "home"
  | "status"
  | "doctor"
  | "help"
  | "claim-form"
  | "claims"
  | "claim-detail"
  | "objective"
  | "analyzing"
  | "research-draft"
  | "intake-edit"
  | "ask-objective"
  | "formalize-select"
  | "formalizing"
  | "formal-draft"
  | "formal-view"
  | "prove-select"
  | "proving"
  | "prove-result"
  | "proof-view"
  | "search"
  | "premises"
  | "theorem-detail"
  | "index"
  | "branches"
  | "branch-detail"
  | "merge-preview"
  | "research"
  | "team"
  | "graph"
  | "experiments"
  | "literature-home"
  | "blockers"
  | "ledger"
  | "why"
  | "history"
  | "environment"
  | "verification-detail"

export function MainPanel(props: {
  view: MainView
  status: StatusProjection
  doctor: DoctorReport | null
  help: string
  claims: Claim[]
  detail: ClaimDetail | null
  claimDraft?: { kind?: ClaimKind; title?: string }
  researchDraft: ResearchDraft | null
  pendingObjectiveId: string | null
  onCreateClaim: (draft: { kind: ClaimKind; title: string; statement: string }) => void
  onCancelOverlay: () => void
  onOpenClaim: (id: string) => void
  onSetObjective: (id: string) => void
  onConfirmIntake: () => void
  onEditIntake: () => void
  onSaveIntakeEdit: (draft: { kind: ClaimKind; title: string; statement: string }) => void
  onAcceptObjective: () => void
  onDeclineObjective: () => void
  formalSession: FormalizationSession | null
  formalStatement: FormalStatement | null
  formalFidelity: FidelityReview | null
  formalClaimId: string | null
  onSelectFormalize: (id: string) => void
  onApproveFormal: () => void
  onRejectFormal: () => void
  proofSession: ProofSession | null
  proofAttempts: ProofAttempt[]
  verification: VerificationReport | null
  onSelectProve: (id: string) => void
  searchTitle: string
  searchCandidates: import("@mathos/retrieval").PremiseCandidate[]
  selectedTheorem: import("@mathos/retrieval").PremiseCandidate | null
  indexText: string
  onOpenTheorem: (name: string) => void
  branches?: import("@mathos/domain").ResearchBranch[]
  branchDetail?: import("@mathos/domain").BranchDetail | null
  mergePreview?: import("@mathos/domain").MergePreview | null
  onSwitchBranch?: (id: string) => void
  researchRun?: import("@mathos/domain").ResearchRun | null
  researchSteps?: import("@mathos/domain").ResearchStep[]
  teamOverview?: ReturnType<import("@mathos/core").MathOS["teamOverview"]> | null
  teamSelected?: number
  teamDetailOn?: boolean
  graphView?: { graph: import("@mathos/graph").ResearchGraph; focusId: string | null; selectedId: string | null; filter: string; detailOn: boolean; query?: string; searchOn?: boolean } | null
  onResearchPause?: () => void
  onResearchResume?: () => void
  onResearchStep?: () => void
  productText?: string
}) {
  return (
    <box flexGrow={1} backgroundColor={theme.background} border borderColor={theme.border} flexDirection="column">
      <Show when={props.view === "home" || props.view === "status"}>
        <ResearchSummary status={props.status} home={props.productText} />
      </Show>
      <Show when={props.view === "doctor"}>
        <box flexDirection="column" padding={1} gap={1}>
          <text fg={theme.textMuted}>DOCTOR</text>
          <For each={props.doctor?.checks ?? []}>
            {(check) => (
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.text}>{check.name}</text>
                <text fg={check.status === "PASS" ? theme.success : check.status === "WARN" ? theme.warning : theme.danger}>
                  {check.status}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={props.view === "help"}>
        <box flexDirection="column" padding={1}>
          <text fg={theme.text}>{props.help || HELP_TEXT}</text>
        </box>
      </Show>
      <Show when={props.view === "claim-form"}>
        <ClaimForm
          initialKind={props.claimDraft?.kind}
          initialTitle={props.claimDraft?.title}
          onSubmit={props.onCreateClaim}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "claims"}>
        <ClaimsList
          claims={props.claims}
          selectedId={props.status.mainObjective?.id}
          onOpen={props.onOpenClaim}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "claim-detail" && props.detail}>
        <ClaimDetailView
          id={props.detail!.id}
          kind={props.detail!.kind}
          title={props.detail!.title}
          status={props.detail!.status}
          statement={props.detail!.naturalStatement}
          evidence={props.detail!.evidence.length === 0 ? "None" : props.detail!.evidence.map((item) => item.summary).join("; ")}
          dependencies={
            props.detail!.dependencies.length === 0
              ? "None"
              : props.detail!.dependencies.map((item) => `${item.relation} ${item.fromClaimId}→${item.toClaimId}`).join("; ")
          }
          branchName={props.detail!.branchName}
          createdAt={props.detail!.createdAt}
          trustExplanation={props.productText?.includes("WHY ") ? props.productText.slice(props.productText.indexOf("WHY ")) : "VerificationGate evidence unavailable."}
          onBack={() => props.onCancelOverlay()}
        />
      </Show>
      <Show when={props.view === "objective"}>
        <ObjectivePicker
          claims={props.claims}
          currentId={props.status.mainObjective?.id}
          onSelect={props.onSetObjective}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "analyzing"}>
        <AnalyzingView />
      </Show>
      <Show when={props.view === "research-draft" && props.researchDraft}>
        <ResearchDraftView
          draft={props.researchDraft!}
          onConfirm={props.onConfirmIntake}
          onEdit={props.onEditIntake}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "intake-edit" && props.researchDraft}>
        <ClaimForm
          initialKind={props.researchDraft!.kind}
          initialTitle={props.researchDraft!.title}
          initialStatement={props.researchDraft!.normalizedStatement}
          onSubmit={props.onSaveIntakeEdit}
          onCancel={() => props.onEditIntake()}
        />
      </Show>
      <Show when={props.view === "ask-objective" && props.pendingObjectiveId}>
        <ObjectiveConfirm
          claimId={props.pendingObjectiveId!}
          onYes={props.onAcceptObjective}
          onNo={props.onDeclineObjective}
        />
      </Show>
      <Show when={props.view === "formalize-select"}>
        <ClaimsList
          claims={props.claims}
          selectedId={props.status.mainObjective?.id}
          onOpen={props.onSelectFormalize}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "formalizing"}>
        <FormalizingView />
      </Show>
      <Show when={props.view === "formal-draft" && props.formalSession}>
        <FormalizationDraftView
          session={props.formalSession!}
          onApprove={props.onApproveFormal}
          onReject={props.onRejectFormal}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "formal-view" && props.formalStatement && props.formalClaimId}>
        <FormalView
          claimId={props.formalClaimId!}
          statement={props.formalStatement!}
          fidelity={props.formalFidelity}
          onBack={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "prove-select"}>
        <ClaimsList
          claims={props.claims}
          selectedId={props.status.mainObjective?.id}
          onOpen={props.onSelectProve}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "proving"}>
        <ProvingView />
      </Show>
      <Show when={props.view === "prove-result" && props.proofSession}>
        <ProofResultView session={props.proofSession!} onBack={props.onCancelOverlay} />
      </Show>
      <Show when={props.view === "proof-view" && props.formalClaimId && props.formalStatement}>
        <ProofView
          claimId={props.formalClaimId!}
          formalId={props.formalStatement!.id}
          attempts={props.proofAttempts}
          verification={props.verification}
          fidelity={props.formalStatement!.fidelityStatus}
          leanVersion={props.formalStatement!.leanVersion}
          onBack={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "search" || props.view === "premises"}>
        <TheoremSearchView
          title={props.searchTitle}
          candidates={props.searchCandidates}
          onOpen={props.onOpenTheorem}
          onCancel={props.onCancelOverlay}
        />
      </Show>
      <Show when={props.view === "theorem-detail" && props.selectedTheorem}>
        <TheoremDetailView candidate={props.selectedTheorem!} onBack={props.onCancelOverlay} />
      </Show>
      <Show when={props.view === "index"}>
        <IndexStatusView text={props.indexText} onBack={props.onCancelOverlay} />
      </Show>
      <Show when={props.view === "branches"}>
        <BranchList branches={props.branches ?? []} onOpen={(id) => props.onSwitchBranch?.(id)} onCancel={props.onCancelOverlay} />
      </Show>
      <Show when={props.view === "branch-detail" && props.branchDetail}>
        <BranchDetailView detail={props.branchDetail!} />
      </Show>
      <Show when={props.view === "merge-preview" && props.mergePreview}>
        <MergePreviewView preview={props.mergePreview!} />
      </Show>
      <Show when={props.view === "research" && props.researchRun}>
        <ResearchPanel
          run={props.researchRun!}
          steps={props.researchSteps ?? []}
          verified={props.status.research.verified}
          openBlockers={props.status.research.blocked}
          humanRequired={props.researchRun!.stopReason === "BLOCKED_NEEDS_HUMAN"}
        />
      </Show>
      <Show when={props.view === "team" && props.teamOverview}>
        <TeamPanel
          session={props.teamOverview!.session}
          rows={props.teamOverview!.agents}
          importCount={props.teamOverview!.imports.length}
          solutions={props.teamOverview!.solutions.length}
          selectedIndex={props.teamSelected ?? 0}
          detail={props.teamDetailOn ? (() => {
            const row = props.teamOverview!.agents[props.teamSelected ?? 0]
            if (!row) return null
            return { agent: row.agent, run: row.run, steps: row.recentSteps ?? [] }
          })() : null}
        />
      </Show>
      <Show when={props.view === "graph" && props.graphView}>
        <GraphPanel
          graph={props.graphView!.graph}
          focusId={props.graphView!.focusId}
          selectedId={props.graphView!.selectedId}
          nodes={props.graphView!.graph.nodes.filter((node) => node.kind === "CLAIM" || node.kind === "OBJECTIVE" || node.kind === "BLOCKER" || node.kind === "VERIFICATION" || node.kind === "PROOF_ATTEMPT")}
          detailOn={props.graphView!.detailOn}
          filter={props.graphView!.filter}
          query={props.graphView!.query}
          searchOn={props.graphView!.searchOn}
        />
      </Show>
      <Show when={["experiments", "literature-home", "blockers", "ledger", "why", "history", "environment", "verification-detail"].includes(props.view) && props.productText}>
        <TextPanel text={props.productText!} onBack={props.onCancelOverlay} />
      </Show>
    </box>
  )
}
