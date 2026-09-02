# MathOS 1.0 Product Boundary

MathOS is a local-first mathematical research operating environment. It organizes informal reasoning, formal statements, literature, experiments, solver evidence, proof attempts, review, and reproducibility under one explicit trust chain. It does not claim to solve every problem or turn model output into proof.

## In scope

- Mathematical context and notation registry.
- Graph-backed research notebook and informal–formal alignment review.
- Verifier-governed proof portfolio, solver evidence, and failure memory.
- Claim-level literature provenance, read-only Theorem Atlas, and data-only widgets.
- Git-based review packets, reproducibility capsules, publication output, and capability-safe adapters.
- TUI as the primary mutation surface, with a read-only Atlas and a governed VS Code bridge.

## Out of scope

- Hosted multi-tenant SaaS, cloud identity, billing, or real-time cloud collaboration.
- Replacement of Lean, VS Code, Git, CAS tools, or reference managers.
- Automatic novelty, truth, or open-problem-solution claims.
- Unapproved remote push, pull request, publication, or release actions.
- In-process arbitrary plugin imports and Windows 1.0 GA claims.

## Product invariant

LLM output is not proof. Computation, literature, semantic similarity, solver success, and compilation are evidence with distinct authority. `KERNEL_VERIFIED yalnız VerificationGate` and target-side re-verification remains mandatory for imported branch results.

## Related decisions

- [Trust model](TRUST_MODEL_V1.md)
- [ADR-001](adr/ADR-001-research-os-adapter-architecture.md)
- [ADR-002](adr/ADR-002-tui-atlas-vscode-surfaces.md)
- [ADR-003](adr/ADR-003-lean-verification-authority.md)
- [ADR-004](adr/ADR-004-out-of-process-plugin-model.md)
