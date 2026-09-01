import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface TestWorkspace {
  readonly root: string
  path(...parts: string[]): string
  cleanup(): void
}

/** Creates an isolated workspace outside the checkout and provides idempotent cleanup. */
export function createTestWorkspace(prefix = "mathos-test-"): TestWorkspace {
  const root = mkdtempSync(join(tmpdir(), prefix))
  let cleaned = false
  return {
    root,
    path(...parts) {
      const path = join(root, ...parts)
      if (parts.length > 1) mkdirSync(join(path, ".."), { recursive: true })
      return path
    },
    cleanup() {
      if (cleaned) return
      cleaned = true
      rmSync(root, { recursive: true, force: true })
    },
  }
}
