# Retrieval V3 paired evaluation

Measured on 2026-09-01 with the frozen six-case development split and six-case
holdout split. The tested candidate adds only lexical declaration/name overlap to
the frozen baseline score. No production ranking configuration was changed.

| Split | Baseline Hit@10 | Candidate Hit@10 | Baseline MRR | Candidate MRR | Baseline DSP@10 | Candidate DSP@10 | Decision |
|---|---:|---:|---:|---:|---:|---:|---|
| Development | 0.000 | 1.000 | 0.083 | 1.000 | 0.000 | 1.000 | INCONCLUSIVE |
| Holdout | 0.000 | 1.000 | 0.083 | 1.000 | 0.000 | 1.000 | INCONCLUSIVE |

Candidate recall, top-200, inspect-30, and final-20 were 1.000 for both rankers on
both splits. There were no completeness or domain Hit@10 regressions. Mean measured
ranking latency stayed below the configured absolute two-millisecond allowance.

The result is **INCONCLUSIVE** because Lean was unavailable in the measurement
environment. Downstream proof success therefore uses frozen proof-success
annotations and cannot authorize production promotion. The positive paired ranking
signal justifies a future Lean-enabled evaluation; it does not justify changing the
production retriever.

Machine-readable measurements are stored in
`benchmarks/retrieval-v3/results/development-latest.json` and
`benchmarks/retrieval-v3/results/holdout-latest.json`.
