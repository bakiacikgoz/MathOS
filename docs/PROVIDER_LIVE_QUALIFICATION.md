# Provider Live Qualification

Provider contract checks are offline and never prove that an account, subscription, or API credential works. Run `bun run providers:contract` for implementation coverage.

Live qualification accepts a saved profile name only:

```text
bun run providers:live-smoke <profile> --live
```

For PAYG profiles, add `--accept-usage`. Secret values are never accepted as command arguments. Missing credentials produce `NOT_CONFIGURED`; prohibited or retired descriptors produce `POLICY_BLOCKED_EXPECTED`. Neither result is a live pass.

The JSON report uses the same fields on Windows 11 x64 and macOS arm64: platform, MathOS revision, provider descriptor, profile, client version, transport, auth owner, model, connection, model list, quota, live request, usage, and terms policy. Reports must be reviewed on the platform that produced them.
