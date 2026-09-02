# Atlas guide

Atlas is a read-only, sequence-bound projection of claims, dependencies, context, sources, blockers, impact, and critical paths. Use snapshot, open, export, impact, and critical-path views. Keyboard navigation and textual graph alternatives preserve access without color.

The loopback server requires a session token, validates origins, redacts credentials, bounds responses, and exposes no mutation endpoint. Atlas labels historical and current verification separately; visualization is not proof and never assigns `KERNEL_VERIFIED`. Missing projection history fails closed and requires refresh.

See [security model](SECURITY_MODEL_V1.md).
