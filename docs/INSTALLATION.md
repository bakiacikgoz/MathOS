# Installation

Every MathOS download is on the [Releases page](https://github.com/bakiacikgoz/MathOS/releases). The commands below use version `1.0.0`; replace it with the version you want.

| You want | Download |
|---|---|
| The desktop app on Windows 10 or 11 (x64) | `MathOS-<version>-windows-x64-setup.exe` |
| The `mathos` command on Windows (x64) | `install.ps1`, or `mathos-<version>-windows-x64.tar.gz` |
| The `mathos` command on an Apple Silicon Mac | `install.sh`, or `mathos-<version>-darwin-arm64.tar.gz` |
| The `mathos` command on Linux (x64) | `install.sh`, or `mathos-<version>-linux-x64.tar.gz` |
| The VS Code companion | `mathos-<version>.vsix` (*Extensions → … → Install from VSIX*) |

`SHA256SUMS` lists the checksum of every file. The desktop app for macOS and Linux, and the command for Intel Macs and Linux on ARM, are built from source for now (see the [desktop README](../apps/desktop/README.md) and [Development](../README.md#development)).

## Not code-signed yet

MathOS installers and executables are not code-signed in this release. Your system may warn the first time:

- **Windows SmartScreen** shows "Windows protected your PC". Choose *More info → Run anyway*.
- **macOS** may refuse to open a `mathos` you downloaded with a browser. The installer script downloads with `curl`, which macOS does not quarantine. For a manual download, run `xattr -d com.apple.quarantine mathos` once.

Check a file against `SHA256SUMS` before you run it. On Windows: `Get-FileHash .\MathOS-1.0.0-windows-x64-setup.exe`. On macOS: `shasum -a 256 <file>`. On Linux: `sha256sum <file>`.

## Desktop app (Windows)

Run `MathOS-<version>-windows-x64-setup.exe`. It installs for the current user, needs no administrator rights, and downloads WebView2 only if Windows lacks it. On first launch, pick a folder or create a workspace (or open the sample project), connect a model under **Settings → Model Providers**, and let MathOS install Lean (see below). API keys go to Windows Credential Manager, never to a file.

Uninstall from *Settings → Apps*. Your workspaces stay where you put them.

## Command line

The installers download the archive for your platform, check it against `SHA256SUMS`, install it for your user only (no sudo, no administrator), and run `mathos --version --json` before they finish. If anything fails, the previous installation is restored.

macOS and Linux install to `~/.local/bin/mathos` (set `MATHOS_INSTALL_DIR` to change it):

```sh
curl -fsSL https://github.com/bakiacikgoz/MathOS/releases/download/v1.0.0/install.sh | MATHOS_VERSION=1.0.0 sh
mathos --version --json
```

Windows installs to `%LOCALAPPDATA%\Programs\MathOS\bin\mathos.exe` (set `MATHOS_INSTALL_ROOT` to change it). Add that folder to your user `PATH` to type `mathos` anywhere:

```powershell
$env:MATHOS_VERSION = '1.0.0'
irm https://github.com/bakiacikgoz/MathOS/releases/download/v1.0.0/install.ps1 | iex
& "$env:LOCALAPPDATA\Programs\MathOS\bin\mathos.exe" --version --json
```

To install from a mirror or a local folder, set `MATHOS_RELEASE_BASE_URL` to the directory that holds the archive and `SHA256SUMS`.

Manual installation works too: extract the archive, copy `root/bin/mathos` to a directory on your `PATH`, and copy `root/share/mathos` next to it as `../share/mathos` (the Atlas and the VS Code bridge are read from there).

`sh scripts/install/uninstall.sh` removes the command and keeps your workspaces, configuration, secrets and plugin data; add `--purge` to remove configuration and data as well.

## Lean and Mathlib

MathOS verifies with the repository-pinned `leanprover/lean4:v4.33.1` toolchain and Mathlib `v4.33.1`, and never replaces the pin with `stable` or `latest`. The download is about 6 GB.

Mathlib is downloaded with [git](https://git-scm.com/downloads), which Windows does not include. Install git first; if it is missing, MathOS says so and links to the download.

- **Desktop:** MathOS installs Lean in the background on first start, with progress under **Settings → System Health**. Lean goes to its standard folder (`~/.elan`), Mathlib to the app data folder. Nothing is downloaded into your workspaces, and your `PATH` is not changed.
- **Command line:** `mathos lean install --accept-downloads=lean,mathlib`, then `mathos lean status` to confirm (`"ready": true`).

If you already use [elan](https://lean-lang.org/install/), MathOS uses it and only adds the pinned toolchain.

## Experiment sandbox

Sandboxed model-generated computation on Windows and macOS requires Docker and the `python:3.12-alpine` image. Run `docker pull python:3.12-alpine`, then confirm `Experiment sandbox` is `PASS` in `mathos doctor --json`. If Docker or the image is unavailable, execution remains blocked and never falls back to the host.

## What every download contains

Each archive and the desktop installer carry `LICENSE` (AGPL-3.0-only), `NOTICE`, `SOURCE.json` (the exact source revision), an SPDX SBOM (`SBOM.json`) and the third-party license inventory and texts (`THIRD_PARTY_LICENSES.json`, `THIRD_PARTY_NOTICES.txt`). In the desktop app they are in the `legal` folder of the installation directory.
