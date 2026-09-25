# MathOS Desktop

A native desktop app for MathOS built with [Tauri 2](https://tauri.app) (Rust) and React. It gives researchers who do not live in a terminal the same workspace the CLI and TUI use: claims, main objective, branches, system health and a console for everything else.

- Monochrome, Apple-style interface with light, dark and system themes (the switch animates as a circular reveal).
- Turkish and English UI, detected from the system language.
- LaTeX in statements (`$…$`, `$$…$$`) rendered with KaTeX, loaded only when needed.
- Keyboard first: `⌘K` palette, `⌘N` new claim, `⌘1…5` screens, `⌘,` settings (`Ctrl` on Windows/Linux).

The app does not reimplement MathOS. It drives the real CLI, so every trust rule stays where it is: only the Lean kernel and the VerificationGate can mark a claim verified.

## Architecture

```
React UI  ──invoke──▶  Rust (src-tauri)  ──stdio JSON lines──▶  mathos-host (Bun)
                       supervises process                        runs runHeadless() in-process
```

`host/host.ts` is a long-lived process that keeps the MathOS CLI warm. A cold `mathos` start costs about 0.9 s; a warm request through the host costs about 30 ms. Requests run one at a time because the CLI relies on the process-wide working directory. Commands that need a terminal (`secrets set`, `provider login`, `atlas` server, `update apply`) are refused with a clear message instead of hanging.

The Rust side (`src-tauri/src/host.rs`) starts the host lazily, restarts it if it dies, and kills it on exit. It looks for the host in this order:

1. `MATHOS_DESKTOP_HOST` (path to an executable)
2. the bundled sidecar next to the app binary (`mathos-host`)
3. debug builds only: `bun apps/desktop/host/host.ts` from this repository

## Develop

Requirements: Bun ≥ 1.4.1, Rust (stable) and the [Tauri system prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```sh
bun install                 # repo root
cd apps/desktop
bun install                 # desktop dependencies (separate lockfile)
bun run tauri:dev           # native window with hot reload
```

UI-only work does not need Rust: `bun run dev` serves the app at http://127.0.0.1:1420 and a dev-only middleware talks to the same host over loopback.

Checks:

```sh
bun run typecheck           # UI types
bun test host src           # protocol and helper tests
cd src-tauri && cargo clippy
```

## Build installers

```sh
bun run tauri:build
```

This compiles the host into a standalone executable (`scripts/build-host.ts` → `src-tauri/binaries/mathos-host-<target-triple>`), then builds the app and platform installers (`.dmg`/`.app`, an NSIS `-setup.exe` on Windows, `.deb`/`.AppImage`/`.rpm`) with the host bundled as a sidecar. Build on each target OS; cross-compiling native installers is not supported.

## Windows

**Ready-made installer.** Every push that touches the app runs the `Desktop · Windows` workflow (GitHub → Actions; it can also be started by hand with *Run workflow*). It typechecks and tests the app. It builds the engine and checks that it answers CLI requests on Windows and stores and reads a key in Windows Credential Manager. Then it builds the installer. Download `MathOS-windows-x64-setup` from the run's *Artifacts*, unzip it and run `MathOS_<version>_x64-setup.exe`.

- The installer is not code-signed yet, so SmartScreen shows "Windows protected your PC". Choose *More info → Run anyway*.
- It installs for the current user only, with no administrator rights needed. WebView2 is already present on Windows 10/11; if it is missing, the installer downloads it.
- API keys entered in the app go to **Windows Credential Manager** (*Control Panel → Credential Manager → Windows Credentials*, entries named `com.mathos.model-provider:<ref>`). They never reach a file on disk.

**Building on your own Windows machine.**

1. Install [Bun](https://bun.sh) (≥ 1.4.1), [Rust](https://rustup.rs) and the *Desktop development with C++* workload of [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. From the repository root, in PowerShell:

```powershell
bun install
cd apps/desktop
bun install
bun run tauri:dev      # run the app with hot reload
bun run tauri:build    # installer at src-tauri\target\release\bundle\nsis\
```

Only the NSIS installer is built on Windows (`src-tauri/tauri.windows.conf.json`). The MSI format rejects pre-release versions such as `1.0.0-rc.1`.
