import katexCss from "katex/dist/katex.min.css?url"
import { isTauri, runJson } from "./bridge.ts"
import { latexFile, markdownFile, renderMarkdown } from "./markdown.ts"

// Documents the assistant writes, saved in the format the user picks. Word and Excel are built here (libraries
// load on first use); PDF goes through the system print dialog, which keeps text and formulas sharp and selectable.

export type ExportFormat = "pdf" | "docx" | "md" | "tex" | "xlsx" | "csv"
const MIME: Record<Exclude<ExportFormat, "pdf">, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown", tex: "application/x-tex", csv: "text/csv",
}
const FILTER: Record<Exclude<ExportFormat, "pdf">, string> = { docx: "Word", xlsx: "Excel", md: "Markdown", tex: "LaTeX", csv: "CSV" }

export const fileSlug = (title: string) => (title.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "document").toLowerCase()

async function toBase64(data: Blob): Promise<string> {
  const bytes = new Uint8Array(await data.arrayBuffer())
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

/** Asks where to save (desktop) and writes the file through the host; in a browser it downloads. Returns the path or null. */
export async function saveFile(root: string, name: string, format: Exclude<ExportFormat, "pdf">, data: Blob): Promise<string | null> {
  if (!isTauri) {
    const url = URL.createObjectURL(data), link = document.createElement("a")
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000)
    return name
  }
  const { save } = await import("@tauri-apps/plugin-dialog")
  const path = await save({ defaultPath: name, filters: [{ name: FILTER[format], extensions: [format] }] })
  if (!path) return null
  await runJson(root, ["assistant", "write-file", "--path", path, "--base64", await toBase64(data)])
  return path
}

/** Opens the folder containing a saved file (desktop only). */
export async function revealFile(path: string): Promise<void> {
  if (!isTauri) return
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
  await revealItemInDir(path)
}

// Word has no LaTeX: formulas are written as linear Unicode math (x², ∑, ≤, (a)/(b)), which reads well and stays editable.
const UNICODE: Record<string, string> = {
  "\\le": "≤", "\\leq": "≤", "\\ge": "≥", "\\geq": "≥", "\\neq": "≠", "\\ne": "≠", "\\approx": "≈", "\\equiv": "≡", "\\sim": "∼", "\\mid": "∣", "\\cdot": "·", "\\times": "×", "\\div": "÷", "\\pm": "±",
  "\\forall": "∀", "\\exists": "∃", "\\neg": "¬", "\\land": "∧", "\\lor": "∨", "\\implies": "⇒", "\\iff": "⇔", "\\to": "→", "\\mapsto": "↦", "\\in": "∈", "\\notin": "∉", "\\subseteq": "⊆", "\\subset": "⊂", "\\cup": "∪", "\\cap": "∩", "\\emptyset": "∅", "\\setminus": "∖",
  "\\sum": "∑", "\\prod": "∏", "\\int": "∫", "\\infty": "∞", "\\partial": "∂", "\\circ": "∘", "\\ldots": "…", "\\cdots": "⋯", "\\langle": "⟨", "\\rangle": "⟩", "\\lfloor": "⌊", "\\rfloor": "⌋", "\\lceil": "⌈", "\\rceil": "⌉",
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\epsilon": "ε", "\\varepsilon": "ε", "\\zeta": "ζ", "\\eta": "η", "\\theta": "θ", "\\kappa": "κ", "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ", "\\pi": "π", "\\rho": "ρ", "\\sigma": "σ", "\\tau": "τ", "\\phi": "φ", "\\varphi": "φ", "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω",
  "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ", "\\Sigma": "Σ", "\\Phi": "Φ", "\\Omega": "Ω",
}
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "i": "ⁱ" }
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "i": "ᵢ", "j": "ⱼ", "k": "ₖ", "n": "ₙ" }
export function latexToUnicode(tex: string): string {
  let out = tex
  for (let pass = 0; pass < 4; pass++) out = out.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)").replace(/\\sqrt\{([^{}]*)\}/g, "√($1)").replace(/\\mathbb\{([A-Z])\}/g, (_m, letter: string) => ({ N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ" } as Record<string, string>)[letter] ?? letter).replace(/\\(?:mathrm|text|operatorname|mathbf|mathit)\{([^{}]*)\}/g, "$1")
  out = out.replace(/\\[A-Za-z]+/g, (command) => UNICODE[command] ?? command.slice(1))
  out = out.replace(/\^\{([^{}]*)\}|\^(.)/g, (_match, group: string | undefined, single: string | undefined) => { const text = group ?? single ?? ""; return [...text].every((char) => SUP[char]) ? [...text].map((char) => SUP[char]).join("") : `^(${text})` })
  out = out.replace(/_\{([^{}]*)\}|_(.)/g, (_match, group: string | undefined, single: string | undefined) => { const text = group ?? single ?? ""; return [...text].every((char) => SUB[char]) ? [...text].map((char) => SUB[char]).join("") : `_(${text})` })
  return out.replace(/\\[,;: !]/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim()
}

/** A Word document from Markdown: headings, paragraphs, lists, code and formulas (as linear math). */
export async function docxBlob(title: string, markdown: string): Promise<Blob> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun, Math: OMath, MathRun } = await import("docx")
  const inline = (text: string, base: { bold?: boolean; italics?: boolean } = {}) => {
    const runs: Array<InstanceType<typeof TextRun> | InstanceType<typeof OMath>> = []
    for (const piece of text.split(/(\$[^$\n]+\$|\*\*[^*]+\*\*|`[^`]+`|(?<![*\w])\*[^*\n]+\*(?!\*))/)) {
      if (!piece) continue
      if (/^\$[^$]+\$$/.test(piece)) runs.push(new OMath({ children: [new MathRun(latexToUnicode(piece.slice(1, -1)))] }))
      else if (/^\*\*.+\*\*$/.test(piece)) runs.push(new TextRun({ text: piece.slice(2, -2), bold: true, italics: base.italics }))
      else if (/^`.+`$/.test(piece)) runs.push(new TextRun({ text: piece.slice(1, -1), font: "Consolas" }))
      else if (/^\*.+\*$/.test(piece)) runs.push(new TextRun({ text: piece.slice(1, -1), italics: true, bold: base.bold }))
      else runs.push(new TextRun({ text: piece, ...base }))
    }
    return runs
  }
  const children: InstanceType<typeof Paragraph>[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
  const lines = markdown.replace(/^\s*#\s+.+\n+/, "").split("\n")
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (line.startsWith("```")) {
      const code: string[] = []
      while (++index < lines.length && !lines[index]!.startsWith("```")) code.push(lines[index]!)
      for (const row of code) children.push(new Paragraph({ children: [new TextRun({ text: row || " ", font: "Consolas", size: 20 })], shading: { fill: "F3F3F3", type: "clear", color: "auto" } }))
      continue
    }
    if (/^\$\$/.test(line.trim())) {
      let tex = line.trim().replace(/^\$\$/, "")
      while (!/\$\$\s*$/.test(tex) && ++index < lines.length) tex += ` ${lines[index]}`
      children.push(new Paragraph({ children: [new OMath({ children: [new MathRun(latexToUnicode(tex.replace(/\$\$\s*$/, "")))] })], alignment: "center" }))
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) { children.push(new Paragraph({ children: inline(heading[2]!), heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][heading[1]!.length - 1] })); continue }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    if (bullet) { children.push(new Paragraph({ children: inline(bullet[1]!), bullet: { level: 0 } })); continue }
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (numbered) { children.push(new Paragraph({ children: inline(numbered[1]!), numbering: { reference: "numbers", level: 0 } })); continue }
    if (!line.trim()) continue
    children.push(new Paragraph({ children: inline(line), spacing: { after: 120 } }))
  }
  const document = new Document({
    creator: "MathOS", title,
    numbering: { config: [{ reference: "numbers", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }] }] },
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  })
  return Packer.toBlob(document)
}

export async function xlsxBlob(title: string, rows: string[][]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default
  const book = new ExcelJS.Workbook()
  book.creator = "MathOS"
  const sheet = book.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, " ") || "Sheet1")
  rows.forEach((row, index) => { const added = sheet.addRow(row.map((cell) => (/^-?\d+(\.\d+)?$/.test(cell.trim()) ? Number(cell) : cell))); if (index === 0) added.font = { bold: true } })
  sheet.columns.forEach((column, index) => { column.width = Math.min(60, Math.max(10, ...rows.map((row) => (row[index] ?? "").length + 2))) })
  if (rows.length > 1) sheet.views = [{ state: "frozen", ySplit: 1 }]
  return new Blob([await book.xlsx.writeBuffer()], { type: MIME.xlsx })
}

export const csvBlob = (rows: string[][]) => new Blob([`﻿${rows.map((row) => row.map((cell) => /[",;\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(",")).join("\r\n")}`], { type: MIME.csv })

/** Prints the document from a hidden frame; the system dialog offers "Save as PDF". */
export async function printPdf(title: string, markdown: string, rows?: string[][]): Promise<void> {
  const body = rows?.length ? `<h1>${escapeHtml(title)}</h1><table>${rows.map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>` : renderMarkdown(markdownFile(title, markdown))
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  document.body.append(frame)
  const css = new URL(katexCss, window.location.href).href
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${css}"><style>
    @page { margin: 22mm 20mm; } body { font: 11pt/1.6 "Iowan Old Style", Palatino, Georgia, serif; color: #111; }
    h1 { font-size: 20pt; margin: 0 0 12pt; } h2 { font-size: 14pt; margin: 18pt 0 6pt; } h3 { font-size: 12pt; }
    pre, code { font: 9.5pt/1.5 ui-monospace, Menlo, Consolas, monospace; } pre { background: #f4f4f5; padding: 8pt 10pt; border-radius: 6pt; white-space: pre-wrap; }
    .md-code-head { display: none; } table { border-collapse: collapse; width: 100%; font-size: 10pt; } th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; } th { background: #f4f4f5; }
    .md-math { margin: 8pt 0; text-align: center; } a { color: inherit; }
  </style></head><body>${body}</body></html>`
  await new Promise<void>((resolve) => { frame.onload = () => resolve() })
  await (frame.contentDocument?.fonts?.ready ?? Promise.resolve())
  frame.contentWindow?.focus()
  frame.contentWindow?.print()
  window.setTimeout(() => frame.remove(), 60_000)
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Builds and saves one export; resolves to the saved path (null when cancelled or printed). */
export async function exportDocument(root: string, lang: "tr" | "en", document: { title: string; format: "markdown" | "latex" | "table"; content: string; rows?: string[][] }, format: ExportFormat): Promise<string | null> {
  const base = fileSlug(document.title)
  if (format === "pdf") { await printPdf(document.title, document.content, document.format === "table" ? document.rows : undefined); return null }
  if (format === "md") return saveFile(root, `${base}.md`, "md", new Blob([markdownFile(document.title, document.content)], { type: MIME.md }))
  if (format === "tex") return saveFile(root, `${base}.tex`, "tex", new Blob([document.format === "latex" && /\\documentclass/.test(document.content) ? document.content : latexFile(document.title, document.content, lang)], { type: MIME.tex }))
  if (format === "docx") return saveFile(root, `${base}.docx`, "docx", await docxBlob(document.title, document.content))
  if (format === "xlsx") return saveFile(root, `${base}.xlsx`, "xlsx", await xlsxBlob(document.title, document.rows ?? []))
  return saveFile(root, `${base}.csv`, "csv", csvBlob(document.rows ?? []))
}
