// Provider logos are the monochrome brand marks from @lobehub/icons-static-svg (MIT). They use
// currentColor, so they follow the black-and-white theme. Marks identify the provider only.
import ai21 from "@lobehub/icons-static-svg/icons/ai21.svg?raw"
import alibabacloud from "@lobehub/icons-static-svg/icons/alibabacloud.svg?raw"
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?raw"
import antigravity from "@lobehub/icons-static-svg/icons/antigravity.svg?raw"
import baseten from "@lobehub/icons-static-svg/icons/baseten.svg?raw"
import cerebras from "@lobehub/icons-static-svg/icons/cerebras.svg?raw"
import chutes from "@lobehub/icons-static-svg/icons/chutes.svg?raw"
import claude from "@lobehub/icons-static-svg/icons/claude.svg?raw"
import codex from "@lobehub/icons-static-svg/icons/codex.svg?raw"
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg?raw"
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg?raw"
import gemini from "@lobehub/icons-static-svg/icons/gemini.svg?raw"
import githubcopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg?raw"
import groq from "@lobehub/icons-static-svg/icons/groq.svg?raw"
import huggingface from "@lobehub/icons-static-svg/icons/huggingface.svg?raw"
import inception from "@lobehub/icons-static-svg/icons/inception.svg?raw"
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg?raw"
import lmstudio from "@lobehub/icons-static-svg/icons/lmstudio.svg?raw"
import meta from "@lobehub/icons-static-svg/icons/meta.svg?raw"
import minimax from "@lobehub/icons-static-svg/icons/minimax.svg?raw"
import mistral from "@lobehub/icons-static-svg/icons/mistral.svg?raw"
import moonshot from "@lobehub/icons-static-svg/icons/moonshot.svg?raw"
import nebius from "@lobehub/icons-static-svg/icons/nebius.svg?raw"
import novita from "@lobehub/icons-static-svg/icons/novita.svg?raw"
import nvidia from "@lobehub/icons-static-svg/icons/nvidia.svg?raw"
import ollama from "@lobehub/icons-static-svg/icons/ollama.svg?raw"
import openai from "@lobehub/icons-static-svg/icons/openai.svg?raw"
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?raw"
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?raw"
import poe from "@lobehub/icons-static-svg/icons/poe.svg?raw"
import qwen from "@lobehub/icons-static-svg/icons/qwen.svg?raw"
import siliconcloud from "@lobehub/icons-static-svg/icons/siliconcloud.svg?raw"
import stepfun from "@lobehub/icons-static-svg/icons/stepfun.svg?raw"
import together from "@lobehub/icons-static-svg/icons/together.svg?raw"
import vertexai from "@lobehub/icons-static-svg/icons/vertexai.svg?raw"
import volcengine from "@lobehub/icons-static-svg/icons/volcengine.svg?raw"
import wandb from "@lobehub/icons-static-svg/icons/wandb.svg?raw"
import xai from "@lobehub/icons-static-svg/icons/xai.svg?raw"
import xiaomimimo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg?raw"
import zai from "@lobehub/icons-static-svg/icons/zai.svg?raw"
import zhipu from "@lobehub/icons-static-svg/icons/zhipu.svg?raw"

const LOGOS: Record<string, string> = {
  "openai-api": openai,
  "openai-codex-chatgpt": codex,
  "openrouter": openrouter,
  "anthropic-api": anthropic,
  "claude-code-account": claude,
  "github-copilot-account": githubcopilot,
  "gemini-api": gemini,
  "google-vertex": vertexai,
  "gemini-cli-enterprise": gemini,
  "google-antigravity-consumer": antigravity,
  "google-antigravity-enterprise-api": antigravity,
  "kimi-code-membership": kimi,
  "kimi-platform-payg": kimi,
  "minimax-token-plan-global": minimax,
  "minimax-token-plan-cn": minimax,
  "minimax-payg": minimax,
  "alibaba-token-plan-personal": alibabacloud,
  "alibaba-token-plan-team": alibabacloud,
  "alibaba-coding-plan": alibabacloud,
  "alibaba-model-studio-payg": alibabacloud,
  "qwen-code-acp": qwen,
  "qwen-portal-oauth-legacy": qwen,
  "zai-payg": zai,
  "zai-coding-plan": zai,
  "deepseek-api": deepseek,
  "ollama": ollama,
  "ollama-cloud": ollama,
  "lm-studio": lmstudio,
  "xai-api": xai,
  "groq-api": groq,
  "mistral-api": mistral,
  "cerebras-api": cerebras,
  "together-api": together,
  "fireworks-api": fireworks,
  "siliconflow-api": siliconcloud,
  "siliconflow-cn-api": siliconcloud,
  "moonshot-payg": moonshot,
  "moonshot-cn-payg": moonshot,
  "huggingface-inference": huggingface,
  "opencode-go": opencode,
  "opencode-zen": opencode,
  "nvidia-nim": nvidia,
  "novita-ai": novita,
  "chutes-api": chutes,
  "nebius-api": nebius,
  "baseten-api": baseten,
  "meta-llama-api": meta,
  "stepfun-api": stepfun,
  "xiaomi-mimo-api": xiaomimimo,
  "poe-api": poe,
  "wandb-inference": wandb,
  "inception-api": inception,
  "ai21-api": ai21,
  "zhipuai-api": zhipu,
  "volcengine-ark": volcengine,
}
export const providerLogo = (descriptorId: string): string | null => LOGOS[descriptorId] ?? null

// Where to create an API key. Only pages we are sure of are listed; everything else links to the
// provider's official documentation from the catalog instead of guessing a console URL.
const KEY_PAGES: Record<string, string> = {
  "openai-api": "https://platform.openai.com/api-keys",
  "anthropic-api": "https://console.anthropic.com/settings/keys",
  "openrouter": "https://openrouter.ai/keys",
  "gemini-api": "https://aistudio.google.com/apikey",
  "deepseek-api": "https://platform.deepseek.com/api_keys",
  "mistral-api": "https://console.mistral.ai/api-keys",
  "groq-api": "https://console.groq.com/keys",
  "huggingface-inference": "https://huggingface.co/settings/tokens",
  "opencode-go": "https://opencode.ai/auth",
  "opencode-zen": "https://opencode.ai/auth",
}
export const keyPage = (descriptorId: string): string | null => KEY_PAGES[descriptorId] ?? null

/** A short, opinionated starting set shown above the full catalog. */
export const FEATURED = ["opencode-go", "openrouter", "anthropic-api", "openai-api", "gemini-api", "deepseek-api", "ollama"]

import type { Lang } from "./i18n.ts"
const POLICY_TEXT: Record<string, Record<Lang, string>> = {
  STANDARD_API: { tr: "Standart API erişimi. Anahtar sizin hesabınıza bağlıdır.", en: "Standard API access. The key belongs to your account." },
  OFFICIAL_CLIENT_BRIDGE: { tr: "Sağlayıcının resmî istemcisi üzerinden bağlanır; kimlik bilgisini istemci saklar.", en: "Connects through the provider's official client, which keeps the credential." },
  SCOPED_PLAN: { tr: "Abonelik planı; sağlayıcının kullanım koşulları geçerlidir.", en: "Subscription plan; the provider's usage terms apply." },
}
const SUMMARY_TR: Record<string, string> = {
  "opencode-go": "Kodlama ajanı tarzı kullanım için aylık abonelik. İstemci kendi User-Agent bilgisini ve her konuşma için sabit bir x-opencode-session başlığı göndermeli; MathOS bunu otomatik yapar. Kötüye kullanım izlenir.",
  "opencode-zen": "Seçilmiş modeller için kullandıkça öde ağ geçidi. Bazı modeller OpenAI Responses ya da Anthropic Messages üzerinden sunulur; MathOS doğru olanı seçer. Gemini'ye özgü modeller desteklenmez.",
}
/** The catalog's terms summary is English; show a localized sentence instead of a raw policy code. */
export function termsText(descriptor: { id: string; terms: { policy: string; summary: string } }, lang: Lang): string {
  if (descriptor.id.startsWith("generic-")) return lang === "tr" ? "Kendi bağladığınız uç nokta. O servisin kullanım koşulları ve ücretlendirmesi geçerlidir." : "An endpoint you connect yourself. That service's terms and billing apply."
  const custom = descriptor.terms.summary !== descriptor.terms.policy && descriptor.terms.summary !== "Standard provider API"
  if (custom) return lang === "tr" ? SUMMARY_TR[descriptor.id] ?? POLICY_TEXT[descriptor.terms.policy]?.tr ?? descriptor.terms.summary : descriptor.terms.summary
  return POLICY_TEXT[descriptor.terms.policy]?.[lang] ?? descriptor.terms.summary
}
