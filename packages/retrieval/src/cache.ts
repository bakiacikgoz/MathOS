import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { CandidateProfile } from "./types.ts"

export function profileCachePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".mathos", "index", "profiles.json")
}

export function loadProfileCache(workspaceRoot: string): Record<string, CandidateProfile> {
  const path = profileCachePath(workspaceRoot)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, CandidateProfile>
  } catch {
    return {}
  }
}

export function saveProfileCache(workspaceRoot: string, cache: Record<string, CandidateProfile>): void {
  mkdirSync(join(workspaceRoot, ".mathos", "index"), { recursive: true })
  writeFileSync(profileCachePath(workspaceRoot), `${JSON.stringify(cache)}\n`, "utf8")
}

export function profileCacheKey(name: string, leanVersion: string | null, mathlibRevision: string | null): string {
  return `${name}|${leanVersion ?? "?"}|${mathlibRevision ?? "?"}`
}
