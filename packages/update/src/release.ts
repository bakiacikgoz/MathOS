import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { compareVersionStrings } from "./index.ts"

/** Where MathOS releases are published. Every download is checked against the release's SHA256SUMS. */
export const RELEASE_REPOSITORY = "bakiacikgoz/MathOS"

export interface ReleaseInfo {
  version: string
  /** The release page, with its notes and every file. */
  url: string
  publishedAt: string | null
  notes: string
}

export interface ReleaseSource {
  fetch?: typeof fetch
  /** Defaults to the GitHub repository; tests and mirrors pass their own. */
  repository?: string
  apiBase?: string
  webBase?: string
  userAgent?: string
  signal?: AbortSignal
}

const TAG = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/
const MAX_SUMS_BYTES = 64 * 1024

function endpoints(source: ReleaseSource) {
  const repository = source.repository ?? RELEASE_REPOSITORY
  return { repository, api: `${(source.apiBase ?? "https://api.github.com").replace(/\/$/, "")}/repos/${repository}`, web: `${(source.webBase ?? "https://github.com").replace(/\/$/, "")}/${repository}` }
}

/**
 * The newest published stable release. The GitHub API gives the notes; when it refuses (its anonymous limit is 60
 * requests an hour per address) the release page's redirect still names the version.
 */
export async function latestRelease(source: ReleaseSource = {}): Promise<ReleaseInfo> {
  const get = source.fetch ?? fetch, { api, web } = endpoints(source)
  const headers = { accept: "application/vnd.github+json", "user-agent": source.userAgent ?? "MathOS" }
  let apiFailure = ""
  try {
    const response = await get(`${api}/releases/latest`, { headers, signal: source.signal })
    if (response.ok) {
      const body = await response.json() as { tag_name?: unknown; html_url?: unknown; published_at?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown }
      const version = typeof body.tag_name === "string" ? TAG.exec(body.tag_name)?.[1] : undefined
      if (version && body.draft !== true && body.prerelease !== true) {
        return { version, url: typeof body.html_url === "string" && body.html_url.startsWith("https://") ? body.html_url : `${web}/releases/tag/v${version}`, publishedAt: typeof body.published_at === "string" ? body.published_at : null, notes: typeof body.body === "string" ? body.body.slice(0, 20_000) : "" }
      }
      apiFailure = "the latest release has no version tag"
    } else apiFailure = `GitHub answered ${response.status}`
  } catch (error) {
    if (source.signal?.aborted) throw error
    apiFailure = error instanceof Error ? error.message : String(error)
  }
  try {
    const response = await get(`${web}/releases/latest`, { method: "HEAD", redirect: "manual", headers: { "user-agent": headers["user-agent"] }, signal: source.signal })
    const location = response.headers.get("location") ?? (response.url && response.url !== `${web}/releases/latest` ? response.url : "")
    const version = TAG.exec(location.split("/").pop() ?? "")?.[1]
    if (version) return { version, url: `${web}/releases/tag/v${version}`, publishedAt: null, notes: "" }
  } catch (error) {
    if (source.signal?.aborted) throw error
  }
  throw new Error(`UPDATE_SOURCE_UNREACHABLE: ${apiFailure || "no release found"}`)
}

export interface UpdateStatus { schemaVersion: "mathos.update-status.v1"; currentVersion: string; latestVersion: string; available: boolean; url: string; publishedAt: string | null; notes: string; checkedAt: string }

/** Is the latest release newer than this one? Prereleases and equal versions are never offered. */
export function updateStatus(currentVersion: string, release: ReleaseInfo, now = new Date()): UpdateStatus {
  const newer = compareVersionStrings(release.version, currentVersion)
  return { schemaVersion: "mathos.update-status.v1", currentVersion, latestVersion: release.version, available: newer !== null && newer > 0 && !release.version.includes("-"), url: release.url, publishedAt: release.publishedAt, notes: release.notes, checkedAt: now.toISOString() }
}

/** The file of a release for this computer: the CLI archive, its installer script, or the desktop setup. */
export function releaseAssetName(kind: "cli" | "installer" | "desktop", version: string, platform: NodeJS.Platform, arch: string): string {
  const os = platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : null
  const cpu = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : null
  if (!os || !cpu) throw new Error(`UPDATE_PLATFORM_UNSUPPORTED: ${platform}-${arch}`)
  if (kind === "installer") return os === "windows" ? "install.ps1" : "install.sh"
  if (kind === "desktop") {
    if (os !== "windows" || cpu !== "x64") throw new Error(`UPDATE_DESKTOP_PLATFORM_UNSUPPORTED: ${platform}-${arch}`)
    return `MathOS-${version}-windows-x64-setup.exe`
  }
  return `mathos-${version}-${os}-${cpu}.tar.gz`
}

/** `SHA256SUMS` lines are `<64 hex>  <name>`; a name listed twice is refused rather than guessed. */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>(), seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *]?(\S.*)$/.exec(line.trim())
    if (!match) continue
    const name = match[2]!.trim()
    if (seen.has(name)) throw new Error(`UPDATE_CHECKSUM_DUPLICATED: ${name}`)
    seen.add(name); sums.set(name, match[1]!.toLowerCase())
  }
  return sums
}

async function download(get: typeof fetch, url: string, source: ReleaseSource, limit: number): Promise<Uint8Array> {
  if (!url.startsWith("https://") && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`UPDATE_URL_UNSAFE: ${url}`)
  const response = await get(url, { headers: { "user-agent": source.userAgent ?? "MathOS" }, signal: source.signal })
  if (!response.ok) throw new Error(`UPDATE_DOWNLOAD_FAILED: ${url} answered ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > limit) throw new Error(`UPDATE_DOWNLOAD_TOO_LARGE: ${url}`)
  return bytes
}

/**
 * Downloads one file of a release into `directory` and keeps it only if its SHA-256 matches the release's SHA256SUMS.
 * The file is written under a temporary name and renamed when complete, so a half-written file is never left as the asset.
 */
export async function downloadReleaseAsset(input: { version: string; name: string; directory: string; maxBytes?: number } & ReleaseSource): Promise<{ path: string; sha256: string; bytes: number }> {
  const get = input.fetch ?? fetch, { web } = endpoints(input), base = `${web}/releases/download/v${input.version}`
  if (!/^[A-Za-z0-9._-]+$/.test(input.name)) throw new Error(`UPDATE_ASSET_NAME_INVALID: ${input.name}`)
  const sums = parseSha256Sums(new TextDecoder().decode(await download(get, `${base}/SHA256SUMS`, input, MAX_SUMS_BYTES)))
  const expected = sums.get(input.name)
  if (!expected) throw new Error(`UPDATE_CHECKSUM_MISSING: ${input.name}`)
  const bytes = await download(get, `${base}/${input.name}`, input, input.maxBytes ?? 1024 * 1024 * 1024)
  const actual = createHash("sha256").update(bytes).digest("hex")
  if (actual !== expected) throw new Error(`UPDATE_CHECKSUM_MISMATCH: ${input.name}`)
  mkdirSync(input.directory, { recursive: true })
  const path = join(input.directory, input.name), partial = `${path}.${randomUUID()}.part`
  try { writeFileSync(partial, bytes, { mode: 0o700 }); rmSync(path, { force: true }); renameSync(partial, path) }
  finally { rmSync(partial, { force: true }) }
  return { path, sha256: actual, bytes: bytes.byteLength }
}
