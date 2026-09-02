# Provider terms and supported access matrix

Reviewed on **2026-09-02**. A stale review produces a warning after 90 days and never opens a prohibited path.

| Provider path | MathOS state | Credential owner | Billing class | Official source |
|---|---|---|---|---|
| OpenAI API | Permitted | MathOS secure store | PAYG | https://platform.openai.com/docs |
| ChatGPT/Codex account | Permitted through `codex app-server`; no token access | Official client | Subscription | https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md |
| Anthropic API | Permitted | MathOS secure store | PAYG | https://docs.anthropic.com |
| Claude Code account | Terms review required for third-party programmatic use | Official client | Subscription | https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan |
| GitHub Copilot | Permitted through official SDK | Official SDK/client | Subscription | https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate |
| Gemini API | Permitted | MathOS secure store | PAYG | https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx |
| Vertex AI | Permitted | Application default credentials | PAYG/enterprise | https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx |
| Gemini CLI ACP | Permitted through documented ACP mode | Official client | Client account | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/acp-mode.md |
| Antigravity consumer | Prohibited for third-party integration | Official product only | Subscription | https://antigravity.google/terms |
| Kimi Code membership | Terms review required | MathOS secure store | Subscription plan | https://www.kimi.com/code/docs/en/ |
| MiniMax Token Plan | Terms review required | MathOS secure store | Subscription plan | https://platform.minimax.io/docs/token-plan/other-tools |
| Alibaba Token/Coding Plan | Terms review required; custom application/automation use is blocked until explicitly permitted | MathOS secure store | Subscription plan | https://www.alibabacloud.com/help/en/model-studio/token-plan-overview |
| Alibaba Model Studio | Permitted API path | MathOS secure store | PAYG | https://www.alibabacloud.com/help/en/model-studio/ |
| Qwen Code ACP | Permitted through documented ACP mode | Official client | Client account | https://qwenlm.github.io/qwen-code-docs/en/developers/architecture/ |
| Qwen Portal OAuth legacy | Retired | None | Retired | https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/ |
| Z.AI PAYG | Permitted | MathOS secure store | PAYG | https://docs.z.ai/guides/develop/http/introduction |
| Z.AI Coding Plan | Terms review required; blocked by default | MathOS secure store | Subscription plan | https://docs.z.ai/devpack/faq |
| DeepSeek API | Permitted | MathOS secure store | PAYG | https://api-docs.deepseek.com/ |
| OpenRouter | Permitted | MathOS secure store | PAYG | https://openrouter.ai/docs/api/api-reference/models/get-models |
| Ollama | Permitted on loopback | None | Local | https://docs.ollama.com/api/chat |
| LM Studio | Permitted on loopback | None or local token | Local | https://lmstudio.ai/docs/developer/openai-compat |

`PROHIBITED_THIRD_PARTY`, `RETIRED`, `REQUIRES_VENDOR_APPROVAL`, and `TERMS_REVIEW_REQUIRED` are product policy states. User configuration cannot convert them into live authorized support. A catalog/contract implementation may be complete while live use remains blocked.
