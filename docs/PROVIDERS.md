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
| OpenCode Go | `mathos provider configure opencode-go --profile go-main --model kimi-k3` | $10/month subscription with per-model usage limits; MathOS secret store |
| OpenCode Zen | `mathos provider configure opencode-zen --profile zen-main --model claude-sonnet-5` | PAYG balance; MathOS secret store |
| Ollama | `mathos provider configure ollama --profile ollama-local --model auto` | Local, loopback only |
| LM Studio | `mathos provider configure lm-studio --profile lmstudio-local --model auto` | Local, loopback only |
| llama.cpp | `mathos provider configure llama-cpp --profile llama-local --model auto` | Local, loopback only |

## Multi-protocol gateways

OpenCode Zen and OpenCode Go serve every model with one API key, but not over one wire protocol: GPT, Grok and Muse models use OpenAI Responses, Claude and Qwen models use Anthropic Messages, and most others use Chat Completions (MiniMax uses Messages on Go but Chat Completions on Zen). MathOS picks the protocol from the model you configure, following the official endpoint tables. Models that are not in the table use Chat Completions. Pass `--protocol openai-chat|openai-responses|anthropic-messages` to override the choice. Gemini-native Zen models are refused with `PROVIDER_MODEL_PROTOCOL_UNSUPPORTED`.

OpenCode Go asks clients to identify themselves truthfully and to keep routing stable per conversation. MathOS sends `User-Agent: MathOS/<version>` and an `x-opencode-session` value derived from the research run (a one-way hash, so run ids are not disclosed). Calls made outside a research run share one session per provider instance.

## Any other compatible endpoint

Every OpenAI- or Anthropic-compatible service can be used through the generic descriptors, including gateways and self-hosted proxies:

```sh
mathos provider configure generic-openai-compatible --profile my-gateway \
  --base-url https://llm.example.com/v1 --model some-model \
  --protocol openai-responses \
  --header "X-Title: MathOS" --session-header x-session-id
mathos secrets set model.my-gateway
```

- `--protocol` defaults to the descriptor's own protocol (`openai-chat` or `anthropic-messages`).
- `--header "Name: value"` may be repeated up to 16 times. Header names that could carry a credential (`Authorization`, `*-Api-Key`, `*token*`, `Cookie`, ...) are refused; the API key always comes from the secret store. Transport headers such as `Host` and `User-Agent` are reserved.
- `--session-header` sends a stable per-research-run id, for gateways that route or cache by session.
- Custom headers are only accepted on the generic descriptors; curated providers keep their own verified identity headers.

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
