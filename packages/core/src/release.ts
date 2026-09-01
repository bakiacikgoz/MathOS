import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
import { Database } from "bun:sqlite"
import { BackupIntegrityFailed, mathosVersion, nowIso } from "@mathos/shared"
import { SCHEMA_EPOCH } from "@mathos/storage"

const SKIP = new Set(["debug.log", "node_modules", ".git", ".env", "secrets"])

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function walkFiles(root: string, rel = ""): string[] {
  const dir = rel ? join(root, rel) : root
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith(".env")) continue
    const next = rel ? join(rel, entry) : entry
    const full = join(root, next)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walkFiles(root, next))
    else out.push(next)
  }
  return out
}

export interface BackupManifest {
  mathosVersion: string
  schemaEpoch: number
  workspaceId: string | null
  createdAt: string
  files: Array<{ path: string; sha256: string; bytes: number }>
}

export function backupWorkspace(root: string, destDir: string): { archive: string; manifest: BackupManifest } {
  try {
    const db = new Database(join(root, ".mathos", "mathos.db"))
    db.exec("PRAGMA wal_checkpoint(FULL)")
    db.close()
  } catch { /* no db yet */ }
  mkdirSync(destDir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "").slice(0, 17)
  const staging = join(destDir, `.staging-${stamp}`)
  mkdirSync(staging, { recursive: true })
  const include = ["mathos.toml", "MATH.md", "README.md", ".mathos", "formal", "experiments", "literature", "reports", "research", "exports"]
  const copied: string[] = []
  for (const rel of include) {
    const src = join(root, rel)
    if (!existsSync(src)) continue
    const dest = join(staging, rel)
    if (statSync(src).isDirectory()) {
      mkdirSync(dest, { recursive: true })
      for (const file of walkFiles(src)) {
        const from = join(src, file)
        const to = join(dest, file)
        mkdirSync(dirname(to), { recursive: true })
        if (file.endsWith("debug.log") || file.endsWith(".db-wal") || file.endsWith(".db-shm")) continue
        copyFileSync(from, to)
        copied.push(join(rel, file))
      }
    } else {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied.push(rel)
    }
  }
  const files = copied.filter((rel) => existsSync(join(staging, rel))).map((rel) => {
    const path = join(staging, rel)
    return { path: rel.replaceAll("\\", "/"), sha256: sha256File(path), bytes: statSync(path).size }
  })
  let workspaceId: string | null = null
  try {
    const db = new Database(join(root, ".mathos", "mathos.db"), { readonly: true })
    workspaceId = db.query<{ id: string }, []>("SELECT id FROM workspaces LIMIT 1").get()?.id ?? null
    db.close()
  } catch { /* optional */ }
  const manifest: BackupManifest = {
    mathosVersion: mathosVersion(),
    schemaEpoch: SCHEMA_EPOCH,
    workspaceId,
    createdAt: nowIso(),
    files,
  }
  writeFileSync(join(staging, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  const archive = join(destDir, `mathos-backup-${stamp}.tgz`)
  const tar = spawnSync("tar", ["-czf", archive, "-C", staging, "."], { encoding: "utf8" })
  rmSync(staging, { recursive: true, force: true })
  if (tar.status !== 0) throw new BackupIntegrityFailed(tar.stderr || "tar failed")
  return { archive, manifest }
}

export function restoreWorkspace(archive: string, destDir: string): { root: string; manifest: BackupManifest } {
  const dest = resolve(destDir)
  if (existsSync(join(dest, "mathos.toml")) || existsSync(join(dest, ".mathos"))) {
    throw new BackupIntegrityFailed("Destination already looks like a MathOS workspace. Restore into a new directory.")
  }
  mkdirSync(dest, { recursive: true })
  const tar = spawnSync("tar", ["-xzf", archive, "-C", dest], { encoding: "utf8" })
  if (tar.status !== 0) throw new BackupIntegrityFailed(tar.stderr || "tar extract failed")
  const manifestPath = join(dest, "backup-manifest.json")
  if (!existsSync(manifestPath)) throw new BackupIntegrityFailed("backup-manifest.json missing")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest
  for (const file of manifest.files) {
    const path = join(dest, file.path)
    if (!existsSync(path)) throw new BackupIntegrityFailed(`missing ${file.path}`)
    const hash = sha256File(path)
    if (hash !== file.sha256) throw new BackupIntegrityFailed(`hash mismatch ${file.path}`)
  }
  try {
    const db = new Database(join(dest, ".mathos", "mathos.db"))
    db.query("UPDATE workspaces SET root_path = ?").run(dest)
    db.close()
  } catch { /* ignore if db missing */ }
  return { root: dest, manifest }
}

export function eventLogHealth(root: string): { status: "PASS" | "WARN" | "FAIL"; detail: string } {
  const path = join(root, ".mathos", "events.jsonl")
  if (!existsSync(path)) return { status: "FAIL", detail: "events.jsonl missing" }
  const text = readFileSync(path, "utf8")
  if (!text.trim()) return { status: "PASS", detail: "empty log" }
  const lines = text.split(/\r?\n/)
  let bad = 0
  let good = 0
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      JSON.parse(line)
      good += 1
    } catch {
      bad += 1
    }
  }
  if (bad === 0) return { status: "PASS", detail: `${good} events` }
  return { status: "WARN", detail: `${bad} malformed line(s); not rewritten` }
}

export function redactCanary(text: string, extra: string[] = []): string {
  const secrets = [process.env.MATHOS_API_KEY, process.env.OPENAI_API_KEY, ...extra].filter((item): item is string => Boolean(item && item.length > 3))
  let out = text
  for (const secret of secrets) out = out.split(secret).join("[redacted]")
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  return out
}

export function exportDiagnostics(root: string, destDir: string, doctorText: string): string {
  mkdirSync(destDir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(":", "").slice(0, 15)
  const file = join(destDir, `mathos-diagnostics-${stamp}.md`)
  const body = redactCanary([
    `# MathOS diagnostics`,
    `version ${mathosVersion()}`,
    `platform ${process.platform} ${process.arch}`,
    `bun ${Bun.version}`,
    `schemaEpoch ${SCHEMA_EPOCH}`,
    "",
    "## doctor",
    doctorText,
    "",
    "Secrets excluded. Full papers, proofs, and model prompts excluded.",
  ].join("\n"))
  writeFileSync(file, body)
  return file
}

export function containsSecretLeak(haystack: string, canary: string): boolean {
  return Boolean(canary) && haystack.includes(canary)
}

export { relative }
