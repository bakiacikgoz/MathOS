import { mkdirSync, rmSync } from "node:fs"
import type { ResearchVcs, VcsStatus, WorktreeInfo } from "./types.ts"

export class FakeVcs implements ResearchVcs {
  initialized = false
  branches = new Set<string>(["main"])
  worktrees = new Map<string, string>()
  failNext: string | null = null

  async detect(workspaceRoot: string): Promise<VcsStatus> {
    return {
      available: true,
      initialized: this.initialized,
      root: this.initialized ? workspaceRoot : null,
      head: this.initialized ? "main" : null,
      dirty: false,
      detail: this.initialized ? "initialized" : "not initialized",
    }
  }

  async initialize(workspaceRoot: string): Promise<VcsStatus> {
    this.initialized = true
    return this.detect(workspaceRoot)
  }

  async createBranch(_workspaceRoot: string, gitRef: string): Promise<void> {
    if (this.failNext === "createBranch") { this.failNext = null; throw new Error("fake createBranch failed") }
    this.branches.add(gitRef)
  }

  async createWorktree(_workspaceRoot: string, gitRef: string, path: string): Promise<WorktreeInfo> {
    if (this.failNext === "createWorktree") { this.failNext = null; throw new Error("fake createWorktree failed") }
    mkdirSync(path, { recursive: true })
    this.worktrees.set(path, gitRef)
    return { path, branch: gitRef }
  }

  async removeWorktree(_workspaceRoot: string, path: string, gitRef?: string): Promise<void> {
    this.worktrees.delete(path)
    if (gitRef) this.branches.delete(gitRef)
    rmSync(path, { recursive: true, force: true })
  }

  async status(workspaceRoot: string): Promise<VcsStatus> {
    return this.detect(workspaceRoot)
  }

  async diffPaths(): Promise<string[]> {
    return []
  }
}
