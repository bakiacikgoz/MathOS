# CLI errors and exit codes

Exit codes are stable: `0` success, `1` operation failure, `2` usage/configuration, `3` capability blocked, `4` trust/verification rejection, and `5` workspace/protocol conflict. JSON mode emits `mathos.cli-error.v1` to stderr.

Common codes include `WorkspaceNotFound`, `CONFIG_INVALID`, `LEAN_NOT_INSTALLED`, `FORMAL_PROOF_FAILED`, `HUMAN_APPROVAL_REQUIRED`, `WORKSPACE_CONFLICT`, `BridgeProtocolMismatch`, `CapsuleFormatUnsupported`, and `PLUGIN_DISABLED`. Stack traces appear only with `MATHOS_DEBUG=1`.
