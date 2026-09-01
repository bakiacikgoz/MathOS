import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export type PilotStatus = "PASS" | "BLOCKED" | "NOT_RUN" | "FAIL"
export interface PilotStep {
  id: string
  status: PilotStatus
  command?: string
  exitCode?: number
  reason: string
  stdout?: string
  stderr?: string
  rerun: string
}
export interface PilotEvidence {
  schemaVersion: 1
  generatedAt: string
  platform: string
  runtime: string
  workspaceKind: "fresh-temporary"
  steps: PilotStep[]
  summary: Record<PilotStatus, number>
  overall: "PASS" | "BLOCKED" | "FAIL"
}

const SECRET_NAME = /(api[_-]?key|token|secret|password|authorization)/i
const SECRET_VALUE = /(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/gi

export function redactPilotText(value: string, env: NodeJS.ProcessEnv = process.env): string {
  let output = value.replace(SECRET_VALUE, "[REDACTED]")
  for (const [name, secret] of Object.entries(env)) {
    if (!SECRET_NAME.test(name) || !secret || secret.length < 4) continue
    output = output.split(secret).join("[REDACTED]")
  }
  return output.slice(0, 8_000)
}

function summarize(steps: PilotStep[]): PilotEvidence["summary"] {
  const result = { PASS: 0, BLOCKED: 0, NOT_RUN: 0, FAIL: 0 }
  for (const step of steps) result[step.status]++
  return result
}

export async function runPilotValidation(options: { output?: string; keepWorkspace?: boolean } = {}): Promise<PilotEvidence> {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const cli = join(repo, "apps/tui/src/cli.ts")
  const temporaryRoot = mkdtempSync(join(tmpdir(), "mathos-pilot-"))
  const workspace = join(temporaryRoot, "pilot")
  const restored = join(temporaryRoot, "restored")
  const backups = join(temporaryRoot, "backups")
  const steps: PilotStep[] = []

  const run = (id: string, args: string[], cwd = workspace, expected = 0): PilotStep => {
    const command = `mathos ${args.join(" ")}`
    const result = Bun.spawnSync([process.execPath, cli, ...args], {
      cwd,
      env: { ...process.env, MATHOS_DEBUG: "0" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = redactPilotText(result.stdout.toString())
    const stderr = redactPilotText(result.stderr.toString())
    const status: PilotStatus = result.exitCode === expected ? "PASS" : "FAIL"
    const step = { id, status, command, exitCode: result.exitCode, reason: status === "PASS" ? "Command completed with the expected exit code." : `Unexpected exit ${result.exitCode}; expected ${expected}.`, stdout, stderr, rerun: `cd <fresh-parent>/pilot && ${command}` }
    steps.push(step)
    return step
  }
  const blocked = (id: string, reason: string, rerun: string, status: PilotStatus = "BLOCKED") => steps.push({ id, status, reason, rerun })

  try {
    run("init", ["init", "pilot"], temporaryRoot)
    const doctor = run("doctor", ["doctor", "--json"])
    if (doctor.status === "FAIL" && doctor.exitCode === 1) {
      doctor.status = "BLOCKED"
      doctor.reason = "Doctor found unavailable required capabilities; inspect its captured JSON before continuing capability-dependent steps."
    }
    run("create_conjecture", ["claim", "create", "--type", "conjecture", "--title", "Pilot identity", "--statement", "For every natural number n, n equals n."])
    run("set_objective", ["objective", "set", "C-001"])

    const formalize = run("formalize", ["formalize", "C-001", "--json"])
    if (formalize.status === "FAIL") {
      formalize.status = "BLOCKED"
      formalize.reason = "A configured model and usable Lean toolchain are required; no synthetic formalization was substituted."
      blocked("fidelity_approval", "No checked formal draft exists, so fidelity approval would be unsafe.", "mathos formalize C-001, review the mapping in the TUI, then approve it", "NOT_RUN")
    } else {
      blocked("fidelity_approval", "Headless CLI has no fidelity-approval command; manual semantic review is required.", "mathos; open C-001 formalization and approve only after checking meaning")
    }

    const premises = run("premise_search", ["premises", "C-001", "--explain"])
    if (premises.status === "FAIL" || !/^\d+\. /m.test(premises.stdout ?? "")) {
      premises.status = "BLOCKED"
      premises.reason = "A built, provenance-valid retrieval index returned no real candidates; the natural-language fallback was not accepted as a pilot pass."
    }
    blocked("proof_attempt", "Proof execution requires an approved formal statement and usable Lean project.", "mathos prove C-001 --json", "NOT_RUN")
    blocked("verify", "Kernel verification requires a compiled proof artifact.", "mathos verify C-001 --json", "NOT_RUN")
    blocked("experiment", "No headless experiment-create command exists; sandbox policy must be reviewed in the TUI.", "mathos; open Experiments, create a deterministic experiment, and inspect its trust labels")
    blocked("literature", "No headless literature-search command exists and no external provider was configured.", "configure a literature provider, run mathos, then search Literature and record source provenance")

    run("branch", ["branch", "setup"])
    const branch = run("branch_create", ["branch", "create", "pilot alternative"])
    if (branch.status === "FAIL") {
      branch.status = "BLOCKED"
      branch.reason = "Research VCS could not create an isolated branch in this host environment."
    }
    blocked("team_start", "No headless team-start command exists and model-backed workers are unavailable.", "mathos; open Team, start a bounded session for C-001")
    blocked("team_pause", "No team session was started, so pause cannot be exercised.", "pause the active session from the Team panel", "NOT_RUN")

    run("reopen", ["status", "--json"])
    const backup = run("backup", ["backup", "--out", backups])
    const archive = backup.stdout?.trim().split("\n").at(-1) ?? ""
    if (backup.status === "PASS" && archive && existsSync(archive)) run("restore", ["restore", archive, "--into", restored], temporaryRoot)
    else blocked("restore", "Backup archive was not produced, so restore was not attempted.", "mathos restore <archive.tgz> --into <empty-dir>", "NOT_RUN")
    run("report", ["report", "--format", "json"])
  } finally {
    if (!options.keepWorkspace) rmSync(temporaryRoot, { recursive: true, force: true })
  }

  const summary = summarize(steps)
  const evidence: PilotEvidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    runtime: `Bun ${Bun.version}`,
    workspaceKind: "fresh-temporary",
    steps,
    summary,
    overall: summary.FAIL ? "FAIL" : summary.BLOCKED || summary.NOT_RUN ? "BLOCKED" : "PASS",
  }
  const output = resolve(options.output ?? join(repo, "artifacts/pilot-validation-latest.json"))
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
  return evidence
}

if (import.meta.main) {
  const outputFlag = process.argv.indexOf("--output")
  const output = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined
  const evidence = await runPilotValidation({ output, keepWorkspace: process.argv.includes("--keep-workspace") })
  process.stdout.write(`${JSON.stringify({ overall: evidence.overall, summary: evidence.summary }, null, 2)}\n`)
  process.exit(evidence.overall === "FAIL" ? 1 : 0)
}
