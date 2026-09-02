export interface NotebookRegistry {
  readonly documents: readonly string[]
}

export function createNotebookRegistry(): NotebookRegistry {
  return Object.freeze({ documents: Object.freeze([]) })
}
