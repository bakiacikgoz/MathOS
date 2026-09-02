import { describe, expect, test } from "bun:test"
import { ClaimSourceSupportMatrix } from "../packages/literature/src/extraction/support-matrix.ts"
import { buildResearchGraph } from "@mathos/graph"

const input = { claimId: "CLM-1", sourceId: "SRC-1", externalResultId: "EXT-1", sourceVersion: "v1", excerptHash: "hash-1", rationale: "reviewed relationship" }

describe("claim-source support matrix", () => {
  test("records reviewed known result, background, counterpoint, and contradiction relations", () => {
    const matrix = new ClaimSourceSupportMatrix(() => "2030")
    for (const relation of ["DIRECT_KNOWN_RESULT", "CONTEXTUAL_BACKGROUND", "COUNTERPOINT", "CONTRADICTION"] as const) {
      expect(matrix.assess({ ...input, relation }, { actorType: "HUMAN", actorId: "alice" }).status).toBe("REVIEWED")
    }
  })

  test("model output remains proposed and invalid excerpts cannot be reviewed", () => {
    const matrix = new ClaimSourceSupportMatrix(() => "2030")
    expect(matrix.assess({ ...input, relation: "DIRECT_KNOWN_RESULT" }, { actorType: "MODEL", actorId: "m" }).status).toBe("PROPOSED")
    expect(() => matrix.assess({ ...input, relation: "DIRECT_KNOWN_RESULT", excerptInvalidated: true }, { actorType: "HUMAN", actorId: "alice" })).toThrow("ASSESSMENT_EXCERPT_INVALIDATED")
  })

  test("source version/hash changes stale assessments and publications without changing proof status", () => {
    const matrix = new ClaimSourceSupportMatrix(() => "2030")
    const assessment = matrix.assess({ ...input, relation: "DIRECT_KNOWN_RESULT", claimProofStatus: "KERNEL_VERIFIED", publicationIds: ["PUB-1"] }, { actorType: "HUMAN", actorId: "alice" })
    const result = matrix.checkRevision(assessment, { sourceVersion: "v2", excerptHash: "hash-2" })
    expect(result.markers.map((marker) => marker.targetId)).toEqual([assessment.id, "PUB-1"])
    expect(result.claimProofStatus).toBe("KERNEL_VERIFIED")
  })

  test("reviewed assessments project typed graph links", () => {
    const matrix = new ClaimSourceSupportMatrix(() => "2030")
    const assessment = matrix.assess({ ...input, relation: "CONTRADICTION" }, { actorType: "HUMAN", actorId: "alice" })
    const graph = buildResearchGraph({ workspaceId: "WS", mainObjectiveId: "CLM-1", eventSequence: 1, claims: [{ id: "CLM-1", workspaceId: "WS", branchId: "B-000", kind: "conjecture", title: "C", statement: "C", status: "DRAFT", isMainObjective: true, createdAt: "2030", updatedAt: "2030" } as any], dependencies: [], formals: [], proofs: [], verifications: [], blockers: [], decisions: [], runs: [], agents: [], branches: [], imports: [], visibility: [], sources: [{ id: "SRC-1", workspaceId: "WS", title: "S", status: "INSPECTED" } as any], externalResults: [{ id: "EXT-1", workspaceId: "WS", branchId: "B-000", sourceId: "SRC-1", kind: "THEOREM", status: "HUMAN_REVIEWED" } as any], claimSourceAssessments: [assessment] }, { includeLiterature: true })
    expect(graph.edges.some((edge) => edge.kind === "CONTRADICTED_BY_SOURCE" && edge.fromNodeId === "CLM-1")).toBe(true)
  })
})
