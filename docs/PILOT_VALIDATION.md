# Fresh-user pilot validation

Run `bun run pilot-validation` from the repository root. The runner uses `dist/cli.js`; when that artifact is absent it first runs the repository build. It creates a private temporary directory, initializes a new `pilot` workspace, captures bounded and redacted output, writes `artifacts/pilot-validation-latest.json`, and removes the temporary workspace. Use `--keep-workspace` only for local diagnosis; temporary paths are normalized out of evidence.

The child CLI receives a credential-free environment allowlist containing only tool discovery and platform essentials such as `PATH`, an isolated `HOME` and `TMPDIR`, locale, and Windows process variables where required. API keys, provider tokens, endpoints, and user configuration are not inherited. The artifact records the git revision, package version, built entrypoint, CLI hash, runner hash, and a canonical evidence hash. `generatedAt` is the sole excluded volatile field; random workspace paths, generated IDs, and artifact timestamps are normalized, so equivalent runs have the same canonical hash.

For a manual pilot, create an empty directory and run:

```bash
mathos init pilot
cd pilot
mathos doctor
mathos
```

Record each item as `PASS`, `BLOCKED`, `NOT_RUN`, or `FAIL`. A missing model, Lean/mathlib, retrieval index, sandbox, provider, or headless command is `BLOCKED`; it must never be converted to a simulated pass.

| Step | Command or action | Passing evidence | Trust expectation |
| --- | --- | --- | --- |
| Initialize | `mathos init pilot` | `.mathos` workspace opens | New local state only |
| Doctor | `mathos doctor --json` | Required checks pass; optional checks are explained | Capability report is evidence, not proof |
| Create conjecture | `mathos claim create --type conjecture ...` | `C-001` created | Claim remains unverified |
| Set objective | `mathos objective set C-001` | Objective shown in status | No proof implication |
| Formalize | `mathos formalize C-001 --json` | Checked Lean draft and provenance | Draft is not a proof |
| Fidelity approval | Review in TUI and approve | Human confirms natural/formal meaning | Approval is semantic, not kernel verification |
| Premise search | `mathos premises C-001 --explain` | Provenance-valid built index returns explanations | Retrieval candidates are suggestions |
| Proof attempt | `mathos prove C-001 --json` | Attempt artifact recorded | Model output alone is untrusted |
| Verify | `mathos verify C-001 --json` | Lean kernel passes the compiled artifact | Only this may yield `KERNEL_VERIFIED` |
| Experiment | `mathos experiment create`; `mathos experiment run` | Deterministic result and explicit runtime trust labels | Computational support is not proof |
| Literature | `mathos literature search ...` | Real provider and source provenance recorded; the default fake provider is `BLOCKED` | Citation is `EXTERNAL_KNOWN`, not proof |
| Branch | `mathos branch setup`; `mathos branch create "pilot alternative"` | Isolated research branch exists | Branch evidence stays branch-local |
| Team start/pause | `mathos team start --json`; `mathos team pause MR-001` | Bounded session starts and pauses cleanly | Workers cannot self-certify proofs |
| Reopen | Exit, then `mathos status --json` | State and interruption recovery are coherent | Reopen must not invent completion |
| Backup | `mathos backup --out backups` | Archive path exists | Secrets must not appear in manifest/output |
| Restore | `mathos restore <archive> --into <empty-dir>` | Restored workspace opens with equivalent state | Never overwrite an existing workspace |
| Report | `mathos report --format json` | Report artifact exists and is redacted | Report labels evidence classes explicitly |

The JSON artifact includes the exact exit code and bounded stdout/stderr for automated commands, a reason for every result, and a rerun instruction. Doctor output is parsed structurally: missing or unverified capabilities become `BLOCKED`, even when the doctor command exits successfully. A nonzero command becomes `BLOCKED` only when its typed error matches an already observed capability or prerequisite gap; other failures remain `FAIL`.

Backup evidence includes archive existence, manifest parsing, and a credential-pattern scan. Restore passes only when objective, claim summary, branch state, and event-log digest match the source and extracted text files are clean. Report passes only when JSON parses, the complete trust legend is present, and its content passes the same secret scan. Interactive TUI launch and human fidelity approval remain explicit actionable `BLOCKED` checklist items in an automated run.
