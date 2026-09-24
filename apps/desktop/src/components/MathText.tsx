import { memo, useEffect, useState } from "react"

type Katex = typeof import("katex")
let katexPromise: Promise<Katex> | null = null
const loadKatex = () => (katexPromise ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([mod]) => (mod as unknown as { default: Katex }).default ?? mod))

type Part = { math: boolean; display: boolean; text: string }
function split(source: string): Part[] {
  const parts: Part[] = []
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g
  let last = 0
  for (const match of source.matchAll(pattern)) {
    if (match.index! > last) parts.push({ math: false, display: false, text: source.slice(last, match.index) })
    const display = match[1] ?? match[2]
    parts.push({ math: true, display: display !== undefined, text: display ?? match[3] ?? match[4] ?? "" })
    last = match.index! + match[0].length
  }
  if (last < source.length) parts.push({ math: false, display: false, text: source.slice(last) })
  return parts
}

/** Renders text with inline `$…$` / display `$$…$$` LaTeX. KaTeX is loaded lazily, only when math appears. */
export const MathText = memo(function MathText({ text, className, inline = false }: { text: string; className?: string; inline?: boolean }) {
  const parts = split(text)
  const hasMath = parts.some((part) => part.math)
  const [katex, setKatex] = useState<Katex | null>(null)
  useEffect(() => { if (hasMath && !katex) void loadKatex().then(setKatex) }, [hasMath, katex])
  return (
    <span className={`math ${className ?? ""}`}>
      {parts.map((part, index) => {
        if (!part.math) return <span key={index}>{part.text}</span>
        if (!katex) return <code key={index}>{part.text}</code>
        const html = katex.renderToString(part.text, { displayMode: part.display && !inline, throwOnError: false, output: "html", strict: "ignore" })
        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />
      })}
    </span>
  )
})
