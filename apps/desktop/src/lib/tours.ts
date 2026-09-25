import type { Lang } from "./i18n.ts"

// Guided tours, one per section. Steps point at `data-tour` anchors; a step whose anchor is not on
// screen (an empty list, a collapsed panel) is skipped instead of floating over nothing.
export type TourId = "welcome" | "app" | "overview" | "claims" | "branches" | "health" | "providers" | "console" | "settings"
type Text = Record<Lang, string>
export interface TourStep { anchor: string; title: Text; body: Text; side?: "top" | "bottom" | "left" | "right" }

const s = (anchor: string, side: TourStep["side"], trTitle: string, trBody: string, enTitle: string, enBody: string): TourStep =>
  ({ anchor, side, title: { tr: trTitle, en: enTitle }, body: { tr: trBody, en: enBody } })

export const TOURS: Record<TourId, TourStep[]> = {
  welcome: [
    s("welcome-open", "bottom", "Var olan çalışma alanı", "Daha önce oluşturduğunuz bir MathOS klasörünü seçin.", "Existing workspace", "Pick a MathOS folder you created before."),
    s("welcome-new", "bottom", "Yeni çalışma alanı", "Boş bir araştırma projesi başlatın; önermeler, kanıtlar ve kaynaklar burada toplanır.", "New workspace", "Start an empty research project; claims, proofs and sources live here."),
    s("welcome-demo", "bottom", "Örnek proje", "Hazır verilerle gezinmek için güvenli bir örnek. İstediğiniz zaman silebilirsiniz.", "Sample project", "A safe sample with data to explore. Delete it whenever you like."),
    s("help", "left", "Rehber her zaman burada", "Bu tur bitince de her bölümdeki ? düğmesiyle o bölümün rehberini yeniden açabilirsiniz.", "Help is always here", "After this tour, the ? button on every section replays that section's guide."),
  ],
  app: [
    s("ws", "right", "Çalışma alanınız", "Buradan son çalışma alanları arasında geçiş yapabilirsiniz.", "Your workspace", "Switch between recent workspaces from here."),
    s("search", "right", "Her şeye tek yerden ulaşın", "Ctrl/⌘+K ile sayfalar, komutlar ve önermeler arasında arama yapın.", "Reach everything", "Press Ctrl/⌘+K to search pages, commands and claims."),
    s("nav-research", "right", "Araştırma", "Genel bakış, önermeler ve araştırma dalları. Sayılar doğrudan çalışma alanından gelir.", "Research", "Overview, claims and research branches. Counts come straight from the workspace."),
    s("nav-system", "right", "Sistem", "Sağlık denetimi, model sağlayıcıları ve konsol. Bir nokta, dikkatinizi bekleyen bir şey olduğunu gösterir.", "System", "Health checks, model providers and the console. A dot means something needs you."),
    s("nav-providers", "right", "Önce bir model bağlayın", "Araştırma asistanı için bir sağlayıcı seçin. Modeller yalnızca öneride bulunur; kanıt otoritesi Lean'dir.", "Connect a model first", "Pick a provider for the research assistant. Models only propose; Lean is the proof authority."),
    s("sidebar-foot", "right", "Görünüm ve ayarlar", "Temayı değiştirin, kenar çubuğunu Ctrl/⌘+B ile daraltın, ayarlara gidin.", "Appearance and settings", "Change the theme, collapse the sidebar with Ctrl/⌘+B, open settings."),
  ],
  overview: [
    s("objective", "bottom", "Ana hedef", "Çalışmanın odaklandığı önerme. Durumu, yalnızca Lean doğrulaması sonrası \"doğrulandı\" olur.", "Main objective", "The claim your work focuses on. It only becomes \"verified\" after Lean accepts a proof."),
    s("stats", "top", "Durum özeti", "Önerme sayıları ve doğrulanma oranı; tahmin değil, çalışma alanındaki kayıtlar.", "At a glance", "Claim counts and verification ratio; records, not estimates."),
    s("integrity", "top", "Bütünlük", "Veritabanı ve olay günlüğünün sağlıklı olduğunu gösterir.", "Integrity", "Shows the database and event log are healthy."),
    s("overview-actions", "top", "Hızlı eylemler", "Yeni önerme oluşturun, listeye gidin ya da sistemi denetleyin.", "Quick actions", "Create a claim, open the list, or run a system check."),
  ],
  claims: [
    s("claims-new", "bottom", "Yeni önerme", "Varsayım, lemma ya da teoremi LaTeX desteğiyle yazın.", "New claim", "Write a conjecture, lemma or theorem with LaTeX support."),
    s("claims-filter", "bottom", "Filtreler", "Açık, doğrulanmış ya da engelli önermelere odaklanın.", "Filters", "Focus on open, verified or blocked claims."),
    s("claims-list", "right", "Önerme listesi", "Ok tuşlarıyla gezinin; hedef simgesi ana hedefi gösterir.", "Claim list", "Move with the arrow keys; the target icon marks the main objective."),
    s("claims-why", "left", "Neden henüz doğrulanmadı?", "Doğrulamaya giden yolda eksik kalan adımlar: biçimselleştirme, sadakat incelemesi ve kanıt.", "Why not verified yet?", "The steps still missing on the way to verification: formalization, fidelity review and proof."),
  ],
  branches: [
    s("branches-list", "bottom", "Araştırma dalları", "Farklı yaklaşımları ana dalı bozmadan ayrı dallarda deneyin.", "Research branches", "Try different approaches on separate branches without touching the main one."),
    s("branches-new", "top", "Dal oluşturun", "Kısa bir ad verin; dal hemen etkin olur.", "Create a branch", "Give it a short name; it becomes active right away."),
  ],
  health: [
    s("health-hero", "bottom", "Genel durum", "Başarısız ya da uyarı veren denetim varsa bu başlık açıkça söyler.", "Overall state", "If any check fails or warns, this headline says so plainly."),
    s("health-list", "top", "Denetimler", "Her satır bir denetim. Uyarılar çalışmayı durdurmaz ama göz atmaya değer.", "Checks", "One check per row. Warnings don't stop you but are worth a look."),
  ],
  providers: [
    s("providers-hero", "bottom", "Üç adımda bağlanın", "Sağlayıcı seçin, anahtarınızı yapıştırın, bağlantıyı deneyin.", "Connect in three steps", "Choose a provider, paste your key, try the connection."),
    s("providers-mine", "bottom", "Profilleriniz", "Anahtar isteyen profillerde tek tıkla anahtar ekleyin; varsayılanı buradan seçin.", "Your profiles", "Add a missing key in one click; choose the default here."),
    s("providers-featured", "top", "Önerilenler", "Hızlı başlangıç için seçilmiş sağlayıcılar. OpenCode Go aylık abonelikle birçok açık modeli sunar.", "Recommended", "A starting set. OpenCode Go offers many open models for a monthly subscription."),
    s("providers-search", "top", "Tüm sağlayıcılar", "60'tan fazla sağlayıcı; listede olmayan her uyumlu servis \"Genel\" sekmesinden eklenir.", "Every provider", "60+ providers; any compatible service not listed can be added from \"Generic\"."),
  ],
  console: [
    s("console-examples", "bottom", "Örnek komutlar", "Tıklayın ve çalıştırın; mathos yazmanıza gerek yok.", "Example commands", "Click to run; no need to type mathos."),
    s("console-input", "top", "Komut satırı", "Masaüstünde karşılığı olmayan her komut burada çalışır.", "Command line", "Every command without a desktop view runs here."),
  ],
  settings: [
    s("settings-appearance", "bottom", "Görünüm", "Açık, koyu ya da sistem teması.", "Appearance", "Light, dark or follow the system."),
    s("settings-language", "top", "Dil", "Türkçe ve İngilizce arasında anında geçiş.", "Language", "Switch between Turkish and English instantly."),
    s("settings-tours", "top", "Rehberler", "Rehberleri buradan kapatabilir ya da baştan izleyebilirsiniz.", "Guides", "Turn guides off or watch them again from here."),
  ],
}

export interface TourPrefs { seen: TourId[]; auto: boolean }
export const DEFAULT_TOUR_PREFS: TourPrefs = { seen: [], auto: true }
const IDS = new Set(Object.keys(TOURS))
/** Stored prefs are untrusted; keep only known tour ids. */
export function normalizeTourPrefs(value: unknown): TourPrefs {
  if (!value || typeof value !== "object") return DEFAULT_TOUR_PREFS
  const row = value as Partial<TourPrefs>
  return { seen: Array.isArray(row.seen) ? [...new Set(row.seen.filter((id): id is TourId => typeof id === "string" && IDS.has(id)))] : [], auto: row.auto !== false }
}
export const shouldAutoStart = (prefs: TourPrefs, id: TourId) => prefs.auto && !prefs.seen.includes(id)
export const markSeen = (prefs: TourPrefs, id: TourId): TourPrefs => prefs.seen.includes(id) ? prefs : { ...prefs, seen: [...prefs.seen, id] }
