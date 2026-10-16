# Changelog

Each section is also the text of its GitHub Release.

## 1.0.1

MathOS now keeps itself up to date, and the assistant copes with a busy model.

### Changes

- **Updates inside the app.** The desktop app looks for a newer release at launch and twice a day (turn it off in Settings → General → Updates). When one is out, a notice in the sidebar shows its notes; **Update now** downloads the Windows setup, checks it against `SHA256SUMS`, installs it over the same per-user installation and opens the new version.
- **`mathos update`** tells you whether a newer release is out, and `mathos update install` installs it over the current command-line installation with that release's own installer, which verifies the download and restores the previous version if the new one does not start.
- **Model and effort side by side.** The model picker moved from the top right into the message box, next to the thinking effort. The effort menu no longer hides its lower options under the message box.
- **A busy model is asked again.** When a provider answers that its model is overloaded or rate limited, the assistant waits and asks again up to three times (2, 5 and 10 seconds) and shows the countdown; if it is still busy, the message says so in plain words and suggests another model.
- Release checks run tests with the same 30-second per-test limit as CI.

MathOS 1.0.0 does not have the in-app update yet: install 1.0.1 once from the Releases page, and later versions arrive by themselves.

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
