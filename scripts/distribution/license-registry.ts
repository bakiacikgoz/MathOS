import { cargoSpdxLicense, createReleaseDependencyInventory, spdxLicense } from "./dependency-inventory.ts"
import { gunzipSync } from "node:zlib"

type Inventory = ReturnType<typeof createReleaseDependencyInventory>
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
type Options = { fetcher?: Fetcher; maxRequests?: number; maxNoticeRequests?: number; timeoutMs?: number; concurrency?: number }

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
      if (size > limit) { await reader.cancel(); return null }
      chunks.push(Buffer.from(value))
    }
  } catch { return null }
  return Buffer.concat(chunks)
}

function tarNotices(compressed: Buffer): Array<{ file: string; text: string }> {
  let tar: Buffer
  try { tar = gunzipSync(compressed, { maxOutputLength: 48_000_000 }) } catch { return [] }
  const matches: Array<{ file: string; text: string }> = []
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    const name = header.subarray(0, 100).toString("utf8").split("\0")[0] ?? ""
    if (!name) break
    const size = Number.parseInt(header.subarray(124, 136).toString("ascii").split("\0")[0]?.trim() ?? "", 8)
    if (!Number.isFinite(size) || size < 0 || offset + 512 + size > tar.length) break
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
  const maxRequests = Math.max(0, Math.min(options.maxRequests ?? 256, 1000))
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 16))
  const timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 8000, 30000))
  const maxNoticeRequests = Math.max(0, Math.min(options.maxNoticeRequests ?? 256, 1000))
  const candidates = inventory.licenses.packages.map((row, index) => ({ row, index }))
    .filter(({ row }) => (row.license === "NOASSERTION" || !row.noticeFiles?.length) && (row.ecosystem === "npm-root" || row.ecosystem === "npm-desktop" || row.ecosystem === "cargo"))
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
        const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error", credentials: "omit", headers: { Accept: "application/json" } })
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
        const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error", credentials: "omit" })
        if (!response.ok) continue
        const body = await limitedBody(response, 8_000_000)
        if (!body) continue
        const notices = tarNotices(body)
        if (!notices.length) continue
        row.noticeFiles = notices.map(notice => notice.file)
        remoteNoticeSections.push(`=== ${row.ecosystem} ${row.name}@${row.version} ===\nSource: ${row.source}\nLicense declaration: ${row.license}\nNotice archive: ${url}\n${notices.map(notice => `--- ${notice.file} ---\n${notice.text.trimEnd()}`).join("\n\n")}`)
        results.noticesResolved++
      } catch { /* Missing archive remains a release blocker. */ }
    }
  }))
  if (remoteNoticeSections.length) inventory.notices += `${remoteNoticeSections.sort((a, b) => a.localeCompare(b)).join("\n\n")}\n`
  inventory.licenses.unresolvedCount = inventory.licenses.packages.filter(row => row.license === "NOASSERTION").length
  inventory.licenses.missingNoticeCount = inventory.licenses.packages.filter(row => row.ecosystem !== "workspace" && !row.noticeFiles?.length).length
  inventory.licenses.complete = inventory.licenses.unresolvedCount === 0 && inventory.licenses.missingNoticeCount === 0
  inventory.licenses.releaseBlocked = !inventory.licenses.complete
  Object.assign(inventory.licenses, { registryEnrichment: results })
}
