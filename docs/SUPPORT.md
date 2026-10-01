# MathOS platform support

| Platform | Core CLI/TUI | Lean | Models | Literature | Sandboxed computation | Release support |
|---|---:|---:|---:|---:|---:|---|
| Windows 11 x64 | Built, runtime evidence pending | capability-gated | capability-gated | capability-gated | Docker container, runtime probe required | Not yet qualified |
| macOS arm64 | Verified locally | verified with pinned 4.33.1 | capability-gated | verified locally | Docker container, runtime probe required | Not yet fully qualified |
| macOS x64 | Built, runtime evidence pending | capability-gated | capability-gated | capability-gated | Docker container, runtime probe required | Not yet qualified |
| Linux x64 | Yes | capability-gated | Yes | Yes | bubblewrap only, runtime probe required | Supported after qualification |

MathOS never falls back to host execution when a required sandbox is unavailable.
On Windows and macOS, model-generated computation requires a running Docker daemon
and the Python 3.12 Alpine image pinned by the multi-platform digest in
`packages/computation/src/platform/container-sandbox.ts`. The setup screen pulls
that exact image when Docker is available; `mathos doctor` reports the capability
as blocked until both are present. Docker is optional for workspace and Lean
workflows. A detected binary is not enough: release qualification must prove the
relevant smoke test. Firejail and macOS `sandbox-exec` are not accepted as production
backends in 1.0 RC.

Public 1.0 acceptance targets Windows 11 x64 and macOS arm64. Other compilation
targets are not a promise of qualified public support. CI builds and downloaded
Actions artifacts do not replace installer, provider, Lean, Docker, Extension Host
and human meaning acceptance on the final source revision.
