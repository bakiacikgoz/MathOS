# Capsule format v1

A capsule is a deterministic canonical manifest plus relative-path artifacts. It records schema epoch, toolchains, model configuration hashes, claims, sources, indexes, seeds, and content hashes without embedding secrets. Export ordering is stable; verify rejects tampering, missing/extra files, traversal, and symlinks.

Replay begins with a dry plan and requires an empty target plus explicit user action. Historical verification is not proof in the destination: every imported verified claim requires local VerificationGate re-verification before `KERNEL_VERIFIED`. Missing required toolchains or newer schemas fail-closed.

See [publication guide](PUBLICATION_GUIDE.md) and [security model](SECURITY_MODEL_V1.md).
