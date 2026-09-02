# Providers

Provider profiles store endpoint and model metadata only. Credentials are SecretStore references and are never accepted on command lines or written to workspace configuration.

```sh
mathos provider list
mathos provider add local --type openai-compatible --base-url http://127.0.0.1:11434/v1 --model local-model --local
mathos provider test local
mathos literature doctor --json
```

Remote models require explicit privacy policy. Literature supports Crossref, OpenAlex, and arXiv with provenance-preserving merge and offline cache mode. Provider failure cannot promote mathematical status.

For a remote OpenAI-compatible endpoint, create a profile with its base URL and model ID, then supply the referenced secret through the platform SecretStore or the environment variable printed by `mathos secrets doctor`. Never pass a key on the command line. `mathos provider test <profile>` performs the live smoke and reports `REQUIRES_USER_SECRET` while the credential is absent.
# Provider dependencies

The GitHub Copilot account integration uses the official `@github/copilot-sdk` package at an exact lockfile version. The SDK is under the MIT license and bundles the official Copilot CLI runtime. MathOS uses its logged-in-user credential path, `mode: "empty"`, and sessions with tools and MCP disabled. Standard Copilot use requires an eligible GitHub Copilot subscription and consumes premium-request quota according to GitHub's current terms.
