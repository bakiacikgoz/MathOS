# Professional pilot

MathOS organizes mathematical research and provenance; it is not an automatic solver of open problems. `KERNEL_VERIFIED` is granted only by the local VerificationGate. Model, literature, computation, solver, retrieval, and reviewer outputs are not proof.

## Clean quickstart

From a clean clone run:

```text
bun install --frozen-lockfile
bun run typecheck:all
bun link
mathos --version
mathos doctor
mathos init pilot-research
cd pilot-research
mathos
```

Complete, in order: create a notebook and context; import an existing paper with dry-run then explicit apply; review informal/formal alignment; run a proof portfolio; inspect Atlas; export and verify a capsule; build a publication; reopen after 48 hours; create a review packet. Useful command families are `mathos capsule export`, `mathos capsule verify`, `mathos publish build`, `mathos atlas snapshot`, and `mathos solver doctor`. If a capability is absent, record BLOCKED; do not reinterpret it as PASS.

Target participants: two Lean/Mathlib users, two professional or academic mathematicians, one computation/CAS researcher, and when possible one shared-formalization maintainer.

## Feedback form

- Confusion:
- Trust:
- Time saved:
- Failure:
- False confidence:
- Missing workflow:
- Task and environment:
- Evidence/artifact link:

Human-interactive TUI steps require a human observation. Security and verification fail-closed.

See [pilot notes](PILOT.md), [trust model](TRUST_MODEL_V1.md), and [security model](SECURITY_MODEL_V1.md).
