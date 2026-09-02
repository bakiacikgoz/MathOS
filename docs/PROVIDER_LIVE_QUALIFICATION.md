# Provider Live Qualification

Provider contract checks are offline and never prove that an account, subscription, or API credential works. Run `bun run providers:contract` for implementation coverage.

Live qualification accepts a saved profile name only:

```text
bun run providers:live-smoke <profile> --live
```

For PAYG profiles, add `--accept-usage`. Secret values are never accepted as command arguments. Missing credentials produce `NOT_CONFIGURED`; prohibited or retired descriptors produce `POLICY_BLOCKED_EXPECTED`. Neither result is a live pass.

The JSON report uses the same fields on Windows 11 x64 and macOS arm64: platform, MathOS revision, provider descriptor, profile, client version, transport, auth owner, model, connection, model list, quota, live request, usage, and terms policy. Reports must be reviewed on the platform that produced them.

## Current release-candidate evidence

| Target | Result | Evidence |
| --- | --- | --- |
| macOS Apple Silicon arm64 | PARTIAL | Native Keychain write/read/delete passed; Codex 0.151.0 was detected and reported a ChatGPT login; standalone provider catalog/configure/status commands passed. Ollama, LM Studio, and llama.cpp were correctly reported `UNAVAILABLE` because no local engine was running. |
| Windows 11 x64 | NOT_RUN | No Windows host was available for this qualification run. Contract coverage and Windows Credential Manager unit tests do not count as a real Windows smoke. |

No provider completion was submitted because no saved profile with an explicitly authorized live credential was supplied. This remains `NOT_CONFIGURED`, not a live pass.
