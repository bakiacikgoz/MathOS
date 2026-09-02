# Installation

Release assets include platform archives, a VSIX, `SHA256SUMS`, a release manifest, SBOM, and license inventory. Verify the archive checksum before extraction. The installer uses `~/.local/bin/mathos`; sudo is not the default.

```sh
MATHOS_VERSION=1.0.0-rc.1 MATHOS_RELEASE_BASE_URL=https://github.com/bakiacikgoz/MathOS/releases/download/v1.0.0-rc.1 sh scripts/install/install.sh
mathos --version --json
```

Manual installation is supported by extracting the archive and copying `root/bin/mathos` to a directory on `PATH`. Uninstall preserves workspaces, configuration, secrets, and plugin data unless `--purge` is explicitly supplied. Signing and notarization status is reported honestly per release.

Lean projects use the repository-pinned `leanprover/lean4:v4.33.1` toolchain and Mathlib `v4.33.1`. Install the official elan manager from `https://lean-lang.org/install/`, then run `mathos formal setup` inside a workspace. MathOS does not replace the pin with `stable` or `latest`.

Sandboxed model-generated computation on Windows and macOS requires Docker and the `python:3.12-alpine` image. Run `docker pull python:3.12-alpine`, then confirm `Experiment sandbox` is `PASS` in `mathos doctor --json`. If Docker or the image is unavailable, execution remains blocked and never falls back to the host.
