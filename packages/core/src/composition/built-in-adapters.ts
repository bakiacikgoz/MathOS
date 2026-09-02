import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import type { ClaimReadPort } from "../ports/claim-read-port.ts"
import type { FormalReadPort } from "../ports/formal-read-port.ts"
import type { GraphReadPort } from "../ports/graph-read-port.ts"
import type { ArtifactStorePort } from "../ports/artifact-store-port.ts"
import type { ClockPort } from "../ports/clock-port.ts"
import type { ClaimRepository, DependencyRepository, FormalStatementRepository } from "@mathos/storage"

export const systemClock: ClockPort = { now: () => new Date().toISOString() }

export function claimReadAdapter(repository: ClaimRepository): ClaimReadPort {
  return { get: (id) => repository.get(id), list: (workspaceId) => repository.list(workspaceId) }
}
export function formalReadAdapter(repository: FormalStatementRepository): FormalReadPort {
  return { get: (id) => repository.get(id), currentForClaim: (claimId) => repository.currentForClaim(claimId) }
}
export function graphReadAdapter(repository: DependencyRepository): GraphReadPort {
  return { dependencies: (workspaceId) => repository.list(workspaceId) }
}

export class FileArtifactStore implements ArtifactStorePort {
  private readonly base: string
  constructor(root: string) { this.base = resolve(root, ".mathos", "artifacts"); mkdirSync(this.base, { recursive: true }) }
  put(key: string, value: Uint8Array): string { const path = this.path(key); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); return key }
  get(key: string): Uint8Array | null { const path = this.path(key); return existsSync(path) ? readFileSync(path) : null }
  exists(key: string): boolean { return existsSync(this.path(key)) }
  private path(key: string): string {
    const target = resolve(join(this.base, key))
    const rel = relative(this.base, target)
    if (!key || rel.startsWith("..") || rel === "" || rel.includes(":")) throw new Error("INVALID_ARTIFACT_KEY")
    return target
  }
}
