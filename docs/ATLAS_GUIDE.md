# Atlas guide

Atlas is a read-only, sequence-bound projection of claims, dependencies, context, sources, blockers, impact, and critical paths. Use snapshot, open, export, impact, and critical-path views. Keyboard navigation and textual graph alternatives preserve access without color.

`mathos atlas` opens the browser with the session link. With `--no-open`, the terminal shows only the address; the full link, including the token, is written to a private file (mode 0600) whose path is printed, and the file is deleted when Atlas stops. The token never appears in terminal output, so logs and screen recordings cannot leak it.

The loopback server requires a session token, validates origins, redacts credentials, bounds responses, and exposes no mutation endpoint. Atlas labels historical and current verification separately; visualization is not proof and never assigns `KERNEL_VERIFIED`. Missing projection history fails closed and requires refresh.

See [security model](SECURITY_MODEL_V1.md).
