# Multi-agent research quality

Independent checkers do not run proof-producing research actions. After a round they
review other workers' solution candidates and emit a structured verdict with concrete
critique items for claim status, formal revision, and verification evidence. When a
checker is assigned, a candidate can stop the session only after an `ACCEPT` verdict.

Shared digests keep verified and unverified findings in separate arrays. They also
record checker reviews and duplicate approach fingerprints. Assignment diversity uses
a normalized fingerprint of approach, target, and goal; duplicates fall back with
`LOW_ASSIGNMENT_DIVERSITY`, and duplicates detected during a session stop explicitly
with that reason.

Artifact imports reach `APPLIED` only when the source is kernel verified, its formal
and verification records are current, source and target workers still match their
branches with no declaration conflict, and target verification produces a current
kernel-verified result. Each failure remains non-applied with a specific code.

## Paired benchmark

The committed single-vs-multi measurement uses fake planners and Fake Lean. It is a
harness and cost signal only: both one-case paths passed, multi used the existing
three-agent limit, and wall time is recorded in
`benchmarks/multi-agent-quality/latest.json`. No real model credential was available,
so the quality decision is **INCONCLUSIVE**. Fake planner success is not evidence that
multi-agent research improves mathematical quality.
