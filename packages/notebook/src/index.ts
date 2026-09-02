export interface NotebookRegistry {
  readonly documents: readonly string[]
}

export function createNotebookRegistry(): NotebookRegistry {
  return Object.freeze({ documents: Object.freeze([]) })
}
export { parseMathosMarkdown, type MathosMarkdownDocument, type NotebookBlock, type SourceRange } from "./parser.ts"
export { renderMathosMarkdown } from "./renderer.ts"
export { referencedEntities, type NotebookEntityReference } from "./references.ts"
export { projectNotebook, type NotebookProjection } from "./projection.ts"
export { NotebookSyncEngine, type NotebookSyncInput, type NotebookSyncPlan } from "./sync.ts"
