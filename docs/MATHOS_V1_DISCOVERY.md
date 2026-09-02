# MathOS 1.0 Discovery Baseline

## Implementation baseline

- Plan discovery base: `main@9ae4a305acd38fcf92689eaaf36e5969bb0e285a`.
- Implementation branch: `codex/mathos-0.2-hardening`.
- MathOS package version at program start: `1.0.0-rc.1`.
- Schema epoch at program start: `20`.
- MathOS 0.2 closure commit at program start: `51518714460a289203281537629cf8a8fd2f726d`.

The repository is materially ahead of the plan's discovery base. It already contains the fail-closed experiment policy, application-service decomposition, VerificationGate authority tests, additive migration guard, event projection recovery, portable-path tests, deterministic release check, retrieval governance, and honest pilot evidence required by the 0.2 prerequisite.

## Trust-boundary decision

Feature work may begin only when `bun run feature-program-preflight` reports every prerequisite as `PASS` and `readyForFeatures: true`. Missing files or stale release artifacts fail closed. Platform qualification remains separate: Windows is still `NOT_TESTED` for the MathOS 0.2 Lean and OS-sandbox release paths and is never converted into fabricated runtime evidence.

## Preserved local evidence

The release and pilot artifacts generated during 0.2 closure remain workspace evidence and are not treated as canonical source. The preflight binds release evidence to the current Git revision so a stale artifact cannot authorize feature work.
