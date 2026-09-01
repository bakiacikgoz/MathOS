# MathOS

Agentic **mathematical research workspace**. Persistent claims, epistemic statuses, Lean verification, retrieval, experiments, and literature — not a chatbot and not a replacement for a proof assistant.

## What it is not

- Not an automatic solver of open problems
- Not a general IDE / desktop app
- LLM output is not proof
- Computation is not proof
- Literature citation is not proof
- **KERNEL_VERIFIED requires VerificationGate**

## Status

**0.1.0-alpha.1** — early-user / pilot alpha. macOS is the supported development platform. Linux is untested in this tree. Windows is **NOT_TESTED**.

## Requirements

**Required:** [Bun](https://bun.sh) >= 1.2, a writable directory.

**Feature-specific:**

- Git — research branches / worktrees
- Lean 4.33.1 + Lake + Mathlib — formal verification
- Python 3 — computational experiments
- `MATHOS_API_KEY` + `MATHOS_MODEL` — AI planner (optional)
- Network — live OpenAlex literature (optional)

MathOS still opens if Lean, Python, Git, or a model key are missing. Formal verification / experiments / live search simply stay unavailable.

## Install / quick start

```bash
bun install
bun link
mathos --version
mathos doctor
mathos init my-research
cd my-research
mathos
```

Users should invoke `mathos` after `bun link` from the repo root. `bun run mathos` also works.

```text
mathos init [name]
mathos status
mathos doctor [--json]
mathos backup --out ./backups
mathos restore <file.tgz> --into ./restored
mathos report --format md
mathos diagnostics export
```

See [docs/PILOT.md](docs/PILOT.md) for the short early-user path.

## Trust model

| Status | Meaning |
| --- | --- |
| CONJECTURE | Informal claim |
| COMPUTATIONALLY_SUPPORTED | Experiment evidence — **not** a proof |
| EXTERNAL_KNOWN | Cited source — **not** a proof |
| FORMALIZED_UNVERIFIED | Lean statement exists, unverified |
| KERNEL_VERIFIED | VerificationGate passed (current formal revision, fidelity, compile, axioms, forbidden constructs) |

## Layout

Workspace-local only (no hidden global config by default):

```text
mathos.toml          project config (no API keys)
.mathos/mathos.db    SQLite
.mathos/events.jsonl append-only events
formal/              Lean artifacts
experiments/         computation recipes
reports/             exported markdown reports
```

API keys live in the environment (`MATHOS_API_KEY`), never SQLite, events, reports, logs, or backups.
