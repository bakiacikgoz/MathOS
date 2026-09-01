import {
  buildResearchGraph,
  blockingChain,
  canonicalGraphFixture,
  cycleGraphFixture,
  branchIsolationFixture,
  importGraphFixture,
  dependenciesOf,
  dependentsOf,
  pathBetween,
  unverifiedFrontier,
  orphanClaims,
  dependencyCycles,
  staleImpact,
  validateResearchGraph,
  buildGraphContextSummary,
} from "@mathos/graph"

export const GRAPH_EVAL_SCENARIOS = [
  "basic-dependency",
  "verification-projection",
  "blocker-chain",
  "unverified-frontier",
  "dependency-cycle",
  "branch-isolation",
  "multi-agent-provenance",
  "verified-import",
  "stale-impact",
  "orphan-claim",
  "proof-attempt-history",
  "deterministic-rebuild",
  "planner-context",
  "frontier-context",
  "blocker-context",
  "failure-context",
  "fidelity-context",
  "branch-context-isolation",
  "import-context",
  "context-determinism",
  "experiment-projection",
  "computational-evidence",
  "counterexample-edge",
  "experiment-branch-isolation",
  "experiment-provenance",
  "source-projection",
  "external-result-projection",
  "citation-provenance",
  "literature-branch-isolation",
] as const

export function runGraphScenario(id: string): { id: string; result: "PASS" | "FAIL"; detail?: string } {
  try {
    if (id === "basic-dependency") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      const ok = dependenciesOf(graph, "T-001").includes("L-001") && dependentsOf(graph, "L-001").includes("T-001") && Boolean(pathBetween(graph, "L-001", "T-001"))
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "verification-projection") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      return { id, result: graph.nodes.some((node) => node.id === "VR-011") && graph.edges.some((edge) => edge.kind === "VERIFIES") ? "PASS" : "FAIL" }
    }
    if (id === "blocker-chain") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      const chain = blockingChain(graph, "BL-002")
      return { id, result: chain.includes("T-001") && chain.includes("L-003") ? "PASS" : "FAIL", detail: chain.join(">") }
    }
    if (id === "unverified-frontier") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      return { id, result: unverifiedFrontier(graph).includes("L-003") ? "PASS" : "FAIL" }
    }
    if (id === "dependency-cycle") {
      const graph = buildResearchGraph(cycleGraphFixture())
      return { id, result: dependencyCycles(graph).length > 0 && !validateResearchGraph(graph).ok ? "PASS" : "FAIL" }
    }
    if (id === "branch-isolation") {
      const b4 = buildResearchGraph(branchIsolationFixture(), { branchId: "B-004" })
      const b5 = buildResearchGraph(branchIsolationFixture(), { branchId: "B-005" })
      const main = buildResearchGraph(branchIsolationFixture(), { branchId: "B-000" })
      const ok = b4.nodes.some((node) => node.id === "L-010") && !b4.nodes.some((node) => node.id === "L-020") && b5.nodes.some((node) => node.id === "L-020") && !main.nodes.some((node) => node.id === "L-010")
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "multi-agent-provenance") {
      const graph = buildResearchGraph(importGraphFixture(), { includeResearchRuntime: true, includeImports: true })
      return { id, result: graph.nodes.some((node) => node.id === "L-021") && graph.nodes.some((node) => node.id === "L-044") ? "PASS" : "FAIL" }
    }
    if (id === "verified-import") {
      const graph = buildResearchGraph(importGraphFixture())
      const ok = graph.edges.some((edge) => edge.kind === "IMPORTS_FROM" && edge.fromNodeId === "L-044") && graph.nodes.filter((node) => node.kind === "VERIFICATION").length === 2
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "stale-impact") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      return { id, result: staleImpact(graph, "L-003").includes("T-001") ? "PASS" : "FAIL" }
    }
    if (id === "orphan-claim") {
      const snap = canonicalGraphFixture()
      snap.claims.push({ ...snap.claims[1]!, id: "L-099", title: "orphan", status: "CONJECTURE" })
      snap.visibility.push({ branchId: "B-000", claimId: "L-099", relation: "LOCAL" })
      return { id, result: orphanClaims(buildResearchGraph(snap, { branchId: "B-000" })).includes("L-099") ? "PASS" : "FAIL" }
    }
    if (id === "proof-attempt-history") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      return { id, result: graph.nodes.some((node) => node.id === "PA-003" && String(node.summary).includes("TYPE_MISMATCH")) ? "PASS" : "FAIL" }
    }
    if (id === "deterministic-rebuild") {
      const a = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      const b = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      return { id, result: a.metadata.graphHash === b.metadata.graphHash ? "PASS" : "FAIL" }
    }
    if (id === "planner-context" || id === "frontier-context" || id === "blocker-context" || id === "failure-context") {
      const summary = buildGraphContextSummary(buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" }), { focusClaimId: "T-001" })
      const ok =
        (id === "planner-context" && summary.verifiedPrerequisites.some((item) => item.id === "L-001") && summary.unverifiedFrontier.some((item) => item.id === "L-003"))
        || (id === "frontier-context" && summary.unverifiedFrontier.some((item) => item.id === "L-003"))
        || (id === "blocker-context" && summary.openBlockingChain.some((item) => item.chain.includes("T-001")))
        || (id === "failure-context" && summary.recentFailedProofRoutes.some((item) => item.failureClass.includes("TYPE_MISMATCH")))
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "fidelity-context") {
      const snap = canonicalGraphFixture()
      snap.formals[0] = { ...snap.formals[0]!, claimId: "T-001", fidelityStatus: "REJECTED", isCurrent: true }
      const summary = buildGraphContextSummary(buildResearchGraph(snap, { branchId: "B-000" }), { focusClaimId: "T-001" })
      return { id, result: summary.fidelity?.blocked === true ? "PASS" : "FAIL" }
    }
    if (id === "branch-context-isolation") {
      const g4 = buildResearchGraph(branchIsolationFixture(), { branchId: "B-004" })
      const ok = g4.nodes.some((node) => node.id === "L-010") && !g4.nodes.some((node) => node.id === "L-020")
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "import-context") {
      const summary = buildGraphContextSummary(buildResearchGraph(importGraphFixture()), { focusClaimId: "T-001" })
      const ok = summary.importedDependencies.some((item) => item.targetClaimId === "L-044") && !summary.verifiedPrerequisites.some((item) => item.id === "L-021")
      return { id, result: ok ? "PASS" : "FAIL" }
    }
    if (id === "context-determinism") {
      const graph = buildResearchGraph(canonicalGraphFixture(), { branchId: "B-000" })
      const a = buildGraphContextSummary(graph, { focusClaimId: "T-001" })
      const b = buildGraphContextSummary(graph, { focusClaimId: "T-001" })
      return { id, result: a.graphContextHash === b.graphContextHash ? "PASS" : "FAIL" }
    }
    if (id === "experiment-projection" || id === "computational-evidence" || id === "counterexample-edge" || id === "experiment-branch-isolation" || id === "experiment-provenance") {
      const snap = canonicalGraphFixture()
      snap.experiments = [{
        id: "EXP-001", workspaceId: snap.workspaceId, branchId: "B-000", claimId: "T-001", researchRunId: null, researchStepId: null, agentId: null,
        kind: "FINITE_VERIFICATION", status: "SUCCEEDED", hypothesis: null,
        runtime: { adapter: "python", executable: "python3", version: "3", sympyVersion: null, platform: "test", adapterVersion: "v1" },
        codeArtifactId: "main.py", parameters: {}, codeHash: "aa", inputHash: "bb", createdAt: "t", startedAt: "t", finishedAt: "t",
      }, {
        id: "EXP-002", workspaceId: snap.workspaceId, branchId: "B-000", claimId: "T-001", researchRunId: null, researchStepId: null, agentId: null,
        kind: "COUNTEREXAMPLE_SEARCH", status: "SUCCEEDED", hypothesis: null,
        runtime: { adapter: "python", executable: "python3", version: "3", sympyVersion: null, platform: "test", adapterVersion: "v1" },
        codeArtifactId: "main.py", parameters: {}, codeHash: "cc", inputHash: "dd", createdAt: "t", startedAt: "t", finishedAt: "t",
      }, {
        id: "EXP-003", workspaceId: snap.workspaceId, branchId: "B-004", claimId: "T-001", researchRunId: null, researchStepId: null, agentId: null,
        kind: "SANITY_CHECK", status: "SUCCEEDED", hypothesis: null,
        runtime: { adapter: "python", executable: "python3", version: "3", sympyVersion: null, platform: "test", adapterVersion: "v1" },
        codeArtifactId: "main.py", parameters: {}, codeHash: "ee", inputHash: "ff", createdAt: "t", startedAt: "t", finishedAt: "t",
      }]
      snap.experimentResults = [{
        id: "ER-001", experimentId: "EXP-001", outcome: "NO_COUNTEREXAMPLE_FOUND", summary: "NO_COUNTEREXAMPLE_FOUND", structuredOutput: {},
        stdoutArtifactId: null, stderrArtifactId: null, startedAt: "t", finishedAt: "t", runtimeFingerprint: "fp", codeHash: "aa", inputHash: "bb",
        exactArithmetic: true, deterministic: true, stdoutTruncated: false, stderrTruncated: false, randomSeed: null,
      }, {
        id: "ER-002", experimentId: "EXP-002", outcome: "COUNTEREXAMPLE_FOUND", summary: "COUNTEREXAMPLE_FOUND", structuredOutput: { witness: { n: -1 } },
        stdoutArtifactId: null, stderrArtifactId: null, startedAt: "t", finishedAt: "t", runtimeFingerprint: "fp", codeHash: "cc", inputHash: "dd",
        exactArithmetic: true, deterministic: true, stdoutTruncated: false, stderrTruncated: false, randomSeed: null,
      }]
      const main = buildResearchGraph(snap, { branchId: "B-000" })
      const b4 = buildResearchGraph(snap, { branchId: "B-004" })
      const proof = buildResearchGraph(snap, { branchId: "B-000", proofOnly: true })
      if (id === "experiment-projection") return { id, result: main.nodes.some((n) => n.id === "EXP-001") && !proof.nodes.some((n) => n.kind === "EXPERIMENT") ? "PASS" : "FAIL" }
      if (id === "computational-evidence") {
        const summary = buildGraphContextSummary(main, { focusClaimId: "T-001" })
        return { id, result: summary.computationalEvidence.some((item) => item.experimentId === "EXP-001") && summary.notes.includes("COMPUTATIONAL EVIDENCE — NOT PROOF") ? "PASS" : "FAIL" }
      }
      if (id === "counterexample-edge") return { id, result: main.edges.some((e) => e.kind === "COUNTEREXAMPLE_TO" && e.fromNodeId === "ER-002") ? "PASS" : "FAIL" }
      if (id === "experiment-branch-isolation") return { id, result: main.nodes.some((n) => n.id === "EXP-001") && !main.nodes.some((n) => n.id === "EXP-003") && b4.nodes.some((n) => n.id === "EXP-003") ? "PASS" : "FAIL" }
      return { id, result: main.edges.some((e) => e.kind === "EXPERIMENT_FOR" && e.fromNodeId === "EXP-001" && e.toNodeId === "T-001") && main.edges.some((e) => e.kind === "PRODUCES" && e.fromNodeId === "EXP-001" && e.toNodeId === "ER-001") ? "PASS" : "FAIL" }
    }
    if (id === "source-projection" || id === "external-result-projection" || id === "citation-provenance" || id === "literature-branch-isolation") {
      const snap = canonicalGraphFixture()
      snap.sources = [{ id: "SRC-001", workspaceId: snap.workspaceId, type: "PAPER", title: "Banach", authors: ["Banach"], year: 1922, venue: null, doi: "10.1/x", arxivId: null, isbn: null, url: null, status: "INSPECTED", fingerprint: "doi:10.1/x", localPath: null, provider: "fake", providerId: "1", version: null, retrievedAt: "t", createdAt: "t" }]
      snap.excerpts = [{ id: "EXC-001", sourceId: "SRC-001", locator: { kind: "THEOREM", theorem: "1.2" }, text: "fixed point", textHash: "h", extractionMethod: "USER_PROVIDED", createdAt: "t" }]
      snap.externalResults = [
        { id: "EXT-001", workspaceId: snap.workspaceId, branchId: "B-000", sourceId: "SRC-001", excerptId: "EXC-001", kind: "THEOREM", name: "Banach", statementSummary: "fixed point", statementMode: "SUMMARY", locator: { kind: "THEOREM", theorem: "1.2" }, status: "HUMAN_REVIEWED", createdAt: "t" },
        { id: "EXT-002", workspaceId: snap.workspaceId, branchId: "B-004", sourceId: "SRC-001", excerptId: "EXC-001", kind: "THEOREM", name: "local", statementSummary: "other", statementMode: "SUMMARY", locator: null, status: "EXTRACTED", createdAt: "t" },
      ]
      snap.citations = [
        { id: "CIT-001", workspaceId: snap.workspaceId, branchId: "B-000", sourceId: "SRC-001", claimId: "T-001", evidenceId: null, blockerId: null, decisionId: null, researchRunId: null, researchStepId: null, externalResultId: "EXT-001", excerptId: "EXC-001", locator: { kind: "THEOREM", theorem: "1.2" }, purpose: "SUPPORT", invalidated: false, createdAt: "t" },
        { id: "CIT-002", workspaceId: snap.workspaceId, branchId: "B-004", sourceId: "SRC-001", claimId: "T-001", evidenceId: null, blockerId: null, decisionId: null, researchRunId: null, researchStepId: null, externalResultId: "EXT-002", excerptId: "EXC-001", locator: null, purpose: "BACKGROUND", invalidated: false, createdAt: "t" },
      ]
      const main = buildResearchGraph(snap, { branchId: "B-000" })
      const b4 = buildResearchGraph(snap, { branchId: "B-004" })
      const proof = buildResearchGraph(snap, { branchId: "B-000", proofOnly: true })
      if (id === "source-projection") return { id, result: main.nodes.some((n) => n.id === "SRC-001") && !proof.nodes.some((n) => n.kind === "SOURCE") ? "PASS" : "FAIL" }
      if (id === "external-result-projection") return { id, result: main.nodes.some((n) => n.id === "EXT-001") && main.edges.some((e) => e.kind === "EXTRACTED_FROM" && e.fromNodeId === "EXT-001") ? "PASS" : "FAIL" }
      if (id === "citation-provenance") return { id, result: main.edges.some((e) => e.kind === "SUPPORTED_BY_SOURCE" && e.fromNodeId === "T-001" && e.toNodeId === "EXT-001") && main.nodes.some((n) => n.id === "CIT-001") ? "PASS" : "FAIL" }
      return { id, result: main.nodes.some((n) => n.id === "CIT-001") && !main.nodes.some((n) => n.id === "CIT-002") && b4.nodes.some((n) => n.id === "CIT-002") && !b4.nodes.some((n) => n.id === "EXT-001") ? "PASS" : "FAIL" }
    }
    return { id, result: "FAIL", detail: "unknown" }
  } catch (error) {
    return { id, result: "FAIL", detail: error instanceof Error ? error.message : String(error) }
  }
}

export function runGraphEval() {
  return GRAPH_EVAL_SCENARIOS.map((id) => runGraphScenario(id))
}
