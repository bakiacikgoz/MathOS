import type { MathosMarkdownDocument } from "./parser.ts"
export interface NotebookEntityReference { type: "claim" | "context" | "experiment" | "source"; id: string }
export function referencedEntities(document: MathosMarkdownDocument): NotebookEntityReference[] {
  const found = new Map<string, NotebookEntityReference>()
  for (const block of document.blocks) {
    let reference: NotebookEntityReference | null = null
    if (block.directive === "claim-ref" && block.attributes.id) reference = { type:"claim", id:block.attributes.id }
    if (block.directive === "proof-sketch" && block.attributes.claim) reference = { type:"claim", id:block.attributes.claim }
    if (block.directive === "context-ref" && block.attributes.id) reference = { type:"context", id:block.attributes.id }
    if (block.directive === "experiment-ref" && block.attributes.id) reference = { type:"experiment", id:block.attributes.id }
    if (reference) found.set(`${reference.type}:${reference.id}`, reference)
  }
  return [...found.values()]
}
