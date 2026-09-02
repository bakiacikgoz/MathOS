# Review and semantic merge

A review packet attests the exact branch revision and summarizes mathematical changes, alignment, verification, dependencies, sources, experiments, and findings. Reviewers record severity and dimension against the packet hash. A changed branch makes the packet stale.

Merge is never automatic. Open findings, stale packets, missing target re-verification, or active research runs block apply. Reviewer approval is not proof and cannot copy `KERNEL_VERIFIED`; target-workspace VerificationGate evidence is required. All ambiguous states fail-closed.

See [capsule format](CAPSULE_FORMAT_V1.md).
