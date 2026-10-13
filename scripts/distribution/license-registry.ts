import { cargoSpdxLicense, createReleaseDependencyInventory, licenseGate, spdxLicense } from "./dependency-inventory.ts"
import { gunzipSync } from "node:zlib"

type Inventory = ReturnType<typeof createReleaseDependencyInventory>
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
type Options = { fetcher?: Fetcher; maxRequests?: number; maxNoticeRequests?: number; timeoutMs?: number; concurrency?: number; retryDelayMs?: number }

const REGISTRY_ATTEMPTS = 3

/** A dropped connection, a timeout, 429 or 5xx is retried; any other answer is final. */
async function fetchWithRetry(fetcher: Fetcher, url: string, init: () => RequestInit, delayMs: number): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetcher(url, init())
      if ((response.status !== 429 && response.status < 500) || attempt === REGISTRY_ATTEMPTS) return response
      await response.body?.cancel()
    } catch (error) {
      if (attempt === REGISTRY_ATTEMPTS) throw error
    }
    await Bun.sleep(delayMs * 2 ** (attempt - 1))
  }
}

const OVERSIZED = Buffer.alloc(0)

/** The body, OVERSIZED past the limit, or null when the transfer broke off. */
async function limitedBody(response: Response, limit: number): Promise<Buffer | null> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); return OVERSIZED }
      chunks.push(Buffer.from(value))
    }
  } catch { return null }
  return Buffer.concat(chunks)
}

/** Notice files in a package archive; null when the archive cannot be read, so "no notice" is never assumed. */
function tarNotices(compressed: Buffer): Array<{ file: string; text: string }> | null {
  let tar: Buffer
  try { tar = gunzipSync(compressed, { maxOutputLength: 160_000_000 }) } catch { return null }
  const matches: Array<{ file: string; text: string }> = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString("utf8").split("\0")[0] ?? ""
    if (!name) break
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").split("\0")[0]?.trim() ?? "", 8)
    if (!Number.isFinite(size) || size < 0 || offset + 512 + size > tar.length) return null
    const basename = name.split("/").at(-1) ?? ""
    if (/^(?:LICEN[CS]E|COPYING|NOTICE)(?:[.\-_].*)?$/i.test(basename) && size <= 512_000 && matches.length < 8) {
      try { matches.push({ file: name, text: new TextDecoder("utf-8", { fatal: true }).decode(tar.subarray(offset + 512, offset + 512 + size)) }) } catch { /* Binary file is not notice text. */ }
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return matches
}

export async function enrichReleaseDependencyInventory(inventory: Inventory, options: Options = {}): Promise<void> {
  const fetcher = options.fetcher ?? fetch
  const maxRequests = Math.max(0, Math.min(options.maxRequests ?? 256, 2000))
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 16))
  const timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 8000, 30000))
  const maxNoticeRequests = Math.max(0, Math.min(options.maxNoticeRequests ?? 256, 2000))
  const retryDelayMs = Math.max(0, Math.min(options.retryDelayMs ?? 1000, 10_000))
  const candidates = inventory.licenses.packages.map((row, index) => ({ row, index }))
    .filter(({ row }) => row.distribution !== "not-distributed" && (row.license === "NOASSERTION" || !row.noticeFiles?.length) && (row.ecosystem === "npm-root" || row.ecosystem === "npm-desktop" || row.ecosystem === "cargo"))
    .sort((a, b) => Number(b.row.license === "NOASSERTION") - Number(a.row.license === "NOASSERTION"))
    .slice(0, maxRequests)
  const results = { attempted: 0, resolved: 0, failures: 0, requestLimit: maxRequests, noticesAttempted: 0, noticesResolved: 0, noticeRequestLimit: maxNoticeRequests }
  const tarballCandidates: Array<{ row: (typeof candidates)[number]["row"]; url: string }> = []
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const { row, index } = candidates[cursor++]!
      const url = row.ecosystem === "cargo" ? `https://crates.io/api/v1/crates/${encodeURIComponent(row.name)}/${encodeURIComponent(row.version)}` :
        `https://registry.npmjs.org/${encodeURIComponent(row.name)}/${encodeURIComponent(row.version)}`
      results.attempted++
      try {
        const response = await fetchWithRetry(fetcher, url, () => ({ signal: AbortSignal.timeout(timeoutMs), redirect: "error", credentials: "omit", headers: { Accept: "application/json" } }), retryDelayMs)
        if (!response.ok) { results.failures++; continue }
        const body = await response.json() as any
        const exactVersion = row.ecosystem === "cargo" ? body?.version?.num : body?.version
        const exactName = row.ecosystem === "cargo" ? row.name : body?.name
        if (exactVersion !== row.version || exactName !== row.name) { results.failures++; continue }
        const raw = row.ecosystem === "cargo" ? body?.version?.license : body?.license
        const license = typeof raw === "string" ? row.ecosystem === "cargo" ? cargoSpdxLicense(raw.trim()) : spdxLicense(raw.trim()) : "NOASSERTION"
        if (license === "NOASSERTION") { if (typeof raw === "string" && raw.trim()) row.rawLicense = raw.trim() }
        else if (row.license === "NOASSERTION") {
          row.license = license
          row.licenseSource = url
          row.rawLicense = null
          inventory.sbom.packages[index]!.licenseDeclared = license
          results.resolved++
        }
        if (!row.noticeFiles?.length) {
          const archiveUrl = row.ecosystem === "cargo" ? `https://static.crates.io/crates/${encodeURIComponent(row.name)}/${encodeURIComponent(row.name)}-${encodeURIComponent(row.version)}.crate` : body?.dist?.tarball
          if (typeof archiveUrl === "string") {
            const parsed = new URL(archiveUrl)
            if (parsed.protocol === "https:" && ["registry.npmjs.org", "static.crates.io"].includes(parsed.hostname)) tarballCandidates.push({ row, url: archiveUrl })
          }
        }
      } catch { results.failures++ }
    }
  }))
  let noticeCursor = 0
  const remoteNoticeSections: string[] = []
  const noticeQueue = tarballCandidates.slice(0, maxNoticeRequests)
  await Promise.all(Array.from({ length: Math.min(concurrency, noticeQueue.length) }, async () => {
    while (noticeCursor < noticeQueue.length) {
      const { row, url } = noticeQueue[noticeCursor++]!
      results.noticesAttempted++
      try {
        let body: Buffer | null = null
        for (let attempt = 1; attempt <= REGISTRY_ATTEMPTS && !body; attempt++) {
          const response = await fetchWithRetry(fetcher, url, () => ({ signal: AbortSignal.timeout(timeoutMs), redirect: "error", credentials: "omit" }), retryDelayMs)
          if (!response.ok) break
          body = await limitedBody(response, 24_000_000)
          // An archive over the size limit stays unread; only a broken transfer is read again.
          if (body === OVERSIZED) { body = null; break }
        }
        if (!body) continue
        const notices = tarNotices(body)
        if (!notices) continue
        if (!notices.length) { row.noticeSearch = "registry-archive"; continue }
        row.noticeFiles = notices.map(notice => notice.file)
        remoteNoticeSections.push(`=== ${row.ecosystem} ${row.name}@${row.version} ===\nSource: ${row.source}\nLicense declaration: ${row.license}\nNotice archive: ${url}\n${notices.map(notice => `--- ${notice.file} ---\n${notice.text.trimEnd()}`).join("\n\n")}`)
        results.noticesResolved++
      } catch { /* Missing archive remains a release blocker. */ }
    }
  }))
  if (remoteNoticeSections.length) inventory.notices += `${remoteNoticeSections.sort((a, b) => a.localeCompare(b)).join("\n\n")}\n`
  Object.assign(inventory.licenses, licenseGate(inventory.licenses.packages))
  Object.assign(inventory.licenses, { registryEnrichment: results })
}
