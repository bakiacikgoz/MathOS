import type { ResearchBlock } from "@mathos/domain"
import type { ResearchGraphEdge, ResearchGraphNode } from "@mathos/graph"
export interface NotebookProjection { nodes:ResearchGraphNode[]; edges:ResearchGraphEdge[] }
export function projectNotebook(input:{ workspaceId:string; branchId:string; documentId:string; blocks:ResearchBlock[] }):NotebookProjection {
  const nodes = input.blocks.map((block):ResearchGraphNode => ({ id:`NOTEBOOK_BLOCK:${block.id}`, kind:"NOTEBOOK_BLOCK", workspaceId:input.workspaceId, branchId:input.branchId, entityId:block.id, label:block.kind, summary:block.markdown.slice(0,160), origin:"LOCAL" }))
  const edges:ResearchGraphEdge[] = []
  for (const block of input.blocks) {
    if (!block.entityId || block.kind === "NARRATIVE" || block.kind === "PROOF_SKETCH") continue
    const prefix = block.kind === "CLAIM_REF" ? "CLAIM" : block.kind === "EXPERIMENT_REF" ? "EXPERIMENT" : block.kind === "DECISION" ? "DECISION" : block.kind === "SOURCE_EXCERPT_REF" ? "SOURCE" : null
    if (prefix) edges.push({ id:`NBREF:${block.id}:${block.entityId}`, kind:"REFERENCES", fromNodeId:`NOTEBOOK_BLOCK:${block.id}`, toNodeId:`${prefix}:${block.entityId}`, workspaceId:input.workspaceId, branchId:input.branchId })
  }
  return { nodes, edges }
}
