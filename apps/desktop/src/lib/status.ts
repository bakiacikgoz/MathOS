import type { Lang } from "./i18n.ts"

export type PillVariant = "solid" | "soft" | "outline" | "dashed" | "strike" | "muted"
interface StatusMeta { tr: string; en: string; variant: PillVariant; hint: { tr: string; en: string } }

// Keys are lower-case claim statuses from the MathOS domain model. Only the
// VerificationGate assigns the verified statuses; the desktop only displays them.
const STATUS: Record<string, StatusMeta> = {
  idea: { tr: "Fikir", en: "Idea", variant: "dashed", hint: { tr: "Henüz biçimsel bir önerme değil.", en: "Not yet a precise statement." } },
  conjecture: { tr: "Varsayım", en: "Conjecture", variant: "outline", hint: { tr: "Kesin ifade edilmiş, kanıtlanmamış.", en: "Precisely stated, not proven." } },
  heuristic_support: { tr: "Sezgisel destek", en: "Heuristic support", variant: "outline", hint: { tr: "Sezgisel gerekçeler var; kanıt değil.", en: "Heuristic reasons exist; not a proof." } },
  computationally_supported: { tr: "Hesaplamayla destekli", en: "Computationally supported", variant: "soft", hint: { tr: "Deneyler destekliyor; hesaplama kanıt değildir.", en: "Experiments support it; computation is not proof." } },
  informal_argument: { tr: "Gayriresmî argüman", en: "Informal argument", variant: "soft", hint: { tr: "Kâğıt üstü bir argüman var.", en: "A paper argument exists." } },
  human_reviewed_argument: { tr: "İnsan incelemesinden geçti", en: "Human-reviewed argument", variant: "soft", hint: { tr: "Bir insan argümanı inceledi.", en: "A person reviewed the argument." } },
  formalized_unverified: { tr: "Biçimselleşti, doğrulanmadı", en: "Formalized, unverified", variant: "soft", hint: { tr: "Lean ifadesi var, kanıt henüz geçmedi.", en: "Lean statement exists; no accepted proof yet." } },
  kernel_verified: { tr: "Lean ile doğrulandı", en: "Kernel verified", variant: "solid", hint: { tr: "Lean çekirdeği ve VerificationGate kabul etti.", en: "Accepted by the Lean kernel and VerificationGate." } },
  independently_checked: { tr: "Bağımsız doğrulandı", en: "Independently checked", variant: "solid", hint: { tr: "Doğrulandı ve bağımsız olarak yeniden kontrol edildi.", en: "Verified and re-checked independently." } },
  external_known: { tr: "Literatürde bilinen", en: "Known in literature", variant: "soft", hint: { tr: "Dış kaynağa dayanıyor; burada kanıtlanmadı.", en: "Relies on an external source; not proven here." } },
  disproved: { tr: "Çürütüldü", en: "Disproved", variant: "strike", hint: { tr: "Karşı örnek veya çürütme var.", en: "A counterexample or refutation exists." } },
  blocked: { tr: "Engellendi", en: "Blocked", variant: "dashed", hint: { tr: "İlerlemek için bir engel çözülmeli.", en: "A blocker must be resolved first." } },
  stale: { tr: "Güncelliğini yitirdi", en: "Stale", variant: "muted", hint: { tr: "Bağımlılıklar değişti; yeniden doğrulanmalı.", en: "Dependencies changed; re-verify." } },
}

export function statusMeta(status: string | null | undefined, lang: Lang) {
  const meta = status ? STATUS[status.toLowerCase()] : undefined
  if (!meta) return { label: status ?? "—", variant: "muted" as PillVariant, hint: "" }
  return { label: meta[lang], variant: meta.variant, hint: meta.hint[lang] }
}

export const isVerifiedStatus = (status: string | null | undefined) => STATUS[status?.toLowerCase() ?? ""]?.variant === "solid"

export const CLAIM_KINDS = ["conjecture", "lemma", "theorem", "corollary", "definition"] as const
export type ClaimKind = (typeof CLAIM_KINDS)[number]
const KIND: Record<ClaimKind, { tr: string; en: string }> = {
  conjecture: { tr: "Varsayım", en: "Conjecture" },
  lemma: { tr: "Lemma", en: "Lemma" },
  theorem: { tr: "Teorem", en: "Theorem" },
  corollary: { tr: "Sonuç", en: "Corollary" },
  definition: { tr: "Tanım", en: "Definition" },
}
export const kindLabel = (kind: string, lang: Lang) => KIND[kind as ClaimKind]?.[lang] ?? kind
