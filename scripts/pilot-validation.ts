import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type PilotStatus = "PASS" | "BLOCKED" | "NOT_RUN" | "FAIL"
export interface PilotStep {
  id: string
  status: PilotStatus
  command?: string
  exitCode?: number
  reason: string
  evidence?: string
  stdout?: string
  stderr?: string
  rerun: string
}
export interface PilotProvenance {
  gitCommit: string
  packageVersion: string
  entrypoint: "dist/cli.js"
  cliSha256: string
  runnerSha256: string
  environment: "credential-free-allowlist"
}
export interface PilotEvidence {
  schemaVersion: 2
  generatedAt: string
  platform: string
  runtime: string
  workspaceKind: "fresh-temporary"
  provenance: PilotProvenance
  steps: PilotStep[]
  summary: Record<PilotStatus, number>
  overall: "PASS" | "BLOCKED" | "FAIL"
  canonicalSha256: string
}

const SECRET_NAME = /(api[_-]?key|token|secret|password|authorization|credential)/i
const SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{16}|Bearer\s+\S+)/gi
const TEXT_EXTENSIONS = new Set([".json", ".jsonl", ".md", ".toml", ".txt", ".lean", ".py", ".log", ".yaml", ".yml"])

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}
function sha256File(path: string): string { return sha256(readFileSync(path)) }

export function redactPilotText(value: string, env: NodeJS.ProcessEnv = process.env): string {
  let output = value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(SECRET_VALUE, "[REDACTED]")
  for (const [name, secret] of Object.entries(env)) {
    if (!SECRET_NAME.test(name) || !secret || secret.length < 4) continue
    output = output.split(secret).join("[REDACTED]")
  }
  return output.slice(0, 8_000)
}

export function normalizePilotText(value: string, temporaryRoot: string, repo: string): string {
  let output = value
  for (const [path, replacement] of [[temporaryRoot, "<pilot-root>"], [repo, "<repo>"]] as const) {
    if (!path) continue
    for (const variant of new Set([path, path.replaceAll("\\", "/"), path.replaceAll("/", "\\"), path.replaceAll("\\", "\\\\")])) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      output = output.replace(new RegExp(`${escaped}(?=$|[/\\\\])`, "g"), replacement)
    }
  }
  output = output
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<timestamp>")
    .replace(/ws_[a-f0-9]{16,}/g, "ws_<id>")
    .replace(/(mathos-backup-)[0-9TZ-]+(?=\.tgz)/g, "$1<timestamp>")
    .replace(/(research-report-)[0-9TZ:.-]+(?=\.json|\.md)/g, "$1<timestamp>")
  return output
}

export function canonicalPilotHash<T extends object>(input: T): string {
  const canonical = Object.fromEntries(Object.entries(structuredClone(input)))
  delete canonical.generatedAt
  delete canonical.canonicalSha256
  return sha256(`${JSON.stringify(canonical, null, 2)}\n`)
}

function summarize(steps: PilotStep[]): PilotEvidence["summary"] {
  const result = { PASS: 0, BLOCKED: 0, NOT_RUN: 0, FAIL: 0 }
  for (const step of steps) result[step.status]++
  return result
}

function cleanEnvironment(temporaryRoot: string): Record<string, string> {
  const isolatedHome = join(temporaryRoot, "home")
  const isolatedTmp = join(temporaryRoot, "tmp")
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: isolatedHome,
    TMPDIR: isolatedTmp,
    MATHOS_DEBUG: "0",
    LANG: process.env.LANG ?? "C.UTF-8",
  }
  for (const name of ["SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"]) if (process.env[name]) env[name] = process.env[name]!
  mkdirSync(isolatedHome, { recursive: true })
  mkdirSync(isolatedTmp, { recursive: true })
  return env
}

function gitValue(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`)
  return result.stdout.toString().trim()
}

function ensureBuiltCli(repo: string): string {
  const cli = join(repo, "dist", "cli.js")
  if (!existsSync(cli)) {
    const result = Bun.spawnSync([process.execPath, join(repo, "scripts", "build.ts")], { cwd: repo, stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0 || !existsSync(cli)) throw new Error(`Unable to build dist/cli.js: ${result.stderr.toString()}`)
  }
  return cli
}

type RawRun = { step: PilotStep; rawStdout: string; rawStderr: string }
type DoctorCheck = { name: string; status: "PASS" | "WARN" | "FAIL"; detail: string }

function hasSecret(text: string): boolean {
  SECRET_VALUE.lastIndex = 0
  if (SECRET_VALUE.test(text)) return true
  return /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i.test(text)
}

function walkTextFiles(root: string): string[] {
  const files: string[] = []
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const info = statSync(path)
      if (info.isDirectory()) visit(path)
      else if (TEXT_EXTENSIONS.has(name.slice(name.lastIndexOf("."))) || name === "backup-manifest.json") files.push(path)
    }
  }
  visit(root)
  return files.sort()
}

function eventDigest(root: string): string {
  const path = join(root, ".mathos", "events.jsonl")
  return existsSync(path) ? sha256(readFileSync(path)) : sha256("")
}

function semanticStatus(raw: string): unknown {
  const parsed = JSON.parse(raw) as { text: string; status: { mainObjective: unknown; research: unknown; branch: Record<string, unknown> | null } }
  const branch = parsed.status.branch
  return {
    text: parsed.text,
    mainObjective: parsed.status.mainObjective,
    research: parsed.status.research,
    branch: branch ? { id: branch.id, name: branch.name, slug: branch.slug, status: branch.status, staleBase: branch.staleBase } : null,
  }
}

export async function runPilotValidation(options: { output?: string; keepWorkspace?: boolean; onWorkspaceCreated?: (root: string) => void } = {}): Promise<PilotEvidence> {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const runner = fileURLToPath(import.meta.url)
  const cli = ensureBuiltCli(repo)
  const packageJson = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string }
  const temporaryRoot = mkdtempSync(join(tmpdir(), "mathos-pilot-"))
  const workspace = join(temporaryRoot, "pilot")
  const restored = join(temporaryRoot, "restored")
  const backups = join(temporaryRoot, "backups")
  const environment = cleanEnvironment(temporaryRoot)
  const steps: PilotStep[] = []
  options.onWorkspaceCreated?.(workspace)

  const normalize = (text: string) => normalizePilotText(redactPilotText(text, environment), temporaryRoot, repo)
  const run = (id: string, args: string[], cwd = workspace): RawRun => {
    const command = `mathos ${args.join(" ")}`
    const result = Bun.spawnSync([process.execPath, cli, ...args], { cwd, env: environment, stdout: "pipe", stderr: "pipe" })
    const rawStdout = result.stdout.toString()
    const rawStderr = result.stderr.toString()
    const status: PilotStatus = result.exitCode === 0 ? "PASS" : "FAIL"
    const step: PilotStep = {
      id, status, command: normalize(command), exitCode: result.exitCode,
      reason: status === "PASS" ? "Command completed and its step-specific evidence is checked below." : `Unexpected exit ${result.exitCode}.`,
      stdout: normalize(rawStdout), stderr: normalize(rawStderr), rerun: normalize(`cd ${workspace} && ${command}`),
    }
    steps.push(step)
    return { step, rawStdout, rawStderr }
  }
  const manual = (id: string, reason: string, rerun: string, status: PilotStatus = "BLOCKED", evidence?: string) => steps.push({ id, status, reason, evidence, rerun })
  const capabilityBlock = (runResult: RawRun, capabilityMissing: boolean, codes: string[], reason: string): void => {
    const normalizeCode = (code: string) => code.replace(/[^a-z0-9]/gi, "").toUpperCase()
    const reportedCodes = [...runResult.rawStderr.matchAll(/(?:Error code:\s*|"code"\s*:\s*")([A-Za-z0-9_-]+)/g)].map(match => normalizeCode(match[1]!))
    const codeMatched = codes.some((code) => reportedCodes.includes(normalizeCode(code)))
    if (runResult.step.status === "FAIL" && capabilityMissing && codeMatched) {
      runResult.step.status = "BLOCKED"
      runResult.step.reason = reason
    }
  }

  try {
    const init = run("init", ["init", "pilot"], temporaryRoot)
    if (init.step.status === "PASS" && existsSync(join(workspace, ".mathos", "mathos.db"))) init.step.evidence = "fresh workspace database and layout created"
    else if (init.step.status === "PASS") { init.step.status = "FAIL"; init.step.reason = "CLI exited successfully without creating the workspace layout." }

    const doctor = run("doctor", ["doctor", "--json"])
    let doctorChecks: DoctorCheck[] = []
    if (doctor.step.status === "PASS") {
      try {
        const parsed = JSON.parse(doctor.rawStdout) as { checks: DoctorCheck[] }
        doctorChecks = parsed.checks
        const gaps = doctorChecks.filter((check) => check.status !== "PASS")
        if (gaps.length) {
          doctor.step.status = "BLOCKED"
          doctor.step.reason = `Doctor reported unavailable or unverified capabilities: ${gaps.map((item) => `${item.name}=${item.status}`).join(", ")}.`
          doctor.step.evidence = gaps.map((item) => `${item.name}: ${item.detail}`).join("; ")
        } else doctor.step.evidence = "all structured doctor checks PASS"
      } catch {
        doctor.step.status = "FAIL"; doctor.step.reason = "Doctor output was not valid structured JSON."
      }
    }
    const missing = (name: string) => doctorChecks.some((check) => check.name === name && check.status !== "PASS")
    const detail = (name: string) => doctorChecks.find((check) => check.name === name)?.detail ?? "unreported"

    manual("tui_launch", "Interactive TUI launch and visual interaction require a human terminal; the built entrypoint was proven executable by the headless steps.", "mathos", "BLOCKED", "manual terminal action explicitly retained in checklist")

    const claim = run("create_conjecture", ["claim", "create", "--type", "conjecture", "--title", "Pilot identity", "--statement", "For every natural number n, n equals n."])
    if (claim.step.status === "PASS" && /Created C-001\s+CONJECTURE/.test(claim.rawStdout)) claim.step.evidence = "C-001 created as CONJECTURE"
    else if (claim.step.status === "PASS") { claim.step.status = "FAIL"; claim.step.reason = "Create output did not prove C-001 is a conjecture." }
    const objective = run("set_objective", ["objective", "set", "C-001"])
    if (objective.step.status === "PASS" && objective.rawStdout.includes("Main objective: C-001")) objective.step.evidence = "C-001 selected as main objective"
    else if (objective.step.status === "PASS") { objective.step.status = "FAIL"; objective.step.reason = "Objective output did not identify C-001." }

    const formalize = run("formalize", ["formalize", "C-001", "--json"])
    capabilityBlock(formalize, missing("API key") || missing("Model") || missing("Lean"), ["ModelNotConfigured", "LeanNotAvailable"], "Formalization is blocked by the doctor-confirmed model or Lean capability gap; configure the reported capability and rerun.")
    if (formalize.step.status === "PASS") formalize.step.evidence = "formalization JSON returned by built CLI; human fidelity remains separate"

    const fidelity = run("fidelity_approval", ["formal", "approve", "C-001"])
    if (fidelity.step.status === "FAIL" && fidelity.rawStderr.includes("Usage: mathos formal setup")) {
      fidelity.step.status = "BLOCKED"
      fidelity.step.reason = "Built CLI was probed and exposes no headless fidelity-approval command; human semantic review is required in the TUI."
      fidelity.step.evidence = "unsupported headless surface confirmed by CLI usage response"
      fidelity.step.rerun = "mathos; review C-001 formalization and approve only after checking meaning"
    }

    const premises = run("premise_search", ["premises", "C-001", "--explain"])
    if (premises.step.status === "PASS" && /^\d+\. /m.test(premises.rawStdout)) premises.step.evidence = "at least one ranked premise with explanation returned"
    else if (premises.step.status === "PASS") {
      premises.step.status = "BLOCKED"
      premises.step.reason = "The real retrieval command ran, but no provenance-valid indexed premise was returned; build a compatible index and rerun."
      premises.step.evidence = "natural-language fallback was not accepted as passing evidence"
    }

    const proof = run("proof_attempt", ["prove", "C-001", "--json"])
    capabilityBlock(proof, formalize.step.status === "BLOCKED" || missing("Lean"), ["ModelNotConfigured", "FormalizationRequired", "FormalStatementNotFound", "LeanNotAvailable", "FidelityApprovalRequired"], "Proof attempt is blocked by the previously evidenced formalization, fidelity, model, or Lean prerequisite.")
    const verify = run("verify", ["verify", "C-001", "--json"])
    capabilityBlock(verify, formalize.step.status === "BLOCKED" || missing("Lean"), ["VerificationFailed", "FormalizationRequired", "FormalStatementNotFound", "LeanNotAvailable"], "Kernel verification is blocked because no compiled current proof artifact exists and Lean/formalization prerequisites are unavailable.")

    const experimentCreate = run("experiment_create", ["experiment", "create", "--claim", "C-001", "--kind", "FINITE_VERIFICATION", "--property", "n == n", "--from", "0", "--to", "2"])
    const experimentId = experimentCreate.rawStdout.match(/Created (EXP-\d+)/)?.[1]
    if (experimentCreate.step.status === "PASS" && experimentId) {
      const experiment = run("experiment", ["experiment", "run", experimentId])
      if (experiment.step.status === "PASS") experiment.step.evidence = "real headless experiment create/run completed; computation remains not proof"
      else capabilityBlock(experiment, missing("Experiment sandbox") || missing("Python runtime"), ["Sandbox", "Python", "ExperimentExecutionFailed"], "Experiment run is blocked by a doctor-confirmed Python or sandbox capability gap.")
    } else manual("experiment", "Experiment creation failed, so execution was not attempted.", "mathos experiment create ... then mathos experiment run EXP-001", "NOT_RUN")

    const literature = run("literature", ["literature", "search", "identity theorem"])
    if (literature.step.status === "PASS" && detail("Literature providers").toLowerCase().includes("fake")) {
      literature.step.status = "BLOCKED"
      literature.step.reason = "The real headless search surface ran, but doctor reports the fake provider; configure a real provider before treating results as pilot literature evidence."
      literature.step.evidence = "provider=fake; output remains EXTERNAL SOURCE / NOT A PROOF"
    } else if (literature.step.status === "PASS" && literature.rawStdout.includes("EXTERNAL SOURCE") && literature.rawStdout.includes("NOT A PROOF")) literature.step.evidence = "real provider search returned explicitly untrusted external-source labels"

    const branchSetup = run("branch_setup", ["branch", "setup"])
    const branch = run("branch", ["branch", "create", "pilot alternative"])
    if (branch.step.status === "PASS" && /Created B-\d+/.test(branch.rawStdout)) branch.step.evidence = "isolated research branch created"
    else capabilityBlock(branch, branchSetup.step.status === "FAIL" || missing("Git"), ["Git", "Vcs"], "Branch creation is blocked by the doctor-confirmed Git/versioning capability gap.")

    const teamStart = run("team_start", ["team", "start", "--json"])
    const teamId = teamStart.rawStdout.match(/"id"\s*:\s*"(MR-\d+)"/)?.[1]
    if (teamStart.step.status === "PASS" && teamId) {
      teamStart.step.evidence = `${teamId} created through the real headless team surface`
      const pause = run("team_pause", ["team", "pause", teamId])
      if (pause.step.status === "PASS" && pause.rawStdout.includes(`Paused ${teamId}`)) pause.step.evidence = `${teamId} paused cleanly`
      else if (pause.step.status === "PASS") { pause.step.status = "FAIL"; pause.step.reason = "Pause output did not confirm the active team session." }
    } else {
      capabilityBlock(teamStart, missing("API key") || missing("Model"), ["ModelNotConfigured"], "Team start is blocked by the doctor-confirmed model capability gap.")
      manual("team_pause", "No team session id was produced, so pause cannot be exercised.", "mathos team pause MR-001", "NOT_RUN")
    }

    const reopen = run("reopen", ["status", "--json"])
    let sourceSemantic: unknown = null
    if (reopen.step.status === "PASS") {
      try {
        sourceSemantic = semanticStatus(reopen.rawStdout)
        const state = sourceSemantic as { text?: string; mainObjective?: { id?: string }; research?: { totalClaims?: number } }
        if (state.mainObjective?.id !== "C-001" || state.research?.totalClaims !== 1 || !state.text?.includes("MR-001 PAUSED")) throw new Error("objective, claim count, or paused team state changed")
        reopen.step.evidence = "fresh CLI process reopened C-001 and preserved claim summary plus MR-001 PAUSED state"
      } catch (error) { reopen.step.status = "FAIL"; reopen.step.reason = `Reopened status was incoherent: ${String(error)}` }
    }

    const sourceEvents = eventDigest(workspace)
    const backup = run("backup", ["backup", "--out", backups])
    const archive = backup.rawStdout.trim().split("\n").at(-1) ?? ""
    if (backup.step.status === "PASS" && existsSync(archive)) {
      const manifestResult = Bun.spawnSync(["tar", "-xOzf", archive, "./backup-manifest.json"], { env: environment, stdout: "pipe", stderr: "pipe" })
      const manifest = manifestResult.stdout.toString()
      if (manifestResult.exitCode !== 0 || !manifest.trim() || hasSecret(manifest)) {
        backup.step.status = "FAIL"; backup.step.reason = "Backup manifest could not be read or contained credential-shaped material."
      } else backup.step.evidence = "archive exists; manifest parsed and secret scan clean"
    } else if (backup.step.status === "PASS") { backup.step.status = "FAIL"; backup.step.reason = "Backup command did not produce an archive." }

    if (backup.step.status === "PASS") {
      const restore = run("restore", ["restore", archive, "--into", restored], temporaryRoot)
      if (restore.step.status === "PASS") {
        const restoredStatus = run("restore_status_probe", ["status", "--json"], restored)
        try {
          const restoredSemantic = semanticStatus(restoredStatus.rawStdout)
          const secretFiles = walkTextFiles(restored).filter((path) => hasSecret(readFileSync(path, "utf8")))
          if (JSON.stringify(restoredSemantic) !== JSON.stringify(sourceSemantic)) throw new Error("objective/claims/branch state differs")
          if (eventDigest(restored) !== sourceEvents) throw new Error("event log differs")
          if (secretFiles.length) throw new Error(`credential-shaped material in ${secretFiles.map((path) => relative(restored, path)).join(", ")}`)
          restore.step.evidence = "semantic state equivalent (objective, claims, branch, event digest); extracted archive secret scan clean"
        } catch (error) { restore.step.status = "FAIL"; restore.step.reason = `Restore validation failed: ${String(error)}` }
      }
    } else manual("restore", "Backup evidence failed, so restore was not attempted.", "mathos restore <archive.tgz> --into <empty-dir>", "NOT_RUN")

    const report = run("report", ["report", "--format", "json"])
    if (report.step.status === "PASS") {
      const reportPath = report.rawStdout.trim().split("\n").at(-1) ?? ""
      try {
        const reportText = readFileSync(reportPath, "utf8")
        const labels = ["KERNEL_VERIFIED", "EXTERNAL_KNOWN", "COMPUTATIONALLY_SUPPORTED", "UNVERIFIED"]
        if (hasSecret(reportText)) throw new Error("credential-shaped material found")
        if (!labels.every((label) => reportText.includes(label))) throw new Error("trust legend incomplete")
        JSON.parse(reportText)
        report.step.evidence = "report JSON parsed; trust labels present; secret scan clean"
      } catch (error) { report.step.status = "FAIL"; report.step.reason = `Report validation failed: ${String(error)}` }
    }
  } finally {
    if (!options.keepWorkspace) rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const summary = summarize(steps)
  const withoutHash = {
    schemaVersion: 2 as const,
    generatedAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    runtime: `Bun ${Bun.version}`,
    workspaceKind: "fresh-temporary" as const,
    provenance: {
      gitCommit: gitValue(repo, ["rev-parse", "HEAD"]),
      packageVersion: packageJson.version,
      entrypoint: "dist/cli.js" as const,
      cliSha256: sha256File(cli),
      runnerSha256: sha256File(runner),
      environment: "credential-free-allowlist" as const,
    },
    steps, summary,
    overall: (summary.FAIL ? "FAIL" : summary.BLOCKED || summary.NOT_RUN ? "BLOCKED" : "PASS") as PilotEvidence["overall"],
  }
  const evidence: PilotEvidence = { ...withoutHash, canonicalSha256: canonicalPilotHash(withoutHash) }
  const output = resolve(options.output ?? join(repo, "artifacts", "pilot-validation-latest.json"))
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
  return evidence
}

if (import.meta.main) {
  const outputFlag = process.argv.indexOf("--output")
  const output = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined
  const evidence = await runPilotValidation({ output, keepWorkspace: process.argv.includes("--keep-workspace") })
  process.stdout.write(`${JSON.stringify({ overall: evidence.overall, summary: evidence.summary, canonicalSha256: evidence.canonicalSha256 }, null, 2)}\n`)
  process.exit(evidence.overall === "FAIL" ? 1 : 0)
}
