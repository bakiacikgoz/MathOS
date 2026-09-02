import type { MathosMarkdownDocument } from "./parser.ts"
export const renderMathosMarkdown = (document: MathosMarkdownDocument): string => document.blocks.map((block) => block.raw).join("")
