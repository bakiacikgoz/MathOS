import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { MathOS, backupWorkspace, restoreWorkspace } from "@mathos/core"
import { WorkspaceOperationLock } from "@mathos/workspace"

test("locked backup and restore preserve semantic workspace without lock or secret state", async () => {
  const root = mkdtempSync(join(tmpdir(), "mathos-backup-rc-")), created = await MathOS.init(root, "source"), app = MathOS.open(created.root); const claim = app.createClaim({ kind: "lemma", title: "L", statement: "P" }); app.close()
  const held = WorkspaceOperationLock.acquire(created.root, "repair"); expect(() => backupWorkspace(created.root, join(root, "blocked"))).toThrow("WORKSPACE_OPERATION_LOCKED"); held.release()
  const backup = backupWorkspace(created.root, join(root, "backups")); expect(backup.manifest.files.some(file => file.path.includes("locks/"))).toBe(false)
  const restored = restoreWorkspace(backup.archive, join(root, "restored")), reopened = MathOS.open(restored.root); expect(reopened.getClaim(claim.id).title).toBe("L"); reopened.close()
})
