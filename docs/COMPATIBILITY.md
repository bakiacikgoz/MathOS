# MathOS compatibility contract

The product version is defined by `MATHOS_PRODUCT_VERSION` in the shared runtime and must match the root, TUI, Atlas, and VS Code package manifests. Build scripts fail on drift.

| Contract | Current | Compatibility rule |
| --- | ---: | --- |
| Product development version | `1.0.0-rc.1` | Frozen to `1.0.0-rc.1` only after G01–G22 pass |
| Workspace schema | 30 | Schemas 16–30 accepted; newer or older unsupported schemas fail before mutation |
| Bridge protocol | 1 | Exact match |
| Plugin API | 1 | Exact match; incompatible plugins disabled |
| Capsule format | 1 | Exact match; newer import refused before mutation |
| Publication format | 1 | Exact match |

`mathos --version --json` and `mathos about --json` report product version, full source revision (or `UNKNOWN` outside a repository when no embedded build revision exists), build ID, schema, bridge protocol, plugin API, capsule format, and publication format. Release builds embed `MATHOS_BUILD_REVISION` and `MATHOS_BUILD_ID`; source checkouts derive the revision from Git.

The default Lean pin is managed by the existing workspace-local Lean toolchain contract. Finding a newer Lean executable does not silently change a workspace pin.
