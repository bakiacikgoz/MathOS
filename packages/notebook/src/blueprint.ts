import type { MathosMarkdownDocument } from "./parser.ts"

const escapeLatex = (value:string) => value.replace(/([%&#_$])/g, "\\$1")

export function exportBlueprintLatex(document:MathosMarkdownDocument):string {
  return document.blocks.map((block) => {
    if (block.type === "narrative") return block.raw.replace(/^(#{1,3})\s+(.+)$/gm, (_, hashes:string, title:string) => `\\${hashes.length === 1 ? "section" : hashes.length === 2 ? "subsection" : "subsubsection"}{${escapeLatex(title)}}`)
    if (block.directive === "claim-ref") return `\\begin{theorem}\n\\label{${block.attributes.id}}\n${block.body.trim()}\n\\end{theorem}\n`
    if (block.directive === "proof-sketch") return `\\begin{proof}\n\\uses{${block.attributes.claim}}\n${block.body.trim()}\n\\end{proof}\n`
    return block.raw
  }).join("")
}
