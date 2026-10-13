import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import spdxIdData from "./spdx-license-id-data.json"

const SPDX_LICENSE_IDS = new Set(spdxIdData.licenseIds)
const SPDX_EXCEPTION_IDS = new Set(spdxIdData.exceptionIds)

type Ecosystem = "workspace" | "runtime" | "npm-root" | "npm-desktop" | "cargo"
const ECOSYSTEM_ORDER: Ecosystem[] = ["workspace", "runtime", "npm-root", "npm-desktop", "cargo"]
export type LicenseReview = { decision: "not-distributed"; ecosystem: Ecosystem; packages: string[]; reviewedAt: string; reason: string; evidence: string }
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
  /** A source copy of this exact version was searched and holds no license or notice file. */
  noticeSearch?: "installed-package" | "registry-archive"
  noticeBasis?: "spdx-standard-text"
  distribution?: "not-distributed"
  review?: Omit<LicenseReview, "ecosystem" | "packages">
}

type Options = {
  sourceRoot: string
  gitRevision: string
  productVersion: string
  target?: string
  created?: string
  cargoRegistryRoots?: string[]
  /** Reviewed packages; defaults to license-review.json next to this file. */
  reviews?: LicenseReview[]
  /** Version of the Bun runtime that compiled executables embed; null leaves it out. */
  bunRuntimeVersion?: string | null
}

const LICENSE_TEXT_ROOT = join(import.meta.dir, "license-texts")

export function loadLicenseReviews(path = join(import.meta.dir, "license-review.json")): LicenseReview[] {
  const data = readJson(path)
  if (data?.schemaVersion !== "mathos.license-review.v1" || !Array.isArray(data.reviews)) throw new Error("LICENSE_REVIEW_INVALID")
  for (const review of data.reviews) {
    if (review?.decision !== "not-distributed" || !ECOSYSTEM_ORDER.includes(review.ecosystem) || review.ecosystem === "workspace" || !Array.isArray(review.packages) || !review.packages.length
      || review.packages.some((id: unknown) => typeof id !== "string" || !/^.+@[^@]+$/.test(id)) || !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)
      || typeof review.reason !== "string" || !review.reason.trim() || typeof review.evidence !== "string" || !review.evidence.trim()) throw new Error("LICENSE_REVIEW_INVALID")
  }
  return data.reviews
}

/** Packages reviewed as not distributed stay in the inventory but cannot block or unblock the release. */
export function licenseGate(rows: InventoryRow[]) {
  const gated = rows.filter(row => row.distribution !== "not-distributed")
  const unresolvedCount = gated.filter(row => row.license === "NOASSERTION").length
  const missingNoticeCount = gated.filter(row => row.ecosystem !== "workspace" && !row.noticeFiles?.length).length
  const complete = unresolvedCount === 0 && missingNoticeCount === 0
  return { unresolvedCount, missingNoticeCount, notDistributedCount: rows.length - gated.length, complete, releaseBlocked: !complete }
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
function runtimeRows(version: string | null): InventoryRow[] {
  if (!version) return []
  const license = `https://github.com/oven-sh/bun/blob/bun-v${version}/LICENSE.md`
  return [{ ecosystem: "runtime", name: "bun", version, license: "MIT", rawLicense: null, licenseSource: license, licenseEvidenceUrl: license,
    source: `https://github.com/oven-sh/bun/tree/bun-v${version}`, lockfileEntry: null }]
}
function runtimeNotice(row: InventoryRow): string | null {
  const path = join(LICENSE_TEXT_ROOT, "runtime", `${row.name}-${row.version}-LICENSE.md`)
  if (!existsSync(path)) { row.noticeFiles = []; return null }
  const lgpl = ["LGPL-2.0-only", "LGPL-2.1-only"]
  row.noticeFiles = [`${row.name}-${row.version}-LICENSE.md`, ...lgpl.map(id => `spdx-standard-text:${id}`)]
  return `=== runtime ${row.name}@${row.version} ===\nSource: ${row.source}\nLicense declaration: ${row.license}\n`
    + `MathOS executables (the mathos command and the desktop engine) are built with bun build --compile and embed this Bun runtime, which statically links the LGPL-licensed JavaScriptCore and the libraries below. `
    + `The runtime source, including the patched WebKit it links, is at ${row.source} and https://github.com/oven-sh/WebKit; the complete MathOS source for this release is named in SOURCE.json, so the executables can be rebuilt against a modified runtime.\n`
    + `--- ${row.noticeFiles[0]} ---\n${readFileSync(path, "utf8").trimEnd()}\n\n`
    + lgpl.map(id => `--- ${id} (SPDX standard text) ---\n${readFileSync(join(LICENSE_TEXT_ROOT, "spdx", `${id}.txt`), "utf8").trimEnd()}`).join("\n\n")
}
function localNotices(root: string, rows: InventoryRow[], registryRoots: string[]): string {
  const npmCaches = { "bun.lock": installedCacheDirs(root, "bun.lock"), "apps/desktop/bun.lock": installedCacheDirs(root, "apps/desktop/bun.lock") }
  const sections: string[] = []
  for (const row of rows) {
    if (row.ecosystem === "workspace") continue
    if (row.ecosystem === "runtime") { const section = runtimeNotice(row); if (section) sections.push(section); continue }
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
    if (directory && !notices.length) row.noticeSearch = "installed-package"
    if (notices.length) sections.push(`=== ${row.ecosystem} ${row.name}@${row.version} ===\nSource: ${row.source}\nLicense declaration: ${row.license}\n${notices.map(entry => `--- ${entry.file} ---\n${entry.text.trimEnd()}`).join("\n\n")}`)
  }
  const identifierAttribution = spdxIdData.sources.map(source => `${source.package} ${source.version}, ${source.license}, ${source.author}, ${source.url}`).join("\n")
  return `MathOS third-party license and notice texts\nThese are exact texts found in installed package or crate source directories for the locked versions. Entries without available texts are identified in THIRD_PARTY_LICENSES.json.\nSPDX identifier reference data:\n${identifierAttribution}\n\n${sections.join("\n\n")}\n`
}

export function createReleaseDependencyInventory(options: Options) {
  if (!/^[0-9a-f]{40}$/.test(options.gitRevision)) throw new Error("RELEASE_SOURCE_REVISION_INVALID")
  const rows = [
    ...workspaceRows(options.sourceRoot, options.gitRevision),
    ...runtimeRows(options.bunRuntimeVersion === undefined ? Bun.version : options.bunRuntimeVersion),
    ...npmRows(options.sourceRoot, "bun.lock", "npm-root"),
    ...npmRows(options.sourceRoot, "apps/desktop/bun.lock", "npm-desktop"),
    ...cargoRows(options.sourceRoot, options.gitRevision, options.cargoRegistryRoots ?? cacheRoots()),
  ].sort((a, b) => {
    return ECOSYSTEM_ORDER.indexOf(a.ecosystem) - ECOSYSTEM_ORDER.indexOf(b.ecosystem) || a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }) || (a.lockfileEntry ?? "").localeCompare(b.lockfileEntry ?? "")
  })
  for (const review of options.reviews ?? loadLicenseReviews()) {
    const { ecosystem, packages: ids, ...decision } = review
    for (const row of rows) if (row.ecosystem === ecosystem && ids.includes(`${row.name}@${row.version}`)) { row.distribution = "not-distributed"; row.review = decision }
  }
  const notices = localNotices(options.sourceRoot, rows, options.cargoRegistryRoots ?? cacheRoots())
  const packages = rows.map(row => ({
    SPDXID: `SPDXRef-Package-${createHash("sha256").update([row.ecosystem, row.name, row.version, row.lockfileEntry].join("\0")).digest("hex").slice(0, 20)}`,
    name: row.name, versionInfo: row.version, downloadLocation: "NOASSERTION", filesAnalyzed: false,
    licenseConcluded: "NOASSERTION", licenseDeclared: row.license, copyrightText: "NOASSERTION",
    sourceInfo: `${row.ecosystem}; ${row.lockfileEntry ?? "workspace package.json"}; ${row.source}`,
  }))
  const runtimeAssetPackages = ["@lobehub/icons-static-svg", "mathlive"].flatMap(name => rows.filter(row => row.ecosystem === "npm-desktop" && row.name === name)
    .map(row => ({ name, version: row.version, license: row.license, metadataFound: row.licenseSource !== null })))
  const licenses = { schemaVersion: "mathos.third-party-licenses.v1", gitRevision: options.gitRevision, productVersion: options.productVersion,
    coverage: "All packages in root Bun lock, desktop Bun lock, desktop Cargo.lock, local JS workspaces, and the Bun runtime embedded in compiled executables. Lock entries include development, optional, and other-platform packages; this is a conservative superset of shipped code.",
    reviewPolicy: "Packages marked distribution=not-distributed were reviewed against the release bundles (scripts/distribution/license-review.json) and are listed but excluded from the release gate. Packages with noticeBasis=spdx-standard-text declare a valid SPDX license but ship no license file in their source copy; the standard SPDX text is reproduced instead.",
    runtimeAssetPackages, packages: rows, ...licenseGate(rows),
    limitations: ["Lockfiles include development, optional, and other-platform packages, and this inventory does not identify the exact contents of each compiled binary.", "A package that declares no valid SPDX license or has no notice text blocks the release until it is reviewed."] }
  const sbom = { spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", name: `mathos-${options.productVersion}-${options.target ?? "universal"}-${options.gitRevision.slice(0, 12)}`,
    documentNamespace: `https://github.com/bakiacikgoz/MathOS/spdx/${options.gitRevision}/${encodeURIComponent(options.productVersion)}/${encodeURIComponent(options.target ?? "universal")}`,
    creationInfo: { creators: ["Tool: MathOS dependency-inventory"], created: options.created ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z") },
    packages, relationships: packages.map(pkg => ({ spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: pkg.SPDXID })) }
  return { sbom, licenses, notices }
}

const STANDARD_TEXT_PREFERENCE = ["MIT", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "ISC", "0BSD", "Zlib", "BlueOak-1.0.0", "Unlicense", "CC0-1.0", "CC-BY-3.0", "MPL-2.0"]
function standardTextChoice(expression: string, available: Set<string>): string[] | null {
  const tokens = expression.replace(/[()]/g, " ").split(/\s+/).filter(Boolean)
  if (tokens.includes("WITH")) return null
  const ids = tokens.filter(token => token !== "AND" && token !== "OR")
  if (tokens.includes("AND")) return ids.every(id => available.has(id)) ? [...new Set(ids)] : null
  const offered = ids.filter(id => available.has(id)).sort((a, b) => STANDARD_TEXT_PREFERENCE.indexOf(a) - STANDARD_TEXT_PREFERENCE.indexOf(b))
  return offered.length ? [offered[0]!] : null
}

/**
 * Covers packages that declare a valid SPDX license but whose exact-version source copy has no license file
 * (common for per-platform binary packages), by reproducing the standard SPDX text. Run after registry enrichment:
 * a package whose source copy was never searched keeps blocking the release.
 */
export function applyStandardLicenseTexts(inventory: ReturnType<typeof createReleaseDependencyInventory>, textRoot = join(LICENSE_TEXT_ROOT, "spdx")): void {
  const available = new Set(readdirSync(textRoot).filter(file => file.endsWith(".txt")).map(file => file.slice(0, -4)))
  const used = new Set<string>()
  const sections: string[] = []
  for (const row of inventory.licenses.packages) {
    if (row.ecosystem === "workspace" || row.distribution === "not-distributed" || row.noticeFiles?.length || !row.noticeSearch || row.license === "NOASSERTION") continue
    const ids = standardTextChoice(row.license, available)
    if (!ids) continue
    row.noticeFiles = ids.map(id => `spdx-standard-text:${id}`)
    row.noticeBasis = "spdx-standard-text"
    for (const id of ids) used.add(id)
    sections.push(`=== ${row.ecosystem} ${row.name}@${row.version} ===\nSource: ${row.source}\nLicense declaration: ${row.license}\n`
      + `The ${row.noticeSearch === "registry-archive" ? "registry archive" : "installed copy"} of this exact version contains no license or notice file. Used under ${ids.join(" and ")}; the standard SPDX text is reproduced under "Standard license texts" below. Copyright holders are as stated in the package source.`)
  }
  if (sections.length) inventory.notices += `\n${sections.sort((a, b) => a.localeCompare(b)).join("\n\n")}\n\n=== Standard license texts (SPDX License List, https://spdx.org/licenses/) ===\n`
    + `${[...used].sort().map(id => `--- ${id} ---\n${readFileSync(join(textRoot, `${id}.txt`), "utf8").trimEnd()}`).join("\n\n")}\n`
  Object.assign(inventory.licenses, licenseGate(inventory.licenses.packages))
}
