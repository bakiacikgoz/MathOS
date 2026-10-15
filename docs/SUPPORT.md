# MathOS platform support

| Platform | 1.0.0 download | Sandboxed computation | Status |
|---|---|---|---|
| Windows 11 x64 | Desktop installer and the `mathos` command | Docker container, runtime probe required | Qualified on real hardware |
| Linux x64 | The `mathos` command | bubblewrap, runtime probe required | Supported |
| macOS arm64 | None yet: build from source | Docker container, runtime probe required | Download follows in 1.0.1 after real-Mac qualification |
| macOS x64 | None: build from source | Docker container, runtime probe required | Not qualified |

MathOS never falls back to host execution when a required sandbox is unavailable.
On Windows and macOS, model-generated computation requires a running Docker daemon
and the Python 3.12 Alpine image pinned by the multi-platform digest in
`packages/computation/src/platform/container-sandbox.ts`. The setup screen pulls
that exact image when Docker is available; `mathos doctor` reports the capability
as blocked until both are present. Docker is optional for workspace and Lean
workflows. A detected binary is not enough: release qualification must prove the
relevant smoke test. Firejail and macOS `sandbox-exec` are not accepted as production
backends in 1.0.

MathOS 1.0.0 is qualified on Windows 11 x64; macOS arm64 will be qualified for 1.0.1.
Other compilation targets are not a promise of qualified public support. CI builds and downloaded
Actions artifacts do not replace installer, provider, Lean, Docker, Extension Host
and human meaning acceptance on the final source revision.
