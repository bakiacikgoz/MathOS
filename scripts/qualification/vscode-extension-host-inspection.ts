type Output = { toString(): string }
export type InspectionRunner = (command: string[], options: { stdout: "pipe"; stderr: "pipe"; timeout: number; cwd?: string }) => { exitCode: number | null; stdout: Output; stderr: Output }
const defaultRunner: InspectionRunner = (command, options) => Bun.spawnSync(command, options)

export function inspectProcessTable(runner: InspectionRunner = defaultRunner): { ok: boolean; rows: string[]; error?: string } {
  try {
    const result = runner(["ps", "-axo", "pid=,ppid=,command="], { stdout: "pipe", stderr: "pipe", timeout: 5_000 })
    if (result.exitCode !== 0) return { ok: false, rows: [], error: `ps exited ${String(result.exitCode)}: ${result.stderr.toString().trim() || "no diagnostic"}` }
    return { ok: true, rows: result.stdout.toString().split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) }
  } catch (error) {
    return { ok: false, rows: [], error: `ps inspection failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export function inspectGitHead(root: string, runner: InspectionRunner = defaultRunner): { ok: boolean; revision?: string; error?: string } {
  try {
    const result = runner(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 5_000 })
    if (result.exitCode !== 0) return { ok: false, error: `git rev-parse exited ${String(result.exitCode)}: ${result.stderr.toString().trim() || "no diagnostic"}` }
    const revision = result.stdout.toString().trim()
    if (!/^[0-9a-f]{40}$/u.test(revision)) return { ok: false, error: "git rev-parse returned an invalid revision" }
    return { ok: true, revision }
  } catch (error) {
    return { ok: false, error: `git revision inspection failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export function revisionsMatch(artifactRevision: unknown, sourceRevision: unknown): boolean {
  return typeof artifactRevision === "string" && typeof sourceRevision === "string" && /^[0-9a-f]{40}$/u.test(artifactRevision) && artifactRevision === sourceRevision
}
