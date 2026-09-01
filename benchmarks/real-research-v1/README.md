# Real Research Capability Benchmark V1

This frozen corpus contains 40 closed, known-proved cases. Each case records its natural statement, expected Lean target, domain, difficulty, known proof, required concepts, and provenance. `manifest.json` pins every case by SHA-256 and pins the manifest itself.

The known proof is validation data and is never passed to the model. A benchmark case runs in a fresh MathOS workspace with a fresh research run and the fixed budget exported as `REAL_RESEARCH_BUDGET`. The runner accepts only the configured real model provider, `NativeLeanAdapter`, and `HybridPremiseRetriever`. Missing model credentials or Lean produces `BLOCKED_CONFIGURATION`; there is no fake fallback.

Validate without external services:

```bash
bun scripts/real-research-eval.ts --validate
```

Run one case or the frozen suite:

```bash
bun scripts/real-research-eval.ts --case RB-ALG-001
bun scripts/real-research-eval.ts
```

Results are written under `artifacts/real-research-v1/`. They report the primary `KernelVerifiedRate` and all Phase 5 secondary metrics. Comparisons are nondeterministic regression signals and explicitly have `hardGate: false`; this benchmark must not be added to CI or the release gate.
