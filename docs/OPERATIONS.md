# Operations

Use `mathos doctor --json` and `mathos workspace inspect --json` before release-sensitive work. Backups, restore, repair, migration, index rebuild, and capsule import are exclusive operations.

```sh
mathos backup --out ./backups
mathos diagnostics export --out ./support
mathos plugin doctor
mathos update check --manifest ./release-update.json --json
```

Restore never overwrites a destination. Updates verify checksum, smoke the candidate, atomically swap, post-smoke, and roll back on failure. Logs are local, bounded, redacted, and no telemetry endpoint exists.

Before migration, MathOS checkpoints WAL and saves a database backup. If another
reader prevents a complete checkpoint, close the other workspace session and
retry; migration stops before making an incomplete backup. Databases from a newer
schema are inspected read-only and rejected without checkpointing their data.
Supported automatic upgrades start at schema 16; the current schema is 30.

Normal update checks offer only a newer compatible SemVer version. Stable channels
do not offer prereleases, and build metadata alone does not make an update newer.
An interrupted CLI update retains the canonical binary path and a separate old
copy; interruption during post-install smoke does not certify the new binary's
startup. Keep the release archive and hash when recovering from such an interruption.

CLI installations must retain `bin/mathos` (or `bin/mathos.exe`) and
`share/mathos` together. The POSIX, PowerShell and Homebrew installers copy the
Atlas/VS Code assets and license/source metadata. The external release
`SHA256SUMS` verifies archive bytes; the checksum file inside the extracted root
verifies manifest files. Download both from the same official release. A checksum
is an integrity check and does not authenticate a publisher by itself.

The first desktop launch installs the pinned shared Lean/Mathlib runtime with live
progress, then runs its Lean health check. Workspaces reuse that runtime. The
installer stays small; the initial Lean/Mathlib download needs internet and disk
space. The setup view exposes retry and background continuation when appropriate.
