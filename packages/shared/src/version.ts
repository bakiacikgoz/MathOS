import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

export const MATHOS_RELEASE_NAME = "MathOS"

function findRootPackage(): { dir: string; version: string } {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json")
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string; version?: string }
        if (json.name === "mathos" && json.version) return { dir, version: json.version }
      } catch { /* continue */ }
    }
    const parent = join(dir, "..")
    if (parent === dir) break
    dir = parent
  }
  return { dir: process.cwd(), version: "0.1.0-alpha.1" }
}

export function mathosVersion(): string {
  return findRootPackage().version
}

export function mathosRepoRoot(): string {
  return findRootPackage().dir
}

export function gitCommitShort(cwd = mathosRepoRoot()): string | null {
  try {
    const proc = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8" })
    if (proc.status !== 0) return null
    const sha = (proc.stdout || "").trim()
    return sha || null
  } catch {
    return null
  }
}

export function formatMathosVersion(schemaEpoch?: number): string {
  const commit = gitCommitShort()
  const schema = schemaEpoch != null ? `schema ${schemaEpoch}` : null
  return [MATHOS_RELEASE_NAME, mathosVersion(), commit ? `commit ${commit}` : null, schema].filter(Boolean).join(" ")
}
