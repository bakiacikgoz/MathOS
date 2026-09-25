import { Marked } from "marked"
import DOMPurify from "dompurify"
import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import latex from "highlight.js/lib/languages/latex"
import python from "highlight.js/lib/languages/python"
import typescript from "highlight.js/lib/languages/typescript"
import type { LanguageFn } from "highlight.js"
import katex from "katex"
import "katex/dist/katex.min.css"

// Lean 4 has no highlight.js grammar in core; this covers what reads well in answers.
const lean: LanguageFn = (hl) => ({
  name: "Lean",
  keywords: {
    keyword: "theorem lemma def example abbrev structure class instance inductive where by fun let have show from calc match with if then else do return import open namespace section end variable universe noncomputable private protected at using exact intro intros apply rw simp simp_all omega linarith nlinarith norm_num decide induction cases rcases obtain use refine constructor ring field_simp positivity aesop gcongr trivial rfl sorry",
    built_in: "Nat Int Rat Real Complex Prop Type Sort Finset Set List Bool True False",
  },
  contains: [
    hl.COMMENT("--", "$"),
    hl.COMMENT("/-", "-/", { contains: ["self"] }),
    hl.QUOTE_STRING_MODE,
    hl.C_NUMBER_MODE,
    { className: "symbol", begin: /[∀∃λ→↔∧∨¬≤≥≠∈∉⊆∑∏ℕℤℚℝℂ]/ },
  ],
})
for (const [name, language] of Object.entries({ bash, javascript, json, latex, python, typescript, lean })) hljs.registerLanguage(name, language)
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" })
hljs.registerAliases(["js"], { languageName: "javascript" })
hljs.registerAliases(["ts"], { languageName: "typescript" })
hljs.registerAliases(["tex"], { languageName: "latex" })
hljs.registerAliases(["py"], { languageName: "python" })
hljs.registerAliases(["lean4"], { languageName: "lean" })

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? "").trim().split(/\s+/)[0]!.toLowerCase()
      const known = language && hljs.getLanguage(language)
      const body = known ? hljs.highlight(text, { language, ignoreIllegals: true }).value : escape(text)
      return `<div class="md-code" data-lang="${escape(language || "text")}"><div class="md-code-head"><span>${escape(language || "text")}</span><button type="button" class="md-copy" data-copy>COPYLABEL</button></div><pre><code class="hljs">${body}</code></pre></div>`
    },
    link({ href, text }) {
      const safe = /^https?:\/\//.test(href) ? href : "#"
      return `<a href="${escape(safe)}" target="_blank" rel="noreferrer noopener">${text}</a>`
    },
  },
})

// Math is cut out before Markdown runs (so _ and * inside formulas stay math) and put back as KaTeX afterwards.
// Code spans and fenced blocks are left alone, so $ inside code stays literal.
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)|\\\(([\s\S]+?)\\\)/g

export function renderMarkdown(source: string, copyLabel = "Copy"): string {
  const formulas: string[] = []
  const protectedSource = source.split(CODE).map((chunk, index) => index % 2 === 1 ? chunk : chunk.replace(MATH, (_match, display, bracket, inline, paren) => {
    const tex = (display ?? bracket ?? inline ?? paren ?? "").trim(), block = display !== undefined || bracket !== undefined
    formulas.push(katex.renderToString(tex, { displayMode: block, throwOnError: false, output: "html", strict: "ignore" }))
    return block ? `\n\nMATHOSMATHBLOCK${formulas.length - 1}X\n\n` : `MATHOSMATH${formulas.length - 1}X`
  })).join("")
  const html = marked.parse(protectedSource, { async: false }) as string
  const withMath = html
    .replace(/<p>MATHOSMATHBLOCK(\d+)X<\/p>/g, (_m, index) => `<div class="md-math">${formulas[Number(index)]}</div>`)
    .replace(/MATHOSMATH(?:BLOCK)?(\d+)X/g, (_m, index) => formulas[Number(index)] ?? "")
  return DOMPurify.sanitize(withMath.replace(/COPYLABEL/g, escape(copyLabel)), { ADD_ATTR: ["target", "data-copy", "data-lang"], FORBID_TAGS: ["style", "script", "iframe", "form", "input"] })
}

/** Plain Markdown with $…$ math, for copying and for exports. */
export function markdownFile(title: string, content: string): string {
  return /^#\s/.test(content.trim()) ? content : `# ${title}\n\n${content}`
}

/** A standalone LaTeX document from Markdown with $…$ math (headings, lists, emphasis and code are converted). */
export function latexFile(title: string, content: string, lang: "tr" | "en"): string {
  const body = content.replace(/^\s*#\s+.+\n+/, "")
    .split(CODE).map((chunk, index) => {
      if (index % 2 === 1) return chunk.startsWith("```") ? `\\begin{verbatim}\n${chunk.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}\\end{verbatim}` : `\\texttt{${chunk.slice(1, -1).replace(/[\\{}]/g, "\\$&")}}`
      return chunk
        .replace(/^###\s+(.+)$/gm, "\\subsubsection*{$1}").replace(/^##\s+(.+)$/gm, "\\subsection*{$1}").replace(/^#\s+(.+)$/gm, "\\section*{$1}")
        .replace(/\*\*([^*]+)\*\*/g, "\\textbf{$1}").replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, "\\emph{$1}")
        .replace(/((?:^[-*]\s+.+\n?)+)/gm, (list) => `\\begin{itemize}\n${list.trim().split("\n").map((line) => `  \\item ${line.replace(/^[-*]\s+/, "")}`).join("\n")}\n\\end{itemize}\n`)
        .replace(/((?:^\d+\.\s+.+\n?)+)/gm, (list) => `\\begin{enumerate}\n${list.trim().split("\n").map((line) => `  \\item ${line.replace(/^\d+\.\s+/, "")}`).join("\n")}\n\\end{enumerate}\n`)
        .replace(/(?<!\\)([%&#])/g, "\\$1")
    }).join("")
  return `\\documentclass[11pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n${lang === "tr" ? "\\usepackage[turkish]{babel}\n" : ""}\\usepackage{amsmath,amssymb,amsthm}\n\\usepackage[margin=2.5cm]{geometry}\n\\title{${title}}\n\\date{\\today}\n\\begin{document}\n\\maketitle\n\n${body.replace(/^#\s+.+\n+/, "")}\n\\end{document}\n`
}
