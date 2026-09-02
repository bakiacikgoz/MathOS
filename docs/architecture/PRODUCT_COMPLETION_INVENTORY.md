# MathOS Product Completion Inventory

Baseline reference: `541e39ef6454ffd7b3934348ccb457f067b28f31`.

This inventory prevents duplicate implementation. Product completion extends the listed implementation in place unless a lifecycle is genuinely independent.

| Capability | Existing implementation | Production gap | Planned phase |
| --- | --- | --- | --- |
| Product identity | `packages/shared/src/version.ts`, package manifests | Canonical cross-surface build identity and explicit compatibility versions | 1 |
| Lean setup | `packages/lean/src/native.ts`, `pin.ts`, `NativeLeanAdapter.setupProject()` | Resumable consent-based bootstrap and verified setup state | 4 |
| Distribution | `scripts/build.ts`, Atlas/VS Code build scripts | Standalone binaries, resource layout, manifest, checksums, SBOM and clean-HOME smoke | 2, 15 |
| Configuration and secrets | workspace TOML, `packages/models/src/config.ts`, environment keys, redaction | Layered validated config, secret references and native SecretStore | 3 |
| Computation sandbox | macOS Seatbelt and fail-closed Linux detector under `packages/computation` | Bubblewrap execution/probe contract and evidence-based support matrix | 5 |
| Model providers | OpenAI-compatible transport, fake fixture, model doctor | Named profiles, role routing, bounded retry/cancel, privacy and local usage | 6 |
| Literature providers | ArXiv, Crossref, OpenAlex adapters and safe HTTP policy | Aggregate registry/runtime, cache, dedupe, rate limits, offline and partial health | 7 |
| Workspace lifecycle | SQLite WAL/FK/busy timeout, additive migrations, backup/restore, event rebuild | Pre-migration backup, exclusive operation locks, stale-write contract and user lifecycle CLI | 8 |
| Local bridge | versioned stdio hello/request/subscription/shutdown | Full envelope, shared errors, bounds, progress, cancellation and workspace confinement | 9 |
| CLI/TUI | broad headless/TUI product surface and trust labels | Stable JSON/exit contracts, command catalog, progress/cancel and terminal recovery | 10 |
| Atlas | read-only projection/server, token/origin/path controls, Solid app/widgets | Artifact-relative launch, CSP, 10k scale evidence and complete inspector/filter UX | 11 |
| VS Code | bridge client, claims tree, governed commands, trust-aware controller | Production manifest, VSIX, package inspection and complete process lifecycle | 12 |
| Plugins | manifest/capability validation, process host, quarantine, conformance | Persistent managed installs and atomic update/remove/compatibility lifecycle | 13 |
| Capsules | deterministic inventory/archive verify/replay plan and format contract | Frozen product-independent V1 import/inspect/conflict and semantic roundtrip | 14 |
| Publication | canonical service with Markdown/LaTeX/HTML and provenance | Frozen format, citation audit, deterministic trust-preserving outputs and optional PDF capability | 14 |
| Installer/updater | release-check only | User-scoped checksum install, explicit atomic update/rollback and preserving uninstall | 15 |
| Diagnostics | doctor, diagnostics export, redaction and pilot artifacts | Rotating local logs, metadata-only support bundle, no telemetry and scale baselines | 16 |
| Release qualification | 17-step release-check and V1 qualification | Artifact-aware G01–G22 software-completion V2 and RC freeze | 18 |

## No-new-subsystem decision

Configuration, secrets, setup, update and diagnostics will initially live in existing `shared`, `models`, `core`, `workspace` and `plugins` boundaries. A new top-level package is permitted only when independent lifecycle and public API requirements cannot be expressed cleanly in those boundaries. VerificationGate, retrieval, graph, research, notebook, literature adapters, Atlas, VS Code foundations, capsules and publication will not be rewritten.
