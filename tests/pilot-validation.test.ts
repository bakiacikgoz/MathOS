import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { canonicalPilotHash, normalizePilotText, redactPilotText, runPilotValidation } from "../scripts/pilot-validation.ts"

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe("fresh-user pilot validation", () => {
  test("redacts environment, URL, and common bearer credentials", () => {
    const input = "https://alice:hunter2@example.test?q=1 token=ghp_abcdefghijklmnopqrstuvwxyz Bearer abcdef secret-canary"
    const output = redactPilotText(input, { MATHOS_API_KEY: "secret-canary" })
    expect(output).not.toContain("alice")
    expect(output).not.toContain("hunter2")
    expect(output).not.toContain("ghp_")
    expect(output).not.toContain("abcdef")
    expect(output).not.toContain("secret-canary")
  })

  test("normalizes volatile workspace paths and timestamped artifacts", () => {
    const normalized = normalizePilotText("/tmp/root/pilot/reports/research-report-2026-09-01T1949.json", "/tmp/root", "/repo")
    expect(normalized).toBe("<pilot-root>/pilot/reports/research-report-<timestamp>.json")
    const oldName = "mathos-backup-2026-10-02T080918.tgz"
    const uniqueName = "mathos-backup-2026-10-02T080928-a916fabc.tgz"
    expect(normalizePilotText(oldName, "", "")).toBe("mathos-backup-<timestamp>.tgz")
    expect(normalizePilotText(uniqueName, "", "")).toBe("mathos-backup-<timestamp>.tgz")
    expect(normalizePilotText("mathos-backup-unsupported.tgz", "", "")).toBe("mathos-backup-unsupported.tgz")
  })

  test("normalizes an existing root's physical path when the caller uses an alias", () => {
    const container = mkdtempSync(join(tmpdir(), "pilot-alias-")); dirs.push(container)
    const physical = join(container, "physical")
    const alias = join(container, "alias")
    mkdirSync(physical)
    symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir")
    const longPath = realpathSync(physical).replaceAll("\\", "/")
    expect(normalizePilotText(`${longPath}/pilot`, alias, "")).toBe("<pilot-root>/pilot")
    expect(normalizePilotText(`${longPath}/scripts`, "", alias)).toBe("<repo>/scripts")
    expect(normalizePilotText(`${longPath}-unrelated/pilot`, alias, "")).toBe(`${longPath}-unrelated/pilot`)
  })

  test("canonical hash excludes only declared volatile generation time", () => {
    const a = { schemaVersion: 2 as const, generatedAt: "a", provenance: { gitCommit: "abc" }, steps: [] }
    const b = { ...a, generatedAt: "b" }
    expect(canonicalPilotHash(a)).toBe(canonicalPilotHash(b))
  })

  test("the deterministic pilot never depends on live literature providers", () => {
    const source = readFileSync(join(import.meta.dir, "../scripts/pilot-validation.ts"), "utf8")
    expect(source).toContain('MATHOS_LITERATURE_OFFLINE: "1"')
  })

  test("uses the built CLI, covers the checklist, records provenance, and cleans up", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-evidence-")); dirs.push(dir)
    const output = join(dir, "result.json")
    let workspaceRoot = ""
    const commands: Array<{ id: string; elapsedMs: number; exitCode: number | null; signalCode: string | null; exitedDueToTimeout: boolean; stderr: string }> = []
    const result = await runPilotValidation({
      output,
      onWorkspaceCreated: (root) => { workspaceRoot = root },
      onCommandCompleted: (command) => {
        commands.push(command)
        console.info(`pilot ${command.id}: ${command.elapsedMs.toFixed(0)}ms exit=${command.exitCode} signal=${command.signalCode} childTimeout=${command.exitedDueToTimeout}${command.exitCode === null ? ` stderr=${command.stderr}` : ""}`)
      },
    })
    expect(commands.map((command) => command.id)).toEqual(result.steps.filter((step) => step.command).map((step) => step.id))
    expect(commands.every((command) => Number.isFinite(command.elapsedMs) && command.elapsedMs >= 0)).toBe(true)
    const ids = new Set(result.steps.map((step) => step.id))
    for (const id of ["init", "doctor", "tui_launch", "create_conjecture", "set_objective", "formalize", "fidelity_approval", "premise_search", "proof_attempt", "verify", "experiment", "literature", "branch", "team_start", "team_pause", "reopen", "backup", "restore", "report"]) expect(ids.has(id)).toBe(true)
    expect(result.provenance.entrypoint).toBe("dist/cli.js")
    expect(result.provenance.cliSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.provenance.gitCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(result.provenance.environment).toBe("credential-free-allowlist")
    expect(result.steps.every((step) => step.reason.length > 0 && step.rerun.length > 0)).toBe(true)
    expect(result.steps.find((step) => step.id === "doctor")?.status).toBe("BLOCKED")
    expect(result.summary.FAIL).toBe(0)
    expect(result.overall).toBe("BLOCKED")
    expect(result.steps.find((step) => step.id === "restore")?.evidence).toContain("semantic state equivalent")
    expect(result.steps.find((step) => step.id === "report")?.evidence).toContain("trust labels present")
    expect(JSON.stringify(result)).not.toContain(workspaceRoot)
    expect(existsSync(workspaceRoot)).toBe(false)
    expect(JSON.parse(readFileSync(output, "utf8")).canonicalSha256).toBe(canonicalPilotHash(result))
  // Windows full-suite CI measured 66.3s after the former 60s deadline
  // interrupted a real CLI child; leave headroom for the 24 serial commands.
  }, 120_000)

  test("two runs have identical canonical evidence hashes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-determinism-")); dirs.push(dir)
    const logCommand = (run: string) => (command: { id: string; elapsedMs: number; exitCode: number | null; signalCode: string | null; exitedDueToTimeout: boolean; stderr: string }) => {
      console.info(`pilot ${run}/${command.id}: ${command.elapsedMs.toFixed(0)}ms exit=${command.exitCode} signal=${command.signalCode} childTimeout=${command.exitedDueToTimeout}${command.exitCode === null ? ` stderr=${command.stderr}` : ""}`)
    }
    const first = await runPilotValidation({ output: join(dir, "one.json"), onCommandCompleted: logCommand("one") })
    const second = await runPilotValidation({ output: join(dir, "two.json"), onCommandCompleted: logCommand("two") })
    expect(first.summary.FAIL).toBe(0)
    expect(second.summary.FAIL).toBe(0)
    expect(first.overall).toBe("BLOCKED")
    expect(second.overall).toBe("BLOCKED")
    if (first.canonicalSha256 !== second.canonicalSha256) {
      const differences: string[] = []
      const inspect = (a: unknown, b: unknown, path: string): void => {
        if (JSON.stringify(a) === JSON.stringify(b)) return
        if (a && b && typeof a === "object" && typeof b === "object") {
          for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) inspect((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`)
          return
        }
        if (path === "evidence.generatedAt" || path === "evidence.canonicalSha256") return
        const left = redactPilotText(JSON.stringify(a) ?? "undefined")
        const right = redactPilotText(JSON.stringify(b) ?? "undefined")
        let offset = 0
        while (offset < Math.min(left.length, right.length) && left[offset] === right[offset]) offset++
        const start = Math.max(0, offset - 60)
        differences.push(`${path} at ${offset}: ${left.slice(start, start + 240)} => ${right.slice(start, start + 240)}`)
      }
      inspect(first, second, "evidence")
      throw new Error(`Canonical pilot evidence differs: ${differences.slice(0, 20).join(" | ")}`)
    }
  // Windows full-suite CI measured 91.3s after the former 90s deadline
  // interrupted a CLI child; the resulting run had null exits and a receipt mismatch.
  }, 180_000)
})
