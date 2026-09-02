# Alignment workflow

Alignment compares the informal statement with its formal statement across assumptions, strength, quantifiers, domains, and notation. A human approval is bound to exact natural, formal, context, and revision hashes. Any change makes that approval stale.

Unresolved errors block confirmation. Approval is necessary but not sufficient: compilation, axiom policy, forbidden constructs, and freshness are enforced by VerificationGate. Similarity, successful compilation alone, and model judgment are not proof; they cannot assign `KERNEL_VERIFIED`. The workflow is fail-closed on missing evidence.

See [trust model](TRUST_MODEL_V1.md).
