# Solver trust model

Solver results are classified as untrusted support, independently checked counterexample, certificate-bearing result, or locally replayed formal evidence. A witness is rechecked; a certificate is retained with input/output hashes and must be replayed against the exact formal revision.

SAT/UNSAT, symbolic simplification, numerical evidence, or a solver's own success claim is not proof. Trust never upgrades on missing evidence. `KERNEL_VERIFIED` remains exclusively controlled by VerificationGate, and policy violations fail-closed.

See [prover adapter contract](PROVER_ADAPTER_CONTRACT.md).
