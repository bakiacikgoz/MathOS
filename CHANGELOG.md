# Changelog

Each section is also the text of its GitHub Release.

## 1.0.0

The first stable release of MathOS: a local research workspace where AI proposes and Lean decides.

### Highlights

- **Claims with a state.** Conjectures, lemmas, theorems and definitions live in a typed dependency graph with sources and history. Only the local VerificationGate (Lean kernel, fidelity policy, forbidden constructs, axiom audit) can mark a claim `KERNEL_VERIFIED`.
- **An assistant inside your research.** It reads claims, searches Mathlib and the literature, and proposes actions that run only after you approve them. Bring your own model: 60+ providers, local models on loopback, cloud models off until you allow them.
- **From statement to proof.** Translate to Lean, compare meanings side by side, prove and verify. The desktop app installs the pinned Lean 4 v4.33.1 toolchain and Mathlib for you.
- **Research runs** that plan, search premises, decompose and attempt proofs within a budget, and stop to ask you when a decision is yours.
- **Memory.** Conventions, research notes, failed proof routes and a personal library of verified results carry context between sessions. A note or convention a model proposes is saved only after you approve it.
- **Everything else:** literature with provenance, sandboxed experiments, branches with semantic merge, notebooks and reproducibility capsules, deterministic publication, the Atlas web view, a VS Code companion, plugins, a full terminal UI, and English and Turkish interfaces.

### Downloads

| File | For |
|---|---|
| `MathOS-<version>-windows-x64-setup.exe` | The desktop app on Windows 10 and 11 (x64) |
| `mathos-<version>-windows-x64.tar.gz` | The `mathos` command on Windows (x64) |
| `mathos-<version>-darwin-arm64.tar.gz` | The `mathos` command on Apple Silicon Macs |
| `mathos-<version>-linux-x64.tar.gz` | The `mathos` command on Linux (x64) |
| `mathos-<version>.vsix` | The VS Code companion extension |
| `install.sh`, `install.ps1` | User-scoped command-line installers that verify `SHA256SUMS` |
| `SHA256SUMS` | Checksums of every file above |

The installers and executables are **not code-signed** yet. Windows SmartScreen may warn on first run (choose *More info → Run anyway*), and macOS may block the command until you allow it (see [installation](https://github.com/bakiacikgoz/MathOS/blob/main/docs/INSTALLATION.md)). Verify a download with `SHA256SUMS` before running it. The desktop app for macOS and Linux is built from source for now.

Every archive and the installer carry `LICENSE`, `NOTICE`, `SOURCE.json`, an SPDX SBOM and the third-party license texts.

## 1.0.0-rc.1

Release candidate for 1.0.0, used to rehearse the release workflow. Its contents are described under 1.0.0.
