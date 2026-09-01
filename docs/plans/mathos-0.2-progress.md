# MathOS 0.2 implementation evidence

User plan: [mathos-0.2.md](mathos-0.2.md). Work is incomplete; do not claim 0.2 ready.

## Phase order and status

- Phase 0: baseline commands attempted and captured; frozen V2 copied. Typecheck failed (existing configuration/type errors); tests 229 pass, 23 fail, 3 errors; release-check failed. Native Lean/Mathlib and portable index fixtures missing.
- Phase 1: PASS after security review. Origin migration, policy, real macOS Seatbelt sandbox, fail-closed adapters, bounded aggregate output, process-tree timeout, environment/network/filesystem isolation, resource limits, audit persistence and focused security regressions implemented. Focused suite: 26 pass; reviewer found no Critical/Important residuals.
- Phases 2–11: pending, blocked on phase 1 acceptance per user plan.

## Decisions

- Existing experiments migrate to MODEL_GENERATED conservatively; provenance of old code cannot be inferred safely.
- New API-created experiments default USER_AUTHORED; research run experiments always MODEL_GENERATED regardless of planner parameters.
- Install missing Bun/Lean in ignored .tools directory, without modifying global developer runtime configuration.
- Preserve baseline failure logs; repair failures as required by phases, never hide them.

## Validation commands

Runtime PATH: prepend `$PWD/.tools/bun-darwin-aarch64` (Bun 1.4.0).
Baseline logs and revision: `artifacts/baseline/`.
`bun test tests/experiment-policy-integration.test.ts`: 3 pass, 0 fail after implementation.
