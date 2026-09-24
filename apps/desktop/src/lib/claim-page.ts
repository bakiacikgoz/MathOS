export interface ClaimPageSection { label: string; lines: string[] }
export interface ClaimCheck { label: string; ok: boolean | null; value?: string }
export interface ClaimPage { heading: string; sections: ClaimPageSection[]; checks: ClaimCheck[]; notes: string[] }

/** Parses the `mathos claim show` page: blank-line separated blocks whose first line is the label. */
export function parseClaimPage(text: string): ClaimPage {
  const [head = "", ...rest] = text.replace(/\r/g, "").split("\n")
  const body = rest.join("\n")
  const whyIndex = body.search(/^WHY NOT VERIFIED\?/m)
  const main = whyIndex === -1 ? body : body.slice(0, whyIndex)
  const why = whyIndex === -1 ? "" : body.slice(whyIndex)
  const sections = main.split(/\n\s*\n/).map((block) => block.split("\n").filter((line) => line.trim())).filter((lines) => lines.length > 0)
    .map(([label, ...lines]) => ({ label: label!.trim(), lines: lines.map((line) => line.trim()) }))
  const checks: ClaimCheck[] = [], notes: string[] = []
  for (const raw of why.split("\n").slice(1)) {
    const line = raw.trim()
    if (!line) continue
    const mark = /^(.*?)\s+([×✓✔])$/.exec(line)
    if (mark) { checks.push({ label: mark[1]!, ok: mark[2] !== "×" }); continue }
    const kv = /^(Open blocker|VerificationGate|Current status)\s+(.+)$/.exec(line)
    if (kv) { checks.push({ label: kv[1]!, ok: null, value: kv[2]! }); continue }
    notes.push(line)
  }
  return { heading: head.trim(), sections, checks, notes }
}
