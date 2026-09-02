export interface SourceRange { start: number; end: number; startLine: number; endLine: number }
export interface NotebookBlock {
  type: "narrative" | "directive"
  directive: string | null
  attributes: Record<string, string>
  body: string
  raw: string
  known: boolean
  range: SourceRange
}
export interface MathosMarkdownDocument { blocks: NotebookBlock[] }

const KNOWN = new Set(["claim-ref","proof-sketch","context-ref","experiment-ref","source-excerpt-ref","decision"])
const ENTITY_PATTERNS: Record<string, RegExp> = { "claim-ref":/^[A-Z]{1,4}-\d+$/, "proof-sketch":/^[A-Z]{1,4}-\d+$/, "context-ref":/^CTX-[A-Za-z0-9-]+$/, "experiment-ref":/^EXP-[A-Za-z0-9-]+$/ }

function attributes(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  const remainder = source.replace(/([A-Za-z][\w-]*)="([^"]*)"/g, (_, key: string, value: string) => { result[key] = value; return "" }).trim()
  if (remainder) throw new Error("INVALID_DIRECTIVE_ATTRIBUTES")
  for (const [key, value] of Object.entries(result)) if (/(?:path|file|source)/i.test(key) && (/^(?:[A-Za-z]:|\/|\\)/.test(value) || value.split(/[\\/]/).includes(".."))) throw new Error("UNSAFE_DIRECTIVE_PATH")
  return result
}

export function parseMathosMarkdown(source: string): MathosMarkdownDocument {
  const lines = [...source.matchAll(/.*(?:\r\n|\n|$)/g)].map((match) => match[0]).filter(Boolean)
  const starts: number[] = []; let offset = 0
  for (const line of lines) { starts.push(offset); offset += line.length }
  const blocks: NotebookBlock[] = []; const ids = new Set<string>(); let narrativeStart = 0; let i = 0
  const pushNarrative = (until: number) => {
    if (until <= narrativeStart) return
    const raw = source.slice(narrativeStart, until)
    const startLine = starts.findIndex((value) => value === narrativeStart) + 1
    const endLine = source.slice(0, until).split(/\r?\n/).length
    blocks.push({ type:"narrative", directive:null, attributes:{}, body:raw, raw, known:true, range:{ start:narrativeStart, end:until, startLine:Math.max(1,startLine), endLine } })
  }
  while (i < lines.length) {
    const opening = /^:::([A-Za-z][\w-]*)(?:\s+(.*?))?\r?\n?$/.exec(lines[i]!)
    if (!opening) { i++; continue }
    const start = starts[i]!; pushNarrative(start)
    const name = opening[1]!; const attrs = attributes(opening[2] ?? "")
    let close = i + 1
    while (close < lines.length && !/^:::\s*\r?\n?$/.test(lines[close]!)) close++
    if (close >= lines.length) throw new Error(`UNCLOSED_DIRECTIVE: ${name}`)
    const end = starts[close]! + lines[close]!.length
    const raw = source.slice(start, end)
    if (raw.length > 1_000_000) throw new Error(`DIRECTIVE_TOO_LARGE: ${name}`)
    if (attrs.id) { if (ids.has(attrs.id)) throw new Error(`DUPLICATE_DIRECTIVE_ID: ${attrs.id}`); ids.add(attrs.id) }
    const entityValue = name === "proof-sketch" ? attrs.claim : attrs.id
    const pattern = ENTITY_PATTERNS[name]
    if (pattern && (!entityValue || !pattern.test(entityValue))) throw new Error(`INVALID_ENTITY_ID: ${entityValue ?? "missing"}`)
    const bodyStart = starts[i + 1] ?? end
    blocks.push({ type:"directive", directive:name, attributes:attrs, body:source.slice(bodyStart, starts[close]), raw, known:KNOWN.has(name), range:{ start, end, startLine:i + 1, endLine:close + 1 } })
    i = close + 1; narrativeStart = end
  }
  pushNarrative(source.length)
  return { blocks }
}
