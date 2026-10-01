import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import spdxIdData from "./spdx-license-id-data.json"

const SPDX_LICENSE_IDS = new Set(spdxIdData.licenseIds)
const SPDX_EXCEPTION_IDS = new Set(spdxIdData.exceptionIds)

type Ecosystem = "workspace" | "npm-root" | "npm-desktop" | "cargo"
type InventoryRow = {
  ecosystem: Ecosystem
  name: string
  version: string
  license: string
  rawLicense: string | null
  licenseSource: string | null
  licenseEvidenceUrl?: string | null
  source: string
  lockfileEntry: string | null
  noticeFiles?: string[]
}

type Options = {
  sourceRoot: string
  gitRevision: string
  productVersion: string
  target?: string
  created?: string
  cargoRegistryRoots?: string[]
}

function readJson(path: string): any { return JSON.parse(readFileSync(path, "utf8")) }
function cacheRoots(): string[] {
  const root = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "registry", "src")
  return existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter(row => row.isDirectory()).map(row => join(root, row.name)) : []
}
function installedCacheDirs(root: string, lockPath: string): string[] {
  const base = lockPath === "bun.lock" ? root : join(root, "apps", "desktop")
  const cachePath = join(base, "node_modules", ".bun")
  return existsSync(cachePath) ? readdirSync(cachePath) : []
}
export function spdxLicense(raw: string): string {
  if (!raw || /[/,;:]|\bSEE LICENSE IN\b|https?:/i.test(raw) || !/^[A-Za-z0-9.()+\- ]+$/.test(raw)) return "NOASSERTION"
  const tokens = raw.match(/\(|\)|AND|OR|WITH|[A-Za-z0-9.+-]+/g)
  if (!tokens || tokens.join("").replaceAll(" ", "") !== raw.replaceAll(" ", "")) return "NOASSERTION"
  let index = 0
  const expression = (): boolean => {
    if (!term()) return false
    while (tokens[index] === "AND" || tokens[index] === "OR") { index++; if (!term()) return false }
    return true
  }
  const term = (): boolean => {
    if (tokens[index] === "(") { index++; return expression() && tokens[index++] === ")" }
    if (!tokens[index] || !SPDX_LICENSE_IDS.has(tokens[index]!)) return false
    index++
    if (tokens[index] === "WITH") { index++; if (!tokens[index] || !SPDX_EXCEPTION_IDS.has(tokens[index]!)) return false; index++ }
    return true
  }
  return expression() && index === tokens.length ? raw : "NOASSERTION"
}
export function cargoSpdxLicense(raw: string): string {
  // Cargo's historical slash spelling denotes OR; Rust's style guide documents this convention.
  return spdxLicense(raw.replace(/\s*\/\s*/g, " OR "))
}
function installedNpmManifest(root: string, lockPath: string, lockKey: string, name: string, version: string, cacheDirs: string[]): string | null {
  const base = lockPath === "bun.lock" ? root : join(root, "apps", "desktop")
  const nested = lockKey.slice(0, Math.max(0, lockKey.length - name.length)).replace(/\/$/, "")
  const candidates = [join(base, "node_modules", name, "package.json")]
  if (nested) {
    const sections = nested.match(/(?:@[^/]+\/)?[^/]+/g) ?? []
    candidates.unshift(join(base, "node_modules", ...sections.flatMap(section => [section, "node_modules"]), name, "package.json"))
  }
  const cachePrefix = `${name.replace("/", "+")}@${version}`
  for (const dir of cacheDirs) if (dir === cachePrefix || dir.startsWith(`${cachePrefix}+`)) {
    candidates.push(join(base, "node_modules", ".bun", dir, "node_modules", name, "package.json"))
  }
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const manifest = readJson(path)
      if (manifest.name === name && manifest.version === version) return path
    } catch { /* A broken installed manifest cannot provide a license. */ }
  }
  return null
}
function npmRows(root: string, lockPath: string, ecosystem: Ecosystem): InventoryRow[] {
  const lock = Bun.JSONC.parse(readFileSync(join(root, lockPath), "utf8")) as { packages?: Record<string, unknown[]> }
  const cacheDirs = installedCacheDirs(root, lockPath)
  return Object.entries(lock.packages ?? {}).flatMap(([key, value]) => {
    const resolved = value[0]
    if (typeof resolved !== "string" || !resolved.includes("@")) throw new Error(`RELEASE_LOCK_ENTRY_INVALID:${lockPath}:${key}`)
    const split = resolved.lastIndexOf("@"), name = resolved.slice(0, split), version = resolved.slice(split + 1)
    if (!name || !version) throw new Error(`RELEASE_LOCK_ENTRY_INVALID:${lockPath}:${key}`)
    if (version.startsWith("workspace:")) return []
    const manifestPath = installedNpmManifest(root, lockPath, key, name, version, cacheDirs)
    const manifest = manifestPath ? readJson(manifestPath) : null
    const rawLicense = typeof manifest?.license === "string" ? manifest.license.trim() : ""
    const license = spdxLicense(rawLicense)
    return [{ ecosystem, name, version, license, rawLicense: license === "NOASSERTION" && rawLicense ? rawLicense : null,
      licenseSource: rawLicense ? "installed package.json" : null,
      source: `https://www.npmjs.com/package/${name}/v/${version}`, lockfileEntry: `${lockPath}#${key}` }]
  })
}
function cargoRows(root: string, revision: string, registryRoots: string[]): InventoryRow[] {
  const path = join(root, "apps", "desktop", "src-tauri", "Cargo.lock")
  const lock = Bun.TOML.parse(readFileSync(path, "utf8")) as { package?: Array<{ name: string; version: string; source?: string }> }
  const local = Bun.TOML.parse(readFileSync(join(root, "apps", "desktop", "src-tauri", "Cargo.toml"), "utf8")) as { package?: { name: string; version: string; license?: string } }
  return (lock.package ?? []).map(pkg => {
    const localMatch = !pkg.source && local.package?.name === pkg.name && local.package?.version === pkg.version
    let license = localMatch && typeof local.package?.license === "string" ? local.package.license : "NOASSERTION"
    let licenseSource: string | null = localMatch && license !== "NOASSERTION" ? "apps/desktop/src-tauri/Cargo.toml" : null
    if (!localMatch) {
      for (const registryRoot of registryRoots) {
        for (const manifestName of ["Cargo.toml", "Cargo.toml.orig"]) {
          const metadataPath = join(registryRoot, `${pkg.name}-${pkg.version}`, manifestName)
          if (!existsSync(metadataPath)) continue
          try {
            const metadata = Bun.TOML.parse(readFileSync(metadataPath, "utf8")) as { package?: { name?: string; version?: string; license?: string } }
            if (metadata.package?.name !== pkg.name || metadata.package?.version !== pkg.version || !metadata.package.license) continue
            license = metadata.package.license
            licenseSource = `cargo-registry/${manifestName}`
            break
          } catch { /* Missing or unreadable registry metadata stays unresolved. */ }
        }
        if (licenseSource) break
      }
    }
    const rawLicense = license
    license = cargoSpdxLicense(license)
    const localManifestUrl = `https://github.com/bakiacikgoz/MathOS/blob/${revision}/apps/desktop/src-tauri/Cargo.toml`
    return { ecosystem: localMatch ? "workspace" as const : "cargo" as const, name: pkg.name, version: pkg.version, license, rawLicense: rawLicense !== license && rawLicense !== "NOASSERTION" ? rawLicense : null, licenseSource,
      licenseEvidenceUrl: localMatch && licenseSource ? localManifestUrl : null,
      source: pkg.source?.startsWith("registry+") ? `https://crates.io/crates/${pkg.name}/${pkg.version}` :
        localMatch ? localManifestUrl : pkg.source ?? "NOASSERTION", lockfileEntry: `apps/desktop/src-tauri/Cargo.lock#${pkg.name}@${pkg.version}` }
  })
}
function workspaceRows(root: string, revision: string): InventoryRow[] {
  const paths = ["package.json"]
  const rootManifest = readJson(join(root, "package.json")) as { license?: string }
  const repositoryLicense = existsSync(join(root, "LICENSE")) ? spdxLicense(rootManifest.license?.trim() ?? "") : "NOASSERTION"
  for (const parent of ["apps", "packages"]) {
    const dir = join(root, parent)
    if (!existsSync(dir)) continue
    paths.push(...readdirSync(dir, { withFileTypes: true }).filter(row => row.isDirectory() && existsSync(join(dir, row.name, "package.json"))).map(row => `${parent}/${row.name}/package.json`))
  }
  return paths.map(path => {
    const pkg = readJson(join(root, path)) as { name: string; version: string; license?: string }
    const rawLicense = pkg.license?.trim() || ""
    const declared = spdxLicense(rawLicense)
    const license = !rawLicense && path !== "package.json" ? repositoryLicense : declared
    return { ecosystem: "workspace" as const, name: pkg.name, version: pkg.version, license, rawLicense: license === "NOASSERTION" && rawLicense ? rawLicense : null,
      licenseSource: rawLicense ? path : license !== "NOASSERTION" ? "LICENSE (repository scope)" : null,
      licenseEvidenceUrl: rawLicense ? `https://github.com/bakiacikgoz/MathOS/blob/${revision}/${path}` : license !== "NOASSERTION" ? `https://github.com/bakiacikgoz/MathOS/blob/${revision}/LICENSE` : null,
      source: `https://github.com/bakiacikgoz/MathOS/blob/${revision}/${path}`, lockfileEntry: null }
  })
}
function noticeTexts(directory: string): Array<{ file: string; text: string }> {
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter(file => /^(?:LICEN[CS]E|COPYING|NOTICE)(?:[.\-_].*)?$/i.test(file))
    .sort((a, b) => a.localeCompare(b)).flatMap(file => {
      const path = join(directory, file)
      if (!statSync(path).isFile() || statSync(path).size > 512_000) return []
      try { return [{ file, text: readFileSync(path, "utf8") }] } catch { return [] }
    })
}
function localNotices(root: string, rows: InventoryRow[], registryRoots: string[]): string {
  const npmCaches = { "bun.lock": installedCacheDirs(root, "bun.lock"), "apps/desktop/bun.lock": installedCacheDirs(root, "apps/desktop/bun.lock") }
  const sections: string[] = []
  for (const row of rows) {
    if (row.ecosystem === "workspace") continue
    let directory: string | null = null
    if (row.ecosystem === "npm-root" || row.ecosystem === "npm-desktop") {
      const lockPath = row.ecosystem === "npm-root" ? "bun.lock" : "apps/desktop/bun.lock"
      const key = row.lockfileEntry!.slice(lockPath.length + 1)
      const manifest = installedNpmManifest(root, lockPath, key, row.name, row.version, npmCaches[lockPath])
      if (manifest) directory = join(manifest, "..")
    } else for (const registryRoot of registryRoots) {
      const candidate = join(registryRoot, `${row.name}-${row.version}`)
      if (existsSync(candidate)) { directory = candidate; break }
    }
    const notices = directory ? noticeTexts(directory) : []
    row.noticeFiles = notices.map(entry => entry.file)
    if (notices.length) sections.push(`=== ${row.ecosystem} ${row.name}@${row.version} ===\nSource: ${row.source}\nLicense declaration: ${row.license}\n${notices.map(entry => `--- ${entry.file} ---\n${entry.text.trimEnd()}`).join("\n\n")}`)
  }
  const identifierAttribution = spdxIdData.sources.map(source => `${source.package} ${source.version}, ${source.license}, ${source.author}, ${source.url}`).join("\n")
  return `MathOS third-party license and notice texts\nThese are exact texts found in installed package or crate source directories for the locked versions. Entries without available texts are identified in THIRD_PARTY_LICENSES.json.\nSPDX identifier reference data:\n${identifierAttribution}\n\n${sections.join("\n\n")}\n`
}

export function createReleaseDependencyInventory(options: Options) {
  if (!/^[0-9a-f]{40}$/.test(options.gitRevision)) throw new Error("RELEASE_SOURCE_REVISION_INVALID")
  const rows = [
    ...workspaceRows(options.sourceRoot, options.gitRevision),
    ...npmRows(options.sourceRoot, "bun.lock", "npm-root"),
    ...npmRows(options.sourceRoot, "apps/desktop/bun.lock", "npm-desktop"),
    ...cargoRows(options.sourceRoot, options.gitRevision, options.cargoRegistryRoots ?? cacheRoots()),
  ].sort((a, b) => {
    const order = ["workspace", "npm-root", "npm-desktop", "cargo"]
    return order.indexOf(a.ecosystem) - order.indexOf(b.ecosystem) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }) || (a.lockfileEntry ?? "").localeCompare(b.lockfileEntry ?? "")
  })
  const notices = localNotices(options.sourceRoot, rows, options.cargoRegistryRoots ?? cacheRoots())
  const packages = rows.map(row => ({
    SPDXID: `SPDXRef-Package-${createHash("sha256").update([row.ecosystem, row.name, row.version, row.lockfileEntry].join("\0")).digest("hex").slice(0, 20)}`,
    name: row.name, versionInfo: row.version, downloadLocation: "NOASSERTION", filesAnalyzed: false,
    licenseConcluded: "NOASSERTION", licenseDeclared: row.license, copyrightText: "NOASSERTION",
    sourceInfo: `${row.ecosystem}; ${row.lockfileEntry ?? "workspace package.json"}; ${row.source}`,
  }))
  const unresolved = rows.filter(row => row.license === "NOASSERTION")
  const missingNoticeCount = rows.filter(row => row.ecosystem !== "workspace" && !row.noticeFiles?.length).length
  const runtimeAssetPackages = ["@lobehub/icons-static-svg", "mathlive"].flatMap(name => rows.filter(row => row.ecosystem === "npm-desktop" && row.name === name)
    .map(row => ({ name, version: row.version, license: row.license, metadataFound: row.licenseSource !== null })))
  const licenses = { schemaVersion: "mathos.third-party-licenses.v1", gitRevision: options.gitRevision, productVersion: options.productVersion,
    coverage: "All packages in root Bun lock, desktop Bun lock, desktop Cargo.lock, and local JS workspaces. Lock entries include development, optional, and other-platform packages; this is a conservative superset of shipped code.",
    runtimeAssetPackages, packages: rows, unresolvedCount: unresolved.length, missingNoticeCount,
    complete: unresolved.length === 0 && missingNoticeCount === 0, releaseBlocked: unresolved.length > 0 || missingNoticeCount > 0,
    limitations: ["Lockfiles include development, optional, and other-platform packages, and this inventory does not identify the exact contents of each compiled binary.", "Missing third-party notice texts and license declarations require separate review before publication."] }
  const sbom = { spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", name: `mathos-${options.productVersion}-${options.target ?? "universal"}-${options.gitRevision.slice(0, 12)}`,
    documentNamespace: `https://github.com/bakiacikgoz/MathOS/spdx/${options.gitRevision}/${encodeURIComponent(options.productVersion)}/${encodeURIComponent(options.target ?? "universal")}`,
    creationInfo: { creators: ["Tool: MathOS dependency-inventory"], created: options.created ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z") },
    packages, relationships: packages.map(pkg => ({ spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: pkg.SPDXID })) }
  return { sbom, licenses, notices }
}
