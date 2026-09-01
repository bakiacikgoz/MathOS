import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
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
  })

  test("canonical hash excludes only declared volatile generation time", () => {
    const a = { schemaVersion: 2 as const, generatedAt: "a", provenance: { gitCommit: "abc" }, steps: [] }
    const b = { ...a, generatedAt: "b" }
    expect(canonicalPilotHash(a)).toBe(canonicalPilotHash(b))
  })

  test("uses the built CLI, covers the checklist, records provenance, and cleans up", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-evidence-")); dirs.push(dir)
    const output = join(dir, "result.json")
    let workspaceRoot = ""
    const result = await runPilotValidation({ output, onWorkspaceCreated: (root) => { workspaceRoot = root } })
    const ids = new Set(result.steps.map((step) => step.id))
    for (const id of ["init", "doctor", "tui_launch", "create_conjecture", "set_objective", "formalize", "fidelity_approval", "premise_search", "proof_attempt", "verify", "experiment", "literature", "branch", "team_start", "team_pause", "reopen", "backup", "restore", "report"]) expect(ids.has(id)).toBe(true)
    expect(result.provenance.entrypoint).toBe("dist/cli.js")
    expect(result.provenance.cliSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.provenance.gitCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(result.provenance.environment).toBe("credential-free-allowlist")
    expect(result.steps.every((step) => step.reason.length > 0 && step.rerun.length > 0)).toBe(true)
    expect(result.steps.find((step) => step.id === "doctor")?.status).toBe("BLOCKED")
    expect(result.steps.find((step) => step.id === "restore")?.evidence).toContain("semantic state equivalent")
    expect(result.steps.find((step) => step.id === "report")?.evidence).toContain("trust labels present")
    expect(JSON.stringify(result)).not.toContain(workspaceRoot)
    expect(existsSync(workspaceRoot)).toBe(false)
    expect(JSON.parse(readFileSync(output, "utf8")).canonicalSha256).toBe(canonicalPilotHash(result))
  }, 60_000)

  test("two runs have identical canonical evidence hashes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-determinism-")); dirs.push(dir)
    const first = await runPilotValidation({ output: join(dir, "one.json") })
    const second = await runPilotValidation({ output: join(dir, "two.json") })
    expect(first.canonicalSha256).toBe(second.canonicalSha256)
  }, 90_000)
})
