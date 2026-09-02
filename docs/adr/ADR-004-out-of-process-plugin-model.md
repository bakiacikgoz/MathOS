# ADR-004: Out-of-process plugin model

## Status

Accepted.

## Decision

Plugins run out of process and communicate using JSON-RPC 2.0 stdio. In-process arbitrary TypeScript imports are forbidden. Every plugin declares narrow capabilities; wildcard process, network, environment, and workspace-write access is denied.

The host validates manifests and every response, applies timeout and output limits, redacts environment data, records audit metadata, and quarantines repeated protocol or permission violations. Missing capability is fail-closed. Plugin evidence cannot assign authority: LLM output is not proof and `KERNEL_VERIFIED yalnız VerificationGate`.

## Consequences

Plugin startup is slower and APIs are more explicit, but supply-chain blast radius and accidental authority are reduced. Removal disables future invocation without deleting historical evidence.
