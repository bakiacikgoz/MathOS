# MathOS Plugin SDK V1

Plugins run out of process over newline-delimited JSON-RPC 2.0. They are disabled by default and receive only explicitly approved capabilities. Shells, wildcard/root permissions, environment values, status promotion, and VerificationGate access are forbidden. Manifest hash changes require fresh approval; three security/protocol/crash failures quarantine a plugin.

Run `bun scripts/run-plugin-conformance.ts plugin.json` before enabling. Outputs remain drafts or untrusted evidence.
