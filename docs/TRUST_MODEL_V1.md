# MathOS 1.0 Trust Model

## Authority matrix

| Input | May create evidence | May change research state | May assign `KERNEL_VERIFIED` |
|---|---:|---:|---:|
| LLM or retrieval | yes, after validation | only through governed services | no |
| Computation or solver | yes, with trust class | only through governed services | no |
| Literature | yes, with locator and review | only through governed services | no |
| Human review | yes | explicit approved transitions | no |
| Lean VerificationGate | verification evidence | guarded storage promotion | yes |

`KERNEL_VERIFIED yalnız VerificationGate`. LLM output is not proof. Human approval cannot be synthesized by a model. A branch-local result requires target-side re-verification.

## Fail-closed boundaries

- Missing sandbox, executable, permission, certificate, replay, or protocol capability produces `BLOCKED` or `UNAVAILABLE`; there is no unsafe fallback.
- Network use requires an explicit provider, host allowlist, private-address rejection, redirect validation, timeout, and response-size limit.
- Secrets and personal absolute paths are excluded from SQLite, events, logs, reports, notebooks, capsules, backups, and publications.
- Historical evidence is immutable. Current validity is represented separately through revision bindings, staleness, and impact projections.

## Surface authority

TUI, CLI, read-only Atlas, and VS Code bridge call the same application services. No UI reimplements SQL, policy, or verification rules. Atlas snapshots and generated publications are projections, never canonical state.
