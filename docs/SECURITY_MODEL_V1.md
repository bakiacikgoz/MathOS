# Security model v1

MathOS is local-first. Secrets remain in environment-backed provider configuration and are excluded from databases, events, logs, reports, backups, notebooks, capsules, and diagnostics. Model code, solvers, and plugins run out of process with explicit capabilities, temporary write roots, bounded resources, and network disabled by default.

Paths are canonicalized; traversal, symlinks, implicit home mounts, private network targets, malformed protocols, unknown permissions, and unavailable isolation fail-closed. Plugins cannot wildcard capabilities and repeated security/protocol failures quarantine them.

Security controls do not create mathematical authority. Computation, literature, plugins, solvers, models, and human comments are not proof. Only VerificationGate may assign `KERNEL_VERIFIED` after current alignment, compilation, axiom, and forbidden-construct checks.

See [prover adapter contract](PROVER_ADAPTER_CONTRACT.md), [capsule format](CAPSULE_FORMAT_V1.md), and [professional pilot](PROFESSIONAL_PILOT.md).
