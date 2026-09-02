import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { WorkspaceOperationLock } from "@mathos/workspace"

test("exclusive workspace operations cannot overlap", () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-lock-")), first = WorkspaceOperationLock.acquire(root, "backup")
  expect(() => WorkspaceOperationLock.acquire(root, "migration")).toThrow("WORKSPACE_OPERATION_LOCKED")
  first.release(); const second = WorkspaceOperationLock.acquire(root, "migration"); expect(second.operation).toBe("migration"); second.release()
})
