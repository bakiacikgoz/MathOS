# Devam kaydı — 5 Eylül 2026

Bu dosya kullanıcının gönderdiği özgün planın tam metnini, her numaralı bölümün altında ilerleme notuyla saklar. Notlar önceki çalışma kayıtlarını özetler; yeni bir qualification PASS beyanı değildir.

## Kaldığımız yer

- Son kod/tooling commit'i: `de4846895a1d017ef54023c0c74662028dc47f2a`.
- Bu devir commit'i yalnız dokümantasyon değiştirir. Önceki test/artifact sonuçları otomatik olarak yeni HEAD'e ait sayılmamalı.
- İlk açık platform adımları: **11, 12, 14, 16, 26** (gerçek macOS arm64).
- Ardından **4–7, 18–25, 30–33, 35–39, 43–44** için Mac/final HEAD kanıtlarını tamamla.
- Yeni branch/worktree yok; yalnız `main`. GitHub Actions başlatma.
- Önceki “Windows tamamen bitti / tek engel Mac” raporu nihai kabul yerine geçmez: aşağıdaki kısmi kanıt/audit notlarını da kapat.

## Mac'te başlangıç

```sh
git switch main
git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD
uname -s
uname -m
bun install --frozen-lockfile
bun scripts/qualification/platform-qualification.ts --target=macos-arm64
```

Beklenen host Darwin/arm64. Dirty tree varsa koru ve analiz et. Qualification aracı komut listesi/skeleton üretir; testlerin tümünü otomatik yürütmez. `--write-skeleton` mevcut evidence dosyasını overwrite eder; mevcut dosyayı korumadan çalıştırma.

## Git ile taşınmayan dosyalar

`artifacts/`, `dist/`, kullanıcı config'i ve araştırma workspace'i ignored/yereldir. Repo clone'u bunları getirmez.

- Windows canonical workspace: `C:\Users\duzey\Documents\MathOS-Lab\mathos-first-research`
- Capsule/export: workspace altında `.mathos/artifacts/c001-*`
- Yerel raporlar: repo altında `artifacts/qualification/`
- Paketler: repo altında `artifacts/releases/1.0.0-rc.1/`
- Mac handoff: `mathos-1.0.0-rc.1-macos-arm64-qualification-bundle.tar.gz`, SHA-256 `952fad8baef912d3be5742e6b6d64a479d274838157e418ee1e0318251c9bbdc`
- Bundle tam kaynak checkout'u veya araştırma DB'si içermez. İçindeki qualification script'i repo konumunu varsayar; checkout içindeki sürümü çalıştır.
- C-001 geçmişini sürdürmek için resmi backup/export yoluyla workspace taşınmalı. Credential/token dosyalarını taşımayın; Mac'te resmi login kullanın.
- C-001 kapsülü yalnız iki dosya içerdiği için tam DB/audit geçmişini geri yüklediğini varsayma.
- Handoff darwin artifact'ı commit öncesi üretilmiş olabilir: gerçek `RELEASE-MANIFEST.json` revision'ını kontrol et. Rapor etiketini değiştirerek kanıt yenileme; final HEAD üzerinde yeniden üret.

## Son kayıtlı sonuçlar

819 PASS / 12 SKIP / 0 FAIL; software completion 22/22; v1 13/13. Gerçek Windows Codex completion ve VS Code Extension Host test kayıtları mevcut. C-001 için FS-002 HUMAN_APPROVED, PA-004 KERNEL_ACCEPTED ve verification report `vr_6c382604786d4f189ed2b01b4d871d8e` kaydedilmiş. Claim/formal revision ve audit metadata'sını gerçek workspace'ten doğrula. Mac'te statement değişirse yeni açık insan onayı gerekir.

Release-check NOT_READY; tag ve GitHub Release oluşturulmadı. Kaynak güven kuralları aşağıdaki özgün planda korunmuştur.

---

# MATHOS 1.0 RC — LIVE MODEL, SANDBOX, CROSS-PLATFORM & FINAL RELEASE CLOSURE

## MISSION

Bu görev MathOS 1.0 RC için **son gerçek ürün qualification ve release closure görevidir**.

Yeni provider ekleme.  
Yeni büyük subsystem geliştirme.  
Yeni ürün özelliği icat etme.

Mevcut MathOS Model Provider Hub ve MathOS 1.0 ürününü gerçek kullanıcı ortamında çalıştır, kalan gerçek blocker'ları kapat, Windows + macOS üzerinde kanıt üret ve ancak bütün zorunlu release gate'leri gerçekten geçtiğinde `v1.0.0-rc.1` release candidate'ını yayımla.

Bu görevde en önemli kanıt şudur:

```text
Gerçek ChatGPT/Codex kullanıcı aboneliği
        ↓
MathOS Provider Hub
        ↓
gerçek model completion
        ↓
MathOS Research Planner
        ↓
C-001 araştırması
        ↓
Lean formalization
        ↓
HUMAN fidelity approval
        ↓
gerçek Lean proof
        ↓
VerificationGate
        ↓
KERNEL_VERIFIED
```

Bunun yanında:

```text
macOS arm64
+
Windows 11 x64
+
real sandbox
+
real TUI
+
real VS Code Extension Host
+
standalone artifacts
```

gerçek makinelerde doğrulanmalıdır.

---

# 0. CANONICAL REPOSITORY RULES — BINDING

> **5 Eylül 2026 ilerleme notu:** KONTROL EDİLDİ — yalnız main; de48468 remote ile eşit, working tree temiz. Mac'te tekrar kontrol et.

Canonical branch:

```text
main
```

Başlangıç referansı:

```text
EXPECTED BASE COMMIT:
71ec76c2e27553a816693d64bdc16750edcc1e3a

VERSION:
1.0.0-rc.1
```

## Kesin Git kuralları

Bu görev sırasında:

```text
DO NOT create another branch
DO NOT create a worktree
DO NOT create codex/*
DO NOT create feature/*
DO NOT create release/*
DO NOT create temporary Git branches
```

Yalnızca:

```text
main
```

üzerinde çalış.

Başlangıçta doğrula:

```bash
git status
git branch --show-current
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```

Beklenti:

```text
branch == main
working tree == clean
HEAD == origin/main
```

HEAD tam olarak `71ec76...` değilse repository'yi resetleme.

Bunun yerine:

```bash
git merge-base --is-ancestor 71ec76c2e27553a816693d64bdc16750edcc1e3a HEAD
```

ile başlangıç commit'inin mevcut `main` geçmişinde bulunduğunu doğrula.

Bulunmuyorsa görevi durdur ve:

```text
CANONICAL_HISTORY_MISMATCH
```

raporla.

Force push kesinlikle yasaktır.

Her tamamlanmış mantıksal dilim doğrudan `main` üzerinde atomik commit edilebilir ve:

```bash
git push origin main
```

ile gönderilebilir.

---

# 1. EXISTING STATE — DO NOT REIMPLEMENT

> **5 Eylül 2026 ilerleme notu:** MEVCUT — yeniden geliştirme. Son kayıtlı suite: 819 PASS / 12 SKIP / 0 FAIL (de48468).

Şu altyapı mevcut kabul edilmektedir:

```text
Model Provider Hub
Profile V2
39 provider descriptors
provider catalog
provider authentication abstractions
native/local secret-store support
HTTP transports
official-client transports
model discovery
quota/usage
routing
billing guards
provider policy gates
CLI integration
TUI integration
Atlas integration
VS Code integration
qualification tooling
```

Son bilinen doğrulama:

```text
Typecheck: PASS
Build: PASS
Tests: 777 PASS / 21 SKIP / 0 FAIL
Provider contract: PASS
Security scan: PASS
VSIX package/verify: PASS
macOS arm64 artifact: PASS
macOS Keychain real write/read/delete: PASS
Codex detection: PASS
```

Bunları sıfırdan yeniden yazma.

Sadece gerçek qualification sırasında ortaya çıkan gerçek defect'leri düzelt.

---

# 2. SCOPE FREEZE

> **5 Eylül 2026 ilerleme notu:** KISMİ — Windows çalışmaları kayıtlı; macOS ve final release açık.

Bu görevin zorunlu hedefleri şunlardır:

```text
A. Real ChatGPT/Codex subscription connection
B. Real model completion
C. Real role-based MathOS model execution
D. macOS production sandbox verification
E. Windows production sandbox verification
F. Real macOS TUI verification
G. Real Windows TUI verification
H. Real VS Code Extension Host verification
I. C-001 HUMAN fidelity approval
J. C-001 legitimate KERNEL_VERIFIED closure
K. Reproducibility and publication smoke
L. macOS standalone qualification
M. Windows standalone qualification
N. Final release-check READY
O. v1.0.0-rc.1 tag/release only if every mandatory gate passes
```

Provider Hub'a başka sağlayıcı eklemek kapsam dışıdır.

---

# 3. NON-NEGOTIABLE TRUST RULES

> **5 Eylül 2026 ilerleme notu:** SÜREKLİ KURAL — bütün sonraki adımlarda koru.

Aşağıdakiler kesinlikle değiştirilemez:

```text
MODEL OUTPUT != PROOF
COMPUTATION != PROOF
EXTERNAL SOURCE != PROOF
LEAN COMPILE != HUMAN FIDELITY APPROVAL
AVAILABLE != VERIFIED
INSTALLED != TESTED
PACKAGE BUILDS != EXTENSION HOST VERIFIED
CODE COMPILES ON MACOS != WINDOWS VERIFIED
MOCK RESPONSE != LIVE PROVIDER
```

Ayrıca:

```text
HUMAN_APPROVED
```

AI tarafından atanamaz.

Ve:

```text
KERNEL_VERIFIED
```

yalnızca mevcut gerçek VerificationGate tarafından atanabilir.

VerificationGate'i gevşetmek, bypass etmek veya test beklentilerini PASS'e çevirmek kesinlikle yasaktır.

---

# 4. REAL CHATGPT / CODEX SUBSCRIPTION — PRIMARY LIVE PROVIDER

> **5 Eylül 2026 ilerleme notu:** WINDOWS CANLI TEST KAYITLI — codex-subscription / official client 0.153.1; Mac'te resmi login durumunu yeniden doğrula.

İlk zorunlu gerçek provider olarak:

```text
ChatGPT / Codex subscription
```

kullan.

Normal OpenAI PAYG API key kullanarak bu kabul testini geçme.

Amaç gerçekten kullanıcının ChatGPT/Codex üyelik erişimini MathOS Provider Hub üzerinden kullanmaktır.

## 4.1 Official path only

Mevcut resmi Codex client/app-server entegrasyonunu kullan.

Şunları yapma:

```text
browser cookie scraping
ChatGPT web session scraping
manual OAuth token extraction
private token file copying
unofficial auth endpoint emulation
hardcoded OAuth tokens
```

Codex CLI/app-server'ın yönettiği resmi login session kullanılmalıdır.

## 4.2 Existing authentication

Önce mevcut Codex hesabını kontrol et.

Örnek:

```text
codex detected
Codex version
login state
subscription/account state
```

MathOS üzerinden de:

```text
provider status
provider doctor
```

çalıştır.

Kullanıcı zaten login olmuşsa mevcut resmi session'ı kullan.

Credential'ı MathOS içine kopyalama.

## 4.3 Login gerekiyorsa

Login yoksa MathOS'un resmi provider login akışını başlat.

Tercih:

```text
browser OAuth
veya
device code
```

Kullanıcıdan hiçbir zaman:

```text
access token
refresh token
OAuth cookie
ChatGPT cookie
authorization header
```

istememelisin.

Kullanıcının yapması gereken yalnızca resmi browser/device ekranında hesabına giriş yapmak ve izin vermek olmalıdır.

Interactive human action gerekiyorsa açık biçimde:

```text
USER ACTION REQUIRED:
Complete the official ChatGPT/Codex sign-in shown in the browser.
Do not paste credentials into this terminal.
```

de ve işlem tamamlanınca devam et.

---

# 5. REAL PROVIDER COMPLETION

> **5 Eylül 2026 ilerleme notu:** WINDOWS PASS KAYITLI — gpt-5.6-sol, external-jsonrpc; Mac'te canlı completion çalıştır.

Login başarılı görünmesi tek başına PASS değildir.

Gerçek model isteği yap.

## Zorunlu evidence

MathOS Provider Hub üzerinden:

```text
provider = ChatGPT/Codex
auth = valid subscription session
model = actual discovered Codex model
request = real network request
response = real model completion
```

olmalıdır.

FakeModelProvider kullanma.

Fixture kullanma.

Recorded response replay kullanma.

HTTP mock kullanma.

## Test prompt

Zararsız ve deterministik bir smoke isteği yeterlidir:

```text
Return JSON only:
{
  "mathos_live_provider_smoke": true
}
```

MathOS structured-output mekanizmasından geçir.

Beklenti:

```json
{
  "mathos_live_provider_smoke": true
}
```

Provider:

```text
VERIFIED
```

olmalıdır.

---

# 6. NO SILENT BILLING FALLBACK

> **5 Eylül 2026 ilerleme notu:** WINDOWS REGRESYON KAYITLI — sessiz PAYG fallback yok; Mac'te yeniden doğrula.

ChatGPT/Codex subscription test edilirken MathOS'un sessizce:

```text
OpenAI API
OpenRouter
başka PAYG provider
```

üzerine düşmediğini doğrula.

Live evidence şu bilgileri secret içermeden gösterebilmeli:

```text
profile id
provider kind
auth mode
transport
model id
request success
usage/quota metadata if available
```

Ama:

```text
access token
refresh token
API key
cookie
Authorization header
```

asla gösterilmemeli.

Abonelik limitine ulaşılırsa:

```text
SUBSCRIPTION_QUOTA_EXHAUSTED
```

veya mevcut typed eşdeğeri dönmeli.

Otomatik ücretli API fallback yasaktır.

---

# 7. PROVIDER ROLE ROUTING — REAL TEST

> **5 Eylül 2026 ilerleme notu:** WINDOWS ARAŞTIRMA KAYITLI — roller/planner; Mac'te persistent config ve gerçek invocation yeniden doğrulanmalı.

Provider Hub'ın MathOS Research Engine'e gerçekten bağlı olduğunu kanıtla.

Gerçek ChatGPT/Codex provider profilini en az aşağıdaki rollere ata:

```text
planner
researcher
formalizer
prover
```

Mevcut architecture checker/auditor için farklı provider gerektiriyorsa mevcut güven kurallarını koru.

Atamaları MathOS'un gerçek persistent config mekanizmasıyla yap.

Restart sonrası seçimler kaybolmamalı.

## Real role test

Her rolün gerçekten seçilen profile resolve edildiğini doğrula.

Sadece config dosyasını okuyup PASS verme.

En az bir gerçek Research Planner invocation çalıştır.

Beklenti:

```text
typed MathOS research action
valid structured output
provider == selected ChatGPT/Codex profile
```

Model:

```text
claimStatus
verificationStatus
HUMAN_APPROVED
KERNEL_VERIFIED
```

alanlarını zorla değiştirememeli.

---

# 8. OTHER PROVIDERS — REGRESSION, NOT LIVE ACCOUNT REQUIREMENT

> **5 Eylül 2026 ilerleme notu:** CONTRACT PASS KAYITLI — 39 descriptor; credential olmayanlar canlı doğrulanmış sayılmaz.

39 descriptor'ın tamamını yeniden canlı credential ile test etmek zorunlu değildir.

Şunların contract/regression testleri korunmalıdır:

```text
OpenAI
OpenRouter
Anthropic
Claude subscription bridge
Gemini
Gemini CLI
Vertex
GitHub Copilot
Kimi Code
MiniMax
Alibaba Token Plan
Alibaba Coding Plan
Qwen
Z.AI
Z.AI Coding Plan
DeepSeek
Ollama
LM Studio
llama.cpp
generic OpenAI-compatible
generic Anthropic-compatible
ve katalogdaki diğer descriptor'lar
```

Kullanıcı credential sağlamadıysa:

```text
NOT_CONFIGURED
```

doğru sonuçtur.

Sahte credential üretme.

---

# 9. POLICY-GATED PROVIDERS

> **5 Eylül 2026 ilerleme notu:** KORUNDU — policy-blocked yollar kapalı kalmalı.

Aşağıdakilerin mevcut policy durumlarını koru:

```text
Antigravity consumer path
restricted Alibaba plan paths
Z.AI Coding Plan
retired Qwen OAuth path
```

Bu entegrasyonlar kodda bulunabilir.

Ama güncel provider policy izin vermiyorsa:

```text
PROVIDER_APPROVAL_REQUIRED
TERMS_RESTRICTED
PROHIBITED_THIRD_PARTY
```

gibi mevcut doğru durumlarında kalmalıdır.

Bunları release blocker yapma; çünkü MathOS bu provider'ları yanlış biçimde kullanmıyor.

Ancak hiçbirini sahte VERIFIED yapma.

---

# 10. LOCAL ENGINES

> **5 Eylül 2026 ilerleme notu:** KORUNDU — unavailable local engines blocker değildir.

Şu provider'lar:

```text
Ollama
LM Studio
llama.cpp
```

makinede kurulu/çalışır değilse:

```text
UNAVAILABLE
```

durumu kabul edilebilir ve release blocker değildir.

MathOS local-engine support kodunun regression testleri geçmelidir.

Sırf qualification için kullanıcı makinesine üç ayrı inference engine kurma.

---

# 11. MACOS PRODUCTION SANDBOX

> **5 Eylül 2026 ilerleme notu:** DEVAM NOKTASI — macOS runtime/OCI kurulumu ve gerçek backend doğrulaması yapılmadı.

Mevcut en önemli blocker'lardan biridir.

Target:

```text
macOS Apple Silicon arm64
```

## 11.1 Runtime detection

MathOS'un production sandbox backend'inin hangi runtime'ı kullandığını belirle.

Mevcut implementation Docker/OCI ise onu koru.

Yeni sandbox subsystem icat etme.

## 11.2 Docker/OCI missing

Docker/runtime kurulu değilse önce mevcut sistemde şunları araştır:

```text
docker
Docker Desktop
colima
podman
başka mevcut desteklenen OCI runtime
```

Mevcut MathOS backend hangisini destekliyorsa onu kullan.

Eksik prerequisite kurmak gerekiyorsa yalnız resmi/güvenilir distribution kullan.

OS admin/password/browser confirmation gerekiyorsa kullanıcıdan yalnız bu sistem onayını iste.

Secret isteme.

## 11.3 Required image

Mevcut sandbox contract'ı örneğin:

```text
python:3.12-alpine
```

gerektiriyorsa image'ın doğru platform sürümünü çek.

Image digest/version evidence kaydet.

`latest` tag'e sessiz geçiş yapma.

---

# 12. REAL SANDBOX ATTACK TESTS — MACOS

> **5 Eylül 2026 ilerleme notu:** NOT_VERIFIED — gerçek Mac üzerinde tam izolasyon saldırı matrisi gerekli.

Testler MathOS'un **gerçek model-generated computation execution path'i** üzerinden yapılmalıdır.

Raw `docker run` testi tek başına yeterli değildir.

Aşağıdaki gerçek izolasyonları doğrula:

```text
network denied
host secret environment inaccessible
SSH_AUTH_SOCK inaccessible
cloud/API credentials inaccessible
host HOME inaccessible
workspace dışına arbitrary read denied
workspace dışına arbitrary write denied
timeout enforced
stdout limit enforced
child-process cleanup enforced
temporary sandbox HOME
sandbox unavailable → fail closed
```

Özellikle gerçek network testi yap.

Model-generated Python örneğin public HTTPS endpoint'e bağlanmaya çalışsın.

Beklenen:

```text
NETWORK_DENIED
```

veya equivalent execution failure.

Eğer network erişimi gerçekleşirse:

```text
SECURITY_BLOCKER
```

olarak kabul et.

Release yapma.

---

# 13. WINDOWS PRODUCTION SANDBOX

> **5 Eylül 2026 ilerleme notu:** WINDOWS TESTLERİ KAYITLI — Docker Engine 29.7.2; son release HEAD için kanıt bağını yeniden kontrol et.

Target:

```text
Windows 11 x64
```

Mac'teki PASS Windows PASS sayılmaz.

Gerçek Windows host gerekir.

Mevcut kullanıcı tarafından daha önce yetkilendirilmiş Windows host/remote access varsa kullanılabilir.

Yeni uzaktan erişim/backdoor kurma.

Windows host yoksa:

```text
WINDOWS_REAL_HOST_UNAVAILABLE
```

raporla ve release yapma.

## Windows sandbox acceptance

Aynı saldırı matrisi gerçek Windows makinede yeniden çalıştırılmalıdır:

```text
network isolation
environment isolation
filesystem isolation
timeout
output limits
process cleanup
fail closed
```

Normal Windows subprocess + env filtering sandbox olarak kabul edilemez.

---

# 14. MACOS REAL TUI

> **5 Eylül 2026 ilerleme notu:** NOT_VERIFIED — gerçek Mac PTY etkileşimleri gerekli.

Headless snapshot test yeterli değildir.

Gerçek terminal/PTY içerisinde:

```bash
mathos
```

başlat.

Gerçek workspace aç.

En az şu etkileşimleri doğrula:

```text
workspace görünür
objective görünür
C-001 görünür
sidebar çalışıyor
command palette açılıyor
provider ekranı açılıyor
provider profile seçilebiliyor
role assignment keyboard ile çalışıyor
quit/cleanup düzgün
```

Terminal crash veya corrupted screen olmamalı.

Sonuç:

```text
MACOS_TUI_REAL_SESSION=PASS
```

olmalıdır.

---

# 15. WINDOWS REAL TUI

> **5 Eylül 2026 ilerleme notu:** WINDOWS TUI KAYITLI — küçük ekran/Lean wrapping düzeltildi. Tam etkileşim matrisi için yalnız snapshot'a dayanma.

Aynı temel kullanıcı senaryosunu gerçek Windows terminalinde çalıştır.

PowerShell/Windows Terminal üzerinden standalone executable kullan.

Source-tree:

```text
bun run ...
```

ile geçiştirme.

Gerçek:

```text
mathos.exe
```

artifact'ı çalıştır.

TUI interaction gerçek terminalde doğrulanmalı.

---

# 16. VS CODE EXTENSION — REAL EXTENSION HOST

> **5 Eylül 2026 ilerleme notu:** NOT_VERIFIED — Mac üzerinde gerçek Extension Host ve lifecycle testi gerekli.

`VSIX build PASS` release için yeterli değildir.

## macOS

Gerçek VS Code installation üzerinde:

```text
mathos-research.mathos@1.0.0-rc.1
```

VSIX'i kur.

Gerçek:

```text
mathos-first-research
```

workspace'i aç.

Extension Host gerçekten activate olmalı.

## Zorunlu kanıt

Şunlar gerçek Extension Host içerisinde çalışmalı:

```text
MathOS Objective tree
MathOS Claims tree
C-001 visible
provider profile selection
persistent profile selection
MathOS Refresh
MathOS Show Objective
MathOS Open Claim
MathOS Open Atlas
MathOS Doctor
bridge startup
bridge health
bridge teardown
```

`activate()` çağrılmış olduğuna dair gerçek runtime evidence olmalı.

Package içeriğine bakarak PASS verme.

## Lifecycle

VS Code kapanınca:

```text
orphan bridge process = 0
duplicate bridge process = 0
secret/token leak = 0
```

olmalıdır.

---

# 17. WINDOWS VS CODE EXTENSION HOST

> **5 Eylül 2026 ilerleme notu:** WINDOWS HOST KAYITLI — BRIDGE_ONLY / refresh/provider komutları; DISPATCHED_UI sonucu görsel sonuç kanıtı değildir, final audit'te kontrol et.

Aynı VSIX gerçek Windows VS Code üzerinde kurulmalı.

Gerçek Extension Host activation yeniden kanıtlanmalı.

macOS sonucu Windows için kullanılmaz.

---

# 18. C-001 — CANONICAL REAL MATHEMATICAL ACCEPTANCE

> **5 Eylül 2026 ilerleme notu:** MEVCUT — C-001, FS-002, PA-004. Workspace Git dışında; taşınması ayrıca gerekir.

Canonical workspace:

```text
mathos-first-research
```

Canonical claim:

```text
C-001 — Sum of odd numbers
```

Natural-language theorem:

```text
For every natural n, the sum of the first n odd natural numbers equals n squared.
```

Mevcut gerçek Lean formalization/proof'u kullan.

Sırf provider test etmek için proof'u gereksiz yere yeniden yazma.

Ancak revision değişmişse VerificationGate'in stale kurallarını takip et.

---

# 19. REAL MODEL RESEARCH ON C-001

> **5 Eylül 2026 ilerleme notu:** WINDOWS CANLI ARAŞTIRMA KAYITLI — R-003 COMPLETED. Mac'te typed model zincirini yeniden çalıştır.

ChatGPT/Codex live provider ile C-001 üzerinde gerçek bir research turn çalıştır.

Amaç matematiksel olarak zor bir theorem çözmek değil.

Amaç sistem bağlantısını kanıtlamak.

En az:

```text
research planner invocation
research action
formalization reasoning
proof strategy suggestion
```

gerçek model tarafından üretilsin.

Modelin cevabı persistent MathOS research state'ine mevcut typed path üzerinden girsin.

Raw chat log'u doğrudan verified evidence yapma.

---

# 20. HUMAN FIDELITY APPROVAL — MUST STOP FOR USER

> **5 Eylül 2026 ilerleme notu:** ÖNCEKİ ONAY KAYITLI — FS-002 HUMAN_APPROVED. Import sonrası gerçek audit ve revision eşleşmesini doğrula; genel devam izninden yeni fidelity onayı türetme.

C-001'in doğal dil ifadesi ile gerçek Lean theorem statement'ını yan yana kullanıcıya göster.

Örnek format:

```text
HUMAN FIDELITY REVIEW REQUIRED

Natural-language claim:
For every natural n, the sum of the first n odd natural numbers equals n squared.

Lean formalization:
<ACTUAL EXACT LEAN STATEMENT>

Important assumptions/domain:
<ACTUAL RESULT>

Back-translation:
<LEAN STATEMENT TRANSLATED BACK TO NATURAL LANGUAGE>

Approve semantic fidelity?
YES / NO
```

Bu noktada AI karar veremez.

Kullanıcının açık:

```text
YES
approve
onaylıyorum
```

anlamına gelen kararını bekle.

Bu human checkpoint, görevin izin verilen tek zorunlu epistemik insan kapısıdır.

## User says NO

Onay verilmezse:

```text
FORMAL_FIDELITY_REVIEW_REQUIRED
```

durumunu koru.

Formalization ile doğal statement arasındaki farkı düzelt.

Sonra yeniden kullanıcıya göster.

## User says YES

Mevcut resmi MathOS fidelity approval mekanizması üzerinden:

```text
HUMAN_APPROVED
```

kaydet.

Kayda:

```text
actor = human/local-user
claim revision
formal revision
timestamp
```

gibi mevcut audit metadata'yı ekle.

AI kendisini human actor olarak yazmamalı.

---

# 21. REAL LEAN VERIFICATION

> **5 Eylül 2026 ilerleme notu:** WINDOWS LEAN PASS KAYITLI — vr_6c382604786d4f189ed2b01b4d871d8e; Mac'te gerçek Lean/VerificationGate çalıştır.

Human approval sonrasında gerçek Lean pipeline'ı çalıştır.

Zorunlu:

```text
Lean 4.33.1 or canonical pinned version
Lake
pinned Mathlib
real theorem compilation
Print Axioms or canonical equivalent
forbidden construct inspection
current revision validation
toolchain pin validation
fidelity validation
VerificationGate
```

Kontrol et:

```text
sorry = absent
admit = absent
unsafe proof = absent
custom unapproved axioms = absent
stale formalization = false
human fidelity = approved
proof kernel accepted = true
```

Yalnız bütün kontroller geçerse:

```text
C-001 = KERNEL_VERIFIED
```

olabilir.

Bunu doğrudan DB update ile yapma.

Mutlaka VerificationGate üzerinden geçsin.

---

# 22. PERSISTENCE REOPEN TEST

> **5 Eylül 2026 ilerleme notu:** WINDOWS REOPEN KAYITLI — Mac import/reopen ve provider config ayrıca doğrulanmalı.

C-001 `KERNEL_VERIFIED` olduktan sonra MathOS'u tamamen kapat.

Tekrar aç.

Kontrol et:

```text
claim persists
objective persists
formalization persists
human fidelity persists
proof metadata persists
kernel evidence persists
verification status persists
provider configuration persists
provider secrets are not persisted in workspace
```

Verification evidence hâlâ aynı claim/formal revision'a bağlı olmalı.

---

# 23. ATLAS REAL POST-VERIFICATION TEST

> **5 Eylül 2026 ilerleme notu:** WINDOWS SNAPSHOT KAYITLI — C-001 verified. Mac'te gerçek Atlas tarayıcı oturumunu doğrula.

Atlas'ı verified C-001 state'inden tekrar aç.

C-001:

```text
KERNEL_VERIFIED
```

olarak görünmeli.

Graph node/metadata doğal olarak mevcut UI tasarımına göre güncellenmeli.

Atlas için yeni feature ekleme.

Browser authentication/session token güvenliği korunmalı.

Token terminal logunda plaintext görünmemeli.

---

# 24. REPRODUCIBILITY CAPSULE

> **5 Eylül 2026 ilerleme notu:** CAPSULE ÜRETİLDİ — yalnız manifest ve Lean dosyası içeriyor; tam workspace yedeği değildir. Araştırma/audit metadata kapsamını final audit'te kontrol et.

Verified C-001 için gerçek capsule oluştur.

Capsule en az mevcut sistemin desteklediği şu bilgileri taşımalı:

```text
MathOS version
git revision
claim revision
formal revision
Lean version
Mathlib/toolchain
verification result
proof artifact hash
provider/profile identifier
model identifier
model/provider transport metadata
research evidence hashes
```

Secret kesinlikle içermemeli.

Özellikle şunları ara:

```text
API key
OAuth token
refresh token
Authorization header
browser cookie
Keychain value
```

Capsule verify komutu başarılı olmalı.

---

# 25. PUBLICATION / EXPORT

> **5 Eylül 2026 ilerleme notu:** EXPORT ÜRETİLDİ — md/tex/html; Mac'te güncel gerçek state üzerinden yeniden üret.

C-001'in güncel verified state'inden gerçek publication/export smoke çalıştır.

Çıktıda:

```text
verified theorem
formal statement
proof metadata
reproducibility reference
```

mevcut desteklenen formata göre bulunabilir.

Model-generated reasoning verified theorem olarak yanlış etiketlenmemeli.

---

# 26. MACOS STANDALONE QUALIFICATION

> **5 Eylül 2026 ilerleme notu:** NOT_VERIFIED — cross-build var; gerçek Mac install/runtime/permisson testi yapılmadı.

Source checkout içinden değil, release artifact üzerinden test et.

Target:

```text
darwin-arm64
```

Artifact extraction sonrası yeni shell/Terminal session içinde:

```bash
mathos --version
mathos doctor --json
mathos
mathos atlas
```

çalışmalıdır.

Standalone binary hiçbir gizli source-tree dependency'ye bağlı olmamalı.

Kontrol:

```text
Mach-O arm64
correct executable permission
version == 1.0.0-rc.1
provider catalog available
Codex integration available
Lean detection works
sandbox detection works
TUI works
Atlas works
```

---

# 27. WINDOWS STANDALONE QUALIFICATION

> **5 Eylül 2026 ilerleme notu:** WINDOWS BUILD/CLEAN-ROOM PASS KAYITLI — de48468.

Gerçek Windows 11 x64 host üzerinde release artifact üret veya canonical build pipeline'dan al.

Artifact:

```text
PE x64
```

olmalıdır.

Yeni PowerShell/Windows Terminal session içinde:

```powershell
mathos --version
mathos doctor --json
mathos
mathos atlas
```

çalışmalıdır.

Path/install davranışı gerçek kullanıcı senaryosunda doğrulanmalı.

Source tree dependency'si olmamalı.

---

# 28. WINDOWS HOST AVAILABILITY POLICY

> **5 Eylül 2026 ilerleme notu:** KURAL — Windows kanıtlarını Mac sonucu ile ikame etme; final HEAD değişirse ilgili Windows kanıtını yenile.

Eğer ajan macOS'ta çalışıyor ve erişebildiği gerçek Windows 11 x64 makine yoksa:

Windows PASS üretme.

Ancak Windows qualification için gereken:

```text
artifact
qualification script
commands
expected checks
evidence schema
```

tam ve taşınabilir halde hazırlanmış olmalı.

Final rapor:

```text
WINDOWS: NOT_VERIFIED
```

olmalı.

Ve:

```text
RELEASE: BLOCKED
```

kalmalıdır.

Windows x64 doğrulaması olmadan `v1.0.0-rc.1` release çıkarma.

---

# 29. NO GITHUB ACTIONS REQUIREMENT

> **5 Eylül 2026 ilerleme notu:** GEÇERLİ — GitHub Actions çalıştırılmadı. Son kullanıcı tercihi Mac cihaza geçip devam etmek.

GitHub Actions kullanma.

Kullanıcının Actions limitlerini gereksiz yere tüketme.

Ana qualification:

```text
local macOS evidence
+
local/authorized Windows evidence
```

üzerinden yapılacak.

---

# 30. FULL REGRESSION

> **5 Eylül 2026 ilerleme notu:** SON KOŞU — de48468: 819 PASS / 12 SKIP / 0 FAIL; software-completion 22/22, v1 13/13. Release-check NOT_READY.

Gerçek qualification sorunları düzeltildikten sonra canonical local suite çalıştır:

```bash
bun install --frozen-lockfile
bun run typecheck
bun run build
bun test
bun run release-check
```

Mevcut özel qualification komutları varsa onları da çalıştır:

```text
provider contract
provider qualification
VSIX verification
release artifact verification
software completion
final product capabilities
```

Testleri yalnız PASS sayısını yükseltmek için çoğaltma.

Gerçek regression riskine yönelik minimum anlamlı test ekle.

---

# 31. RELEASE-CHECK REQUIREMENTS

> **5 Eylül 2026 ilerleme notu:** AÇIK — release-check NOT_READY. Her gate'in gerçek kanıtını incele; üst düzey PASS JSON'u tek başına yeterli değil.

Final release-check şu gerçek evidence'ları ayırt edebilmelidir:

```text
CODE_TESTED
LIVE_TESTED
PLATFORM_TESTED
USER_ACTION_REQUIRED
NOT_CONFIGURED
NOT_AVAILABLE
POLICY_BLOCKED
```

Özellikle:

```text
mock model PASS
```

gerçek provider capability gate'i geçirmemeli.

Aynı şekilde:

```text
cross-compiled Windows artifact
```

Windows runtime PASS sayılmamalı.

---

# 32. SECURITY FINAL AUDIT

> **5 Eylül 2026 ilerleme notu:** KISMİ AUDIT — önceki taramalar temiz raporlandı; bazı taramalar binary/arşiv/SQLite dosyalarını dışladı. Tam kapsamlı final security audit açık.

Final repository ve generated artifacts üzerinde ara:

```text
sk-
Bearer
Authorization:
access_token
refresh_token
OPENAI
OPENROUTER
ANTHROPIC
MINIMAX
KIMI
QWEN
ZAI
ALIBABA
credential
cookie
```

False positive fixture'ları elle doğrula.

Gerçek credential bulunmamalı.

Özellikle kontrol et:

```text
Git history added in this task
working tree
generated reports
qualification evidence
VSIX
standalone archives
reproducibility capsules
logs
JSONL
SQLite
config files committed to repo
```

Secret leak varsa:

```text
SECURITY_BLOCKER
```

ve release yapma.

---

# 33. BILLING / PRIVACY FINAL AUDIT

> **5 Eylül 2026 ilerleme notu:** WINDOWS KONTROLLERİ KAYITLI — Mac ve final çıktılar üzerinde tekrar doğrula.

Live provider smoke sonrası doğrula:

```text
No unexpected PAYG fallback
No provider switch without user choice
No hidden credential persistence
No secret in usage ledger
No prompt/response accidentally marked as proof
No model authority escalation
```

Role routing değişiklikleri yalnız provider selection'ı etkilemeli.

MathOS epistemic state authority değişmemeli.

---

# 34. CLEANUP OLD LOCAL BRANCH

> **5 Eylül 2026 ilerleme notu:** KONTROL EDİLDİ — yalnız main; eski local branch yok.

Daha önce localde kaldığı bildirilen:

```text
codex/mathos-0.2-hardening
```

branch'ini incele.

Önce:

```bash
git merge-base --is-ancestor codex/mathos-0.2-hardening main
```

ve gerekiyorsa commit containment kontrollerini yap.

Branch'teki bütün commit'ler `main` içindeyse local branch'i sil:

```bash
git branch -d codex/mathos-0.2-hardening
```

Force `-D` kullanma.

Main'de olmayan commit bulunursa branch'i silme ve raporla.

Bu görev sonunda tercih edilen local branch listesi:

```text
main
```

olmalıdır.

Remote'da da yalnız canonical policy'ye uygun mevcut branch'ler kalmalı; kullanıcı istemeden remote branch silme.

---

# 35. CROSS-PLATFORM FINAL MATRIX

> **5 Eylül 2026 ilerleme notu:** AÇIK — tüm macOS hücreleri NOT_VERIFIED; Windows kayıtları tarihsel/revision bağlı.

Final evidence matrix'i gerçek verilerle doldur:

| Capability | macOS arm64 | Windows 11 x64 |
|---|---|---|
| Standalone install | | |
| CLI | | |
| TUI real terminal | | |
| Workspace | | |
| Claims/Objectives | | |
| Provider Hub | | |
| ChatGPT/Codex detection | | |
| Live model completion | | |
| Role routing | | |
| Literature | | |
| Lean | | |
| Real proof | | |
| VerificationGate | | |
| Sandbox | | |
| Network isolation | | |
| Filesystem isolation | | |
| Atlas | | |
| VS Code Extension Host | | |
| Reproducibility | | |
| Publication/export | | |
| Release artifact | | |
| Release-check | | |

Yalnız gerçek platform evidence olan hücrelere:

```text
PASS
```

yaz.

---

# 36. REQUIRED RELEASE STATE

> **5 Eylül 2026 ilerleme notu:** SAĞLANMADI — macOS gate'leri ve final release-check eksik.

`v1.0.0-rc.1` release için aşağıdakilerin tamamı zorunludur:

```text
macOS arm64 full mandatory matrix PASS
Windows 11 x64 full mandatory matrix PASS

ChatGPT/Codex real subscription login PASS
Real model completion PASS
Real Research Planner invocation PASS

macOS sandbox PASS
Windows sandbox PASS

macOS real TUI PASS
Windows real TUI PASS

macOS VS Code Extension Host PASS
Windows VS Code Extension Host PASS

C-001 HUMAN_APPROVED
C-001 real Lean proof PASS
C-001 VerificationGate PASS
C-001 KERNEL_VERIFIED

Reopen persistence PASS
Atlas verified state PASS
Reproducibility PASS
Publication/export PASS

Typecheck PASS
Build PASS
Tests 0 FAIL
Release-check READY

Security scan PASS
No secret persistence
No unexpected billing fallback

main clean
HEAD == origin/main
```

Policy-gated Z.AI/Alibaba/Antigravity paths **release blocker değildir**, eğer doğru policy status'unda ve fail-closed durumdaysa.

Unavailable Ollama/LM Studio/llama.cpp da release blocker değildir.

---

# 37. TAG CREATION

> **5 Eylül 2026 ilerleme notu:** NOT_CREATED — iki platform da final HEAD üzerinde geçmeden oluşturma.

Bütün zorunlu gate'ler PASS ise önce final commit'i pushla.

Doğrula:

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Beklenti:

```text
working tree clean
HEAD == origin/main
```

Daha sonra mevcut tag'i kontrol et:

```bash
git tag --list v1.0.0-rc.1
```

Tag yoksa annotated tag oluştur:

```bash
git tag -a v1.0.0-rc.1 -m "MathOS 1.0.0 RC1"
git push origin v1.0.0-rc.1
```

Tag zaten varsa üzerine yazma.

Force tag yasaktır.

Mevcut tag farklı commit'e işaret ediyorsa:

```text
TAG_CONFLICT
```

raporla ve release yapma.

---

# 38. RELEASE ARTIFACTS

> **5 Eylül 2026 ilerleme notu:** KISMİ — yerel paketler mevcut, ignored; build revision ve SHA her artifact için ayrıca kontrol edilmeli.

Minimum release artifacts:

```text
MathOS macOS arm64 standalone archive
MathOS Windows x64 standalone archive
MathOS VSIX
checksums
release qualification report
```

Checksum tercihen:

```text
SHA-256
```

olarak üret.

Artifact'ların build revision'ı final HEAD ile eşleşmeli.

Eski artifact'i yeni release içine koyma.

---

# 39. GITHUB RELEASE

> **5 Eylül 2026 ilerleme notu:** NOT_CREATED — final gate'ler tamamlanana kadar yayımlama.

Yalnız bütün required release state PASS ise GitHub Release oluştur.

Release:

```text
Tag: v1.0.0-rc.1
Title: MathOS 1.0.0 RC1
Prerelease: YES
```

olmalıdır.

Release notes kısa ama dürüst olsun.

Şunları belirt:

```text
Supported:
Windows 11 x64
macOS Apple Silicon arm64

Core:
Agentic mathematical research workspace
Lean verification
Research Provider Hub
ChatGPT/Codex subscription integration
Literature
Atlas
VS Code integration
Sandboxed computation
Reproducibility
Publication
```

Ayrıca policy-gated provider durumlarını dürüstçe belirt.

API keys veya kullanıcı bilgisi release notes'a girmemeli.

---

# 40. DO NOT RELEASE IF BLOCKED

> **5 Eylül 2026 ilerleme notu:** UYGULANDI — release kapalı.

Herhangi bir zorunlu gate eksikse:

```text
TAG: NOT_CREATED
GITHUB_RELEASE: NOT_CREATED
```

olmalıdır.

Özellikle şu gerekçelerden biri kalırsa release yapma:

```text
Windows NOT_VERIFIED
real model NOT_VERIFIED
sandbox BLOCKED
VS Code Extension Host NOT_VERIFIED
human fidelity missing
VerificationGate blocked
security failure
release-check NOT_READY
```

---

# 41. PROHIBITED SHORTCUTS

> **5 Eylül 2026 ilerleme notu:** SÜREKLİ KURAL — kısmi kanıttan PASS üretme.

Kesinlikle yapma:

```text
mock provider → LIVE VERIFIED
FakeLean → real Lean evidence
VSIX installed → Extension Host PASS
Docker CLI installed → sandbox PASS
Mac cross-build → Windows PASS
AI → HUMAN_APPROVED
direct DB update → KERNEL_VERIFIED
API key → pretend ChatGPT subscription
PAYG fallback → pretend subscription success
environment flag → pretend network isolation
skip failed test
weaken assertion
disable security check
force tag
force push
create another branch
create worktree
```

---

# 42. SUCCESSFUL USER EXPERIENCE

> **5 Eylül 2026 ilerleme notu:** KISMİ — Windows çalışma kayıtları var; tam iki-platform deneyimi henüz tamamlanmadı.

Görev başarıyla tamamlandığında gerçek kullanıcı şu deneyimi yaşayabilmelidir:

```text
mathos
```

açar.

Sonra MathOS içerisinde:

```text
ChatGPT / Codex
Connected
Subscription session verified
```

görür.

Bir model seçer.

Örneğin:

```text
planner      → Codex
researcher   → Codex
formalizer   → Codex
prover       → Codex
```

atar.

Araştırmasını çalıştırır.

MathOS modeli kullanır fakat modele matematiksel doğruluk yetkisi vermez.

Sonunda:

```text
AI research
     ↓
formalization
     ↓
human semantic review
     ↓
Lean kernel
     ↓
VerificationGate
     ↓
KERNEL_VERIFIED
```

zinciri gerçekleşir.

Bu MathOS'un temel ürün vaadidir.

---

# 43. FINAL REPORT FORMAT

> **5 Eylül 2026 ilerleme notu:** ARA RAPOR MEVCUT — ignored artifacts altında; final rapor Mac doğrulaması sonrası yeniden oluşturulmalı.

Görev sonunda yalnız gerçek evidence ile şu raporu ver:

```text
MATHOS 1.0 RC — FINAL LIVE QUALIFICATION REPORT

STATUS:
DONE / PASS_WITH_GAPS / BLOCKED

CANONICAL BRANCH:
main

START HEAD:
<sha>

FINAL HEAD:
<sha>

REMOTE SYNC:
PASS / FAIL

WORKING TREE:
CLEAN / DIRTY

LOCAL BRANCHES:
<list>

VERSION:
1.0.0-rc.1


LIVE MODEL

ChatGPT/Codex detection:
Login:
Subscription auth:
Model discovery:
Live completion:
Structured output:
Planner invocation:
Role routing:
Quota/usage:
Unexpected PAYG fallback:


C-001

Workspace:
Claim:
Live model research:
Formalization:
Human fidelity:
Lean compile:
Axiom check:
VerificationGate:
Final claim status:
Reopen persistence:


MACOS ARM64

Standalone:
CLI:
TUI real session:
Provider Hub:
Live model:
Literature:
Lean:
Sandbox:
Network isolation:
Filesystem isolation:
Atlas:
VS Code Extension Host:
Reproducibility:
Publication:
Release-check:


WINDOWS 11 X64

Standalone:
CLI:
TUI real session:
Provider Hub:
Live model:
Literature:
Lean:
Sandbox:
Network isolation:
Filesystem isolation:
Atlas:
VS Code Extension Host:
Reproducibility:
Publication:
Release-check:


PROVIDER HUB

Descriptors:
Contract:
Policy-gated providers:
Local engines:
Credential persistence:
Billing guard:


TESTS

Typecheck:
Build:
Tests:
Provider qualification:
VSIX:
macOS artifact:
Windows artifact:
Release-check:


SECURITY

Secret scan:
OAuth token persistence:
API key persistence:
Usage ledger:
Capsule:
Sandbox host fallback:
Verification authority:


ARTIFACTS

macOS:
SHA256:

Windows:
SHA256:

VSIX:
SHA256:


TAG:
CREATED / NOT_CREATED

GITHUB RELEASE:
CREATED / NOT_CREATED


KNOWN BLOCKERS:
<none or exact blockers>

KNOWN NON-BLOCKING LIMITATIONS:
<exact limitations>


FINAL VERDICT:
<one precise paragraph>
```

---

# 44. DEFINITION OF DONE

> **5 Eylül 2026 ilerleme notu:** TAMAMLANMADI — macOS qualification ve conditional tag/release bekliyor.

Bu görevi `DONE` ilan etmeden önce şu final durumu gerçek olmalıdır:

```text
main only
clean working tree
origin/main synced

real ChatGPT/Codex subscription connected
real model completion
real MathOS planner execution

C-001 human approved
C-001 kernel verified legitimately

macOS sandbox real
Windows sandbox real

macOS real TUI
Windows real TUI

macOS real VS Code Extension Host
Windows real VS Code Extension Host

macOS standalone real
Windows standalone real

reproducibility real
publication/export real

all mandatory tests PASS
release-check READY
security PASS

v1.0.0-rc.1 tag created
GitHub prerelease created
```

Bunlardan biri eksikse:

```text
PASS_WITH_GAPS
```

veya:

```text
BLOCKED
```

raporla.

Sahte `DONE` üretme.

---

# FINAL PRINCIPLE

Artık amaç MathOS'a daha fazla kod eklemek değildir.

Amaç gerçek bir matematikçinin Windows veya macOS bilgisayarında:

```text
mathos
```

yazıp;

mevcut ChatGPT/Codex aboneliğini bağlayıp;

gerçek AI araştırma modellerini kullanıp;

problemini formalize edip;

Lean ile ispatlayıp;

formal ifadenin matematiksel anlamını insan olarak onaylayıp;

kernel doğrulamasından geçirip;

araştırmasını kapatıp yeniden açıp;

Atlas ve VS Code'da aynı state'i görüp;

güvenli sandbox içerisinde hesaplama yapıp;

tekrar üretilebilir ve yayımlanabilir matematiksel araştırma çıktısı üretmesidir.

**MathOS 1.0 RC ancak bu gerçek ürün zinciri hem macOS arm64 hem Windows 11 x64 üzerinde kanıtlandığında tamamlanmış sayılacaktır.**

