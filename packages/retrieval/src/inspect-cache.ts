import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { LeanDeclarationInspection } from "@mathos/lean"
import type { InspectionCacheStats } from "./types.ts"

const CACHE_VERSION = 1

interface CacheFile {
  version: number
  leanVersion: string | null
  mathlibRevision: string | null
  entries: Record<string, { inspection: LeanDeclarationInspection; sourceHash: string | null; storedAt: string }>
}

export function inspectionCachePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".mathos", "index", "lean-inspection-cache.json")
}

export function readInspectionCache(
  workspaceRoot: string,
  leanVersion: string | null,
  mathlibRevision: string | null,
): { file: CacheFile; stats: InspectionCacheStats } {
  const path = inspectionCachePath(workspaceRoot)
  if (!existsSync(path)) {
    return {
      file: { version: CACHE_VERSION, leanVersion, mathlibRevision, entries: {} },
      stats: { entries: 0, valid: 0, stale: 0 },
    }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CacheFile
    if (parsed.version !== CACHE_VERSION) {
      return {
        file: { version: CACHE_VERSION, leanVersion, mathlibRevision, entries: {} },
        stats: { entries: 0, valid: 0, stale: 0 },
      }
    }
    const compatible = parsed.leanVersion === leanVersion && parsed.mathlibRevision === mathlibRevision
    const entries = Object.keys(parsed.entries).length
    if (!compatible) {
      return {
        file: { version: CACHE_VERSION, leanVersion, mathlibRevision, entries: {} },
        stats: { entries, valid: 0, stale: entries },
      }
    }
    return { file: parsed, stats: { entries, valid: entries, stale: 0 } }
  } catch {
    return {
      file: { version: CACHE_VERSION, leanVersion, mathlibRevision, entries: {} },
      stats: { entries: 0, valid: 0, stale: 0 },
    }
  }
}

export function writeInspectionCache(workspaceRoot: string, file: CacheFile): void {
  const dir = join(workspaceRoot, ".mathos", "index")
  mkdirSync(dir, { recursive: true })
  const target = inspectionCachePath(workspaceRoot)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, `${JSON.stringify(file)}\n`, "utf8")
  renameSync(tmp, target)
}

export function inspectionCacheStats(workspaceRoot: string, leanVersion: string | null, mathlibRevision: string | null): InspectionCacheStats {
  return readInspectionCache(workspaceRoot, leanVersion, mathlibRevision).stats
}

export function lookupInspection(
  file: CacheFile,
  name: string,
  sourceHash: string | null,
): LeanDeclarationInspection | null {
  const entry = file.entries[name]
  if (!entry) return null
  if (sourceHash && entry.sourceHash && entry.sourceHash !== sourceHash) return null
  return entry.inspection
}

export function storeInspection(
  file: CacheFile,
  name: string,
  inspection: LeanDeclarationInspection,
  sourceHash: string | null,
): void {
  file.entries[name] = { inspection, sourceHash, storedAt: new Date().toISOString() }
}
