import { MathOS, createDemoWorkspace, experimentTrustLabels, formatInitReport, formatTypedUserError, formatConfigShow, inspectHostEnvironment } from "@mathos/core"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { formatUserError, isMathOSError } from "@mathos/shared"
import { formatBranchDetail, formatBranches, formatClaims, formatDoctor, formatMergePreview, formatResearchRun, formatStatus, HELP_TEXT } from "./format.ts"

function joinCwdBackups(): string {
  return join(process.cwd(), "backups")
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

export async function runHeadless(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      process.stdout.write(
        `${HELP_TEXT}\nAlso:\n  mathos init [name]\n  mathos status\n  mathos doctor\n  mathos events rebuild\n  mathos claim create --type conjecture --title "..." --statement "..."\n  mathos claims\n  mathos objective set C-001\n  mathos ingest --text "..." [--json]\n`,
      )
      return 0
    }

    if (command === "init") {
      const json = rest.includes("--json")
      const name = flag(rest, "--name") ?? rest.find((item) => !item.startsWith("--"))
      const created = await MathOS.init(process.cwd(), name)
      const report = formatInitReport(created.name, created.root)
      if (json) process.stdout.write(`${JSON.stringify({ root: created.root, name: created.name, report }, null, 2)}\n`)
      else process.stdout.write(`${report}\nInitialized MathOS workspace: ${created.root}\n`)
      return 0
    }

    if (command === "demo" && rest[0] === "create") {
      const created = await createDemoWorkspace(process.cwd(), flag(rest, "--name") ?? "mathos-demo")
      process.stdout.write(`Demo workspace ${created.name}\n${created.root}\n`)
      return 0
    }

    if (command === "config" && rest[0] === "show") {
      process.stdout.write(`${formatConfigShow(MathOS.tryLocate(process.cwd()) ?? process.cwd())}\n`)
      return 0
    }

    if (command === "restore") {
      const archive = rest.find((item) => !item.startsWith("--"))
      const dest = flag(rest, "--into")
      if (!archive || !dest) {
        process.stderr.write("Usage: mathos restore <backup.tgz> --into <dir>\n")
        return 1
      }
      const restored = MathOS.restore(archive, dest)
      process.stdout.write(`Restored ${restored.root}\n`)
      return 0
    }

    if (command === "version" || command === "--version") {
      process.stdout.write(`${MathOS.versionText()}\n`)
      return 0
    }

    const app = MathOS.open(process.cwd())
    try {
      if (command === "status") {
        const json = rest.includes("--json")
        const text = app.statusSummary()
        if (json) process.stdout.write(`${JSON.stringify({ text, status: app.status() }, null, 2)}\n`)
        else process.stdout.write(`${text}\n`)
        return 0
      }

      if (command === "report") {
        const format = rest.includes("--json") || flag(rest, "--format") === "json" ? "json" : "md"
        const written = app.exportReport(format)
        process.stdout.write(`${written.path}\n`)
        return 0
      }

      if (command === "ledger") {
        const id = rest.find((item) => !item.startsWith("--"))
        if (!id) {
          process.stderr.write("Usage: mathos ledger T-001 [--json]\n")
          return 1
        }
        if (rest.includes("--json")) process.stdout.write(`${JSON.stringify(app.ledger(id), null, 2)}\n`)
        else process.stdout.write(`${app.ledgerText(id)}\n`)
        return 0
      }

      if (command === "why") {
        const id = rest.find((item) => !item.startsWith("--"))
        if (!id) {
          process.stderr.write("Usage: mathos why T-001\n")
          return 1
        }
        process.stdout.write(`${app.whyClaim(id)}\n`)
        return 0
      }

      if (command === "doctor") {
        const report = await app.doctor()
        if (rest.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
        else process.stdout.write(`${formatDoctor(report)}\n`)
        return report.ok ? 0 : 1
      }

      if (command === "events" && rest[0] === "rebuild") {
        const result = app.rebuildEventProjection()
        if (rest.includes("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
        else process.stdout.write(`Event projection rebuilt: ${result.eventCount} events (${result.status})\n`)
        return result.status === "HEALTHY" ? 0 : 1
      }

      if (command === "backup" || (command === "workspace" && rest[0] === "backup")) {
        const dest = flag(rest, "--out") ?? joinCwdBackups()
        const result = app.backup(dest)
        process.stdout.write(`${result.archive}\n`)
        return 0
      }

      if (command === "diagnostics" && rest[0] === "export") {
        const dest = flag(rest, "--out") ?? process.cwd()
        process.stdout.write(`${app.exportDiagnosticsBundle(dest)}\n`)
        return 0
      }

      if (command === "formal") {
        if (rest[0] === "setup") {
          const result = await app.formalSetup()
          process.stdout.write(
            `Lean project ${result.projectRoot}\nToolchain ${result.toolchain}\nMathlib ${result.mathlib ? "yes" : "no"}\nBuild ${result.build}\n${result.detail}\n`,
          )
          return result.build === "FAIL" ? 1 : 0
        }
        process.stderr.write("Usage: mathos formal setup\n")
        return 1
      }

      if (command === "prove") {
        const id = rest.find((item) => !item.startsWith("--"))
        if (!id) {
          process.stderr.write("Usage: mathos prove C-001 [--json]\n")
          return 1
        }
        const session = await app.prove(id)
        if (rest.includes("--json")) {
          process.stdout.write(`${JSON.stringify({
            claimId: session.claimId,
            accepted: session.accepted?.id ?? null,
            attempts: session.attempts.map((item) => ({ id: item.id, status: item.status })),
            verificationPassed: session.verification?.passed ?? false,
            claimStatus: app.getClaim(session.claimId).status,
          }, null, 2)}\n`)
          return session.accepted ? 0 : 1
        }
        process.stdout.write(
          `PROOF ${session.accepted ? "KERNEL ACCEPTED" : "FAILED"}\nATTEMPTS ${session.attempts.length}\nCLAIM ${app.getClaim(session.claimId).status}\n`,
        )
        return session.accepted ? 0 : 1
      }

      if (command === "verify") {
        const id = rest.find((item) => !item.startsWith("--"))
        if (!id) {
          process.stderr.write("Usage: mathos verify C-001 [--json]\n")
          return 1
        }
        const report = await app.verify(id)
        if (rest.includes("--json")) {
          process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
          return report.passed ? 0 : 1
        }
        process.stdout.write(
          `VERIFICATION ${report.passed ? "PASS" : "FAIL"}\nCLAIM ${report.claimStatus}\nAXIOMS ${(report.axioms.join(", ") || "none")}\n`,
        )
        return report.passed ? 0 : 1
      }

      if (command === "index") {
        if (rest[0] === "build") {
          const manifest = await app.indexBuild()
          process.stdout.write(
            `INDEX ${manifest.revision}\ndecls ${manifest.declarationCount}  mathlib ${manifest.mathlibCount}  workspace ${manifest.workspaceCount}\n`,
          )
          return 0
        }
        const info = app.indexStatus()
        const cache = info.inspectionCache
        process.stdout.write(
          info.present
            ? `HEADER INDEX\n${info.manifest?.declarationCount ?? 0} declarations${info.stale ? "  STALE" : ""}${info.reason ? `\n${info.reason}` : ""}\n\nCHANNEL INDEX\nnames          ${info.channelIndex?.names ?? 0}\nbigrams        ${info.channelIndex?.bigrams ?? 0}\ntrigrams       ${info.channelIndex?.trigrams ?? 0}\ntypes          ${info.channelIndex?.types ?? 0}\nnamespaces     ${info.channelIndex?.namespaces ?? 0}\nstructures     ${info.channelIndex?.structures ?? 0}\n\nLEAN INSPECTION CACHE\n${cache?.entries ?? 0} entries\n${cache?.valid ?? 0} valid\n${cache?.stale ?? 0} stale\n`
            : `${info.reason ?? "Premise index missing. Run mathos index build."}\n`,
        )
        return info.present ? 0 : 1
      }

      if (command === "search-theorem") {
        const json = rest.includes("--json")
        const goalIdx = rest.indexOf("--goal")
        const goalId = goalIdx >= 0 ? rest[goalIdx + 1] : undefined
        const query = rest.filter((item, i) => item !== "--json" && item !== "--goal" && !(goalIdx >= 0 && i === goalIdx + 1)).join(" ").replace(/^["']|["']$/g, "")
        const result = goalId
          ? await app.premisesForClaim(goalId)
          : await app.searchTheorems(query)
        if (!query && !goalId) {
          process.stderr.write("Usage: mathos search-theorem \"Finset card\" | --goal C-001\n")
          return 1
        }
        if (json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
          return 0
        }
        process.stdout.write(
          `THEOREM SEARCH${result.mode === "FORMAL_GOAL" ? "  (goal-aware)" : ""}\n${result.candidates.map((item, i) => `${i + 1}. ${item.declaration.name}\n   ${item.declaration.module ?? item.declaration.origin}`).join("\n")}\n`,
        )
        return 0
      }

      if (command === "premises") {
        const id = rest.find((item) => !item.startsWith("--"))
        if (!id) {
          process.stderr.write("Usage: mathos premises C-001 [--explain]\n")
          return 1
        }
        const result = await app.premisesForClaim(id)
        const explain = rest.includes("--explain")
        const { explainCandidate } = await import("@mathos/retrieval")
        if (result.warning) process.stdout.write(`${result.warning}\n\n`)
        process.stdout.write(
          `PREMISES FOR ${id}${result.mode === "FORMAL_GOAL" ? `\nGoal-aware · ${result.enrichment === "LEAN_ELABORATED" ? "Lean enriched" : "header index"}\n` : "\n"}${result.candidates
            .map((item, i) => {
              const head = `${i + 1}. ${item.declaration.name}  ${item.score.toFixed(2)}`
              if (!explain) return `${head}  ${item.declaration.origin}`
              return `${head}\n${explainCandidate(item).map((line) => `   ${line}`).join("\n")}`
            })
            .join("\n")}\n`,
        )
        return 0
      }

      if (command === "formalize") {
        const id = rest.find((item) => !item.startsWith("--"))
        if (!id) {
          process.stderr.write("Usage: mathos formalize C-001 [--json]\n")
          return 1
        }
        const session = await app.formalize(id)
        if (rest.includes("--json")) {
          process.stdout.write(`${JSON.stringify({
            claimId: session.claimId,
            formalId: session.formalStatement.id,
            lean: session.check.result,
            fidelity: session.fidelity?.verdict,
            claimStatus: app.getClaim(session.claimId).status,
            proofAttempted: false,
          }, null, 2)}\n`)
          return 0
        }
        process.stdout.write(
          `FORMALIZATION DRAFT ${session.formalStatement.id}\nLEAN ${session.check.result}\nFIDELITY ${session.fidelity?.verdict ?? "—"}\nPROOF NOT ATTEMPTED\nClaim remains ${app.getClaim(session.claimId).status}\n`,
        )
        return 0
      }

      if (command === "ingest") {
        const text = flag(rest, "--text") ?? rest.filter((item) => item !== "--json" && item !== "--create").join(" ")
        if (!text) {
          process.stderr.write("Usage: mathos ingest --text \"...\" [--json]\n")
          return 1
        }
        const draft = await app.ingest(text)
        if (rest.includes("--create")) {
          const created = app.confirmIntake(draft)
          process.stdout.write(`Created ${created.id}  ${created.status}  ${created.title}\n`)
          return 0
        }
        if (rest.includes("--json")) {
          process.stdout.write(`${JSON.stringify(draft, null, 2)}\n`)
          return 0
        }
        const { formatDraft } = await import("./format-draft.ts")
        process.stdout.write(`${formatDraft(draft)}\n`)
        return 0
      }

      if (command === "claims") {
        process.stdout.write(`${formatClaims(app.listClaims())}\n`)
        return 0
      }

      if (command === "claim") {
        const sub = rest[0]
        if (sub === "create") {
          const type = flag(rest, "--type")
          const title = flag(rest, "--title")
          const statement = flag(rest, "--statement")
          const asObjective = rest.includes("--objective")
          const created = app.createClaim({
            kind: type ?? "conjecture",
            title: title ?? "",
            statement: statement ?? "",
            asMainObjective: asObjective,
          })
          process.stdout.write(`Created ${created.id}  ${created.status}  ${created.title}\n`)
          return 0
        }
        if (sub === "show" && rest[1]) {
          process.stdout.write(`${app.claimPage(rest[1])}\n`)
          return 0
        }
        process.stderr.write("Usage: mathos claim create --type <kind> --title <title> --statement <text>\n")
        return 1
      }

      if (command === "objective") {
        if (rest[0] === "set" && rest[1]) {
          const claim = app.setMainObjective(rest[1])
          process.stdout.write(`Main objective: ${claim.id}  ${claim.title}\n`)
          return 0
        }
        process.stderr.write("Usage: mathos objective set <CLAIM-ID>\n")
        return 1
      }

      if (command === "branch") {
        const json = rest.includes("--json")
        const sub = rest.find((item) => !item.startsWith("--"))
        if (sub === "setup") {
          const status = await app.setupResearchVersioning()
          process.stdout.write(`Research versioning ${status.initialized ? "ready" : "failed"}  ${status.root ?? ""}\n`)
          return status.initialized ? 0 : 1
        }
        if (sub === "list" || !sub) {
          const rows = app.listBranches()
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${formatBranches(rows)}\n`)
          return 0
        }
        if (sub === "create") {
          const name = rest.filter((item) => item !== "create" && item !== "--json").join(" ").replace(/^["']|["']$/g, "")
          if (!name) {
            process.stderr.write("Usage: mathos branch create \"contradiction approach\"\n")
            return 1
          }
          const created = await app.createBranch(name)
          process.stdout.write(json ? `${JSON.stringify(created, null, 2)}\n` : `Created ${created.id}  ${created.name}\n`)
          return 0
        }
        if (sub === "show" && rest[1]) {
          const detail = app.branchDetail(rest[1])
          process.stdout.write(json ? `${JSON.stringify(detail, null, 2)}\n` : `${formatBranchDetail(detail)}\n`)
          return 0
        }
        if (sub === "switch" && rest[1]) {
          const branch = app.switchBranch(rest[1])
          process.stdout.write(`Switched to ${branch.id}  ${branch.name}\n`)
          return 0
        }
        if (sub === "pause" && rest[1]) {
          const branch = app.pauseBranch(rest[1])
          process.stdout.write(`Paused ${branch.id}\n`)
          return 0
        }
        if (sub === "resume" && rest[1]) {
          const branch = app.resumeBranch(rest[1])
          process.stdout.write(`Resumed ${branch.id}\n`)
          return 0
        }
        if (sub === "abandon" && rest[1]) {
          const branch = app.abandonBranch(rest[1])
          process.stdout.write(`Abandoned ${branch.id}\n`)
          return 0
        }
        if (sub === "merge" && rest[1]) {
          const preview = rest.includes("--apply") ? app.mergeBranch(rest[1], { applySafe: true }) : app.previewMerge(rest[1])
          process.stdout.write(json ? `${JSON.stringify(preview, null, 2)}\n` : `${formatMergePreview(preview)}\n`)
          return preview.conflicts ? 1 : 0
        }
        process.stderr.write("Usage: mathos branch list|create|show|switch|pause|resume|abandon|merge|setup\n")
        return 1
      }

      if (command === "research") {
        const json = rest.includes("--json")
        const sub = rest.find((item) => !item.startsWith("--"))
        if (sub === "start") {
          const run = app.startResearch()
          process.stdout.write(json ? `${JSON.stringify(run, null, 2)}\n` : `Started ${run.id} on ${run.branchId}\n`)
          return 0
        }
        if (sub === "status" && rest[1]) {
          const run = app.getResearch(rest[1])
          process.stdout.write(json ? `${JSON.stringify(run, null, 2)}\n` : `${formatResearchRun(run, app.researchHistory(run.id))}\n`)
          return 0
        }
        if (sub === "progress") {
          process.stdout.write(`${app.researchProgress(rest[1])}\n`)
          return 0
        }
        if (sub === "context") {
          const ctx = app.researchContext(rest[1])
          process.stdout.write(json ? `${JSON.stringify(ctx.summary, null, 2)}\n` : `${ctx.text}\n`)
          return 0
        }
        if (sub === "pause" && rest[1]) {
          process.stdout.write(`Paused ${app.pauseResearch(rest[1]).id}\n`)
          return 0
        }
        if (sub === "resume" && rest[1]) {
          process.stdout.write(`Resumed ${app.resumeResearch(rest[1]).id}\n`)
          return 0
        }
        if (sub === "step" && rest[1]) {
          const run = await app.stepResearch(rest[1])
          process.stdout.write(json ? `${JSON.stringify(run, null, 2)}\n` : `${formatResearchRun(run, app.researchHistory(run.id))}\n`)
          return 0
        }
        if ((sub === "run" || sub === "start-run") && rest[1]) {
          const run = await app.runResearch(rest[1])
          process.stdout.write(`${formatResearchRun(run, app.researchHistory(run.id))}\n`)
          return run.status === "COMPLETED" ? 0 : 1
        }
        if (sub === "show" && rest[1]) {
          const run = app.getResearch(rest[1])
          process.stdout.write(json ? `${JSON.stringify({ run, steps: app.researchHistory(run.id) }, null, 2)}\n` : `${formatResearchRun(run, app.researchHistory(run.id))}\n`)
          return 0
        }
        if (sub === "history" && rest[1]) {
          const steps = app.researchHistory(rest[1])
          process.stdout.write(json ? `${JSON.stringify(steps, null, 2)}\n` : `${steps.map((step) => `${step.sequence} ${step.action} ${step.status}`).join("\n")}\n`)
          return 0
        }
        if (sub === "trace" && rest[1]) {
          process.stdout.write(`${app.researchTrace(rest[1])}\n`)
          return 0
        }
        if (sub === "answer" && rest[1] && rest[2]) {
          const text = rest.slice(3).join(" ")
          app.answerResearch(rest[1], rest[2], text)
          process.stdout.write(`Recorded answer for ${rest[2]}. Resume with mathos research resume ${rest[1]}\n`)
          return 0
        }
        if (sub === "doctor") {
          const report = await app.doctor()
          process.stdout.write(`${formatDoctor(report)}\n`)
          return report.ok ? 0 : 1
        }
        process.stderr.write("Usage: mathos research start|status|pause|resume|step|run|show|history|trace|answer|doctor\n")
        return 1
      }

      if (command === "team") {
        const json = rest.includes("--json")
        const sub = rest.find((item) => !item.startsWith("--"))
        if (sub === "start") {
          const execFlag = rest.find((item) => item.startsWith("--execution"))
          const execEq = rest.find((item) => item.startsWith("--execution="))
          const execIdx = rest.indexOf("--execution")
          const raw = execEq ? execEq.slice("--execution=".length) : execIdx >= 0 ? rest[execIdx + 1] : rest.includes("--parallel") ? "bounded-parallel" : "sequential"
          const executionMode = raw === "bounded-parallel" || raw === "parallel" ? "BOUNDED_PARALLEL" as const : "SEQUENTIAL" as const
          const pIdx = rest.indexOf("--parallel-workers")
          const maxParallelWorkers = pIdx >= 0 ? Number(rest[pIdx + 1]) : undefined
          const session = await app.startTeam({ executionMode, maxParallelWorkers })
          process.stdout.write(json ? `${JSON.stringify(session, null, 2)}\n` : `Started ${session.id} ${session.executionMode} parallel=${session.maxParallelWorkers} agents=${app.teamAgents(session.id).length}\n`)
          return 0
        }
        if (sub === "list") {
          const rows = app.listTeamSessions()
          process.stdout.write(rows.map((item) => `${item.id}  ${item.status}  ${item.objectiveClaimId}`).join("\n") + "\n")
          return 0
        }
        if ((sub === "status" || sub === "show") && rest[1]) {
          const overview = app.teamOverview(rest[1])
          const session = overview.session
          const verified = overview.agents.filter((row) => row.verified)
          const unverified = overview.agents.filter((row) => !row.verified)
          process.stdout.write(json ? `${JSON.stringify(overview, null, 2)}\n` : `MULTI-AGENT · ${session.id}\nExecution ${session.executionMode}\nParallel workers ${session.maxParallelWorkers}\n${session.status}\n\nVERIFIED FINDINGS\n${verified.map((row) => `${row.agent.id} ${row.agent.role} KERNEL_VERIFIED`).join("\n") || "none"}\n\nUNVERIFIED FINDINGS\n${unverified.map((row) => `${row.agent.id} ${row.agent.role} ${row.localStatus}`).join("\n") || "none"}\n`)
          return 0
        }
        if (sub === "step" && rest[1]) {
          const session = await app.stepTeam(rest[1])
          process.stdout.write(`${session.id} round ${session.currentRound} ${session.status}\n`)
          return 0
        }
        if (sub === "run" && rest[1]) {
          const session = await app.runTeam(rest[1])
          process.stdout.write(`${session.id} ${session.status} ${session.stopReason ?? ""}\n`)
          return session.status === "SOLUTION_FOUND" ? 0 : 1
        }
        if (sub === "pause" && rest[1]) { process.stdout.write(`Paused ${app.pauseTeam(rest[1]).id}\n`); return 0 }
        if (sub === "resume" && rest[1]) { process.stdout.write(`Resumed ${app.resumeTeam(rest[1]).id}\n`); return 0 }
        if (sub === "cancel" && rest[1]) { process.stdout.write(`Cancelled ${app.cancelTeam(rest[1]).id}\n`); return 0 }
        if (sub === "history" && rest[1]) {
          process.stdout.write(app.teamHistory(rest[1]).map((round) => `${round.id} ${round.status}`).join("\n") + "\n")
          return 0
        }
        if (sub === "solutions" && rest[1]) {
          const rows = app.teamSolutions(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : rows.map((item) => `${item.agentId} · ${item.branchId}  ${item.claimId}`).join("\n") + "\n")
          return 0
        }
        if (sub === "merge-preview" && rest[1] && rest[2]) {
          const preview = app.teamMergePreview(rest[1], rest[2])
          process.stdout.write(json ? `${JSON.stringify(preview, null, 2)}\n` : formatMergePreview(preview) + "\n")
          return 0
        }
        if (sub === "imports" && rest[1]) {
          process.stdout.write(json ? `${JSON.stringify(app.teamImports(rest[1]), null, 2)}\n` : app.teamImports(rest[1]).map((item) => `${item.id} ${item.status} ${item.sourceClaimId}`).join("\n") + "\n")
          return 0
        }
        if (sub === "import" && rest[1] === "show" && rest[2]) {
          process.stdout.write(`${JSON.stringify(app.previewImport(rest[2]), null, 2)}\n`)
          return 0
        }
        if (sub === "import" && rest[1] === "apply" && rest[2]) {
          const row = await app.applyImport(rest[2])
          process.stdout.write(`${row.id} ${row.status} ${row.failureCode ?? ""}\n`)
          return row.status === "APPLIED" ? 0 : 1
        }
        if (sub === "import" && rest[1] === "reject" && rest[2]) {
          process.stdout.write(`${app.rejectImport(rest[2]).id} REJECTED\n`)
          return 0
        }
        process.stderr.write("Usage: mathos team start|list|status|show|step|run|pause|resume|cancel|history|solutions|merge-preview|imports\n")
        return 1
      }

      if (command === "graph") {
        const json = rest.includes("--json")
        const formatFlag = rest.includes("--format") ? rest[rest.indexOf("--format") + 1] : rest.find((item) => item.startsWith("--format="))?.split("=")[1]
        const format = json ? "json" as const : formatFlag === "dot" ? "dot" as const : formatFlag === "mermaid" ? "mermaid" as const : "text" as const
        const depthIdx = rest.indexOf("--depth")
        const depth = depthIdx >= 0 ? Number(rest[depthIdx + 1]) : 2
        const sub = rest.find((item) => !item.startsWith("--"))
        if (!sub || sub === "show") {
          const focus = rest.filter((item) => !item.startsWith("--") && item !== "show")[0]
          process.stdout.write(app.graphShow(focus, { format, depth }))
          if (format === "text") process.stdout.write("\n")
          return 0
        }
        if (sub === "dependencies" && rest[1]) {
          const rows = app.graphDependencies(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.join("\n")}\n`)
          return 0
        }
        if (sub === "dependents" && rest[1]) {
          const rows = app.graphDependents(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.join("\n")}\n`)
          return 0
        }
        if (sub === "blockers" && rest[1]) {
          const rows = app.graphBlockers(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.join("\n")}\n`)
          return 0
        }
        if (sub === "path" && rest[1] && rest[2]) {
          const path = app.graphPath(rest[1], rest[2])
          process.stdout.write(json ? `${JSON.stringify(path, null, 2)}\n` : `${(path ?? []).join(" → ")}\n`)
          return path ? 0 : 1
        }
        if (sub === "compare" && rest[1] && rest[2]) {
          const cmp = app.graphCompare(rest[1], rest[2])
          process.stdout.write(`${JSON.stringify(cmp, null, 2)}\n`)
          return 0
        }
        if (sub === "team" && rest[1]) {
          process.stdout.write(app.graphShow(undefined, { format, depth, teamSessionId: rest[1], proofOnly: false }))
          if (format === "text") process.stdout.write("\n")
          return 0
        }
        if (sub === "frontier") {
          const out = app.graphFrontier(rest[1])
          process.stdout.write(json ? `${JSON.stringify(out.summary, null, 2)}\n` : `${out.text}\n`)
          return 0
        }
        if (sub === "blocking-chain" && rest[1]) {
          const rows = app.graphBlockingChain(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((item) => item.chain.join(" → ")).join("\n")}\n`)
          return 0
        }
        if (sub === "support" && rest[1]) {
          const rows = app.graphSupport(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((item) => `${item.id} ${item.status}`).join("\n")}\n`)
          return 0
        }
        if (sub === "unresolved" && rest[1]) {
          const rows = app.graphUnresolved(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((item) => `${item.id} ${item.status}`).join("\n")}\n`)
          return 0
        }
        process.stderr.write("Usage: mathos graph show [ID] | dependencies ID | dependents ID | blockers ID | path FROM TO | compare B1 B2 | team MR-001 | frontier | blocking-chain | support | unresolved\n")
        return 1
      }

      if (command === "experiment") {
        const json = rest.includes("--json")
        const sub = rest.find((item) => !item.startsWith("--"))
        if (sub === "create") {
          const claim = flag(rest, "--claim")
          const kind = flag(rest, "--kind")
          const file = flag(rest, "--file")
          const code = file ? readFileSync(file, "utf8") : undefined
          const experiment = await app.createExperiment({ kind, claimId: claim, code, parameters: { property: flag(rest, "--property"), domainStart: flag(rest, "--from"), domainEnd: flag(rest, "--to") } })
          process.stdout.write(json ? `${JSON.stringify(experiment, null, 2)}\n` : `Created ${experiment.id}\n`)
          return 0
        }
        if (sub === "list") {
          const rows = app.listExperiments()
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((item) => `${item.id} ${item.kind} ${item.status} · ${experimentTrustLabels(item).join(" · ")}`).join("\n")}\n`)
          return 0
        }
        if (sub === "show" && rest[1]) {
          process.stdout.write(json ? `${JSON.stringify({ experiment: app.getExperiment(rest[1]), results: app.experimentResults(rest[1]) }, null, 2)}\n` : `${app.formatExperiment(rest[1])}\n`)
          return 0
        }
        if ((sub === "run" || sub === "rerun") && rest[1]) {
          const result = sub === "rerun" ? await app.rerunExperiment(rest[1]) : await app.runExperiment(rest[1])
          const experiment = app.getExperiment(result.experimentId)
          process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${result.id} ${result.outcome}\n${experimentTrustLabels(experiment).join(" · ")}\n`)
          return result.outcome === "EXECUTION_FAILED" ? 1 : 0
        }
        if (sub === "results" && rest[1]) {
          const rows = app.experimentResults(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `${rows.map((item) => `${item.id} ${item.outcome}`).join("\n")}\n`)
          return 0
        }
        process.stderr.write("Usage: mathos experiment create|list|show|run|rerun|results\n")
        return 1
      }

      if (command === "literature" || command === "source" || command === "citation" || command === "external") {
        const json = rest.includes("--json")
        const sub = rest.find((item) => !item.startsWith("--") && !item.startsWith("\""))
        if (command === "literature" && sub === "search") {
          const query = rest.filter((item) => item !== "search" && item !== "--json").join(" ").replace(/^"|"$/g, "")
          const search = await app.searchLiterature(query)
          const hits = app.literatureHits(search.id)
          process.stdout.write(json ? `${JSON.stringify({ search, hits }, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${hits.map((hit, i) => `${i}. ${hit.title} (${hit.year ?? "?"})`).join("\n")}\n`)
          return 0
        }
        if (command === "source" && sub === "list") {
          const rows = app.listSources()
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${rows.map((item) => `${item.id} ${item.title}`).join("\n")}\n`)
          return 0
        }
        if (command === "source" && sub === "show" && rest[1]) {
          process.stdout.write(json ? `${JSON.stringify(app.getSource(rest[1]), null, 2)}\n` : `${app.formatSource(rest[1])}\n`)
          return 0
        }
        if (command === "source" && sub === "import" && rest[1] && rest[2]) {
          const source = await app.importSearchResult(rest[1], Number(rest[2]))
          process.stdout.write(json ? `${JSON.stringify(source, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\nImported ${source.id}\n`)
          return 0
        }
        if (command === "source" && sub === "add" && rest[1]) {
          const source = app.addLocalSource(rest[1])
          process.stdout.write(json ? `${JSON.stringify(source, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\nAdded ${source.id}\n`)
          return 0
        }
        if (command === "source" && sub === "excerpts" && rest[1]) {
          const rows = app.listExcerpts(rest[1])
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${rows.map((item) => `${item.id} ${item.textHash.slice(0, 8)}`).join("\n")}\n`)
          return 0
        }
        if (command === "source" && sub === "inspect" && rest[1]) {
          const source = app.inspectSource(rest[1])
          process.stdout.write(json ? `${JSON.stringify(source, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${source.id} ${source.status}\n`)
          return 0
        }
        if (command === "citation" && sub === "list") {
          const rows = app.listCitations()
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${rows.map((item) => `${item.id} ${item.purpose} ${item.sourceId}`).join("\n")}\n`)
          return 0
        }
        if (command === "citation" && sub === "show" && rest[1]) {
          const citation = app.getCitation(rest[1])
          process.stdout.write(json ? `${JSON.stringify(citation, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${citation.id} ${citation.purpose} ${citation.sourceId}\n`)
          return 0
        }
        if (command === "external" && sub === "list") {
          const rows = app.listExternal()
          process.stdout.write(json ? `${JSON.stringify(rows, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${rows.map((item) => `${item.id} ${item.status}`).join("\n")}\n`)
          return 0
        }
        if (command === "external" && sub === "show" && rest[1]) {
          const external = app.getExternal(rest[1])
          process.stdout.write(json ? `${JSON.stringify(external, null, 2)}\n` : `EXTERNAL SOURCE\nNOT A PROOF\n${external.id} ${external.status}\n`)
          return 0
        }
        process.stderr.write("Usage: mathos literature search | source list|show|import|add|excerpts|inspect | citation list|show | external list|show\n")
        return 1
      }

      process.stderr.write(`Unknown command: ${command}\n`)
      return 1
    } finally {
      app.close()
    }
  } catch (error) {
    process.stderr.write(`${formatTypedUserError(error).text}\n`)
    return isMathOSError(error) ? 1 : 2
  }
}
