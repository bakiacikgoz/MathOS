import { createSignal, onCleanup } from "solid-js"
import { onResize, useKeyboard, useRenderer } from "@opentui/solid"
import type { MathOS } from "@mathos/core"
import { resolveCommand } from "../keys.ts"
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
import { formatUserError } from "@mathos/shared"
import { visibleExplorerNodes } from "@mathos/graph"
import { HELP_TEXT } from "../format.ts"
import { parseClaimArgs, parseSlash } from "../slash.ts"
import { layoutMode, theme } from "../theme.ts"
import { CommandPalette } from "./CommandPalette.tsx"
import { Header } from "./Header.tsx"
import { MainPanel, type MainView } from "./MainPanel.tsx"
import { PromptInput } from "./PromptInput.tsx"
import { Sidebar } from "./Sidebar.tsx"
import { StatusBar } from "./StatusBar.tsx"
import { Toast } from "./Toast.tsx"
import { portfolioSnapshot,type PortfolioSnapshot } from "./PortfolioViews.tsx"
import { failureMemorySnapshot } from "./FailureMemoryViews.tsx"
import { solverSnapshot } from "./SolverViews.tsx"
import { literatureDeskSnapshot } from "./LiteratureDeskViews.tsx"
import { evaluateProviderPolicy, providerCatalog } from "@mathos/models"
import { providerCenterSnapshot } from "./ProviderCenter.tsx"

export function AppShell(props: { mathos: MathOS }) {
  const renderer = useRenderer()
  const [status, setStatus] = createSignal<StatusProjection>(props.mathos.status())
  const currentFormalText = () => {
    const id = status().mainObjective?.id
    if (!id) return null
    try { return props.mathos.getFormal(id).sourceText } catch { return null }
  }
  const [doctor, setDoctor] = createSignal<DoctorReport | null>(null)
  const [view, setView] = createSignal<MainView>("home")
  const [claims, setClaims] = createSignal<Claim[]>(props.mathos.listClaims())
  const [detail, setDetail] = createSignal<ClaimDetail | null>(null)
  const [claimDraft, setClaimDraft] = createSignal<{ kind?: ClaimKind; title?: string }>({})
  const [researchDraft, setResearchDraft] = createSignal<ResearchDraft | null>(null)
  const [pendingObjectiveId, setPendingObjectiveId] = createSignal<string | null>(null)
  const [formalSession, setFormalSession] = createSignal<FormalizationSession | null>(null)
  const [formalStatement, setFormalStatement] = createSignal<FormalStatement | null>(null)
  const [formalFidelity, setFormalFidelity] = createSignal<FidelityReview | null>(null)
  const [formalClaimId, setFormalClaimId] = createSignal<string | null>(null)
  const [proofSession, setProofSession] = createSignal<ProofSession | null>(null)
  const [proofAttempts, setProofAttempts] = createSignal<ProofAttempt[]>([])
  const [verification, setVerification] = createSignal<VerificationReport | null>(null)
  const [searchTitle, setSearchTitle] = createSignal("THEOREM SEARCH")
  const [searchCandidates, setSearchCandidates] = createSignal<import("@mathos/retrieval").PremiseCandidate[]>([])
  const [selectedTheorem, setSelectedTheorem] = createSignal<import("@mathos/retrieval").PremiseCandidate | null>(null)
  const [indexText, setIndexText] = createSignal("")
  const [branchDetail, setBranchDetail] = createSignal<import("@mathos/domain").BranchDetail | null>(null)
  const [mergePreview, setMergePreview] = createSignal<import("@mathos/domain").MergePreview | null>(null)
  const initialResearchRun = props.mathos.latestResearch()
  const [researchRun, setResearchRun] = createSignal<import("@mathos/domain").ResearchRun | null>(initialResearchRun)
  const [researchSteps, setResearchSteps] = createSignal<import("@mathos/domain").ResearchStep[]>(initialResearchRun ? props.mathos.researchHistory(initialResearchRun.id) : [])
  const [teamOverview, setTeamOverview] = createSignal<ReturnType<import("@mathos/core").MathOS["teamOverview"]> | null>(null)
  const [teamSelected, setTeamSelected] = createSignal(0)
  const [teamDetailOn, setTeamDetailOn] = createSignal(false)
  const [graphView, setGraphView] = createSignal<{ graph: import("@mathos/graph").ResearchGraph; focusId: string | null; selectedId: string | null; filter: "all" | "proof" | "blockers" | "verified" | "branch-local"; detailOn: boolean; query: string; searchOn: boolean } | null>(null)
  const [productText, setProductText] = createSignal((() => {
    const home = props.mathos.workspaceHome()
    const run = props.mathos.latestResearch()
    return run?.status === "PAUSED" ? `${props.mathos.reopenSummary()}\n\n${home}` : home
  })())
  const [contextItems, setContextItems] = createSignal<import("@mathos/domain").MathematicalContextItem[]>([])
  const [contextConflicts, setContextConflicts] = createSignal<import("@mathos/domain").ContextConflict[]>([])
  const [notebookDocument, setNotebookDocument] = createSignal<import("@mathos/domain").ResearchDocument | null>(null)
  const [notebookBlocks, setNotebookBlocks] = createSignal<import("@mathos/domain").ResearchBlock[]>([])
  const [alignment, setAlignment] = createSignal<import("@mathos/domain").FormalAlignment|null>(null)
  const [alignmentFindings, setAlignmentFindings] = createSignal<import("@mathos/domain").AlignmentFinding[]>([])
  const [portfolio, setPortfolio] = createSignal<PortfolioSnapshot|null>(null)
  const [failureMemory, setFailureMemory] = createSignal<ReturnType<typeof failureMemorySnapshot>|null>(null)
  const [solver, setSolver] = createSignal<ReturnType<typeof solverSnapshot>|null>(null)
  const [literatureDesk, setLiteratureDesk] = createSignal<ReturnType<typeof literatureDeskSnapshot>|null>(null)
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [toast, setToast] = createSignal<{ message: string; kind: "info" | "success" | "error" } | null>(null)
  const [history, setHistory] = createSignal<string[]>([])
  const [width, setWidth] = createSignal(renderer.width ?? 80)
  const [height, setHeight] = createSignal(renderer.height ?? 24)

  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let intakeAbort: AbortController | undefined
  let proveAbort: AbortController | undefined

  onResize((nextWidth, nextHeight) => { setWidth(nextWidth); setHeight(nextHeight) })
  onCleanup(() => {
    if (toastTimer) clearTimeout(toastTimer)
    intakeAbort?.abort()
    proveAbort?.abort()
  })

  const OVERLAY_VIEWS = new Set([
    "claim-form", "claims", "claim-detail", "objective", "analyzing", "research-draft", "intake-edit", "ask-objective",
    "formalize-select", "formalizing", "formal-draft", "formal-view", "prove-select", "proving", "prove-result", "proof-view",
    "search", "premises", "theorem-detail", "index", "branches", "branch-detail", "merge-preview", "research", "team", "graph",
    "experiments", "literature-home", "blockers", "ledger", "why", "history", "environment", "verification-detail", "portfolio", "failures", "solver",
    "providers",
  ])
  const overlayOpen = () => OVERLAY_VIEWS.has(view()) || paletteOpen()

  function showToast(message: string, kind: "info" | "success" | "error" = "info") {
    setToast({ message, kind })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => setToast(null), 2800)
  }

  function refresh() {
    setStatus(props.mathos.status())
    setClaims(props.mathos.listClaims())
  }

  function openHome() {
    intakeAbort?.abort()
    intakeAbort = undefined
    setView("home")
    setDetail(null)
    setClaimDraft({})
    setResearchDraft(null)
    setPendingObjectiveId(null)
    setProductText(props.mathos.workspaceHome())
  }

  function runCommand(name: string, rest = "") {
    try {
      if (name === "status") {
        refresh()
        setProductText(props.mathos.statusSummary())
        setView("status")
        return
      }
      if (name === "doctor") {
        void props.mathos.doctor().then((report) => {
          setDoctor(report)
          setView("doctor")
        })
        return
      }
      if (name === "help") {
        setView("help")
        return
      }
      if (name === "context") {
        const branch = props.mathos.currentBranch()
        setContextItems(props.mathos.services.repositories.contextItems.list(branch.workspaceId, { limit:10_000 }))
        setContextConflicts(props.mathos.services.mathematicalContext.detectConflicts({ workspaceId:branch.workspaceId, branchId:branch.id }))
        setView("context")
        return
      }
      if (name === "notebook") {
        const branch=props.mathos.currentBranch(), id=rest.trim()
        const document=id?props.mathos.services.repositories.researchDocuments.get(id):props.mathos.services.repositories.researchDocuments.list(branch.workspaceId,{limit:1})[0]??null
        if(!document){showToast("No notebook. Use: mathos notebook init <slug>","info");return}
        setNotebookDocument(document);setNotebookBlocks(props.mathos.services.repositories.researchBlocks.list(document.id,{limit:10_000}));setView("notebook");return
      }
      if(name==="align"){
        const key=rest.trim();const found=key.startsWith("AL-")?props.mathos.services.repositories.formalAlignments.get(key):props.mathos.services.repositories.formalAlignments.list(key||status().mainObjective?.id||"",{limit:100}).at(-1)??null
        if(!found){showToast("Run alignment from CLI first: mathos align run <claim-id>","info");return}setAlignment(found);setAlignmentFindings(props.mathos.services.repositories.alignmentFindings.listByAlignment(found.id));setView("alignment");return
      }
      if(name==="portfolio"){
        const id=rest.trim();if(!id){showToast("Usage: /portfolio PF-1","error");return}setPortfolio(portfolioSnapshot(props.mathos.services.proofPortfolio.status(id)));setView("portfolio");return
      }
      if(name==="failures"){
        const id=rest.trim();if(!id){showToast("Usage: /failures FF-1","error");return}const failure=props.mathos.services.repositories.failureFingerprints.get(id);if(!failure){showToast("Failure not found","error");return}setFailureMemory(failureMemorySnapshot(failure,props.mathos.services.failureMemory.occurrences(id)));setView("failures");return
      }
      if(name==="solver"){setSolver(solverSnapshot({adapters:props.mathos.services.solverRegistry.list()}));setView("solver");return}
      if(name==="providers"){setView("providers");return}
      if (name === "quit") {
        renderer.destroy()
        return
      }
      if (name === "claim") {
        setClaimDraft(parseClaimArgs(rest))
        setView("claim-form")
        return
      }
      if (name === "claims") {
        refresh()
        setView("claims")
        return
      }
      if (name === "objective") {
        const id = rest.trim()
        if (id) {
          const claim = props.mathos.setMainObjective(id)
          refresh()
          setView("home")
          showToast(`Main objective set to ${claim.id}`, "success")
          return
        }
        refresh()
        setView("objective")
        return
      }
      if (name === "formalize") {
        const id = rest.trim()
        if (id) {
          void startFormalize(id)
          return
        }
        refresh()
        setView("formalize-select")
        return
      }
      if (name === "formal") {
        const id = rest.trim() || status().mainObjective?.id
        if (!id) {
          showToast("Specify a claim id, e.g. /formal C-001", "error")
          return
        }
        try {
          const statement = props.mathos.getFormal(id)
          setFormalClaimId(id)
          setFormalStatement(statement)
          setFormalFidelity(props.mathos.getFidelity(statement.id))
          setView("formal-view")
        } catch (error) {
          showToast(formatUserError(error), "error")
        }
        return
      }
      if (name === "prove") {
        const id = rest.trim()
        if (id) {
          void startProve(id)
          return
        }
        refresh()
        setView("prove-select")
        return
      }
      if (name === "verify") {
        const id = rest.trim() || status().mainObjective?.id
        if (!id) {
          showToast("Specify a claim id, e.g. /verify C-001", "error")
          return
        }
        void props.mathos.verify(id).then((report) => {
          setVerification(report)
          refresh()
          showToast(report.passed ? "Verification PASS" : "Verification did not promote claim", report.passed ? "success" : "info")
          setView("home")
        }).catch((error) => showToast(formatUserError(error), "error"))
        return
      }
      if (name === "proof") {
        const id = rest.trim() || status().mainObjective?.id
        if (!id) {
          showToast("Specify a claim id, e.g. /proof C-001", "error")
          return
        }
        try {
          const statement = props.mathos.getFormal(id)
          setFormalClaimId(id)
          setFormalStatement(statement)
          setProofAttempts(props.mathos.listProofs(id))
          setView("proof-view")
        } catch (error) {
          showToast(formatUserError(error), "error")
        }
        return
      }
      if (name === "search-theorem") {
        const query = rest.trim() || status().mainObjective?.id || ""
        if (!query) {
          showToast("Usage: /search-theorem query-or-C-001", "error")
          return
        }
        void (async () => {
          const goalFlag = rest.includes("--goal")
          const cleaned = rest.replace("--goal", "").trim()
          const results = cleaned.match(/^[A-Z]+-\d+$/) || goalFlag
            ? await props.mathos.premisesForClaim(cleaned || query)
            : await props.mathos.searchTheorems(cleaned || query)
          const list = "candidates" in results ? results.candidates : results
          setSearchTitle(results.mode === "FORMAL_GOAL" ? "THEOREM SEARCH  ·  goal-aware" : "THEOREM SEARCH")
          setSearchCandidates(list)
          setView("search")
        })().catch((error) => showToast(formatUserError(error), "error"))
        return
      }
      if (name === "premises") {
        const id = rest.trim() || status().mainObjective?.id
        if (!id) {
          showToast("Specify a claim id, e.g. /premises C-001", "error")
          return
        }
        void props.mathos.premisesForClaim(id).then((results) => {
          setSearchTitle(
            results.mode === "NATURAL_FALLBACK"
              ? `PREMISES FOR ${id.toUpperCase()}\nFormal goal unavailable.`
              : `PREMISES FOR ${id.toUpperCase()}\nGoal-aware · ${results.enrichment === "LEAN_ELABORATED" ? "Lean enriched" : "header index"}`,
          )
          setSearchCandidates(results.candidates)
          setView("premises")
        }).catch((error) => showToast(formatUserError(error), "error"))
        return
      }
      if (name === "index") {
        if (rest.trim() === "build") {
          void props.mathos.indexBuild().then((manifest) => {
            setIndexText(`Built ${manifest.declarationCount} declarations (${manifest.mathlibCount} mathlib)`)
            setView("index")
          }).catch((error) => showToast(formatUserError(error), "error"))
          return
        }
        const info = props.mathos.indexStatus()
        setIndexText(info.present ? `present ${info.stale ? "STALE" : "fresh"} ${info.manifest?.declarationCount ?? 0} decls` : (info.reason ?? "missing"))
        setView("index")
        return
      }
      if (name === "branches") {
        setView("branches")
        return
      }
      if (name === "branch") {
        const tokens = rest.trim().split(/\s+/).filter(Boolean)
        const sub = tokens[0]
        if (!sub || sub === "list") {
          setView("branches")
          return
        }
        if (sub === "new" || sub === "create") {
          void props.mathos.createBranch(tokens.slice(1).join(" ") || "branch").then((branch) => {
            refresh()
            showToast(`Created ${branch.id}`, "success")
          }).catch((error) => showToast(formatUserError(error), "error"))
          return
        }
        if (sub === "switch" && tokens[1]) {
          props.mathos.switchBranch(tokens[1])
          refresh()
          showToast(`Switched to ${tokens[1]}`, "success")
          return
        }
        if (sub === "pause" && tokens[1]) {
          props.mathos.pauseBranch(tokens[1]); refresh(); return
        }
        if (sub === "resume" && tokens[1]) {
          props.mathos.resumeBranch(tokens[1]); refresh(); return
        }
        if (sub === "abandon" && tokens[1]) {
          props.mathos.abandonBranch(tokens[1]); refresh(); return
        }
        if (sub === "merge" && tokens[1]) {
          if (tokens[2] === "apply") {
            const preview = props.mathos.mergeBranch(tokens[1], { applySafe: true })
            refresh()
            showToast(preview.conflicts ? "Conflicts remain" : "Safe merge applied", preview.conflicts ? "error" : "success")
            return
          }
          setMergePreview(props.mathos.previewMerge(tokens[1]))
          setView("merge-preview")
          return
        }
        setBranchDetail(props.mathos.branchDetail(sub === "show" ? tokens[1] : undefined))
        setView("branch-detail")
        return
      }
      if (name === "research" || name === "progress") {
        const tokens = rest.trim().split(/\s+/).filter(Boolean)
        const sub = name === "progress" ? "status" : tokens[0]
        try {
          if (!sub || sub === "start") {
            const run = props.mathos.startResearch()
            setResearchRun(run)
            setResearchSteps([])
            setView("research")
            showToast(`Started ${run.id}`, "success")
            refresh()
            return
          }
          if (sub === "pause" && tokens[1]) { props.mathos.pauseResearch(tokens[1]); refresh(); return }
          if (sub === "resume" && tokens[1]) { props.mathos.resumeResearch(tokens[1]); refresh(); return }
          if (sub === "step" && tokens[1]) {
            void props.mathos.stepResearch(tokens[1]).then((run) => {
              setResearchRun(run)
              setResearchSteps(props.mathos.researchHistory(run.id))
              setView("research")
              refresh()
            })
            return
          }
          const id = tokens.find((item) => item.startsWith("R-")) ?? props.mathos.latestResearch()?.id
          if (id) {
            setResearchRun(props.mathos.getResearch(id))
            setResearchSteps(props.mathos.researchHistory(id))
            setView("research")
            if (name === "progress") showToast(props.mathos.researchProgress(id).split("\n").slice(0, 4).join(" · "), "info")
            return
          }
          showToast(props.mathos.researchProgress(), "info")
        } catch (error) {
          showToast(formatUserError(error), "error")
        }
        return
      }
      if (name === "team") {
        const tokens = rest.trim().split(/\s+/).filter(Boolean)
        const sub = tokens[0] ?? "status"
        try {
          if (sub === "start") {
            void props.mathos.startTeam().then((session) => {
              showToast(`Started ${session.id}`, "success")
              setTeamOverview(props.mathos.teamOverview(session.id))
              setView("team")
              refresh()
            }).catch((error) => showToast(formatUserError(error), "error"))
            return
          }
          if (sub === "step" && tokens[1]) {
            void props.mathos.stepTeam(tokens[1]).then(() => refresh()).catch((error) => showToast(formatUserError(error), "error"))
            return
          }
          if (sub === "pause" && tokens[1]) { props.mathos.pauseTeam(tokens[1]); refresh(); return }
          if (sub === "resume" && tokens[1]) { props.mathos.resumeTeam(tokens[1]); refresh(); return }
          if (sub === "solutions" && tokens[1]) {
            const rows = props.mathos.teamSolutions(tokens[1])
            showToast(rows.length ? rows.map((item) => `${item.agentId} ${item.claimId}`).join(" · ") : "No solutions", "info")
            return
          }
          const id = tokens.find((item) => item.startsWith("MR-")) ?? props.mathos.listTeamSessions().at(-1)?.id
          if (id) showToast(`${id} ${props.mathos.getTeam(id).status}`, "info")
          else showToast("No team session", "error")
        } catch (error) {
          showToast(formatUserError(error), "error")
        }
        return
      }
      if (name === "graph") {
        const focus = rest.trim().split(/\s+/).find((item) => item && !item.startsWith("-"))
        const graph = props.mathos.buildGraph({ proofOnly: true })
        const focusId = (focus || graph.metadata.focusNodeId || "").toUpperCase() || null
        setGraphView({ graph, focusId, selectedId: focusId, filter: "proof", detailOn: false, query: "", searchOn: false })
        setView("graph")
        return
      }
      if (name === "experiment") {
        const tokens = rest.trim().split(/\s+/).filter(Boolean)
        const sub = tokens[0] ?? "list"
        void (async () => {
          try {
            if (sub === "new" || sub === "create") {
              const experiment = await props.mathos.createExperiment({ claimId: tokens[1], kind: tokens[2] })
              showToast(`Created ${experiment.id}`, "success")
              return
            }
            if (sub === "run" && tokens[1]) {
              const result = await props.mathos.runExperiment(tokens[1])
              showToast(`${result.id} ${result.outcome} — NOT PROOF`, "info")
              return
            }
            if (sub === "show" && tokens[1]) {
              showToast(props.mathos.formatExperiment(tokens[1]).split("\n").slice(0, 4).join(" · "), "info")
              return
            }
            const rows = props.mathos.listExperiments()
            setProductText(props.mathos.experimentsPanel())
            setView("experiments")
            showToast(rows.length ? rows.map((item) => `${item.id} ${item.status}`).join(" · ") : "No experiments", "info")
          } catch (error) {
            showToast(formatUserError(error), "error")
          }
        })()
        return
      }
      if (name === "literature") {
        if (!rest.trim()) {
          const sources = props.mathos.listSources()
          setLiteratureDesk(literatureDeskSnapshot({ sources, excerpts: sources.flatMap((source) => props.mathos.listExcerpts(source.id)), candidates: props.mathos.listExternal(), assessments: props.mathos.listCitations() }))
          setView("literature-desk")
          return
        }
        const query = rest.trim()
        void (async () => {
          try {
            const search = await props.mathos.searchLiterature(query)
            const hits = props.mathos.literatureHits(search.id)
            showToast(hits.slice(0, 3).map((hit, i) => `${i + 1}. ${hit.title}`).join(" · ") || "No hits", "info")
          } catch (error) {
            showToast(formatUserError(error), "error")
          }
        })()
        return
      }
      if(name==="atlas"){const graph=props.mathos.buildGraph({includeLiterature:true});setProductText(`Health READY · nodes ${graph.nodes.length} · ${rest.trim()||"snapshot"}`);setView("atlas");return}
      if(name==="conjecture"||name==="agenda"){setProductText(name==="conjecture"?"CONJECTURE TRIAGE · PROPOSAL — HUMAN ACCEPTANCE REQUIRED":"RESEARCH AGENDA · unresolved items are research state");setView("home");return}
      if(name==="capsule"||name==="publication"){setProductText(name==="capsule"?"REPRODUCIBILITY CAPSULE · verify before replay":"PUBLICATION STUDIO · provenance and loss report required");setView("home");return}
      if(name==="plugin"){setProductText("PLUGIN HOST · OUT OF PROCESS · FAIL CLOSED");setView("home");return}
      if (name === "ledger" || name === "why" || name === "history" || name === "blockers" || name === "resume") {
        const id = rest.trim() || status().mainObjective?.id
        if (name === "blockers") {
          setProductText(props.mathos.blockersPanel())
          setView("blockers")
          return
        }
        if (name === "history") {
          setProductText(props.mathos.timeline())
          setView("history")
          return
        }
        if (name === "resume") {
          const run = props.mathos.latestResearch()
          if (run) {
            props.mathos.resumeResearch(run.id)
            showToast(`Resumed ${run.id}`, "success")
          }
          return
        }
        if (!id) {
          showToast("No claim selected", "error")
          return
        }
        if (name === "ledger") {
          setProductText(props.mathos.ledgerText(id))
          setView("ledger")
          return
        }
        setProductText(props.mathos.whyClaim(id))
        setView("why")
        return
      }
      showToast(`Unknown command: /${name}`, "error")
    } catch (error) {
      showToast(formatUserError(error), "error")
    }
  }

  async function startProve(id: string) {
    proveAbort?.abort()
    proveAbort = new AbortController()
    setView("proving")
    try {
      const session = await props.mathos.prove(id, proveAbort.signal)
      setProofSession(session)
      setProofAttempts(session.attempts)
      setVerification(session.verification)
      setFormalClaimId(id)
      setFormalStatement(session.formalStatement)
      refresh()
      setView("prove-result")
    } catch (error) {
      if (proveAbort.signal.aborted) {
        setView("home")
        return
      }
      showToast(formatUserError(error), "error")
      setView("home")
    }
  }

  async function startFormalize(id: string) {
    setView("formalizing")
    try {
      const session = await props.mathos.formalize(id)
      setFormalSession(session)
      setFormalClaimId(id)
      setView("formal-draft")
    } catch (error) {
      showToast(formatUserError(error), "error")
      setView("home")
    }
  }

  async function startIntake(text: string) {
    intakeAbort?.abort()
    intakeAbort = new AbortController()
    setView("analyzing")
    try {
      const draft = await props.mathos.ingest(text, intakeAbort.signal)
      setResearchDraft(draft)
      setView("research-draft")
    } catch (error) {
      if (intakeAbort.signal.aborted) {
        openHome()
        return
      }
      showToast(formatUserError(error), "error")
      setView("home")
    }
  }

  function handleSubmit(value: string) {
    setHistory((items) => [...items, value])
    const slash = parseSlash(value)
    if (slash) {
      runCommand(slash.name, slash.rest)
      return
    }
    void startIntake(value)
  }

  function handleCreateClaim(draft: { kind: ClaimKind; title: string; statement: string }) {
    try {
      const claim = props.mathos.createClaim({
        kind: draft.kind,
        title: draft.title,
        statement: draft.statement,
      })
      refresh()
      setView("home")
      showToast(`Created ${claim.id}`, "success")
    } catch (error) {
      showToast(formatUserError(error), "error")
    }
  }

  function handleConfirmIntake() {
    const draft = researchDraft()
    if (!draft) return
    try {
      const claim = props.mathos.confirmIntake(draft)
      refresh()
      showToast(`${claim.id} created`, "success")
      if (!status().mainObjective) {
        setPendingObjectiveId(claim.id)
        setView("ask-objective")
        return
      }
      setResearchDraft(null)
      setView("home")
    } catch (error) {
      showToast(formatUserError(error), "error")
    }
  }

  function handleSaveIntakeEdit(next: { kind: ClaimKind; title: string; statement: string }) {
    const current = researchDraft()
    if (!current) return
    setResearchDraft({
      ...current,
      kind: next.kind,
      title: next.title,
      normalizedStatement: next.statement,
    })
    setView("research-draft")
  }

  function handleOpenClaim(id: string) {
    try {
      setDetail(props.mathos.getClaimDetail(id))
      setProductText(props.mathos.claimPage(id))
      setView("claim-detail")
    } catch (error) {
      showToast(formatUserError(error), "error")
    }
  }

  function handleSetObjective(id: string) {
    try {
      const claim = props.mathos.setMainObjective(id)
      refresh()
      setView("home")
      showToast(`Main objective set to ${claim.id}`, "success")
    } catch (error) {
      showToast(formatUserError(error), "error")
    }
  }

  useKeyboard((key) => {
    if (view() === "research" && !key.ctrl && !key.meta) {
      const run = researchRun()
      if (run && key.name === "p") {
        key.stopPropagation()
        setResearchRun(props.mathos.pauseResearch(run.id))
        refresh()
        return
      }
      if (run && key.name === "r") {
        key.stopPropagation()
        setResearchRun(props.mathos.resumeResearch(run.id))
        refresh()
        return
      }
      if (run && key.name === "s") {
        key.stopPropagation()
        void props.mathos.stepResearch(run.id).then((next) => {
          setResearchRun(next)
          setResearchSteps(props.mathos.researchHistory(next.id))
          refresh()
        })
        return
      }
    }
    if (view() === "team" && !key.ctrl && !key.meta) {
      const overview = teamOverview()
      const id = overview?.session.id
      if (key.name === "up") {
        key.stopPropagation()
        setTeamSelected((n) => Math.max(0, n - 1))
        return
      }
      if (key.name === "down") {
        key.stopPropagation()
        setTeamSelected((n) => Math.min((overview?.agents.length ?? 1) - 1, n + 1))
        return
      }
      if (key.name === "return") {
        key.stopPropagation()
        setTeamDetailOn(true)
        return
      }
      if (key.name === "escape" && teamDetailOn()) {
        key.stopPropagation()
        setTeamDetailOn(false)
        return
      }
      if (id && key.name === "s") {
        key.stopPropagation()
        void props.mathos.stepTeam(id).then((session) => { setTeamOverview(props.mathos.teamOverview(session.id)); refresh() })
        return
      }
      if (id && key.name === "p") { key.stopPropagation(); props.mathos.pauseTeam(id); setTeamOverview(props.mathos.teamOverview(id)); refresh(); return }
      if (id && key.name === "r") { key.stopPropagation(); props.mathos.resumeTeam(id); setTeamOverview(props.mathos.teamOverview(id)); refresh(); return }
      if (id && key.name === "i") { key.stopPropagation(); showToast(props.mathos.teamImports(id).map((item) => `${item.id} ${item.status}`).join(" · ") || "No imports", "info"); return }
      if (id && key.name === "v") { key.stopPropagation(); showToast(props.mathos.teamSolutions(id).map((item) => item.claimId).join(" · ") || "No solutions", "info"); return }
    }
    if (view() === "graph" && !key.ctrl && !key.meta) {
      const current = graphView()
      if (current) {
        if (current.searchOn) {
          if (key.name === "escape") { key.stopPropagation(); setGraphView({ ...current, searchOn: false }); return }
          if (key.name === "return") {
            key.stopPropagation()
            const hit = current.graph.nodes.find((node) => `${node.id} ${node.label}`.toLowerCase().includes(current.query.toLowerCase()))
            if (hit) setGraphView({ ...current, focusId: hit.id, selectedId: hit.id, searchOn: false, detailOn: false })
            return
          }
          if (key.name === "backspace") { key.stopPropagation(); setGraphView({ ...current, query: current.query.slice(0, -1) }); return }
          if (key.sequence && key.sequence.length === 1 && !key.ctrl) { key.stopPropagation(); setGraphView({ ...current, query: current.query + key.sequence }); return }
          return
        }
        const nodes = visibleExplorerNodes(current.graph, { focusId: current.focusId, selectedId: current.selectedId, depth: 2, filter: current.filter, query: current.query })
        if (key.sequence === "/") { key.stopPropagation(); setGraphView({ ...current, searchOn: true, query: "" }); return }
        if (key.sequence === "a") { key.stopPropagation(); setGraphView({ ...current, filter: "all" }); return }
        if (key.sequence === "p") { key.stopPropagation(); setGraphView({ ...current, filter: "proof" }); return }
        if (key.sequence === "b") { key.stopPropagation(); setGraphView({ ...current, filter: "blockers" }); return }
        if (key.sequence === "v") { key.stopPropagation(); setGraphView({ ...current, filter: "verified" }); return }
        if (key.sequence === "l") { key.stopPropagation(); setGraphView({ ...current, filter: "branch-local" }); return }
        if (key.name === "up" || key.name === "down") {
          key.stopPropagation()
          const index = Math.max(0, nodes.findIndex((node) => node.id === current.selectedId))
          const next = nodes[Math.min(nodes.length - 1, Math.max(0, index + (key.name === "down" ? 1 : -1)))]
          if (next) setGraphView({ ...current, selectedId: next.id })
          return
        }
        if (key.name === "return") {
          key.stopPropagation()
          const selected = current.selectedId
          if (selected && /^[TCLDK]-/.test(selected)) {
            handleOpenClaim(selected)
            return
          }
          setGraphView({ ...current, detailOn: true, focusId: current.selectedId ?? current.focusId })
          return
        }
        if (key.name === "escape" && current.detailOn) { key.stopPropagation(); setGraphView({ ...current, detailOn: false }); return }
        if (key.name === "left") {
          key.stopPropagation()
          const parent = current.graph.edges.find((edge) => edge.kind === "DEPENDS_ON" && edge.toNodeId === current.selectedId)?.fromNodeId
          if (parent) setGraphView({ ...current, selectedId: parent, focusId: parent })
          return
        }
      }
    }
    const command = resolveCommand(key)
    if (command === "quit") {
      key.stopPropagation()
      renderer.destroy()
      return
    }
    if (command === "palette" && !overlayOpen()) {
      key.stopPropagation()
      setPaletteOpen(true)
      return
    }
    if (command === "escape" && view() === "analyzing") {
      key.stopPropagation()
      intakeAbort?.abort()
      openHome()
    }
    if (command === "escape" && view() === "proving") {
      key.stopPropagation()
      proveAbort?.abort()
      openHome()
    }
    if (command === "escape" && paletteOpen()) {
      key.stopPropagation()
      setPaletteOpen(false)
    }
  })

  const mode = () => layoutMode(width())
  const sidebarWidth = () => width() < 140 ? 34 : 40
  const showSidebar = () => mode() !== "compact" && width() >= 100 && height() >= 36
  const compactDashboard = () => mode() === "compact" || width() < 115 || height() < 36

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme.background}>
      <Header status={status()} compact={mode() === "compact"} />
      <box flexGrow={1} flexDirection="row">
      <MainPanel
          view={view()}
          status={status()}
          doctor={doctor()}
          help={HELP_TEXT}
          claims={claims()}
          detail={detail()}
          claimDraft={claimDraft()}
          researchDraft={researchDraft()}
          pendingObjectiveId={pendingObjectiveId()}
          onCreateClaim={handleCreateClaim}
          onCancelOverlay={() => {
            if (view() === "claim-detail") {
              setView("claims")
              return
            }
            if (view() === "intake-edit") {
              setView("research-draft")
              return
            }
            if (view() === "theorem-detail") {
              setView("search")
              return
            }
            openHome()
          }}
          onOpenClaim={handleOpenClaim}
          onSetObjective={handleSetObjective}
          onConfirmIntake={handleConfirmIntake}
          onEditIntake={() => setView(view() === "intake-edit" ? "research-draft" : "intake-edit")}
          onSaveIntakeEdit={handleSaveIntakeEdit}
          onAcceptObjective={() => {
            const id = pendingObjectiveId()
            if (id) handleSetObjective(id)
            setPendingObjectiveId(null)
            setResearchDraft(null)
          }}
          onDeclineObjective={() => {
            setPendingObjectiveId(null)
            setResearchDraft(null)
            setView("home")
          }}
          formalSession={formalSession()}
          formalStatement={formalStatement()}
          formalFidelity={formalFidelity()}
          formalClaimId={formalClaimId()}
          onSelectFormalize={(id) => {
            void startFormalize(id)
          }}
          onApproveFormal={() => {
            const session = formalSession()
            if (!session) return
            try {
              const approved = props.mathos.approveFormal(session.formalStatement.id)
              refresh()
              setFormalStatement(approved)
              setFormalFidelity(props.mathos.getFidelity(approved.id))
              setView("formal-view")
              showToast("HUMAN APPROVED — claim is FORMALIZED_UNVERIFIED", "success")
            } catch (error) {
              showToast(formatUserError(error), "error")
            }
          }}
          onRejectFormal={() => {
            const session = formalSession()
            if (!session) return
            try {
              props.mathos.rejectFormal(session.formalStatement.id)
              refresh()
              setView("home")
              showToast("Formalization rejected", "info")
            } catch (error) {
              showToast(formatUserError(error), "error")
            }
          }}
          proofSession={proofSession()}
          proofAttempts={proofAttempts()}
          verification={verification()}
          onSelectProve={(id) => {
            void startProve(id)
          }}
          searchTitle={searchTitle()}
          searchCandidates={searchCandidates()}
          selectedTheorem={selectedTheorem()}
          indexText={indexText()}
          onOpenTheorem={(name) => {
            const found = searchCandidates().find((item) => item.declaration.name === name) ?? null
            setSelectedTheorem(found)
            if (found) setView("theorem-detail")
          }}
          branches={props.mathos.listBranches()}
          branchDetail={branchDetail()}
          mergePreview={mergePreview()}
          onSwitchBranch={(id) => {
            props.mathos.switchBranch(id)
            refresh()
            setView("home")
          }}
          researchRun={researchRun()}
          researchSteps={researchSteps()}
          teamOverview={teamOverview()}
          teamSelected={teamSelected()}
          teamDetailOn={teamDetailOn()}
          graphView={graphView()}
          productText={productText()}
          homeFormalText={currentFormalText()}
          contextItems={contextItems()}
          contextConflicts={contextConflicts()}
          notebookDocument={notebookDocument()}
          notebookBlocks={notebookBlocks()}
          alignment={alignment()}
          alignmentFindings={alignmentFindings()}
          portfolio={portfolio()}
          failureMemory={failureMemory()}
        solver={solver()}
        literatureDesk={literatureDesk()}
        providers={providerCenterSnapshot(providerCatalog.list().map(descriptor => ({ descriptor, policy: evaluateProviderPolicy(descriptor.id) })))}
        compact={compactDashboard()}
        />
        <Sidebar status={status()} visible={showSidebar()} width={sidebarWidth()} run={researchRun()} steps={researchSteps()} />
      </box>
      <Toast message={toast()?.message ?? null} kind={toast()?.kind} />
      <PromptInput onSubmit={handleSubmit} history={history()} inactive={overlayOpen()} />
      <StatusBar hint="Ctrl+K palette   Ctrl+R research   Ctrl+G graph   Ctrl+E experiment   Ctrl+L literature   Ctrl+H help   Ctrl+Q quit" mode={`main | ${mode()}`} />
      <CommandPalette
        open={paletteOpen()}
        onClose={() => setPaletteOpen(false)}
        onSelect={(name) => {
          setPaletteOpen(false)
          runCommand(name)
        }}
      />
    </box>
  )
}
