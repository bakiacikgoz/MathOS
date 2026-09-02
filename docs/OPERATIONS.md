# Operations

Use `mathos doctor --json` and `mathos workspace inspect --json` before release-sensitive work. Backups, restore, repair, migration, index rebuild, and capsule import are exclusive operations.

```sh
mathos backup --out ./backups
mathos diagnostics export --out ./support
mathos plugin doctor
mathos update check --manifest ./release-update.json --json
```

Restore never overwrites a destination. Updates verify checksum, smoke the candidate, atomically swap, post-smoke, and roll back on failure. Logs are local, bounded, redacted, and no telemetry endpoint exists.
