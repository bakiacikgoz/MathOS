# Provider security

Provider profiles contain descriptor IDs, model IDs, endpoint metadata, roles, and SecretRefs. They never contain secret values, cookies, device codes, account e-mail addresses, or upstream tokens.

- macOS secrets use Keychain service `com.mathos.model-provider`.
- Windows secrets use Windows Credential Manager and enter the native API through stdin, never argv.
- External clients receive an allowlisted environment in a scratch directory with workspace roots, MCP, shell, browser, edit, and write tools disabled.
- Remote custom endpoints require HTTPS, reject URL credentials, private/loopback addresses, unsafe redirects, and oversized frames. Local engines are restricted to loopback unless a separate LAN policy is explicitly enabled.
- Recursive redaction covers authorization headers, cookies, device codes, credential-shaped keys, known secret values, circular values, and prototype-pollution keys.
- Provider and model code has no authority to write `KERNEL_VERIFIED` or `HUMAN_APPROVED`. VerificationGate and human fidelity review remain separate authorities.
- Billing fallback and local-to-remote fallback require explicit policy. No quota event silently starts PAYG usage.

Run `bun scripts/providers/security-scan.ts` for the static provider boundary gate. Run `bun run providers:contract` for offline implementation coverage. A live qualification requires a saved profile, explicit `--live`, and `--accept-usage` for PAYG. Logs and reports remain redacted.
