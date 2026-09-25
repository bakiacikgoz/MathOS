import type { Lang } from "./i18n.ts"

// The CLI speaks English; the desktop shows its fixed phrases in the UI language. Anything not
// listed here (paths, versions, user data, new messages) is shown exactly as the CLI printed it.
type Pair = [tr: string, en: string]
const pick = (pair: Pair | undefined, lang: Lang, fallback: string) => pair ? (lang === "tr" ? pair[0] : pair[1]) : fallback

const CHECK_NAMES: Record<string, Pair> = {
  "Platform support": ["Platform desteği", "Platform support"], Workspace: ["Çalışma alanı", "Workspace"], Database: ["Veritabanı", "Database"],
  "Event log": ["Olay günlüğü", "Event log"], "Model provider": ["Model sağlayıcısı", "Model provider"], "API key": ["API anahtarı", "API key"],
  Endpoint: ["Uç nokta", "Endpoint"], "Lean project": ["Lean projesi", "Lean project"], "Toolchain pinned": ["Sabitlenmiş araç zinciri", "Toolchain pinned"],
  "Lean compile": ["Lean derlemesi", "Lean compile"], "Declaration inspect": ["Tanım incelemesi", "Declaration inspect"], "Research graph": ["Araştırma grafiği", "Research graph"],
  "Python runtime": ["Python çalışma ortamı", "Python runtime"], "Python version": ["Python sürümü", "Python version"], "Experiment sandbox": ["Deney yalıtım ortamı", "Experiment sandbox"],
  "Literature providers": ["Literatür kaynakları", "Literature providers"], "Local source extraction": ["Yerel kaynak çıkarımı", "Local source extraction"],
  "Event Projection Health": ["Olay projeksiyonu sağlığı", "Event projection health"], "Schema version": ["Şema sürümü", "Schema version"], "MathOS version": ["MathOS sürümü", "MathOS version"],
}
const CHECK_DETAILS: Record<string, Pair> = {
  "layout complete": ["yapı eksiksiz", "layout complete"], "schema reachable": ["şemaya erişiliyor", "schema reachable"], appendable: ["yazılabilir", "appendable"],
  "mathos.db present": ["mathos.db mevcut", "mathos.db present"], "mathos.db is missing": ["mathos.db bulunamadı", "mathos.db is missing"],
  "database file missing": ["veritabanı dosyası yok", "database file missing"], "file exists but is not writable": ["dosya var ama yazılamıyor", "file exists but is not writable"],
  "git is not available on PATH": ["git PATH üzerinde bulunamadı", "git is not available on PATH"], "mathos.toml or .mathos is missing": ["mathos.toml ya da .mathos eksik", "mathos.toml or .mathos is missing"],
  reachable: ["erişilebilir", "reachable"], "unreachable / offline": ["erişilemiyor / çevrimdışı", "unreachable / offline"], "authentication failed": ["kimlik doğrulama başarısız", "authentication failed"],
  "not installed": ["kurulu değil", "not installed"], "not detected": ["bulunamadı", "not detected"], skipped: ["atlandı", "skipped"], consistent: ["tutarlı", "consistent"],
  missing: ["eksik", "missing"], none: ["yok", "none"], "no lean-toolchain / lakefile": ["lean-toolchain ya da lakefile yok", "no lean-toolchain / lakefile"],
  "lean-toolchain missing": ["lean-toolchain eksik", "lean-toolchain missing"], aggregate: ["birleşik", "aggregate"],
  OPTIONAL_MISSING: ["isteğe bağlı, kurulu değil", "optional, not installed"], EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE: ["yalıtım ortamı yok; deneyler güvenli biçimde engellendi", "no sandbox; experiments are safely blocked"],
  "JSONL matches canonical SQLite events": ["JSONL, SQLite'taki asıl olaylarla eşleşiyor", "JSONL matches canonical SQLite events"],
}
export const checkName = (name: string, lang: Lang) => pick(CHECK_NAMES[name], lang, name)
export function checkDetail(detail: string, lang: Lang): string {
  const exact = CHECK_DETAILS[detail]
  if (exact) return pick(exact, lang, detail)
  const unset = /^(MATHOS_[A-Z_]+) is not set$/.exec(detail)
  if (unset) return lang === "tr" ? `${unset[1]} tanımlı değil` : detail
  if (lang === "tr" && detail.includes("UNTESTED")) return detail.replace("UNTESTED", "test edilmedi").replace("no implemented backend", "uygulanmış arka uç yok").replace("network isolation=unavailable", "ağ yalıtımı=yok")
  return detail
}

// Values and notes printed by `mathos claim show`.
const CLAIM_NOTES: Record<string, Pair> = {
  "KERNEL_VERIFIED requires VerificationGate. Computation and literature are not proofs.": ["\"Lean ile doğrulandı\" durumu için VerificationGate gerekir. Hesaplama ve literatür kanıt değildir.", "KERNEL_VERIFIED requires VerificationGate. Computation and literature are not proofs."],
}
export function claimValue(value: string, lang: Lang): string {
  const text = value.trim(), key = text.toLowerCase()
  if (key === "none") return lang === "tr" ? "Yok" : "None"
  if (key === "not created") return lang === "tr" ? "Oluşturulmadı" : "Not created"
  const fidelity: Record<string, Pair> = { HUMAN_APPROVED: ["İnsan onayladı", "Approved by a person"], AI_REVIEWED: ["Model inceledi, onay bekliyor", "Reviewed by a model, awaiting approval"], NOT_REVIEWED: ["İncelenmedi", "Not reviewed"], REVIEW_REQUIRED: ["İnceleme gerekli", "Review required"], REJECTED: ["Reddedildi", "Rejected"] }
  if (fidelity[text]) return pick(fidelity[text], lang, text)
  if (lang === "en") return value
  const counted = /^(\d+) (computational|literature|citations?|experiments?)$/i.exec(text)
  if (counted) return `${counted[1]} ${{ computational: "hesaplamalı", literature: "literatür", citation: "alıntı", citations: "alıntı", experiment: "deney", experiments: "deney" }[counted[2]!.toLowerCase()]}`
  return text.replace(/^(LOCAL|INHERITED|MERGED)\b/, (word) => ({ LOCAL: "Yerel", INHERITED: "Devralınan", MERGED: "Birleştirilen" }[word] ?? word))
}
export const claimNote = (note: string, lang: Lang) => pick(CLAIM_NOTES[note.trim()], lang, note)

// Branches.
const BRANCH_STATUS: Record<string, Pair> = { ACTIVE: ["etkin", "active"], PAUSED: ["duraklatıldı", "paused"], MERGED: ["birleştirildi", "merged"], ABANDONED: ["bırakıldı", "abandoned"], ARCHIVED: ["arşivlendi", "archived"] }
export const branchStatus = (status: string, lang: Lang) => pick(BRANCH_STATUS[status.toUpperCase()], lang, status.toLowerCase())
/** The default branch purpose written by `mathos init`. */
export const branchPurpose = (purpose: string, lang: Lang) => purpose === "Primary research line" && lang === "tr" ? "Ana araştırma hattı" : purpose

// Providers: generic descriptor names and the reasons a provider is restricted.
const PROVIDER_NAMES: Record<string, Pair> = {
  "generic-openai-compatible": ["Özel OpenAI uyumlu uç nokta", "Custom OpenAI-compatible endpoint"],
  "generic-anthropic-compatible": ["Özel Anthropic uyumlu uç nokta", "Custom Anthropic-compatible endpoint"],
  "gemini-cli-enterprise": ["Gemini CLI Enterprise", "Gemini CLI Enterprise"],
}
export const providerName = (descriptor: { id: string; displayName: string }, lang: Lang) => pick(PROVIDER_NAMES[descriptor.id], lang, descriptor.displayName)
export const providerVendor = (vendor: string, lang: Lang) => vendor === "Generic" ? (lang === "tr" ? "Kendi uç noktanız" : "Your endpoint") : vendor
const POLICY_REASON: Record<string, Pair> = {
  PROVIDER_TERMS_RESTRICTED: ["Sağlayıcının koşulları bu kullanıma henüz izin vermiyor.", "The provider's terms do not allow this use yet."],
  PROVIDER_RETIRED: ["Bu erişim yolu kullanımdan kaldırıldı.", "This access path has been retired."],
}
const REMEDIATION: Record<string, Pair> = {
  "zai-payg": ["Bunun yerine Z.AI PAYG kullanın.", "Use Z.AI PAYG instead."],
  "Use Alibaba plan/PAYG or OpenRouter.": ["Bunun yerine Alibaba Model Studio PAYG ya da OpenRouter kullanın.", "Use Alibaba Model Studio PAYG or OpenRouter instead."],
  "Use Gemini API, Vertex AI, or an officially permitted Enterprise Agent Platform API.": ["Bunun yerine Gemini API ya da Vertex AI kullanın.", "Use the Gemini API or Vertex AI instead."],
}
export function policyReason(policy: { code: string; remediation: string | null }, lang: Lang): string {
  const reason = pick(POLICY_REASON[policy.code], lang, policy.code)
  return policy.remediation ? `${reason} ${pick(REMEDIATION[policy.remediation], lang, policy.remediation)}` : reason
}

// Error codes the desktop can explain; the code itself stays visible for support.
const ERRORS: Record<string, Pair> = {
  DESKTOP_BRIDGE_UNAVAILABLE: ["MathOS motoruna ulaşılamadı. Ayarlar > MathOS motoru bölümünden yeniden başlatmayı deneyin.", "Could not reach the MathOS engine. Try restarting it in Settings > MathOS engine."],
  DESKTOP_HOST_EXITED: ["MathOS motoru beklenmedik biçimde durdu; bir sonraki işlemde yeniden başlatılacak.", "The MathOS engine stopped unexpectedly; it restarts on the next action."],
  DESKTOP_HOST_TIMEOUT: ["MathOS motoru zamanında yanıt vermedi.", "The MathOS engine did not answer in time."],
  DESKTOP_COMMAND_NEEDS_TERMINAL: ["Bu komut bir terminal gerektiriyor.", "This command needs a terminal."],
  DESKTOP_CWD_NOT_FOUND: ["Çalışma alanı klasörü bulunamadı; taşınmış ya da silinmiş olabilir.", "The workspace folder was not found; it may have moved or been deleted."],
  MODEL_PROFILE_NOT_FOUND: ["Bu model profili bulunamadı.", "This model profile was not found."],
  MODEL_PROFILE_ID_INVALID: ["Profil adı geçersiz.", "The profile name is invalid."],
  MODEL_PROFILE_SECRET_FORBIDDEN: ["Anahtar ya da token içerebilecek başlıklara izin verilmez; anahtar güvenli depoya girilir.", "Headers that could carry a key or token are not allowed; keys go to the secure store."],
  MODEL_PROFILE_HEADER_INVALID: ["Başlık biçimi geçersiz. \"Ad: değer\" biçiminde, satır başına bir tane yazın.", "Invalid header. Write one \"Name: value\" per line."],
  MODEL_PROFILE_URL_UNSAFE: ["Uzak uç noktalar https ile başlamalı.", "Remote endpoints must use https."],
  PROVIDER_PROTOCOL_OVERRIDE_FORBIDDEN: ["Bu sağlayıcı için protokol değiştirilemez.", "This provider's protocol cannot be changed."],
  PROVIDER_TERMS_RESTRICTED: ["Sağlayıcının koşulları bu kullanıma izin vermiyor.", "The provider's terms do not allow this use."],
  PROVIDER_MODEL_PROTOCOL_UNSUPPORTED: ["Bu model MathOS'un desteklemediği bir protokol kullanıyor.", "This model uses a protocol MathOS does not support."],
  SECRET_VALUE_INVALID: ["Anahtar boş olamaz ve tek satır olmalı.", "The key cannot be empty and must be a single line."],
  MODEL_ROUTE_UNAVAILABLE: ["Bu adım için bir model yapılandırılmamış. Model Sağlayıcıları'ndan bir varsayılan seçin.", "No model is configured for this step. Choose a default in Model Providers."],
  MODEL_ROUTE_BLOCKED: ["Model kullanılamıyor: bulut modelleri kapalı ya da profil engelli. Ayarlar > Gizlilik'e bakın.", "The model cannot be used: cloud models are off or the profile is blocked. See Settings > Privacy."],
  LEANNOTINSTALLED: ["Lean bu bilgisayarda kurulu değil. Sistem Durumu sayfasından tek tıkla kurabilirsiniz.", "Lean is not installed on this computer. Install it with one click from the Health page."],
  PROOFPREREQUISITEFAILED: ["İspat için önce anlamın aynı olduğunu onaylayın.", "Approve that the meanings match before proving."],
  UNRESOLVED_ALIGNMENT_ERROR: ["Model ciddi bir anlam farkı buldu; onaydan önce Lean ifadesini düzeltin.", "The model found a serious difference in meaning; fix the Lean statement before approving."],
  FORMALSTATEMENTNOTFOUND: ["Bu önermenin henüz bir Lean ifadesi yok.", "This claim has no Lean statement yet."],
  PROOFBODYREJECTED: ["Buraya yalnızca ifadeyi yazın; ispat (:= …) sonraki adımda aranır.", "Write only the statement here; the proof (:= …) comes in the next step."],
  STATEMENT_REVISIONS_REQUIRED: ["Karşılaştırma için önce Lean ifadesi gerekiyor.", "A Lean statement is needed before comparing."],
  PROVIDER_LOGIN_NOT_SUPPORTED: ["Bu sağlayıcı uygulama içinden giriş desteklemiyor.", "This provider does not support signing in from the app."],
  LIVE_USAGE_ACCEPTANCE_REQUIRED: ["Ücretli deneme isteği için onay gerekiyor.", "Consent is required for a paid test request."],
}
/** A readable message for a CLI or bridge error, falling back to the original text. */
export function errorText(error: unknown, lang: Lang): string {
  const typed = error as { code?: string; message?: string }
  const code = typed?.code ?? /^([A-Z][A-Z0-9_]{3,})(?::|$)/.exec(typed?.message ?? "")?.[1]
  const known = code ? ERRORS[code] : undefined
  return known ? pick(known, lang, "") : typed?.message ?? String(error)
}
