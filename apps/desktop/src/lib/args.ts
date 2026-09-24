/** Splits a command line like a POSIX shell would for the common cases: quotes, escapes, whitespace. */
export function splitArgs(input: string): string[] {
  const out: string[] = []
  let current = "", quote: '"' | "'" | null = null, started = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === "\\" && quote === '"' && i + 1 < input.length) current += input[++i]
      else current += ch
    } else if (ch === '"' || ch === "'") { quote = ch; started = true }
    else if (ch === "\\" && i + 1 < input.length) { current += input[++i]; started = true }
    else if (/\s/.test(ch)) { if (started || current) out.push(current); current = ""; started = false }
    else { current += ch; started = true }
  }
  if (started || current) out.push(current)
  if (out[0] === "mathos") out.shift()
  return out
}
