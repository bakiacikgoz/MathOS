# Security boundary

MathOS enforces the `KERNEL_VERIFIED` transition across its public application, model, literature, experiment, repository, and normal SQLite mutation paths. SQLite triggers require a complete persisted VerificationGate evidence graph and prevent that evidence from being changed or deleted while the claim remains verified.

The local filesystem owner remains outside this boundary. A process with arbitrary write access to the workspace database can disable triggers or forge an entire internally consistent evidence graph. Protecting against a malicious machine owner requires an external trust root, such as signed remote attestations, and is outside the local research runtime's threat model.
