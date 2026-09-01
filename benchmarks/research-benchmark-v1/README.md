# MathOS Research Benchmark V1

Frozen evaluation set. Role: EVALUATION. `tuningAllowed: false`.

Do not tune production planner, retrieval, or verification against this dataset.
Create `research-dev-v1` for development. Do not reuse retrieval holdouts.

- Public fixtures: `dataset.json` (no reference proofs)
- Reference solutions: `reference/solutions.ts` (oracle / fake harness only)
- Results: `../results/research-benchmark/` append-only

```
bun scripts/research-benchmark.ts --validate
bun scripts/research-benchmark.ts --fake
bun scripts/research-benchmark.ts --model
bun scripts/research-benchmark-regression.ts
```
