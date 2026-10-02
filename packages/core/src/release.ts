import { createHash, randomUUID } from "node:crypto"
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path"
import { Database } from "bun:sqlite"
import { BackupIntegrityFailed, mathosVersion, nowIso, withWorkspaceOperationLock } from "@mathos/shared"
import { extractTarArchive, inspectTarArchive, writeTarGzip } from "@mathos/shared/archive"
import { SCHEMA_EPOCH, writeDatabaseSnapshot } from "@mathos/storage"

const SKIP = new Set(["debug.log", "node_modules", ".git", ".env", "secrets", "locks"])

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function walkFiles(root: string, rel = "", excludeLake = false): string[] {
  const dir = rel ? join(root, rel) : root
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith(".env") || (excludeLake && rel === "" && entry === ".lake")) continue
    const next = rel ? join(rel, entry) : entry
    const full = join(root, next)
    const st = lstatSync(full)
    if (st.isSymbolicLink()) throw new BackupIntegrityFailed(`Workspace contains symbolic link: ${next}`)
    if (st.isDirectory()) out.push(...walkFiles(root, next, excludeLake))
    else if (st.isFile()) out.push(next)
    else throw new BackupIntegrityFailed(`Unsupported workspace entry: ${next}`)
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

function canonicalTarget(path: string): string {
  const absolute = resolve(path)
  let ancestor = absolute
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new BackupIntegrityFailed(`Cannot resolve backup destination: ${absolute}`)
    ancestor = parent
  }
  return resolve(realpathSync(ancestor), relative(ancestor, absolute))
}

function safeArchivePath(raw: string): string {
  if (raw !== "." && raw !== "./" && (raw.startsWith("/") || raw.startsWith("\\"))) throw new BackupIntegrityFailed(`Unsafe archive path: ${raw}`)
  const path = raw === "." || raw === "./" ? "" : raw.startsWith("./") ? raw.slice(2) : raw
  const value = path.endsWith("/") ? path.slice(0, -1) : path
  if (value === "") return ""
  if (isAbsolute(value) || win32.isAbsolute(value) || value.includes("\\") || /^[A-Za-z]:/.test(value) || /[\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new BackupIntegrityFailed(`Unsafe archive path: ${raw}`)
  }
  return value
}

function preflightArchive(archive: string): void {
  try {
    for (const entry of inspectTarArchive(archive)) safeArchivePath(entry.rawPath)
  } catch (error) {
    throw new BackupIntegrityFailed(`Backup archive invalid: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function collectStagedFiles(root: string, rel = ""): string[] {
  const files: string[] = []
  for (const name of readdirSync(join(root, rel))) {
    const next = rel ? `${rel}/${name}` : name
    safeArchivePath(next)
    const stat = lstatSync(join(root, next))
    if (stat.isSymbolicLink()) throw new BackupIntegrityFailed(`Symbolic link in backup: ${next}`)
    if (stat.isDirectory()) files.push(...collectStagedFiles(root, next))
    else if (stat.isFile()) files.push(next)
    else throw new BackupIntegrityFailed(`Unsupported backup entry: ${next}`)
  }
  return files
}

function validateManifest(manifest: BackupManifest): void {
  if (!manifest || !Array.isArray(manifest.files) || typeof manifest.mathosVersion !== "string" || !Number.isSafeInteger(manifest.schemaEpoch) || manifest.schemaEpoch < 0 || !(manifest.workspaceId === null || typeof manifest.workspaceId === "string") || typeof manifest.createdAt !== "string") throw new BackupIntegrityFailed("Backup manifest invalid")
  const seen = new Set<string>()
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || safeArchivePath(file.path) !== file.path || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || seen.has(file.path) || file.path === "backup-manifest.json" || /^\.mathos\/mathos\.db-(?:wal|shm|journal)$/.test(file.path)) throw new BackupIntegrityFailed("Backup manifest file invalid")
    seen.add(file.path)
  }
  if (!seen.has(".mathos/mathos.db")) throw new BackupIntegrityFailed("Workspace database missing from manifest")
}

function inspectSnapshot(path: string): { schemaEpoch: number; workspaceId: string | null } {
  const db = new Database(path, { readonly: true })
  try {
    const integrity = db.query<{ quick_check: string }, []>("PRAGMA quick_check").get()?.quick_check
    if (integrity !== "ok") throw new BackupIntegrityFailed(`Workspace database integrity failed: ${integrity ?? "unknown"}`)
    const epochRaw = db.query<{ value: string }, []>("SELECT value FROM mathos_meta WHERE key='schema_epoch'").get()?.value
    const schemaEpoch = Number(epochRaw)
    if (epochRaw === undefined || !Number.isSafeInteger(schemaEpoch) || schemaEpoch < 0) throw new BackupIntegrityFailed("Workspace database schema epoch invalid")
    const workspaceId = db.query<{ id: string }, []>("SELECT id FROM workspaces LIMIT 1").get()?.id ?? null
    if (!workspaceId) throw new BackupIntegrityFailed("Workspace identity missing from database")
    return { schemaEpoch, workspaceId }
  } catch (error) {
    if (error instanceof BackupIntegrityFailed) throw error
    throw new BackupIntegrityFailed(`Workspace database invalid: ${error instanceof Error ? error.message : String(error)}`)
  } finally { db.close() }
}

export function backupWorkspace(root: string, destDir: string): { archive: string; manifest: BackupManifest } {
  return withWorkspaceOperationLock(root, "backup", () => backupWorkspaceUnlocked(root, destDir))
}

function backupWorkspaceUnlocked(root: string, destDir: string): { archive: string; manifest: BackupManifest } {
  const sourceDb = join(root, ".mathos", "mathos.db")
  if (!existsSync(sourceDb)) throw new BackupIntegrityFailed("Workspace database missing")
  const include = ["mathos.toml", "MATH.md", "README.md", ".mathos", "formal", "experiments", "literature", "reports", "research", "exports"]
  const destination = canonicalTarget(destDir)
  for (const rel of include) {
    const within = relative(canonicalTarget(join(root, rel)), destination)
    if (within === "" || (within !== ".." && !within.startsWith(`..${sep}`) && !isAbsolute(within))) throw new BackupIntegrityFailed(`Backup destination is inside included workspace path: ${rel}`)
  }
  mkdirSync(destination, { recursive: true })
  const stamp = `${new Date().toISOString().replaceAll(":", "").replaceAll(".", "").slice(0, 17)}-${randomUUID().slice(0, 8)}`
  const staging = mkdtempSync(join(destination, ".mathos-backup-staging-"))
  const partialArchive = join(destination, `.mathos-backup-partial-${randomUUID()}.tgz`)
  try {
  const copied: string[] = []
  for (const rel of include) {
    const src = join(root, rel)
    if (!existsSync(src)) continue
    const dest = join(staging, rel)
    const sourceStat = lstatSync(src)
    if (sourceStat.isSymbolicLink()) throw new BackupIntegrityFailed(`Workspace contains symbolic link: ${rel}`)
    if (sourceStat.isDirectory()) {
      mkdirSync(dest, { recursive: true })
      for (const file of walkFiles(src, "", rel === "formal")) {
        const from = join(src, file)
        const to = join(dest, file)
        if (file.endsWith("debug.log") || file.endsWith(".db-wal") || file.endsWith(".db-shm") || (rel === ".mathos" && file === "mathos.db")) continue
        // Lake's downloads and build output come back from lakefile + lake-manifest.json.
        mkdirSync(dirname(to), { recursive: true })
        copyFileSync(from, to)
        copied.push(join(rel, file))
      }
    } else if (sourceStat.isFile()) {
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(src, dest)
      copied.push(rel)
    } else throw new BackupIntegrityFailed(`Unsupported workspace entry: ${rel}`)
  }
  mkdirSync(join(staging, ".mathos"), { recursive: true })
  // A SQLite snapshot includes committed WAL frames even when another reader
  // prevents a checkpoint. The storage helper produces a self-contained DB.
  const source = new Database(sourceDb, { readonly: true })
  try { writeDatabaseSnapshot(source, join(staging, ".mathos", "mathos.db")) }
  finally { source.close() }
  copied.push(join(".mathos", "mathos.db"))
  const files = copied.filter((rel) => existsSync(join(staging, rel))).map((rel) => {
    const path = join(staging, rel)
    return { path: rel.replaceAll("\\", "/"), sha256: sha256File(path), bytes: statSync(path).size }
  })
  const identity = inspectSnapshot(join(staging, ".mathos", "mathos.db"))
  const manifest: BackupManifest = {
    mathosVersion: mathosVersion(),
    schemaEpoch: identity.schemaEpoch,
    workspaceId: identity.workspaceId,
    createdAt: nowIso(),
    files,
  }
  writeFileSync(join(staging, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  const archive = join(destination, `mathos-backup-${stamp}.tgz`)
  try { writeTarGzip(staging, partialArchive) }
  catch (error) { throw new BackupIntegrityFailed(`Backup archive creation failed: ${error instanceof Error ? error.message : String(error)}`) }
  linkSync(partialArchive, archive)
  return { archive, manifest }
  } finally {
    rmSync(partialArchive, { force: true })
    const safe = resolve(staging)
    if (dirname(safe) !== destination || !safe.split(sep).at(-1)?.startsWith(".mathos-backup-staging-")) throw new Error("Unsafe backup staging cleanup")
    rmSync(safe, { recursive: true, force: true })
  }
}

export function restoreWorkspace(archive: string, destDir: string): { root: string; manifest: BackupManifest } {
  const dest = resolve(destDir)
  const prior = existsSync(dest)
  if (prior && (!lstatSync(dest).isDirectory() || readdirSync(dest).length !== 0)) throw new BackupIntegrityFailed("Restore destination must be a new or empty directory")
  mkdirSync(dirname(dest), { recursive: true })
  const staging = mkdtempSync(join(dirname(dest), ".mathos-restore-staging-"))
  try {
  // Inspect and extract the same private copy. The caller's archive may be
  // replaced between these steps, but this owned staging copy cannot.
  const archiveCopy = join(staging, "archive.tgz")
  copyFileSync(resolve(archive), archiveCopy)
  preflightArchive(archiveCopy)
  const payload = join(staging, "payload")
  mkdirSync(payload)
  try { extractTarArchive(archiveCopy, payload) }
  catch (error) { throw new BackupIntegrityFailed(`Backup archive extraction failed: ${error instanceof Error ? error.message : String(error)}`) }
  const manifestPath = join(payload, "backup-manifest.json")
  if (!existsSync(manifestPath)) throw new BackupIntegrityFailed("backup-manifest.json missing")
  let manifest: BackupManifest
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest }
  catch { throw new BackupIntegrityFailed("backup-manifest.json invalid") }
  validateManifest(manifest)
  const actual = new Set(collectStagedFiles(payload))
  actual.delete("backup-manifest.json")
  if (actual.size !== manifest.files.length) throw new BackupIntegrityFailed("archive files do not match manifest")
  for (const file of manifest.files) {
    if (!actual.delete(file.path)) throw new BackupIntegrityFailed(`missing or duplicate ${file.path}`)
    const path = join(payload, file.path)
    if (statSync(path).size !== file.bytes) throw new BackupIntegrityFailed(`size mismatch ${file.path}`)
    const hash = sha256File(path)
    if (hash !== file.sha256) throw new BackupIntegrityFailed(`hash mismatch ${file.path}`)
  }
  if (actual.size) throw new BackupIntegrityFailed("archive contains unlisted files")
  const dbPath = join(payload, ".mathos", "mathos.db")
  if (!existsSync(dbPath)) throw new BackupIntegrityFailed("Workspace database missing from backup")
  // Earlier archives can contain a self-contained main DB with a WAL header.
  // On macOS, opening that header may create persistent WAL/SHM files. Move
  // the already hash-checked file into an owned source folder and create a
  // separate validated DELETE-mode snapshot at the final payload path. Any
  // source sidecars remain isolated from the restored database.
  const normalizationSource = join(staging, "normalization-source")
  mkdirSync(normalizationSource)
  const sourceDbPath = join(normalizationSource, "mathos.db")
  renameSync(dbPath, sourceDbPath)
  const source = new Database(sourceDbPath)
  try { writeDatabaseSnapshot(source, dbPath) }
  finally { source.close() }
  const normalizedSidecars = ["wal", "shm", "journal"].filter((suffix) => existsSync(`${dbPath}-${suffix}`))
  if (normalizedSidecars.length) throw new BackupIntegrityFailed(`Restored snapshot has SQLite sidecar files: ${normalizedSidecars.map((suffix) => `${suffix}=${statSync(`${dbPath}-${suffix}`).size}`).join(", ")}`)
  const identity = inspectSnapshot(dbPath)
  if (identity.schemaEpoch > SCHEMA_EPOCH) throw new BackupIntegrityFailed(`Backup schema ${identity.schemaEpoch} is newer than supported ${SCHEMA_EPOCH}`)
  if (identity.schemaEpoch !== manifest.schemaEpoch || identity.workspaceId !== manifest.workspaceId) throw new BackupIntegrityFailed("Backup identity does not match database")
  const db = new Database(dbPath)
  try {
    db.query("UPDATE workspaces SET root_path = ?").run(dest)
  } finally { db.close() }
  if ([`${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`].some(existsSync)) throw new BackupIntegrityFailed("Restored database has SQLite sidecar files")
  // The restored copy has a different root_path, so refresh its own manifest.
  const dbEntry = manifest.files.find((file) => file.path === ".mathos/mathos.db")!
  dbEntry.bytes = statSync(dbPath).size
  dbEntry.sha256 = sha256File(dbPath)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  if (prior) rmdirSync(dest)
  try { renameSync(payload, dest) }
  catch (error) {
    if (prior) mkdirSync(dest)
    throw error
  }
  return { root: dest, manifest }
  } finally {
    if (existsSync(staging)) {
      const safe = resolve(staging)
      if (dirname(safe) !== dirname(dest) || !safe.split(sep).at(-1)?.startsWith(".mathos-restore-staging-")) throw new Error("Unsafe restore staging cleanup")
      rmSync(safe, { recursive: true, force: true })
    }
  }
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
