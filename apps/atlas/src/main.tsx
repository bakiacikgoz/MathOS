export interface AtlasShell {
  readonly title: "MathOS Theorem Atlas"
  readonly authority: "READ_ONLY"
}

export function createAtlasShell(): AtlasShell {
  return Object.freeze({ title: "MathOS Theorem Atlas", authority: "READ_ONLY" })
}

if (typeof document !== "undefined") document.title = createAtlasShell().title
