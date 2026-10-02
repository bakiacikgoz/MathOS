import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { BRIDGE_PROTOCOL_VERSION } from "@mathos/shared"

const root = resolve(import.meta.dir, "../..")
const manifest = JSON.parse(readFileSync(resolve(root, "apps/vscode-extension/package.json"), "utf8")) as { version: string }
const path = resolve(process.argv[2] ?? resolve(root, "dist", `mathos-${manifest.version}.vsix`))
if (!existsSync(path)) throw new Error(`VSIX_MISSING: ${path}`)

const windows = process.platform === "win32"
const tarTool = windows ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar"
if (windows && !existsSync(tarTool)) throw new Error(`WINDOWS_TAR_MISSING:${tarTool}`)
let staging: string | null = null
let archiveName = windows ? basename(path) : path
let archiveDirectory = windows ? dirname(path) : undefined
try {
  if (windows && /[^\x00-\x7f]/.test(archiveName)) {
    staging = mkdtempSync(join(tmpdir(), "mathos-vsix-verify-"))
    archiveName = "package.vsix"
    archiveDirectory = staging
    copyFileSync(path, join(staging, archiveName))
  }
  const runTar = (...args: string[]) => Bun.spawnSync([tarTool, ...args], {
    stdout: "pipe", stderr: "pipe", ...(archiveDirectory ? { cwd: archiveDirectory } : {}),
  })
  const listing = runTar("-tf", archiveName)
  if (listing.exitCode !== 0) throw new Error(`VSIX_UNREADABLE: ${listing.stderr.toString()}`)
  const files = listing.stdout.toString().split(/\r?\n/).filter(Boolean)
  if (!files.includes("extension/package.json") || !files.includes("extension/dist/extension.js")) throw new Error("VSIX_REQUIRED_FILES_MISSING")
  if (files.some(file => /(^|\/)(src|test|tests|node_modules|\.env|coverage)(\/|$)|\.map$|\.log$/i.test(file))) throw new Error("VSIX_DEV_FILE_LEAK")

  const packageFile = runTar("-xOf", archiveName, "extension/package.json")
  if (packageFile.exitCode !== 0) throw new Error(`VSIX_PACKAGE_UNREADABLE: ${packageFile.stderr.toString()}`)
  const packaged = JSON.parse(packageFile.stdout.toString()) as { version: string }
  if (packaged.version !== manifest.version) throw new Error("VSIX_VERSION_MISMATCH")

  const extensionFile = runTar("-xOf", archiveName, "extension/dist/extension.js")
  if (extensionFile.exitCode !== 0) throw new Error(`VSIX_EXTENSION_UNREADABLE: ${extensionFile.stderr.toString()}`)
  const extension = extensionFile.stdout.toString()
  if (/api[_-]?key\s*[:=]\s*["'][^"']+/i.test(extension)) throw new Error("VSIX_SECRET_LEAK")
  if (!extension.includes(`PROTOCOL_VERSION = ${BRIDGE_PROTOCOL_VERSION}`)) throw new Error("VSIX_BRIDGE_PROTOCOL_MISMATCH")
  process.stdout.write(`${JSON.stringify({ schemaVersion: "mathos.vsix-verification.v1", ready: true, path, version: manifest.version, bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION, files: files.length }, null, 2)}\n`)
} finally {
  if (staging) {
    const safe = resolve(staging)
    if (dirname(safe) !== resolve(tmpdir()) || !basename(safe).startsWith("mathos-vsix-verify-")) throw new Error("VSIX_STAGING_CLEANUP_UNSAFE")
    rmSync(safe, { recursive: true, force: true })
  }
}
