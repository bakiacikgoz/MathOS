export interface VcsStatus {
  available: boolean
  initialized: boolean
  root: string | null
  head: string | null
  dirty: boolean
  detail: string
}

export interface WorktreeInfo {
  path: string
  branch: string
}

export interface ResearchVcs {
  detect(workspaceRoot: string): Promise<VcsStatus>
  initialize(workspaceRoot: string): Promise<VcsStatus>
  createBranch(workspaceRoot: string, gitRef: string, fromRef?: string): Promise<void>
  createWorktree(workspaceRoot: string, gitRef: string, path: string): Promise<WorktreeInfo>
  removeWorktree(workspaceRoot: string, path: string, gitRef?: string): Promise<void>
  status(workspaceRoot: string): Promise<VcsStatus>
  diffPaths(workspaceRoot: string, fromRef: string, toRef: string): Promise<string[]>
}

export class VcsNotInitialized extends Error {
  constructor(root: string) {
    super(`Research versioning is not initialized at ${root}. Run mathos branch setup.`)
    this.name = "VcsNotInitialized"
  }
}

export class VcsCommandFailed extends Error {
  constructor(command: string, detail: string) {
    super(`VCS command failed (${command}): ${detail}`)
    this.name = "VcsCommandFailed"
  }
}
