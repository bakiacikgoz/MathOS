# Providers

Provider profiles store endpoint and model metadata only. Credentials are SecretStore references and are never accepted on command lines or written to workspace configuration.

```sh
mathos provider list
mathos provider add local --type openai-compatible --base-url http://127.0.0.1:11434/v1 --model local-model --local
mathos provider test local
mathos literature doctor --json
```

Remote models require explicit privacy policy. Literature supports Crossref, OpenAlex, and arXiv with provenance-preserving merge and offline cache mode. Provider failure cannot promote mathematical status.
