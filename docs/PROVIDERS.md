# Model providers

MathOS stores provider and model metadata in named profiles. Credentials stay in the operating system secret store or in an official upstream client. Start with:

```sh
mathos provider catalog
mathos provider list --json
mathos provider status --json
```

## Quickstarts

| Access path | Configure command | Billing and credential owner |
|---|---|---|
| ChatGPT/Codex | `mathos provider configure openai-codex-chatgpt --profile codex-personal` then `mathos provider login codex-personal` | Subscription; Codex owns login |
| Claude Code | `mathos provider configure claude-code-account --profile claude-main` then login | Subscription; Claude Code owns login; terms review gate applies |
| GitHub Copilot | `mathos provider configure github-copilot-account --profile copilot-main` | Subscription; official SDK/client owns login |
| OpenRouter | `mathos provider configure openrouter --profile openrouter-main --model auto` | PAYG; MathOS secret store |
| Kimi Code | `mathos provider configure kimi-code-membership --profile kimi-main --model k3-256k` | Subscription plan, distinct from Kimi Platform PAYG |
| MiniMax | `mathos provider configure minimax-token-plan-global --profile minimax-main --model MiniMax-M2.7` | Token subscription plan, distinct from MiniMax PAYG |
| Alibaba | `mathos provider configure alibaba-model-studio-payg --profile alibaba-payg --model auto` | PAYG is available; Token/Coding Plans remain terms restricted |
| Z.AI | `mathos provider configure zai-payg --profile zai-payg --model GLM-5.1` | PAYG is available; Coding Plan is blocked pending vendor approval |
| DeepSeek | `mathos provider configure deepseek-api --profile deepseek-main --model deepseek-v4-pro` | PAYG; MathOS secret store |
| Ollama | `mathos provider configure ollama --profile ollama-local --model auto` | Local, loopback only |
| LM Studio | `mathos provider configure lm-studio --profile lmstudio-local --model auto` | Local, loopback only |
| llama.cpp | `mathos provider configure llama-cpp --profile llama-local --model auto` | Local, loopback only |

Qwen Code ACP uses the official client. Qwen Portal OAuth was retired on 2026-04-15 and cannot be re-enabled.

For API profiles, store the referenced value through masked input:

```sh
mathos secrets set model.openrouter-main
mathos provider status openrouter-main
mathos provider models openrouter-main --refresh --json
mathos provider quota openrouter-main --json
```

On macOS, MathOS uses Keychain service `com.mathos.model-provider`. On Windows 11, it uses Windows Credential Manager generic credentials. Linux uses Secret Service when available and otherwise offers read-only environment lookup. Plaintext secret files are not supported.

## Role routing and fallback

```toml
[model]
default_profile = "codex-personal"

[model.roles]
planner = "codex-personal"
prover = "kimi-main"
checker = "copilot-main"

[model.fallback.planner]
profiles = ["codex-personal", "ollama-local"]
allow_billing_transition = false
allow_local_to_remote_transition = false
```

Fallback within the same billing class is permitted. Subscription-to-PAYG and local-to-remote fallback are blocked by default. Use `mathos provider fallback set` only after reviewing cost and privacy implications.

`mathos provider test <profile>` checks configuration without making a completion. A billable live request requires both `--live` and `--accept-usage`. Contract PASS and live account verification are separate; missing credentials remain `NOT_CONFIGURED`.
