import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
export type WorkspaceExclusiveOperation = "migration" | "backup" | "restore" | "index-rebuild" | "capsule-import" | "repair"
export class WorkspaceOperationLock {
  private released = false
  private constructor(readonly operation: WorkspaceExclusiveOperation, readonly path: string, private readonly descriptor: number) {}
  static acquire(root: string, operation: WorkspaceExclusiveOperation): WorkspaceOperationLock {
    const path = join(root, ".mathos", "locks", "exclusive.lock"); mkdirSync(dirname(path), { recursive: true })
    const attempt = (): WorkspaceOperationLock => { try { const descriptor = openSync(path, "wx", 0o600); writeFileSync(descriptor, JSON.stringify({ operation, pid: process.pid, createdAt: new Date().toISOString() })); return new WorkspaceOperationLock(operation, path, descriptor) } catch (error) { if (existsSync(path)) { try { const holder = JSON.parse(readFileSync(path, "utf8")) as {pid?:number}; if (holder.pid && holder.pid !== process.pid) { try { process.kill(holder.pid, 0) } catch { rmSync(path, { force: true }); return attempt() } } } catch {} } throw new Error(`WORKSPACE_OPERATION_LOCKED: ${path}`, { cause: error }) } }
    return attempt()
  }
  release(): void { if (this.released) return; this.released = true; closeSync(this.descriptor); rmSync(this.path, { force: true }) }
}
export function withWorkspaceOperationLock<T>(root: string, operation: WorkspaceExclusiveOperation, work: () => T): T { const lock = WorkspaceOperationLock.acquire(root, operation); try { return work() } finally { lock.release() } }
