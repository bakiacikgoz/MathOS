# MathOS Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing MathOS research platform at `541e39ef6454ffd7b3934348ccb457f067b28f31` into a source-checkout-independent, installable, upgradeable, capability-honest `1.0.0-rc.1` release candidate with 22/22 software-completion gates passing.

**Architecture:** Preserve all existing research and trust subsystems. Add product lifecycle contracts around them: canonical identity and compatibility in `shared`, configuration/setup orchestration in existing model/core/workspace boundaries, platform isolation in `computation`, operational runtimes in models/literature/plugins, and deterministic distribution/update/qualification scripts. No surface may bypass VerificationGate, human fidelity, secret isolation, or fail-closed capability detection.

**Tech Stack:** Bun 1.4, TypeScript 5.9, SQLite, Solid/OpenTUI, Lean/Lake external toolchain, Bun standalone compilation, VS Code VSIX tooling.

**Spec:** User-provided attachment `MATHOS_FINAL_YAZILIMSAL_TAMAMLAMA_VE_PRODUCTION_READINESS_PLANI.md`

## Global Constraints

- Start from exact SHA `541e39ef6454ffd7b3934348ccb457f067b28f31` on `codex/mathos-1.0-product-completion`.
- Reuse existing research, VerificationGate, retrieval, Lean, literature, notebook, Atlas, VS Code, plugin, capsule, and publication implementations.
- `KERNEL_VERIFIED` remains writable only through VerificationGate → VerificationService → guarded storage.
- Model, literature, computation, retrieval, plugin, importer, capsule, bridge, and human commentary never create proof authority.
- Model-generated code never runs on the host; unavailable isolation is BLOCKED.
- Secrets never enter workspace state, events, reports, logs, capsules, backups, publications, or bridge payloads.
- Migrations are additive, backup-aware, and fail closed; no destructive rollback.
- Retrieval candidates marked `INCONCLUSIVE` remain outside production ranking.
- Generated binaries, `.codegraph`, local qualification output, credentials, and runtime state are not committed.
- Every task follows red → green → focused verification → typecheck → logical commit.

---

### Task 0: Baseline Freeze and Product Inventory

**Files:**
- Create: `scripts/product-completion/capture-baseline.ts`
- Create: `docs/architecture/PRODUCT_COMPLETION_INVENTORY.md`
- Create: `tests/product-completion-baseline.test.ts`

**Interfaces:**
- Produces: `captureProductBaseline(): Promise<ProductBaseline>` with source SHA, versions, checks, capabilities, and package builds.

- [ ] Write a failing test that requires exact source provenance, all existing format versions, and generated output only under `artifacts/product-completion/`.
- [ ] Run `bun test tests/product-completion-baseline.test.ts` and confirm the missing runner failure.
- [ ] Implement the baseline collector without weakening or wrapping failed checks as PASS.
- [ ] Inventory each existing subsystem and its production gap in the four required columns.
- [ ] Run baseline typecheck, full tests, build, release-check, and V1 qualification; commit `chore(product): freeze final completion baseline`.

### Task 1: Canonical Version, Compatibility, and Build Identity

**Files:**
- Create: `packages/shared/src/compatibility.ts`
- Modify: `packages/shared/src/version.ts`, `packages/shared/src/index.ts`, root/app package manifests, `apps/tui/src/cli.ts`
- Create: `docs/COMPATIBILITY.md`, `tests/version-contract.test.ts`, `tests/compatibility-contract.test.ts`

**Interfaces:**
- Produces: `MathOSBuildIdentity`, `currentBuildIdentity()`, and fail-closed workspace/bridge/plugin/capsule/publication compatibility checks.

- [ ] Write failing tests for package mismatch, newer schema/protocol/API/format, and JSON build identity.
- [ ] Run both focused tests and confirm failure.
- [ ] Implement independent explicit compatibility constants and canonical dev version identity.
- [ ] Add `--version --json` and `about --json` without mixing human text into JSON.
- [ ] Run focused tests and typecheck; commit `chore(version): establish v1 compatibility contract`.

### Task 2: Standalone Distribution and Release Manifest

**Files:**
- Create: `packages/shared/src/runtime-layout.ts`, `packages/shared/src/release-manifest.ts`
- Create: `scripts/distribution/{build-release,verify-release,release-manifest,package-atlas,package-vscode,smoke-release}.ts`
- Create: `tests/{distribution-layout,release-manifest,no-source-tree-runtime-dependency}.test.ts`
- Modify: `package.json`, runtime resource lookups

**Interfaces:**
- Produces: target-aware runtime layout, canonical manifest with SHA-256, SBOM/license inventory, and `release:build`/`release:verify`.

- [ ] Write failing layout/manifest/source-independence tests.
- [ ] Implement runtime path resolution and manifest canonicalization.
- [ ] Build host standalone executable plus Atlas assets and verify outside the checkout under a clean HOME.
- [ ] Verify checksum, `--version`, `doctor`, `setup status`, and `init` using only artifact contents.
- [ ] Run focused tests/build/typecheck; commit `feat(distribution): build standalone release artifacts`.

### Task 3: Layered Configuration and Secure SecretStore

**Files:**
- Create under existing `packages/shared` and `packages/models`: `config-schema.ts`, `config-load.ts`, `secret-store.ts`, platform backends
- Modify CLI routing and shared redaction
- Create: `tests/{config-layering,config-validation,secret-store,secret-redaction-e2e}.test.ts`

**Interfaces:**
- Produces: typed precedence loader and `SecretStore` with macOS Keychain, Linux Secret Service, and environment-only fallback.

- [ ] Write failing precedence, malformed-security-field, metadata-only listing, and canary-redaction tests.
- [ ] Implement schema validation, platform-native paths, atomic non-secret writes, and no plaintext fallback.
- [ ] Add `config` and `secrets` CLI families; never accept secret values in argv/JSON output.
- [ ] Exercise logs/errors/diagnostics/backup/capsule/publication/bridge/provider redaction.
- [ ] Run focused tests/typecheck; commit `feat(config): add layered config and secret references`.

### Task 4: Resumable Setup and Capability Bootstrap

**Files:**
- Create: `packages/domain/src/setup.ts`, `packages/core/src/services/setup-service.ts`
- Modify: doctor, CLI/headless contracts, Lean setup composition
- Create: `tests/{setup-state,setup-resume,setup-doctor,lean-setup-contract}.test.ts`

**Interfaces:**
- Produces: idempotent setup state machine and capability evidence states `DETECTED|CONFIGURED|AVAILABLE|VERIFIED|BLOCKED|OPTIONAL_MISSING`.

- [ ] Write failing resume, consent, smoke-required verification, and JSON tests.
- [ ] Implement setup status/subcommands and explicit download consent.
- [ ] Reuse NativeLeanAdapter for pinned workspace bootstrap; never mutate global toolchains without `--install`.
- [ ] Verify clean artifact `install → setup → init → doctor` flow.
- [ ] Run focused tests/typecheck; commit `feat(setup): add resumable capability onboarding`.

### Task 5: Linux Bubblewrap Isolation and Support Matrix

**Files:**
- Create: `packages/computation/src/platform/{linux-bwrap,linux-policy}.ts`, `scripts/security/linux-sandbox-smoke.ts`
- Modify: Linux sandbox selection and capability reporting
- Create: `tests/linux-sandbox-contract.test.ts`, `docs/SUPPORT.md`

**Interfaces:**
- Produces: argv-only bwrap launch plan with private namespaces, sanitized env, private HOME/tmp, bounded resources, and no host fallback.

- [ ] Write failing contract tests for missing bwrap/namespaces/network proof, paths, symlinks, limits, and env secrets.
- [ ] Implement probe and launch policy; all critical uncertainty returns BLOCKED.
- [ ] Run contract tests on every platform and live smoke only where supported.
- [ ] Record FULL only for live-evidenced platforms.
- [ ] Run computation/security regressions and typecheck; commit `feat(sandbox): implement linux bubblewrap isolation`.

### Task 6: Production Model Profiles and Routing

**Files:**
- Create in `packages/models/src`: `profile.ts`, `registry.ts`, `router.ts`, `retry.ts`, `usage.ts`, `health.ts`, `privacy.ts`
- Modify: `openai.ts`, core model composition, CLI
- Create: `tests/model-{profile,routing,retry,cancellation,privacy,secret-redaction}.test.ts`

**Interfaces:**
- Produces: named OpenAI-compatible profiles, explicit role routing, bounded retry, AbortSignal propagation, local usage metadata, and remote/local privacy policy.

- [ ] Write failing tests for route precedence, no silent fallback, retry classes/Retry-After, cancellation, response bounds, and remote-policy block.
- [ ] Implement profiles and registry using SecretRef only.
- [ ] Integrate role routing and usage metadata without invented cost.
- [ ] Add provider/usage CLI commands and capability-honest health output.
- [ ] Run model/core tests and typecheck; commit `feat(models): productionize provider profiles`.

### Task 7: Literature Provider Runtime

**Files:**
- Create in `packages/literature/src`: `registry.ts`, `runtime.ts`, `cache.ts`, `dedupe.ts`, `rate-limit.ts`, `health.ts`, `offline.ts`
- Modify CLI/core composition
- Create: `tests/literature-{registry,dedupe,cache,offline,partial-failure}.test.ts`

**Interfaces:**
- Produces: bounded multi-provider search with canonical merged provenance, local TTL cache, offline zero-network mode, and partial health.

- [ ] Write failing tests for test-only fake provider, DOI/arXiv/fingerprint dedupe, TTL, 429, partial failure, and zero offline requests.
- [ ] Implement aggregate runtime over existing adapters.
- [ ] Add safe download limits and provider doctor output.
- [ ] Confirm literature never promotes proof status.
- [ ] Run literature suite/typecheck; commit `feat(literature): add provider runtime and offline cache`.

### Task 8: Workspace Lifecycle and Concurrent Clients

**Files:**
- Modify: storage client/migrations, workspace layout, lifecycle CLI, event/cache fingerprinting
- Create: `tests/{workspace-migration-rc,workspace-lock,stale-write,workspace-backup-rc,workspace-repair}.test.ts`

**Interfaces:**
- Produces: pre-migration backup, exclusive operation locks, optimistic expectedRevision errors, safe repair, and secret-free backups.

- [ ] Write failing old-schema, crash, two-client, stale-write, restore-equivalence, and repair-boundary tests.
- [ ] Implement additive migrations and transactional backup/migration checks.
- [ ] Add lifecycle CLI and deterministic event/cache repair only.
- [ ] Verify no secret values enter backup and no heuristic mathematical mutation occurs.
- [ ] Run workspace/storage/event tests and typecheck; commit `feat(workspace): harden migration and concurrent clients`.

### Task 9: Versioned Bounded Local Bridge

**Files:**
- Modify: bridge domain/service/stdio, VS Code protocol/client, shared errors
- Create: `tests/{bridge-version,bridge-cancellation,bridge-workspace-boundary}.test.ts`

**Interfaces:**
- Produces: versioned request/response envelope, hello handshake, allowlisted methods, progress notifications, cancellation, limits, and shared structured errors.

- [ ] Write failing version, oversized/inflight, cancellation, traversal, and forbidden-method tests.
- [ ] Implement protocol bounds and workspace canonicalization.
- [ ] Propagate cancellation to model/Lean/research operations.
- [ ] Update clients and verify mismatch fails before mutation.
- [ ] Run bridge/security tests/typecheck; commit `feat(bridge): version local integration protocol`.

### Task 10: CLI/TUI and Headless Contract Freeze

**Files:**
- Modify CLI/headless/slash/UI trust and progress components
- Create: `tests/{cli-contract,headless-json-contract,tui-final-smoke}.test.tsx`
- Create/update: command and error-code documentation

**Interfaces:**
- Produces: stable command catalog, versioned JSON outputs, exit codes 0–5, cancellable progress/checkpoints, and common trust language.

- [ ] Write failing machine-output, exit-code, cancellation, narrow-terminal, and debug-privacy tests.
- [ ] Implement stable schemas and errors without breaking existing aliases.
- [ ] Derive explainability from existing graph/trust state.
- [ ] Verify terminal restoration on cancel/error and no raw model payload by default.
- [ ] Run CLI/TUI tests/build/typecheck; commit `feat(tui): freeze professional product contracts`.

### Task 11: Atlas Production Hardening

**Files:**
- Modify Atlas server/projection/app and distribution assets
- Create: `tests/{atlas-snapshot,atlas-large-graph}.test.ts` plus focused app tests

**Interfaces:**
- Produces: versioned read-only snapshot, loopback token server with CSP, artifact-relative assets, inspector/filter/critical-path behavior, and bounded 10k preparation.

- [ ] Write failing CSP/loopback/token/no-mutation/version/10k tests.
- [ ] Implement `mathos atlas [--no-open]`, lifecycle cleanup, and artifact-relative serving.
- [ ] Add professional filters/inspector without new mutation APIs or remote assets.
- [ ] Measure and bound 1k/10k snapshot/render preparation.
- [ ] Run Atlas tests/build/standalone launch; commit `feat(atlas): harden professional theorem atlas`.

### Task 12: VS Code VSIX Productionization

**Files:**
- Modify extension manifest/client/controller/commands
- Create: `.vscodeignore`, packaging/verification scripts
- Create: `tests/{vscode-package-manifest,vscode-bridge-contract,vscode-workspace-trust}.test.ts`

**Interfaces:**
- Produces: valid VSIX, strict Workspace Trust policy, executable discovery/handshake/restart/deactivate lifecycle, and cancellation propagation.

- [ ] Write failing manifest/package/trust/protocol/no-secret tests.
- [ ] Complete manifest and exact version compatibility.
- [ ] Build/package VSIX and inspect contents; no tests, secrets, dev garbage, or remote WebView assets.
- [ ] Verify untrusted workspaces allow metadata only and block execution/mutation.
- [ ] Run extension tests/build/package/typecheck; commit `feat(vscode): package production vscode extension`.

### Task 13: Persistent Safe Plugin Lifecycle

**Files:**
- Modify plugin registry/manifest/process host and CLI
- Create lifecycle persistence/install/update helpers in existing plugin package
- Create: `tests/plugin-{persistence,install-security,update-rollback,process-isolation,api-compatibility}.test.ts`

**Interfaces:**
- Produces: atomic platform-data registry and managed installs with checksum, staging, conformance, compatibility, quarantine, and rollback.

- [ ] Write failing restart, traversal/symlink, update-failure, API mismatch, integrity, and authority tests.
- [ ] Implement local directory/archive install into managed root with atomic activation.
- [ ] Implement enable/disable/update/remove/doctor and persistent quarantine.
- [ ] Verify child env/IO/time/cancellation bounds and absence of verification capability.
- [ ] Run plugin/conformance/typecheck; commit `feat(plugins): persist safe plugin lifecycle`.

### Task 14: Capsule and Publication Format Freeze

**Files:**
- Modify capsule domain/services/contracts and publication canonical model/renderers
- Create: `tests/{capsule-format-v1,capsule-import-dry-run,capsule-secret-scan,publication-determinism,publication-epistemic-status,publication-citation-audit}.test.ts`

**Interfaces:**
- Produces: product-independent format version 1, canonical hashes, mutation-free dry-run/conflict plan, trust-preserving deterministic renderers, and citation audit.

- [ ] Write failing newer-format, tamper, conflict, canary, determinism, status, and citation tests.
- [ ] Implement frozen manifest and canonical serialization with explicit hash scope.
- [ ] Add inspect/import dry-run and new-workspace/branch-only safe apply.
- [ ] Unify publication outputs on canonical model and optional PDF capability block.
- [ ] Run roundtrip/publication tests/typecheck; commit `feat(repro): finalize capsule and publication formats`.

### Task 15: Installer, Updater, Rollback, and Uninstall

**Files:**
- Create: `scripts/install/{install,uninstall}.sh`, distribution Homebrew/sign/notarize hooks
- Add update lifecycle files under existing shared/core boundary
- Create: `tests/{updater-manifest,updater-checksum,updater-rollback,uninstall-preserves-workspaces}.test.ts`

**Interfaces:**
- Produces: explicit channel-aware update check/apply/rollback and user-scoped checksum-verified atomic installer/uninstaller.

- [ ] Write failing checksum, smoke failure rollback, incompatible manifest, and workspace-preservation tests.
- [ ] Implement staged download/verify/smoke/swap/post-smoke with automatic binary rollback.
- [ ] Implement install/uninstall and optional purge semantics; default preserves workspaces/config/plugin data.
- [ ] Generate and verify Homebrew formula; signing/notarization remain capability-honest hooks.
- [ ] Run clean-HOME install/update/rollback/uninstall smoke; commit `feat(update): add atomic installer and updater`.

### Task 16: Diagnostics, Privacy, and Scale

**Files:**
- Add bounded local logger/diagnostics service in existing shared/core boundary
- Create: `scripts/product-scale-benchmark.ts`, `benchmarks/product-scale/`
- Create: `tests/{diagnostics-redaction,doctor-contract-v1,log-redaction}.test.ts`

**Interfaces:**
- Produces: rotating redacted local logs, self-checking support bundle, no remote telemetry, finalized doctor categories, and frozen scale baselines.

- [ ] Write failing secret/content exclusion, rotation, no-network telemetry, doctor, and bundle self-check tests.
- [ ] Implement metadata-only default diagnostics and terminal-safe crash summary.
- [ ] Benchmark cold start, open, 10k claims, 100k events, graph/Atlas, TUI list, retrieval, DB size/memory.
- [ ] Add only evidence-backed indexes/pagination/bounds for pathological regressions.
- [ ] Run diagnostics tests/benchmark/typecheck; commit `feat(diagnostics): harden privacy and scale`.

### Task 17: User-First Documentation and Example Workspace

**Files:**
- Rewrite `README.md`
- Create/update installation, quickstart, provider, trust, operations, feature, and error-code docs
- Create: `examples/professional-demo/`, `scripts/docs-smoke.ts`, `tests/docs-product-completion.test.ts`

**Interfaces:**
- Produces: source-independent install/setup/10-minute workflow and machine-checked command/path/version/support documentation.

- [ ] Write failing docs smoke for links, commands, canonical versions, canaries, and support claims.
- [ ] Rewrite README user-first and consolidate existing docs rather than duplicate them.
- [ ] Add serious deterministic demo without pre-populated fake verification.
- [ ] Run every nonmutating documented command and clean-workspace quickstart smoke.
- [ ] Run docs test/typecheck; commit `docs: close MathOS 1.0 product onboarding`.

### Task 18: Software Completion Qualification V2 and RC Freeze

**Files:**
- Create: `scripts/run-software-completion-v2.ts`, `benchmarks/software-completion-v2-baseline.json`, `docs/SOFTWARE_COMPLETION_V2.md`
- Modify: release-check, package scripts, canonical/app versions
- Create: `tests/software-completion-v2.test.ts`

**Interfaces:**
- Produces: exact G01–G22 report with `PASS|FAIL|SKIPPED_UNSUPPORTED_PLATFORM|PENDING_EXTERNAL_VALIDATION`, blocker register, source revision, artifact hashes, and `ready` semantics.

- [ ] Write failing tests for missing/skipped required gates, fake evidence, stale revision, artifact mismatch, and nonzero blockers.
- [ ] Implement all 22 gates using real command/artifact evidence; no hardcoded PASS.
- [ ] Run integrated fresh-HOME installed-artifact workflow through setup, workspace, evidence, Atlas/VS Code contract, capsule/publication, backup/update/rollback/restore.
- [ ] Freeze canonical and app versions to `1.0.0-rc.1`; rebuild every artifact.
- [ ] Run frozen install, typecheck, full tests, builds, release-check, completion V2, release build/verify, clean clone, performance, and `git diff --check`.
- [ ] Commit `chore(release): qualify MathOS 1.0.0-rc.1`; do not claim PASS unless G01–G22 are 22/22, release is READY, artifacts verify, and software blockers are zero.
