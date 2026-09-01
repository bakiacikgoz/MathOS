# Retrieval V3 research program

This benchmark compares the frozen production ranking baseline with one candidate
channel: lexical declaration/name overlap. It does not change production retrieval.

`development/` is the only split allowed for candidate tuning. `holdout/` is loaded
only with the `final-evaluation` purpose; the evaluator rejects holdout access with a
`tuning` purpose before reading gold labels. Both manifests pin fixture and gold
files by SHA-256 and case count. Changing any frozen input makes evaluation fail.

The paired evaluator reports candidate recall, top-200, inspect-30, final-20,
Hit@1/5/10, MRR, latency, domain deltas, complete-case regressions, and
DownstreamProofSuccess@10. Promotion requires every gate. A missing Lean runtime or
missing downstream evidence produces `INCONCLUSIVE`, never `PROMOTE`.

Run:

```sh
bun scripts/retrieval-v3-eval.ts --split=development
bun scripts/retrieval-v3-eval.ts --split=holdout
```

Each case is evaluated through the production `retrieveFromDeclarations` stages and
reports both source-corpus and generated-stage sizes. A stage below the minimum
representative size makes promotion inconclusive. Gold files identify expected
premises and contain proof programs, but success is counted only after that program
is executed by Lean and returns `KERNEL_ACCEPTED`. Missing Lean/mathlib, a failed
probe, or any missing downstream execution makes promotion inconclusive.
