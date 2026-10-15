#!/usr/bin/env bun
// Release helpers for .github/workflows/release.yml, one subcommand per workflow step:
//   check-tag <tag>                 the tag must be v<product version>
//   notes <version> <out>           the CHANGELOG section for that version
//   collect <downloads> <out> <ver> the downloads the release publishes, plus one SHA256SUMS over all of them
import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { MATHOS_PRODUCT_VERSION } from "../../packages/shared/src/version.ts"

const ROOT = resolve(import.meta.dir, "..", "..")
// The Apple Silicon archive stays out until a real Mac qualifies it (planned for 1.0.1).
export const CLI_TARGETS = ["windows-x64", "linux-x64"] as const

export function checkReleaseTag(tag: string, version = MATHOS_PRODUCT_VERSION): void {
  if (tag !== `v${version}`) throw new Error(`RELEASE_TAG_MISMATCH: tag ${tag} does not name product version ${version}`)
}

export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.replaceAll("\r\n", "\n").split("\n")
  const start = lines.findIndex(line => new RegExp(`^## ${version.replaceAll(".", "\\.")}(?:\\s|$)`).test(line))
  if (start < 0) throw new Error(`RELEASE_NOTES_MISSING: CHANGELOG.md has no "## ${version}" section`)
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line))
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim()
  if (!body) throw new Error(`RELEASE_NOTES_MISSING: the ${version} section is empty`)
  return `${body}\n`
}

export function expectedReleaseAssets(version: string): string[] {
  return [...CLI_TARGETS.map(target => `mathos-${version}-${target}.tar.gz`), `MathOS-${version}-windows-x64-setup.exe`, `mathos-${version}.vsix`, "install.sh", "install.ps1"]
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)])
}

/** Copies exactly the expected assets into outDir and writes SHA256SUMS; a missing or duplicated asset fails. */
export function collectReleaseAssets(downloads: string, outDir: string, version: string, installScripts = join(ROOT, "scripts", "install")): string[] {
  const expected = expectedReleaseAssets(version)
  const found = new Map<string, string>()
  for (const path of [...filesUnder(downloads), join(installScripts, "install.sh"), join(installScripts, "install.ps1")]) {
    const name = basename(path)
    if (!expected.includes(name)) continue
    if (found.has(name)) throw new Error(`RELEASE_ASSET_DUPLICATE: ${name}`)
    found.set(name, path)
  }
  const missing = expected.filter(name => !found.has(name))
  if (missing.length) throw new Error(`RELEASE_ASSET_MISSING: ${missing.join(", ")}`)
  mkdirSync(outDir, { recursive: true })
  const sums = expected.map(name => {
    const destination = join(outDir, name)
    copyFileSync(found.get(name)!, destination)
    if (statSync(destination).size === 0) throw new Error(`RELEASE_ASSET_EMPTY: ${name}`)
    return `${createHash("sha256").update(readFileSync(destination)).digest("hex")}  ${name}`
  })
  writeFileSync(join(outDir, "SHA256SUMS"), `${sums.join("\n")}\n`)
  return [...expected, "SHA256SUMS"]
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  if (command === "check-tag" && args[0]) checkReleaseTag(args[0])
  else if (command === "notes" && args[0] && args[1]) writeFileSync(args[1], releaseNotes(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"), args[0]))
  else if (command === "collect" && args[0] && args[1] && args[2]) console.log(collectReleaseAssets(resolve(args[0]), resolve(args[1]), args[2]).join("\n"))
  else { console.error("usage: assets.ts check-tag <tag> | notes <version> <out> | collect <downloads> <out> <version>"); process.exit(2) }
}
