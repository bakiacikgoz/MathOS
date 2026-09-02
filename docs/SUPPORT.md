# MathOS platform support

| Platform | Core CLI/TUI | Lean | Models | Literature | Sandboxed computation | Release support |
|---|---:|---:|---:|---:|---:|---|
| Windows x64 | Yes | capability-gated | Yes | Yes | Blocked (no reviewed backend) | Core supported |
| macOS arm64/x64 | Yes | capability-gated | Yes | Yes | `sandbox-exec`, smoke required | Supported after qualification |
| Linux x64 | Yes | capability-gated | Yes | Yes | bubblewrap only, runtime probe required | Supported after qualification |

MathOS never falls back to host execution when a required sandbox is unavailable. A detected binary is not enough: release qualification must prove the relevant smoke test. Firejail is intentionally not accepted as a production backend in 1.0 RC.
