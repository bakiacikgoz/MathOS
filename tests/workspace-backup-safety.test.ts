import { afterEach, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve, sep } from "node:path"
import { gzipSync } from "node:zlib"
import { MathOS, backupWorkspace } from "@mathos/core"
import { FakeLeanAdapter } from "@mathos/lean"
import { FakeVcs } from "@mathos/vcs"
import { BackupIntegrityFailed } from "@mathos/shared"
import { extractTarArchive, writeTarGzip } from "@mathos/shared/archive"
import { SCHEMA_EPOCH } from "@mathos/storage"

const roots: string[] = []
function temp(): string { const root = mkdtempSync(join(tmpdir(), "mathos-backup-safety-")); roots.push(root); return root }
afterEach(() => {
  for (const root of roots.splice(0)) {
    const safe = resolve(root)
    if (!safe.startsWith(`${resolve(tmpdir())}${sep}`) || !safe.split(sep).at(-1)?.startsWith("mathos-backup-safety-")) throw new Error(`Unsafe test cleanup: ${safe}`)
    rmSync(safe, { recursive: true, force: true })
  }
})

function archive(entries: Array<{ path: string; body?: Buffer | string; type?: "0" | "1" | "2"; link?: string }>): string {
  const octal = (header: Buffer, value: number, offset: number, length: number) => header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii")
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body ?? "")
    const header = Buffer.alloc(512)
    header.write(entry.path, 0, 100, "utf8")
    octal(header, 0o644, 100, 8); octal(header, 0, 108, 8); octal(header, 0, 116, 8)
    octal(header, body.length, 124, 12); octal(header, 0, 136, 12)
    header.fill(0x20, 148, 156)
    header.write(entry.type ?? "0", 156, 1, "ascii")
    header.write(entry.link ?? "", 157, 100, "utf8")
    header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii")
    octal(header, header.reduce((sum, byte) => sum + byte, 0), 148, 8)
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  const file = join(temp(), "crafted.tgz")
  writeFileSync(file, gzipSync(Buffer.concat(blocks)))
  return file
}

test.skipIf(process.platform !== "win32" || !existsSync(join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "tar.exe")))("backup and restore are independent of which tar is first on PATH", async () => {
  const gitTar = join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "tar.exe")
  if (process.env.MATHOS_TAR_PATH_CHILD !== "1") {
    const environment = { ...process.env, PATH: `${dirname(gitTar)}${delimiter}${process.env.PATH ?? ""}`, MATHOS_TAR_PATH_CHILD: "1" }
    const result = spawnSync(process.execPath, ["test", join(import.meta.dir, "workspace-backup-safety.test.ts"), "--test-name-pattern", "backup and restore are independent of which tar is first on PATH"], {
      cwd: join(import.meta.dir, ".."), env: environment, encoding: "utf8", timeout: 60_000,
    })
    expect(result.status).toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain("1 pass")
    return
  }
  const selected = spawnSync(join(process.env.SystemRoot!, "System32", "where.exe"), ["tar.exe"], { encoding: "utf8" }).stdout.split(/\r?\n/)[0]?.trim()
  expect(selected?.toLowerCase()).toBe(gitTar.toLowerCase())
  const parent = temp()
  const created = await MathOS.init(join(parent, "source"), "tar-path-independent")
  const app = MathOS.open(created.root)
  let archivePath = ""
  try {
    const claim = app.createClaim({ kind: "conjecture", title: "tar independent", statement: "True", asMainObjective: true })
    archivePath = app.backup(join(parent, "backups")).archive
    const restored = MathOS.restore(archivePath, join(parent, "restored"))
    const reopened = MathOS.open(restored.root)
    try { expect(reopened.getClaim(claim.id).title).toBe("tar independent") }
    finally { reopened.close() }
  } finally { app.close() }
})

test("backup and restore preserve Turkish paths, filenames and content", async () => {
  const parent = temp()
  const created = await MathOS.init(join(parent, "Çalışma alanı"), "ölçüm")
  const sourceFile = join(created.root, "research", "ölçüm-π.txt")
  mkdirSync(dirname(sourceFile), { recursive: true })
  writeFileSync(sourceFile, "İstanbul, ölçüm ve π sabit kalır.\n")
  const app = MathOS.open(created.root)
  let claimId: string, archivePath: string
  try {
    claimId = app.createClaim({ kind: "conjecture", title: "ölçüm", statement: "π = π", asMainObjective: true }).id
    archivePath = app.backup(join(parent, "Yedekler Türkçe")).archive
  } finally { app.close() }
  const target = join(parent, "Geri Yüklenen")
  const restored = MathOS.restore(archivePath, target)
  expect(readFileSync(join(restored.root, "research", "ölçüm-π.txt"), "utf8")).toBe("İstanbul, ölçüm ve π sabit kalır.\n")
  const copy = MathOS.open(restored.root)
  try { expect(copy.getClaim(claimId).title).toBe("ölçüm") }
  finally { copy.close() }
})

function repack(source: string, edit: (folder: string) => void): string {
  const folder = temp()
  extractTarArchive(source, folder)
  edit(folder)
  const target = join(temp(), "edited.tgz")
  writeTarGzip(folder, target)
  return target
}

test("backup includes committed WAL changes even while another reader prevents checkpoint", async () => {
  const workspace = await MathOS.init(temp(), "wal-backup")
  const app = MathOS.open(workspace.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
  const dbPath = join(workspace.root, ".mathos", "mathos.db")
  const reader = new Database(dbPath, { readonly: true })
  try {
    reader.exec("BEGIN")
    reader.query("SELECT id FROM claims").all()
    const claim = app.createClaim({ kind: "conjecture", title: "WAL committed", statement: "True", asMainObjective: true })
    expect(existsSync(`${dbPath}-wal`)).toBe(true)
    const { archive } = app.backup(temp())
    const restored = MathOS.restore(archive, join(temp(), "restored"))
    const copy = MathOS.open(restored.root, { leanAdapter: new FakeLeanAdapter(), vcs: new FakeVcs() })
    try { expect(copy.listClaims().map((row) => row.id)).toContain(claim.id) }
    finally { copy.close() }
  } finally { reader.exec("ROLLBACK"); reader.close(); app.close() }
})

test("backup names are unique and destination inside included workspace content is refused", async () => {
  const parent = temp()
  const created = await MathOS.init(join(parent, "source"), "unique")
  const app = MathOS.open(created.root)
  try {
    const folder = join(parent, "backups")
    const first = app.backup(folder), second = app.backup(folder)
    expect(first.archive).not.toBe(second.archive)
    expect(existsSync(first.archive)).toBe(true)
    expect(existsSync(second.archive)).toBe(true)
    expect(readdirSync(folder).filter((name) => name.startsWith(".mathos-backup-partial-"))).toEqual([])
    expect(() => backupWorkspace(created.root, join(created.root, ".mathos", "backups"))).toThrow(BackupIntegrityFailed)
    const alias = join(parent, "mathos-alias")
    try {
      symlinkSync(join(created.root, ".mathos"), alias, process.platform === "win32" ? "junction" : "dir")
      expect(() => backupWorkspace(created.root, join(alias, "backups"))).toThrow(BackupIntegrityFailed)
    } catch (error) {
      if (existsSync(alias)) throw error
      // Windows installations without junction creation rights still exercise
      // the direct destination check above; macOS/Linux exercise the alias.
    }
  } finally { app.close() }
})

test("restore rejects traversal and link entries before creating target", () => {
  const parent = temp()
  const outside = join(parent, "outside.txt")
  writeFileSync(outside, "unchanged")
  for (const entry of [
    { path: "../outside.txt", body: "overwritten" },
    { path: "alias", type: "2" as const, link: ".." },
    { path: "alias", type: "1" as const, link: "../outside.txt" },
  ]) {
    const dest = join(parent, `restored-${entry.type ?? "traversal"}`)
    expect(() => MathOS.restore(archive([entry]), dest)).toThrow(BackupIntegrityFailed)
    expect(existsSync(dest)).toBe(false)
    expect(readFileSync(outside, "utf8")).toBe("unchanged")
  }
})

test("restore rejects manifest traversal and unlisted payload without touching target", () => {
  const parent = temp()
  const outside = join(parent, "sentinel.txt")
  writeFileSync(outside, "owned")
  const forged = {
    mathosVersion: "1.0.0-rc.1", schemaEpoch: SCHEMA_EPOCH, workspaceId: null,
    createdAt: new Date().toISOString(),
    files: [{ path: "../sentinel.txt", sha256: createHash("sha256").update("owned").digest("hex"), bytes: 5 }],
  }
  const target = join(parent, "forged")
  expect(() => MathOS.restore(archive([{ path: "backup-manifest.json", body: JSON.stringify(forged) }]), target)).toThrow(BackupIntegrityFailed)
  expect(existsSync(target)).toBe(false)
  expect(readFileSync(outside, "utf8")).toBe("owned")
  const workspace = join(parent, "source")
  return MathOS.init(workspace, "source").then((created) => {
    const valid = MathOS.open(created.root)
    let archivePath: string
    try { archivePath = valid.backup(join(parent, "backups")).archive }
    finally { valid.close() }
    const extra = repack(archivePath, (folder) => writeFileSync(join(folder, "unlisted.txt"), "surprise"))
    expect(() => MathOS.restore(extra, join(parent, "unlisted"))).toThrow(BackupIntegrityFailed)
    expect(existsSync(join(parent, "unlisted"))).toBe(false)
  })
})

test("restore refuses a validly hashed future-schema database and preserves an empty destination", async () => {
  const parent = temp()
  const created = await MathOS.init(join(parent, "source"), "future")
  const app = MathOS.open(created.root)
  let archivePath: string
  try { archivePath = app.backup(join(parent, "backups")).archive }
  finally { app.close() }
  const future = repack(archivePath, (folder) => {
    const path = join(folder, ".mathos", "mathos.db")
    const db = new Database(path)
    try { db.query("UPDATE mathos_meta SET value=? WHERE key='schema_epoch'").run(String(SCHEMA_EPOCH + 1)) }
    finally { db.close() }
    const manifestPath = join(folder, "backup-manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    manifest.schemaEpoch = SCHEMA_EPOCH + 1
    const row = manifest.files.find((entry: { path: string }) => entry.path === ".mathos/mathos.db")
    const bytes = readFileSync(path)
    row.sha256 = createHash("sha256").update(bytes).digest("hex")
    row.bytes = bytes.length
    writeFileSync(manifestPath, JSON.stringify(manifest))
  })
  const dest = join(parent, "empty")
  mkdirSync(dest)
  expect(() => MathOS.restore(future, dest)).toThrow(BackupIntegrityFailed)
  expect(existsSync(dest)).toBe(true)
  expect(readFileSync(join(created.root, "mathos.toml"), "utf8")).toContain("future")
})

test("restore rejects archive-listed SQLite sidecars even when manifest hashes match", async () => {
  const started = performance.now()
  let checkpoint = started
  const phases: Record<string, number> = {}
  const elapsed = (phase: string) => {
    const now = performance.now()
    phases[phase] = Math.round(now - checkpoint)
    checkpoint = now
  }
  try {
    const parent = temp()
    const created = await MathOS.init(join(parent, "source"), "sidecar")
    elapsed("init")
    const app = MathOS.open(created.root)
    elapsed("open")
    let archivePath: string
    try { archivePath = app.backup(join(parent, "backups")).archive; elapsed("backup") }
    finally { app.close(); elapsed("close") }
    const malformed = repack(archivePath, (folder) => {
      const sidecar = ".mathos/mathos.db-wal"
      writeFileSync(join(folder, sidecar), "unexpected")
      const path = join(folder, "backup-manifest.json")
      const manifest = JSON.parse(readFileSync(path, "utf8"))
      manifest.files.push({ path: sidecar, sha256: createHash("sha256").update("unexpected").digest("hex"), bytes: 10 })
      writeFileSync(path, JSON.stringify(manifest))
    })
    elapsed("repack")
    const dest = join(parent, "restored")
    expect(() => MathOS.restore(malformed, dest)).toThrow("Backup manifest file invalid")
    expect(existsSync(dest)).toBe(false)
    elapsed("restoreRejectionAssertions")
  } finally {
    console.info("[backup-sidecar timing ms; cleanup in afterEach]", JSON.stringify({ ...phases, total: Math.round(performance.now() - started) }))
  }
  // Windows CI measured 7223 ms against the default 5000 ms deadline.
}, 20_000)

test("restore accepts an older checkpointed WAL-header backup without sidecars", async () => {
  const parent = temp()
  const created = await MathOS.init(join(parent, "source"), "legacy-header")
  const app = MathOS.open(created.root)
  let claimId: string, archivePath: string
  try {
    claimId = app.createClaim({ kind: "conjecture", title: "preserved", statement: "True", asMainObjective: true }).id
    archivePath = app.backup(join(parent, "backups")).archive
  } finally { app.close() }
  const oldFormat = repack(archivePath, (folder) => {
    const path = join(folder, ".mathos", "mathos.db")
    const db = new Database(path)
    try { expect(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode=WAL").get()?.journal_mode).toBe("wal") }
    finally { db.close() }
    expect(existsSync(`${path}-wal`)).toBe(false)
    const manifestPath = join(folder, "backup-manifest.json")
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    const row = manifest.files.find((entry: { path: string }) => entry.path === ".mathos/mathos.db")
    const bytes = readFileSync(path)
    row.sha256 = createHash("sha256").update(bytes).digest("hex")
    row.bytes = bytes.length
    writeFileSync(manifestPath, JSON.stringify(manifest))
  })
  const empty = join(parent, "restored")
  mkdirSync(empty)
  const restored = MathOS.restore(oldFormat, empty)
  const restoredDbPath = join(restored.root, ".mathos", "mathos.db")
  const normalized = new Database(restoredDbPath, { readonly: true })
  try { expect(normalized.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()?.journal_mode).toBe("delete") }
  finally { normalized.close() }
  expect(existsSync(`${restoredDbPath}-wal`)).toBe(false)
  expect(existsSync(`${restoredDbPath}-shm`)).toBe(false)
  expect(readdirSync(parent).some((name) => name.startsWith(".mathos-restore-staging-"))).toBe(false)
  const copy = MathOS.open(restored.root)
  try { expect(copy.getClaim(claimId).title).toBe("preserved") }
  finally { copy.close() }
})
