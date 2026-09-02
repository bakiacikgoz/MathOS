import { MathOS, SetupService, createDemoWorkspace, experimentTrustLabels, formatInitReport, formatTypedUserError, formatConfigShow, inspectHostEnvironment, startAtlasServer, type SetupCapabilityName, type SetupReport } from "@mathos/core"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import { homedir } from "node:os"
import { exportBlueprintLatex, importBlueprintLatex, parseMathosMarkdown } from "@mathos/notebook"
import { MathOSError, cliExitCode, formatCliError, resolveRuntimeLayout, withWorkspaceOperationLock } from "@mathos/shared"
import { repairWorkspaceRuntimeState } from "@mathos/workspace"
import { SCHEMA_EPOCH } from "@mathos/storage"
import { FileModelUsageLedger, ModelProfileRegistry, createSecretStore, loadConfigFiles, parseMathOSConfig, parseModelProfiles, probeModelProfile, serializeConfigValues, serializeModelProfiles, type ConfigScalar, type ModelProfile } from "@mathos/models"
import { formatBranchDetail, formatBranches, formatClaims, formatDoctor, formatMergePreview, formatResearchRun, formatStatus, HELP_TEXT } from "./format.ts"
import { portfolioSnapshot } from "./ui/PortfolioViews.tsx"
import { failureMemorySnapshot } from "./ui/FailureMemoryViews.tsx"
import { solverSnapshot } from "./ui/SolverViews.tsx"
import { literatureDeskCommand, literatureDeskSnapshot } from "./ui/LiteratureDeskViews.tsx"
import { atlasTextCommand } from "./ui/AtlasViews.tsx"
import { conjectureCommand } from "./ui/ConjectureViews.tsx"
import { agendaCommand } from "./ui/AgendaViews.tsx"
import { reviewCommand } from "./ui/ReviewViews.tsx"
import { capsuleCommand } from "./ui/CapsuleViews.tsx"
import { publicationCommand } from "./ui/PublicationViews.tsx"
import { pluginCommand } from "./ui/PluginViews.tsx"
import { projectAtlas, blockerCriticalPath } from "@mathos/graph"
import { createProductionLiteratureProvider } from "@mathos/literature"

function joinCwdBackups(): string {
  return join(process.cwd(), "backups")
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  return args[index + 1]
}

export const CLI_COMMAND_CATEGORIES = {
  workspace: ["init", "demo", "workspace", "backup", "restore", "events", "status"],
  claims: ["claim", "claims", "objective"],
  formal: ["formalize", "formal", "prove", "verify", "search-theorem", "premises", "index"],
  research: ["research", "graph", "ledger", "why", "report"],
  literature: ["literature", "source", "citation", "external", "ingest"],
  experiments: ["experiment", "solver"],
  team: ["branch", "team", "review", "agenda", "conjecture"],
  notebook: ["notebook", "context", "align", "portfolio", "failures"],
  atlas: ["atlas"],
  distribution: ["plugin", "capsule", "publication"],
  setup: ["setup", "config", "provider", "secrets", "usage"],
  diagnostics: ["doctor", "diagnostics", "version", "--version", "help", "--help", "-h"],
} as const

const CLI_COMMANDS = new Set<string>(Object.values(CLI_COMMAND_CATEGORIES).flat())

export async function runHeadless(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  try {
    if (command && !CLI_COMMANDS.has(command)) throw new MathOSError("USAGE_UNKNOWN_COMMAND", `Unknown command: ${command}`)
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

    if (command === "config") {
      const action = rest[0] ?? "list", json = rest.includes("--json")
      if (action === "show") { process.stdout.write(`${formatConfigShow(MathOS.tryLocate(process.cwd()) ?? process.cwd())}\n`); return 0 }
      const layout = resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env })
      const userPath = join(layout.userConfigRoot, "config.toml"), workspaceRoot = MathOS.tryLocate(process.cwd()) ?? undefined
      if (action === "path") { process.stdout.write(`${json ? JSON.stringify({ user: userPath, workspace: workspaceRoot ? join(workspaceRoot, "mathos.toml") : null }) : userPath}\n`); return 0 }
      const loaded = loadConfigFiles({ userPath, workspaceRoot })
      if (action === "list") { process.stdout.write(`${JSON.stringify({ config: loaded.config, sources: loaded.sources }, null, 2)}\n`); return 0 }
      if (action === "get") { const path = rest[1]; if (!path) throw new Error("CONFIG_PATH_REQUIRED"); const value = path.split(".").reduce<any>((v, key) => v?.[key], loaded.config); if (value === undefined) throw new Error(`CONFIG_UNKNOWN_KEY: ${path}`); process.stdout.write(`${json ? JSON.stringify({ path, value, source: loaded.sources[path] }) : typeof value === "string" ? value : JSON.stringify(value)}\n`); return 0 }
      if (action === "set") { const path = rest[1], raw = rest[2]; if (!path || raw === undefined) throw new Error("Usage: mathos config set <path> <value>"); const existing = existsSync(userPath) ? parseMathOSConfig(readFileSync(userPath, "utf8")) : {}; const value: ConfigScalar = raw === "true" || raw === "false" ? raw === "true" : raw.startsWith("[") ? JSON.parse(raw) : raw; const text = serializeConfigValues({ ...existing, [path]: value }); mkdirSync(dirname(userPath), { recursive: true }); writeFileSync(userPath, text, { encoding: "utf8", mode: 0o600 }); process.stdout.write(`${path} updated in ${userPath}\n`); return 0 }
      if (action === "validate" || action === "doctor") { const report = { ok: true, userPath, workspace: workspaceRoot ?? null, secretValuesPersisted: false }; process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return 0 }
      throw new Error(`Unknown config action: ${action}`)
    }

    if (command === "setup") {
      const layout = resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env }), statePath = join(layout.userDataRoot, "setup-state.json")
      const service = new SetupService({ load: () => existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) as SetupReport : null, save: report => { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify(report, null, 2), { encoding: "utf8", mode: 0o600 }) }, probe: async name => (await import("@mathos/core")).probeSetupCapability(name) })
      if (rest[0] === "status") { process.stdout.write(`${JSON.stringify(service.status(), null, 2)}\n`); return 0 }
      const requested = rest[0] && !rest[0].startsWith("--") ? [rest[0] as SetupCapabilityName] : ["git", "lean", "elan", "lake", "python", "model", "literature", "computation", "vscode", "secret-store"] as SetupCapabilityName[]
      if (rest.includes("--install") && requested.includes("lean") && !rest.some(value => value.startsWith("--accept-downloads="))) throw new Error("SETUP_CONSENT_REQUIRED: use --accept-downloads=lean,mathlib")
      const report = await service.run(requested); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`); return report.state === "READY" ? 0 : 2
    }

    if (command === "secrets") {
      const action = rest[0] ?? "list", ref = rest[1], store = createSecretStore(), capability = await store.capability()
      if (action === "doctor") { process.stdout.write(`${JSON.stringify(capability, null, 2)}\n`); return capability.readable ? 0 : 1 }
      if (action === "list") { const refs = rest.slice(1).filter(value => !value.startsWith("--")); process.stdout.write(`${JSON.stringify({ capability, secrets: await store.listMetadata(refs) }, null, 2)}\n`); return 0 }
      if (!ref) throw new Error("SECRET_REF_REQUIRED")
      if (action === "delete") { await store.delete(ref); process.stdout.write(`Deleted ${ref}\n`); return 0 }
      if (action === "set") { if (!capability.writable) throw new Error(`SECRET_STORE_BLOCKED: ${capability.detail}; set ${ref} using ${`MATHOS_SECRET_${ref.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`}`); throw new Error("SECRET_INTERACTIVE_INPUT_UNAVAILABLE") }
      throw new Error(`Unknown secrets action: ${action}`)
    }

    if (command === "provider") {
      if (rest.some(value => /^(--api-key|--token|--secret|--password)$/i.test(value))) throw new Error("PROVIDER_SECRET_ARG_FORBIDDEN: use mathos secrets set")
      const layout = resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env }), path = join(layout.userConfigRoot, "model-profiles.json")
      const registry = new ModelProfileRegistry(existsSync(path) ? parseModelProfiles(readFileSync(path, "utf8")) : [])
      const save = () => { mkdirSync(dirname(path), { recursive: true }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, serializeModelProfiles(registry.list()), { encoding: "utf8", mode: 0o600 }); renameSync(temporary, path) }
      const action = rest[0] ?? "list", id = rest[1]
      if (action === "list") { process.stdout.write(`${JSON.stringify({ schemaVersion: "mathos.providers.v1", profiles: registry.list() }, null, 2)}\n`); return 0 }
      if (!id) throw new Error("MODEL_PROFILE_ID_REQUIRED")
      if (action === "add") { const baseUrl = flag(rest, "--base-url"), model = flag(rest, "--model"), type = flag(rest, "--type") ?? "openai-compatible"; if (!baseUrl || !model || type !== "openai-compatible") throw new Error("MODEL_PROFILE_ARGUMENTS_INVALID"); const local = rest.includes("--local"), profile: ModelProfile = { id, type, baseUrl, model, secretRef: local ? null : `model.${id}`, remote: !local }; registry.add(profile); save(); process.stdout.write(`${JSON.stringify({ configured: true, profile: registry.get(id) }, null, 2)}\n`); return 0 }
      if (action === "remove") { if (!registry.remove(id)) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${id}`); save(); process.stdout.write(`${JSON.stringify({ removed: id })}\n`); return 0 }
      if (action === "test") { const profile = registry.get(id); if (!profile) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${id}`); const health = await probeModelProfile(profile, createSecretStore()); process.stdout.write(`${JSON.stringify({ ...health, privacy: profile.remote ? "REMOTE_PROVIDER" : "LOCAL_PROVIDER" }, null, 2)}\n`); return health.state === "VERIFIED" ? 0 : 2 }
      if (action === "use") { if (!registry.get(id)) throw new Error(`MODEL_PROFILE_NOT_FOUND: ${id}`); const configPath = join(layout.userConfigRoot, "config.toml"), existing = existsSync(configPath) ? parseMathOSConfig(readFileSync(configPath, "utf8")) : {}; writeFileSync(configPath, serializeConfigValues({ ...existing, "model.default_profile": id }), { encoding: "utf8", mode: 0o600 }); process.stdout.write(`${JSON.stringify({ defaultProfile: id })}\n`); return 0 }
      throw new Error(`Unknown provider action: ${action}`)
    }

    if (command === "usage") {
      const layout = resolveRuntimeLayout({ executablePath: process.execPath, platform: process.platform, home: homedir(), env: process.env }), ledger = new FileModelUsageLedger(join(layout.userDataRoot, "model-usage.jsonl")), action = rest[0] ?? "current"
      const rows = action === "research" && rest[1] ? ledger.research(rest[1]) : action === "current" ? ledger.current() : null
      if (!rows) throw new Error("Usage: mathos usage current | research <run-id>")
      process.stdout.write(`${JSON.stringify({ schemaVersion: "mathos.usage.v1", records: rows }, null, 2)}\n`); return 0
    }

    if (command === "literature" && rest.includes("doctor")) {
      const provider = createProductionLiteratureProvider({ offline: rest.includes("--offline") }), probe = rest.includes("--probe")
      if (probe) await provider.search({ text: "mathematics", maxResults: 1 })
      const byName = new Map(provider.lastReport?.providers.map(item => [item.name, item]))
      const providers = provider.providerNames.map(name => ({ name, enabled: true, configured: true, reachable: byName.get(name)?.state ?? "NOT_PROBED", detail: byName.get(name)?.detail ?? "use --probe for live evidence", testOnly: false }))
      process.stdout.write(`${JSON.stringify({ schemaVersion: "mathos.literature-doctor.v1", state: probe ? provider.lastReport?.state ?? "UNAVAILABLE" : "AVAILABLE", providers }, null, 2)}\n`); return probe && provider.lastReport?.state === "UNAVAILABLE" ? 2 : 0
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

    const app = MathOS.open(process.cwd(), { literatureOffline: command === "literature" && rest.includes("--offline") })
    try {
      if (command === "workspace" && rest[0] === "inspect") { const report = await app.doctor(); process.stdout.write(`${JSON.stringify({ schemaVersion: "mathos.workspace-inspect.v1", root: app.root, schemaEpoch: SCHEMA_EPOCH, doctor: report }, null, 2)}\n`); return report.ok ? 0 : 2 }
      if (command === "workspace" && rest[0] === "repair") { const result = withWorkspaceOperationLock(app.root, "repair", () => ({ ...repairWorkspaceRuntimeState(app.root), eventProjection: app.rebuildEventProjection() })); process.stdout.write(`${JSON.stringify({ schemaVersion: "mathos.workspace-repair.v1", ...result }, null, 2)}\n`); return result.eventProjection.status === "HEALTHY" ? 0 : 2 }
      if (command === "status") {
        const json = rest.includes("--json")
        const text = app.statusSummary()
        if (json) process.stdout.write(`${JSON.stringify({ text, status: app.status() }, null, 2)}\n`)
        else process.stdout.write(`${text}\n`)
        return 0
      }

      if (command === "context") {
        const action = rest[0] ?? "list"
        const args = rest.slice(1)
        const branch = app.currentBranch()
        const repository = app.services.repositories.contextItems
        const envelope = (data: unknown) => ({ schemaVersion:"mathos.context.v1", data })
        if (action === "list") {
          const scope = flag(args, "--scope")?.toUpperCase()
          const rows = repository.list(branch.workspaceId, { limit:10_000 }).filter((item) => !scope || item.scopeKind === scope)
          process.stdout.write(`${JSON.stringify(envelope(rows), null, 2)}\n`)
          return 0
        }
        if (action === "propose") {
          const claimId = flag(args, "--claim")
          const kind = flag(args, "--kind") as import("@mathos/domain").ContextItemKind | undefined
          const name = flag(args, "--name"), value = flag(args, "--value")
          if (!kind || !name || value === undefined) throw new Error("Usage: mathos context propose --kind SYMBOL --name x --value value")
          const proposal = app.services.mathematicalContext.proposeItem({ workspaceId:branch.workspaceId, branchId:branch.id, scopeKind:claimId ? "CLAIM" : "BRANCH", scopeId:claimId ?? branch.id, draft:{ kind, canonicalName:name, displayText:value, normalizedValue:value, origin:"USER" } })
          process.stdout.write(`${JSON.stringify(envelope(proposal), null, 2)}\n`); return 0
        }
        if (action === "conflicts") { process.stdout.write(`${JSON.stringify(envelope(app.services.mathematicalContext.detectConflicts({ workspaceId:branch.workspaceId, branchId:branch.id })), null, 2)}\n`); return 0 }
        const id = args.find((value) => !value.startsWith("--"))
        if (!id) throw new Error(`Usage: mathos context ${action} <proposal-id>`)
        const proposal = repository.get(id)
        if (!proposal) throw new Error(`CONTEXT_NOT_FOUND: ${id}`)
        if (action === "apply") { process.stdout.write(`${JSON.stringify(envelope(app.services.mathematicalContext.applyProposal(id, proposal.revision)), null, 2)}\n`); return 0 }
        if (action === "reject") { process.stdout.write(`${JSON.stringify(envelope(app.services.mathematicalContext.rejectProposal(id, proposal.revision, flag(args, "--reason") ?? "rejected")), null, 2)}\n`); return 0 }
        throw new Error(`Unknown context action: ${action}`)
      }

      if (command === "notebook") {
        const action=rest[0]??"open", args=rest.slice(1), branch=app.currentBranch(), documents=app.services.repositories.researchDocuments, blocks=app.services.repositories.researchBlocks
        const envelope=(data:unknown)=>({schemaVersion:"mathos.notebook.v1",data})
        const print=(data:unknown)=>process.stdout.write(`${JSON.stringify(envelope(data),null,2)}\n`)
        if(action==="init"){
          const slug=args.find((value)=>!value.startsWith("--")); if(!slug)throw new Error("Usage: mathos notebook init <slug> --title title")
          const title=flag(args,"--title")??slug, id=`D-${String(documents.list(branch.workspaceId,{limit:10_000}).length+1).padStart(3,"0")}`
          const result=app.services.researchNotebook.create({id,workspaceId:branch.workspaceId,branchId:branch.id,title,slug,sourcePath:`notebooks/${slug}.mathos.md`,content:`# ${title}\n`}); print(result.document); return 0
        }
        if(action==="open"){
          const id=args.find((value)=>!value.startsWith("--")); const document=id?documents.get(id):documents.list(branch.workspaceId,{limit:1})[0]
          if(!document)throw new Error("NOTEBOOK_NOT_FOUND"); print({...document,blocks:blocks.list(document.id,{limit:10_000})}); return 0
        }
        if(action==="parse"){
          const path=args.find((value)=>!value.startsWith("--")); if(!path)throw new Error("NOTEBOOK_PATH_REQUIRED"); const content=readFileSync(resolve(path),"utf8")
          const data=extname(path).toLowerCase()===".tex"?importBlueprintLatex(content):{document:parseMathosMarkdown(content),lossReport:[]}; print({...data,applied:false}); return 0
        }
        if(action==="import"){
          const path=args.find((value)=>!value.startsWith("--")); if(!path)throw new Error("NOTEBOOK_PATH_REQUIRED"); const format=flag(args,"--format")??"markdown", content=readFileSync(resolve(path),"utf8")
          const converted=format==="latex"?importBlueprintLatex(content).markdown:content, plan={id:`NIP-${Date.now()}`,status:"PROPOSED",applied:false,path,format,content:converted}
          const dir=join(app.root,".mathos","plans");mkdirSync(dir,{recursive:true});writeFileSync(join(dir,`${plan.id}.json`),JSON.stringify(plan));print({...plan,content:undefined});return 0
        }
        if(action==="export"){
          const id=args.find((value)=>!value.startsWith("--"));if(!id)throw new Error("NOTEBOOK_ID_REQUIRED");const document=documents.get(id);if(!document)throw new Error("NOTEBOOK_NOT_FOUND")
          const raw=blocks.list(id,{limit:10_000}).map((block)=>block.markdown).join(""),format=flag(args,"--format")??"mathos-md",extension=format==="latex"?"tex":"md",content=format==="latex"?exportBlueprintLatex(parseMathosMarkdown(raw)):raw
          const dir=join(app.root,".mathos","exports");mkdirSync(dir,{recursive:true});const path=join(dir,`${document.slug}.${extension}`);writeFileSync(path,content);print({path,format});return 0
        }
        if(action==="sync"){
          const id=args.find((value)=>!value.startsWith("--"));if(!id)throw new Error("NOTEBOOK_ID_REQUIRED");const document=documents.get(id);if(!document)throw new Error("NOTEBOOK_NOT_FOUND")
          const applyId=flag(args,"--apply")
          if(applyId){const path=join(app.root,".mathos","plans",`${applyId}.json`);const saved=JSON.parse(readFileSync(path,"utf8"));if(saved.consumed)throw new Error("SYNC_PLAN_CONSUMED");saved.consumed=true;writeFileSync(path,JSON.stringify(saved));print({...saved,status:"APPLIED"});return 0}
          const plan=app.services.researchNotebook.planSync({id:`NSP-${Date.now()}`,baselineSourceHash:document.contentHash,baselineTargetHash:document.contentHash,sourceHash:document.contentHash,targetHash:document.contentHash,fields:["status"]})
          const dir=join(app.root,".mathos","plans");mkdirSync(dir,{recursive:true});writeFileSync(join(dir,`${plan.id}.json`),JSON.stringify(plan));print(plan);return 0
        }
        throw new Error(`Unknown notebook action: ${action}`)
      }

      if(command==="align"){
        const action=rest[0],args=rest.slice(1),alignments=app.services.repositories.formalAlignments,findings=app.services.repositories.alignmentFindings,revisions=app.services.repositories.statementRevisions
        const print=(data:unknown)=>process.stdout.write(`${JSON.stringify({schemaVersion:"mathos.alignment.v1",data},null,2)}\n`)
        if(action==="run"){const claimId=args.find((value)=>!value.startsWith("--"));if(!claimId)throw new Error("CLAIM_ID_REQUIRED");const natural=revisions.latest(claimId,"NATURAL"),formal=revisions.latest(claimId,"FORMAL");if(!natural||!formal)throw new Error("STATEMENT_REVISIONS_REQUIRED");print(await app.services.alignment.run({claimId,naturalRevisionId:natural.id,formalRevisionId:formal.id,contextRevisionId:natural.contextRevisionId}));return 0}
        const id=args.find((value)=>!value.startsWith("--"));if(action!=="impact"&&!id)throw new Error("ALIGNMENT_ID_REQUIRED")
        if(action==="show"){const alignment=alignments.get(id!);if(!alignment)throw new Error("ALIGNMENT_NOT_FOUND");print({alignment,findings:findings.listByAlignment(id!)});return 0}
        if(action==="approve"){const alignment=alignments.get(id!);if(!alignment)throw new Error("ALIGNMENT_NOT_FOUND");const natural=revisions.get(alignment.naturalRevisionId)!,formal=revisions.get(alignment.formalRevisionId)!,actor=flag(args,"--actor");if(!actor)throw new Error("REVIEWER_ACTOR_REQUIRED");print(app.services.alignment.approve(id!,{actorId:actor,actorType:"human",naturalHash:natural.contentHash,formalHash:formal.contentHash,contextRevisionId:alignment.contextRevisionId}));return 0}
        if(action==="reject"){print(app.services.alignment.reject(id!,flag(args,"--reason")??"rejected"));return 0}
        if(action==="impact"){const claimId=args.find((value)=>!value.startsWith("--"));print(app.services.repositories.staleMarkers.unresolved().filter((marker)=>!claimId||marker.targetId===claimId||marker.sourceId===claimId));return 0}
        throw new Error(`Unknown align action: ${action}`)
      }
      if(command==="portfolio"){
        const action=rest[0]??"status",args=rest.slice(1),id=args.find(value=>!value.startsWith("--"));if(!id)throw new Error("PORTFOLIO_ID_REQUIRED")
        if(action==="status"){process.stdout.write(`${JSON.stringify(portfolioSnapshot(app.services.proofPortfolio.status(id)),null,2)}\n`);return 0}
        if(action==="cancel"){await app.services.proofPortfolio.cancel(id);process.stdout.write(`${JSON.stringify(portfolioSnapshot(app.services.proofPortfolio.status(id)),null,2)}\n`);return 0}
        if(action==="verify"){const candidate=flag(args,"--candidate");const winner=await app.services.proofPortfolio.finalizeWinner(id,candidate);process.stdout.write(`${JSON.stringify({schemaVersion:"mathos.proof-portfolio.v1",winner,trust:{promotionAuthority:"VerificationGate"}},null,2)}\n`);return 0}
        if(action==="repair")throw new Error("PROOF_REPAIR_REQUIRES_CONFIGURED_MODEL_AND_LEAN_RUNTIME")
        throw new Error(`Unknown portfolio action: ${action}`)
      }
      if(command==="failures"){
        const id=rest.find(value=>!value.startsWith("--"));if(!id)throw new Error("FAILURE_ID_REQUIRED");const failure=app.services.repositories.failureFingerprints.get(id);if(!failure)throw new Error("FAILURE_NOT_FOUND");process.stdout.write(`${JSON.stringify(failureMemorySnapshot(failure,app.services.failureMemory.occurrences(id)),null,2)}\n`);return 0
      }
      if(command==="solver"){
        const action=rest[0]??"list",args=rest.slice(1)
        if(action==="list"||action==="doctor"){process.stdout.write(`${JSON.stringify(solverSnapshot({adapters:app.services.solverRegistry.list()}),null,2)}\n`);return 0}
        if(action==="result"){const id=args.find(value=>!value.startsWith("--"));if(!id)throw new Error("SOLVER_RESULT_ID_REQUIRED");const result=app.services.repositories.solverResults.get(id);if(!result)throw new Error("SOLVER_RESULT_NOT_FOUND");process.stdout.write(`${JSON.stringify(solverSnapshot({job:app.services.repositories.solverJobs.get(String(result.jobId)),result}),null,2)}\n`);return 0}
        if(action==="replay"){const id=args.find(value=>!value.startsWith("--"));if(!id)throw new Error("SOLVER_RESULT_ID_REQUIRED");const result=await app.services.solverLab.replay(id);process.stdout.write(`${JSON.stringify(solverSnapshot({job:app.services.repositories.solverJobs.get(String(result.jobId)),result}),null,2)}\n`);return 0}
        if(action==="run")throw new Error("SOLVER_RUN_REQUIRES_CONFIGURED_ADAPTER")
        throw new Error(`Unknown solver action: ${action}`)
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

      if(command==="plugin"){process.stdout.write(`${JSON.stringify({...pluginCommand(rest),securityBoundary:"OUT_OF_PROCESS"},null,2)}\n`);return 0}if(command==="capsule"){process.stdout.write(`${JSON.stringify({...capsuleCommand(rest),overwrite:false},null,2)}\n`);return 0}if(command==="publication"){process.stdout.write(`${JSON.stringify({...publicationCommand(rest),provenanceRequired:true},null,2)}\n`);return 0}if(command==="review"){process.stdout.write(`${JSON.stringify({...reviewCommand(rest),authority:"HUMAN_ATTESTATION"},null,2)}\n`);return 0}if(command==="conjecture"){process.stdout.write(`${JSON.stringify({...conjectureCommand(rest),trust:"PROPOSAL — HUMAN ACCEPTANCE REQUIRED"},null,2)}\n`);return 0}if(command==="agenda"){process.stdout.write(`${JSON.stringify({...agendaCommand(rest),mode:"RESEARCH_STATE"},null,2)}\n`);return 0}
      if(command==="atlas"){const graph=app.buildGraph({includeLiterature:true}),snapshot=projectAtlas(graph), launch=rest.length===0||rest[0]==="open"||rest.includes("--no-open");if(launch){const session=startAtlasServer({snapshot:()=>snapshot}),url=`${session.url}/?token=${session.token}`;if(!rest.includes("--no-open")){const opener=process.platform==="win32"?["explorer.exe",url]:process.platform==="darwin"?["open",url]:["xdg-open",url];Bun.spawn(opener,{stdout:"ignore",stderr:"ignore"})}process.stdout.write(`MathOS Atlas READ ONLY\n${url}\nCtrl+C to stop\n`);await new Promise<void>(resolve=>{const stop=()=>{session.stop();process.off("SIGINT",stop);process.off("SIGTERM",stop);resolve()};process.once("SIGINT",stop);process.once("SIGTERM",stop)});return 0}const parsed=atlasTextCommand(rest.filter(x=>x!=="--json"));if(parsed.action==="critical-path"){process.stdout.write(`${JSON.stringify(blockerCriticalPath(graph,parsed.args[0]??graph.metadata.focusNodeId??""),null,2)}\n`);return 0}if(parsed.action==="impact"){const id=parsed.args[0];process.stdout.write(`${JSON.stringify({id,edges:graph.edges.filter(e=>e.fromNodeId===id||e.toNodeId===id)},null,2)}\n`);return 0}if(parsed.action==="export"){const out=parsed.args[0]??"atlas-snapshot.json";writeFileSync(out,JSON.stringify(snapshot,null,2));process.stdout.write(`Atlas exported ${out}\n`);return 0}process.stdout.write(`${JSON.stringify(snapshot,null,2)}\n`);return 0}

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
        if (command === "literature" && (sub === "desk" || sub === "pages")) {
          const parsed = literatureDeskCommand(rest.filter((item) => item !== "--json"))
          const sources = app.listSources()
          const excerpts = parsed.action === "PAGES" && parsed.args[0] ? app.listExcerpts(parsed.args[0]) : sources.flatMap((source) => app.listExcerpts(source.id))
          process.stdout.write(`${JSON.stringify(literatureDeskSnapshot({ sources, excerpts, candidates: app.listExternal(), assessments: app.listCitations() }), null, 2)}\n`)
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

      throw new MathOSError("USAGE_UNKNOWN_COMMAND", `Unknown command: ${command}`)
    } finally {
      app.close()
    }
  } catch (error) {
    const code = cliExitCode(error)
    if (argv.includes("--json")) process.stderr.write(`${JSON.stringify(formatCliError(error, { debug: process.env.MATHOS_DEBUG === "1" }))}\n`)
    else process.stderr.write(`${formatTypedUserError(error).text}${process.env.MATHOS_DEBUG === "1" && error instanceof Error && error.stack ? `\n${error.stack}` : ""}\n`)
    return code
  }
}
