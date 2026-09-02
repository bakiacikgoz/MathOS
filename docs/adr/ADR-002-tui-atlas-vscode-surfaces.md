# ADR-002: TUI, Atlas, and VS Code surfaces

## Status

Accepted.

## Decision

The keyboard-first TUI remains the primary control surface. The local Theorem Atlas is read-only and consumes a versioned snapshot. VS Code communicates through a versioned stdio bridge and never opens SQLite directly. All mutations pass through shared application services.

Deep links identify entities but grant no authority. Atlas uses loopback binding, session tokens, CSP, and data-only widgets. Branch imports require target-side re-verification. LLM output is not proof; `KERNEL_VERIFIED yalnız VerificationGate`.
