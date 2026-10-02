import { afterEach, expect, test } from "bun:test"
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import { gzipSync } from "node:zlib"
import { ArchiveSafetyError, extractTarArchive, inspectTarArchive, readTarTextFile, writeTarGzip } from "@mathos/shared/archive"

const roots: string[] = []
function temp(): string { const root = mkdtempSync(join(tmpdir(), "mathos-shared-archive-")); roots.push(root); return root }
afterEach(() => {
  for (const root of roots.splice(0)) {
    const safe = resolve(root)
    if (!safe.startsWith(`${resolve(tmpdir())}${sep}`) || !safe.split(sep).at(-1)?.startsWith("mathos-shared-archive-")) throw new Error(`Unsafe archive test cleanup: ${safe}`)
    rmSync(safe, { recursive: true, force: true })
  }
})

function crafted(entries: Array<{ path: string; type?: string; body?: string; link?: string }>, gzip = true): string {
  const blocks: Buffer[] = []
  const octal = (header: Buffer, value: number, offset: number, length: number) => header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii")
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? "")
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
  const path = join(temp(), gzip ? "crafted.tgz" : "crafted.tar")
  const bytes = Buffer.concat([...blocks, Buffer.alloc(1024)])
  writeFileSync(path, gzip ? gzipSync(bytes) : bytes)
  return path
}

function paxRecord(key: string, value: string): string {
  const payload = `${key}=${value}\n`
  let length = Buffer.byteLength(payload) + 3
  while (true) {
    const next = Buffer.byteLength(`${length} ${payload}`)
    if (next === length) return `${length} ${payload}`
    length = next
  }
}

test("round trips Unicode/PAX filenames and reads a manifest without extracting", () => {
  const root = temp()
  const source = join(root, "Çalışma")
  const file = join(source, "research", "ölçüm-π.txt")
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, "İstanbul π\n")
  writeFileSync(join(source, "backup-manifest.json"), "{\"ok\":true}\n")
  const archive = join(root, "yedek.tgz")
  writeTarGzip(source, archive)
  const entries = inspectTarArchive(archive)
  expect(entries.find((entry) => entry.path === "research/ölçüm-π.txt")?.type).toBe("File")
  expect(readTarTextFile(archive, "backup-manifest.json")).toBe("{\"ok\":true}\n")
  const dest = join(root, "Geri Yüklenen")
  mkdirSync(dest)
  extractTarArchive(archive, dest)
  expect(readFileSync(join(dest, "research", "ölçüm-π.txt"), "utf8")).toBe("İstanbul π\n")
})

test("reads existing plain TAR archives and rejects unsafe member types before extraction", () => {
  const plain = crafted([{ path: "plugin.json", body: "{}" }], false)
  expect(inspectTarArchive(plain).map((entry) => entry.path)).toEqual(["plugin.json"])
  expect(readTarTextFile(plain, "plugin.json")).toBe("{}")
  for (const type of ["1", "2", "6", "Z"]) {
    const archive = crafted([{ path: "alias", type, ...(type === "1" || type === "2" ? { link: "outside" } : {}) }])
    try {
      inspectTarArchive(archive)
      throw new Error(`Unsafe archive type ${type} was accepted`)
    } catch (error) {
      expect(error).toBeInstanceOf(ArchiveSafetyError)
      expect((error as ArchiveSafetyError).code).toBe("ENTRY_TYPE_UNSAFE")
    }
    const dest = join(temp(), "empty")
    mkdirSync(dest)
    expect(() => extractTarArchive(archive, dest)).toThrow(ArchiveSafetyError)
    expect(existsSync(join(dest, "alias"))).toBe(false)
  }
})

test("rejects traversal, Windows aliases and duplicate member names", () => {
  for (const path of ["../outside", "C:/outside", "a\\b", "a\\..\\outside", "a:stream", "folder./file", "CON.txt"]) {
    expect(() => inspectTarArchive(crafted([{ path, body: "x" }]))).toThrow(ArchiveSafetyError)
  }
  expect(() => inspectTarArchive(crafted([{ path: "same", body: "a" }, { path: "./same", body: "b" }]))).toThrow("Duplicate")
  const pax = paxRecord("path", "a\\b")
  for (const entries of [
    [{ path: "PaxHeader/file", type: "x", body: pax }, { path: "safe", body: "x" }],
    [{ path: "PaxHeader/file", type: "x", body: pax }, { path: "PaxHeader/again", type: "x", body: paxRecord("comment", "hello") }, { path: "safe", body: "x" }],
  ]) {
    try {
      inspectTarArchive(crafted(entries))
      throw new Error("Unsafe PAX path was accepted")
    } catch (error) {
      expect(error).toBeInstanceOf(ArchiveSafetyError)
      expect((error as ArchiveSafetyError).code).toBe("TRAVERSAL")
    }
  }
})

test("create refuses hardlinked source entries rather than emitting a link member", () => {
  const root = temp()
  const source = join(root, "source")
  mkdirSync(source)
  writeFileSync(join(source, "first"), "data")
  linkSync(join(source, "first"), join(source, "second"))
  expect(() => writeTarGzip(source, join(root, "hardlinks.tgz"))).toThrow(ArchiveSafetyError)
})

test.skipIf(process.platform === "win32")("preserves POSIX executable mode", () => {
  const root = temp()
  const source = join(root, "source")
  mkdirSync(source)
  const executable = join(source, "run.sh")
  writeFileSync(executable, "#!/bin/sh\nexit 0\n")
  chmodSync(executable, 0o755)
  const archive = join(root, "mode.tgz")
  writeTarGzip(source, archive)
  const dest = join(root, "dest")
  mkdirSync(dest)
  extractTarArchive(archive, dest)
  expect(statSync(join(dest, "run.sh")).mode & 0o111).toBe(0o111)
})
