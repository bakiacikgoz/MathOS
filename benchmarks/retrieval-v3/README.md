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

The included corpus is a small governance and harness corpus. Its proof-success
labels are frozen annotations, not evidence of broad mathematical capability.
Production promotion requires a Lean-enabled run on a larger representative corpus.
