# Installation

Release assets include platform archives, a VSIX, `SHA256SUMS`, a release manifest, SBOM, and license inventory. Verify the archive checksum before extraction. The installer uses `~/.local/bin/mathos`; sudo is not the default.

```sh
MATHOS_VERSION=1.0.0-rc.1 MATHOS_RELEASE_BASE_URL=https://github.com/bakiacikgoz/MathOS/releases/download/v1.0.0-rc.1 sh scripts/install/install.sh
mathos --version --json
```

Manual installation is supported by extracting the archive and copying `root/bin/mathos` to a directory on `PATH`. Uninstall preserves workspaces, configuration, secrets, and plugin data unless `--purge` is explicitly supplied. Signing and notarization status is reported honestly per release.
