# Fresh-user pilot validation

Run `bun run pilot-validation` from the repository root. The runner creates a private temporary directory, initializes a new `pilot` workspace through the real CLI, captures bounded and redacted output, writes `artifacts/pilot-validation-latest.json`, and removes the temporary workspace. Use `--keep-workspace` only for local diagnosis; the path is intentionally absent from committed evidence.

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
| Experiment | TUI → Experiments | Deterministic result, runtime fingerprint, sandbox/network labels | Computational support is not proof |
| Literature | TUI → Literature | Provider and source provenance recorded | Citation is `EXTERNAL_KNOWN`, not proof |
| Branch | `mathos branch setup`; `mathos branch create "pilot alternative"` | Isolated research branch exists | Branch evidence stays branch-local |
| Team start/pause | TUI → Team | Bounded session starts and pauses cleanly | Workers cannot self-certify proofs |
| Reopen | Exit, then `mathos status --json` | State and interruption recovery are coherent | Reopen must not invent completion |
| Backup | `mathos backup --out backups` | Archive path exists | Secrets must not appear in manifest/output |
| Restore | `mathos restore <archive> --into <empty-dir>` | Restored workspace opens with equivalent state | Never overwrite an existing workspace |
| Report | `mathos report --format json` | Report artifact exists and is redacted | Report labels evidence classes explicitly |

The JSON artifact includes the exact exit code and bounded stdout/stderr for automated commands, a reason for every result, and a rerun instruction. `overall: BLOCKED` is an honest pilot result when optional infrastructure is absent; any unexpected local command failure makes the run `FAIL`.
