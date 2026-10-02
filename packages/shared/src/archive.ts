import { closeSync, lstatSync, openSync, readSync, readdirSync, statSync } from "node:fs"
import { isAbsolute, win32 } from "node:path"
import * as tar from "tar"

export type ArchiveEntry = {
  rawPath: string
  path: string
  type: "File" | "Directory"
  bytes: number
  mode: number
}

export type ArchiveSafetyCode = "TRAVERSAL" | "ENTRY_TYPE_UNSAFE" | "DUPLICATE" | "INVALID"

export class ArchiveSafetyError extends Error {
  constructor(readonly code: ArchiveSafetyCode, message: string) {
    super(message)
    this.name = "ArchiveSafetyError"
  }
}

function safePath(raw: string): string {
  if (raw === "." || raw === "./") return ""
  const path = raw.startsWith("./") ? raw.slice(2) : raw
  const value = path.endsWith("/") ? path.slice(0, -1) : path
  if (!value || isAbsolute(value) || win32.isAbsolute(value) || value.startsWith("/") || value.startsWith("\\") || value.includes("\\") || /[\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => part === "" || part === "." || part === ".." || part.includes(":"))) {
    throw new ArchiveSafetyError("TRAVERSAL", `Unsafe archive path: ${raw}`)
  }
  // Windows resolves these names and trailing characters to paths other than
  // the member name. Reject them on every platform so archives are portable.
  if (value.split("/").some((part) => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new ArchiveSafetyError("TRAVERSAL", `Unsafe archive path: ${raw}`)
  }
  return value
}

function scanArchive(archivePath: string, capturePath?: string): { entries: ArchiveEntry[]; captured?: string } {
  const entries: ArchiveEntry[] = []
  const seen = new Set<string>()
  let captured: Buffer[] | undefined
  let capturedBytes = 0
  let ended = false
  let failure: Error | undefined
  const parser = new tar.Parser({ strict: true, preservePaths: false })
  parser.on("entry", (entry) => {
    try {
      if (entry.type !== "File" && entry.type !== "Directory") throw new ArchiveSafetyError("ENTRY_TYPE_UNSAFE", `Unsupported archive entry type: ${entry.type}`)
      // ReadEntry.path normalizes backslashes on Windows. Header.path retains
      // the effective path after PAX/GNU overrides, before that normalization.
      const rawPath = entry.header.path
      safePath(rawPath)
      const path = safePath(entry.path)
      if (!path && entry.type !== "Directory") throw new ArchiveSafetyError("TRAVERSAL", "Archive root is not a directory")
      if (path) {
        const key = process.platform === "win32" ? path.toLowerCase() : path
        if (seen.has(key)) throw new ArchiveSafetyError("DUPLICATE", `Duplicate archive entry: ${path}`)
        seen.add(key)
      }
      if ((entry.mode & 0o6000) !== 0) throw new ArchiveSafetyError("ENTRY_TYPE_UNSAFE", `Privileged archive mode: ${path}`)
      entries.push({ rawPath, path, type: entry.type, bytes: entry.size, mode: entry.mode })
      if (capturePath !== undefined && path === capturePath) {
        if (entry.type !== "File") throw new ArchiveSafetyError("ENTRY_TYPE_UNSAFE", `Archive member is not a file: ${path}`)
        captured = []
        entry.on("data", (chunk: Buffer) => {
          capturedBytes += chunk.length
          if (capturedBytes > 16 * 1024 * 1024) throw new ArchiveSafetyError("INVALID", `Archive member too large: ${path}`)
          captured!.push(Buffer.from(chunk))
        })
      } else entry.resume()
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
      entry.resume()
    }
  })
  parser.on("ignoredEntry", (entry) => { failure ??= new ArchiveSafetyError("ENTRY_TYPE_UNSAFE", `Unsupported archive entry type: ${entry.type}`); entry.resume() })
  // node-tar can mutate a PAX path while handling chained extension headers.
  // Inspect metadata before it is parsed so a literal backslash cannot be
  // hidden by a later normalization of the effective entry path.
  parser.on("meta", (metadata: string) => {
    if (metadata.includes("\\")) failure ??= new ArchiveSafetyError("TRAVERSAL", "Unsafe archive metadata path")
  })
  parser.on("error", (error) => { failure ??= error })
  parser.on("end", () => { ended = true })
  const fd = openSync(archivePath, "r")
  try {
    const chunk = Buffer.allocUnsafe(64 * 1024)
    let bytes: number
    while ((bytes = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      parser.write(chunk.subarray(0, bytes))
      if (failure) throw failure
    }
    parser.end()
    if (failure) throw failure
    if (!ended || entries.length === 0) throw new ArchiveSafetyError("INVALID", "Archive is empty or incomplete")
    if (capturePath !== undefined && captured === undefined) throw new ArchiveSafetyError("INVALID", `Archive member missing: ${capturePath}`)
    return { entries, ...(captured === undefined ? {} : { captured: Buffer.concat(captured).toString("utf8") }) }
  } catch (error) {
    if (error instanceof ArchiveSafetyError) throw error
    throw new ArchiveSafetyError("INVALID", `Archive invalid: ${error instanceof Error ? error.message : String(error)}`)
  } finally { closeSync(fd) }
}

export function inspectTarArchive(archivePath: string): ArchiveEntry[] {
  return scanArchive(archivePath).entries
}

export function readTarTextFile(archivePath: string, entryPath: string): string {
  const path = safePath(entryPath)
  if (!path) throw new ArchiveSafetyError("TRAVERSAL", "Archive root is not a file")
  return scanArchive(archivePath, path).captured!
}

export function writeTarGzip(directory: string, archivePath: string, entries: string[] = ["."]): void {
  if (!entries.length || entries.some((entry) => entry !== "." && safePath(entry) !== entry)) throw new ArchiveSafetyError("TRAVERSAL", "Invalid archive input path")
  tar.c({ cwd: directory, file: archivePath, gzip: true, sync: true, strict: true, onWriteEntry: (entry) => {
    if (entry.type !== "File" && entry.type !== "Directory") throw new ArchiveSafetyError("ENTRY_TYPE_UNSAFE", `Unsupported archive input type: ${entry.type}`)
    safePath(entry.path)
  } }, entries)
  inspectTarArchive(archivePath)
}

export function extractTarArchive(archivePath: string, destination: string): ArchiveEntry[] {
  const entries = inspectTarArchive(archivePath)
  if (!statSync(destination).isDirectory() || readdirSync(destination).length !== 0 || lstatSync(destination).isSymbolicLink()) throw new ArchiveSafetyError("INVALID", "Archive destination must be an empty directory")
  tar.x({ cwd: destination, file: archivePath, sync: true, strict: true, preservePaths: false, noChmod: false, filter: (_path, archiveEntry) => {
    const entry = archiveEntry as { type: string; path: string; header: { path: string } }
    if (entry.type !== "File" && entry.type !== "Directory") throw new ArchiveSafetyError("ENTRY_TYPE_UNSAFE", `Unsupported archive entry type: ${entry.type}`)
    safePath(entry.header.path)
    safePath(entry.path)
    return true
  } })
  return entries
}
