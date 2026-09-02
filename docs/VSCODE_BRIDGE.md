# VS Code bridge

The extension communicates with the MathOS stdio bridge through a versioned hello/welcome protocol, request IDs, bounded payloads, subscriptions, and explicit shutdown. Workspace and database paths are canonicalized; malformed or incompatible messages fail-closed.

Commands display research state, open trusted local views, and request governed domain actions. The extension contains no independent verification logic. Editor diagnostics and successful Lean editing are not proof; only VerificationGate can assign `KERNEL_VERIFIED`.

See [review and semantic merge](REVIEW_AND_SEMANTIC_MERGE.md).
