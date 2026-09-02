export interface BlueprintDeclaration { name:string; environment:"theorem"|"definition"; label:string|null; leanOk:boolean }
export interface BlueprintLoss { kind:"UNKNOWN_MACRO"; raw:string; offset:number }
export interface BlueprintImportResult { markdown:string; declarations:BlueprintDeclaration[]; unresolvedDeclarations:string[]; lossReport:BlueprintLoss[] }

const KNOWN_MACROS = new Set(["section","subsection","subsubsection","begin","end","label","lean","leanok","uses","textbf","emph"])

export function importBlueprintLatex(source:string, options:{ declarationExists?:(name:string)=>boolean } = {}):BlueprintImportResult {
  const declarations:BlueprintDeclaration[] = []; const unresolvedDeclarations:string[] = []; const lossReport:BlueprintLoss[] = []
  let markdown = source.replace(/\\(section|subsection|subsubsection)\{([^}]*)\}/g, (_, level:string, title:string) => `${"#".repeat(level === "section" ? 1 : level === "subsection" ? 2 : 3)} ${title}`)
  markdown = markdown.replace(/\\begin\{(theorem|definition)\}(?:\[([^\]]*)\])?([\s\S]*?)\\end\{\1\}/g, (_, environment:"theorem"|"definition", title:string|undefined, rawBody:string) => {
    const label = /\\label\{([^}]*)\}/.exec(rawBody)?.[1] ?? null
    const lean = /\\lean\{([^}]*)\}/.exec(rawBody)?.[1] ?? null
    const uses = /\\uses\{([^}]*)\}/.exec(rawBody)?.[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? []
    const leanOk = /\\leanok\b/.test(rawBody)
    if (lean) { declarations.push({ name:lean, environment, label, leanOk }); if (options.declarationExists && !options.declarationExists(lean)) unresolvedDeclarations.push(lean) }
    const body = rawBody.replace(/\\(?:label|lean|uses)\{[^}]*\}/g, "").replace(/\\leanok\b/g, "").trim()
    const id = label ?? `BP-${declarations.length}`
    const dependencyText = uses.length ? `\nUses: ${uses.join(", ")}` : ""
    return `:::claim-ref id="${id}" blueprint-kind="${environment}"${lean ? ` lean="${lean}"` : ""}${leanOk ? ' leanok="true"' : ""}\n${title ? `${title}\n` : ""}${body}${dependencyText}\n:::`
  })
  for (const match of source.matchAll(/\\([A-Za-z]+)(?:\{[^}]*\})?/g)) {
    if (!KNOWN_MACROS.has(match[1]!)) lossReport.push({ kind:"UNKNOWN_MACRO", raw:match[0], offset:match.index })
  }
  return { markdown, declarations, unresolvedDeclarations:[...new Set(unresolvedDeclarations)].sort(), lossReport }
}
