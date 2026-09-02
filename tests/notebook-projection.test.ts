import { describe, expect, test } from "bun:test"
import { projectNotebook } from "@mathos/notebook"
import type { ResearchBlock } from "@mathos/domain"

const block = (id:string, kind:ResearchBlock["kind"], entityType:string|null, entityId:string|null):ResearchBlock => ({ id,documentId:"D-1",parentBlockId:null,sequence:0,kind,markdown:"text",entityType,entityId,attributes:{},revision:1,contentHash:id,createdAt:"now",updatedAt:"now" })
describe("notebook projection", () => {
  test("projects entity references while narrative carries no proof authority", () => {
    const projection = projectNotebook({ workspaceId:"W-1", branchId:"B-1", documentId:"D-1", blocks:[block("N-1","NARRATIVE",null,null),block("N-2","CLAIM_REF","claim-ref","C-1"),block("N-3","EXPERIMENT_REF","experiment-ref","EXP-1"),block("N-4","DECISION","decision","DEC-1")] })
    expect(projection.nodes.map((node) => node.kind)).toContain("NOTEBOOK_BLOCK")
    expect(projection.edges.map((edge) => edge.toNodeId).sort()).toEqual(["CLAIM:C-1","DECISION:DEC-1","EXPERIMENT:EXP-1"])
    expect(projection.edges.some((edge) => edge.fromNodeId === "NOTEBOOK_BLOCK:N-1")).toBe(false)
  })
})
