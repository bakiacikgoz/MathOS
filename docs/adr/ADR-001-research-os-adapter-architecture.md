# ADR-001: Research OS and adapter architecture

## Status

Accepted.

## Decision

Preserve the local SQLite, append-only event projection, Git/worktree, and Lean VerificationGate core. Add capabilities as bounded domain contracts, application services, repositories, read ports, and validated adapters. Large subsystems do not accumulate inside `MathOS`; the facade delegates.

Adapters translate untrusted external output into internal typed results before persistence. Capability absence is fail-closed. LLM output is not proof, and `KERNEL_VERIFIED yalnız VerificationGate`.

## Consequences

Subsystems can be tested and replaced independently, while migrations remain additive. Adapter boilerplate is accepted in exchange for explicit trust and rollback boundaries.
