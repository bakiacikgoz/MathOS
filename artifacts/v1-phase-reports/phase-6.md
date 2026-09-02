# MathOS 1.0 Phase 6 — Solver Lab and Certificate/Replay Trust

Status: PASS

## Closure evidence

- Solver descriptors are unique, capability-scoped, canonical-path bound, network-denied by default, and external executables require sandboxing.
- Lean emits proof candidates that still require VerificationGate; SymPy emits computational evidence only.
- SageMath, GAP, and cvc5 optional adapters report unavailable binaries honestly and use sandbox request files, argv execution, bounded output, timeouts, and input/output hashes.
- Counterexample witnesses are independently re-evaluated. Invalid witnesses become `INVALID_COUNTEREXAMPLE`.
- Certificates do not self-certify. `CERTIFICATE_CHECKED` requires an independent checker; `LEAN_REPLAYED` additionally requires successful replay with exact matching input/output hashes.
- Solver jobs/results and evidence are persisted; replay mutates only replay/trust metadata under hash guards. Solver paths never update claim verification status.
- CLI/TUI snapshots are versioned and display `SOLVER EVIDENCE — NOT A PROOF` with exact, certificate, witness, and replay state.

## Exit gate

SymPy computational fixture, cvc5 certificate fixture, invalid/valid witness paths, and matching/mismatched Lean replay transitions passed. Verification authority regression confirms no solver path directly verifies a claim.

Verification: 25 tests passed across the Phase 6 solver suite; `typecheck:all` passed at every task closure.

Commits: `21dd7c4`, `4ce7493`, `31d7972`, `7351ff0`, `b40145b`.
