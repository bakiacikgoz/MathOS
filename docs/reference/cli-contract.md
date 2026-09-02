# MathOS CLI contract

The command catalog is grouped as workspace, claims/objective, formalization/proof,
research, literature, experiments, branches/team, notebook/context, Atlas,
plugins/capsules/publication, setup/config/providers, and diagnostics/version.
Existing command names remain stable through the 1.0 release candidate.

Machine-readable commands use versioned JSON. JSON mode never mixes human prose
into stdout. Errors are written as a single `mathos.cli-error.v1` object to stderr.

Exit codes are stable: `0` success, `1` operation failure, `2` usage or
configuration error, `3` capability unavailable or blocked, `4` trust or
verification rejection, and `5` workspace conflict or version mismatch.

Canonical trust terms are `KERNEL_VERIFIED`, `FORMAL_PROOF_FAILED`,
`HUMAN_APPROVAL_REQUIRED`, `COMPUTATIONAL_EVIDENCE`, `EXTERNAL_SOURCE`,
`CANDIDATE_CONJECTURE`, `STALE`, and `BLOCKED`.

Long operations report elapsed time, a cancellation hint, and the last durable
checkpoint. Raw prompts, provider payloads, secrets, and stack traces are hidden
unless `MATHOS_DEBUG=1` is explicitly set.
