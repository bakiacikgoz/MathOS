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
export { importBlueprintLatex, type BlueprintDeclaration, type BlueprintImportResult, type BlueprintLoss } from "./latex-import.ts"
export { exportBlueprintLatex } from "./blueprint.ts"
export type { PublicationModel } from "./publication.ts"
export { articleMarkdown } from "./templates/article-markdown.ts"
export { articleLatex } from "./templates/article-latex.ts"
export { articleHtml } from "./templates/article-html.ts"
