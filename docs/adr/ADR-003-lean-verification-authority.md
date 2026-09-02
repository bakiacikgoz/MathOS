# ADR-003: Lean VerificationGate authority

## Status

Accepted and non-disableable.

## Decision

`KERNEL_VERIFIED yalnız VerificationGate`. The gate requires a current formal revision, human-approved fidelity, an accepted proof, pinned toolchain evidence, successful compilation, and an allowed axiom audit. LLM output is not proof.

No feature flag, plugin, solver, literature assessment, reviewer attestation, or model role may bypass this path. Imported proofs undergo target-side re-verification, and static authority tests constrain guarded writes.

## Consequences

Some useful results remain unverified or blocked. This is intentional: epistemic labels reflect evidence, not product optimism.
