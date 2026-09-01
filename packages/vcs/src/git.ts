import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { VcsCommandFailed, type ResearchVcs, type VcsStatus, type WorktreeInfo } from "./types.ts"

const GITIGNORE = `# MathOS runtime / cache
.mathos/tmp/
.mathos/index/
.mathos/logs/
.mathos/sessions/
.mathos/checkpoints/
.mathos/worktrees/
.mathos/*.db
.mathos/*.db-wal
.mathos/*.db-shm
.mathos/debug.log
.mathos/events.jsonl
.mathos/*.key
secrets/
`

function run(args: string[], cwd: string): { ok: boolean; out: string } {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const out = `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}`.trim()
  return { ok: proc.exitCode === 0, out }
}

export class GitResearchVcs implements ResearchVcs {
  async detect(workspaceRoot: string): Promise<VcsStatus> {
    const version = Bun.spawnSync(["git", "--version"], { stdout: "pipe", stderr: "pipe" })
    if (version.exitCode !== 0) {
      return { available: false, initialized: false, root: null, head: null, dirty: false, detail: "git is not available" }
    }
    const inside = run(["rev-parse", "--is-inside-work-tree"], workspaceRoot)
    if (!inside.ok) {
      return { available: true, initialized: false, root: null, head: null, dirty: false, detail: "research workspace is not a git repository" }
    }
    const root = run(["rev-parse", "--show-toplevel"], workspaceRoot)
    const head = run(["rev-parse", "--abbrev-ref", "HEAD"], workspaceRoot)
    const dirty = run(["status", "--porcelain"], workspaceRoot)
    return {
      available: true,
      initialized: true,
      root: root.out || workspaceRoot,
      head: head.ok ? head.out : null,
      dirty: dirty.ok && dirty.out.length > 0,
      detail: "initialized",
    }
  }

  async initialize(workspaceRoot: string): Promise<VcsStatus> {
    const existing = await this.detect(workspaceRoot)
    if (existing.initialized) return existing
    mkdirSync(workspaceRoot, { recursive: true })
    const ignore = join(workspaceRoot, ".gitignore")
    if (!existsSync(ignore)) writeFileSync(ignore, GITIGNORE, "utf8")
    const init = run(["init"], workspaceRoot)
    if (!init.ok) throw new VcsCommandFailed("init", init.out)
    run(["config", "user.email", "mathos@local"], workspaceRoot)
    run(["config", "user.name", "MathOS"], workspaceRoot)
    run(["add", "-A"], workspaceRoot)
    run(["commit", "-m", "mathos: initialize research versioning"], workspaceRoot)
    run(["branch", "-M", "main"], workspaceRoot)
    return this.detect(workspaceRoot)
  }

  async createBranch(workspaceRoot: string, gitRef: string, fromRef = "HEAD"): Promise<void> {
    const created = run(["branch", gitRef, fromRef], workspaceRoot)
    if (!created.ok && !/already exists/i.test(created.out)) throw new VcsCommandFailed("branch", created.out)
  }

  async createWorktree(workspaceRoot: string, gitRef: string, path: string): Promise<WorktreeInfo> {
    mkdirSync(join(path, ".."), { recursive: true })
    const added = run(["worktree", "add", path, gitRef], workspaceRoot)
    if (!added.ok) throw new VcsCommandFailed("worktree add", added.out)
    return { path, branch: gitRef }
  }

  async removeWorktree(workspaceRoot: string, path: string, gitRef?: string): Promise<void> {
    run(["worktree", "remove", "--force", path], workspaceRoot)
    if (gitRef) run(["branch", "-D", gitRef], workspaceRoot)
  }

  async status(workspaceRoot: string): Promise<VcsStatus> {
    return this.detect(workspaceRoot)
  }

  async diffPaths(workspaceRoot: string, fromRef: string, toRef: string): Promise<string[]> {
    const diff = run(["diff", "--name-only", fromRef, toRef], workspaceRoot)
    if (!diff.ok) return []
    return diff.out.split("\n").map((line) => line.trim()).filter(Boolean)
  }
}

export { GITIGNORE as RESEARCH_GITIGNORE }
