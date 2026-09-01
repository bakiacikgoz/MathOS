# MathOS 0.2 — Production-Grade Research Runtime Hardening & Mathematical Capability Plan

**Hedef sürüm:** `0.2.0-alpha`  
**Kaynak durum:** `0.1.0-alpha.1`  
**Plan türü:** Tek parça, doğrudan uygulanabilir implementation backlog  
**Ana ilke:** Yeni özellik sayısını artırmak yerine mevcut MathOS araştırma çekirdeğini güvenli, modüler, ölçülebilir ve gerçek matematiksel araştırma kapasitesi açısından doğrulanabilir hale getirmek.

---

# 0. Yönetici Özeti

## Hedef

MathOS 0.2'nin hedefi:

> Mevcut MathOS araştırma ortamını; güvenli deney yürütme, modüler core mimarisi, gerçek Lean/model benchmarkları, daha ölçülebilir premise retrieval ve güvenilir release süreci ile erken kullanıcıların gerçek matematik araştırmalarında kontrollü biçimde kullanabileceği seviyeye taşımaktır.

Bu çalışma MathOS'u genel amaçlı chatbot, otomatik açık problem çözücü veya Lean'in yerine geçen bir proof assistant yapmayacaktır.

MathOS'un ürün kimliği korunacaktır:

> **Agentic mathematical research workspace / mathematical research operating environment**

## Ana teknik kararlar

1. Model tarafından üretilen Python kodu host üzerinde doğrudan çalıştırılmayacak.
2. Computation execution güvenlik politikası fail-closed olacak.
3. `MathOS` facade korunacak ancak domain operasyonları ayrı application service'lere ayrılacak.
4. `KERNEL_VERIFIED` yalnızca mevcut VerificationGate üzerinden üretilebilecek.
5. Retrieval geliştirmeleri benchmark kanıtı olmadan production path'e alınmayacak.
6. Fake Lean / fake planner benchmarkları yalnızca harness correctness göstergesi olarak kalacak.
7. Gerçek model + gerçek Lean kullanan ayrı bir research capability benchmarkı oluşturulacak.
8. Release gate sahte PASS üreten kontrollerden arındırılacak.
9. Platforma özel hard-coded path'ler kaldırılacak.
10. GitHub Actions zorunlu kabul edilmeyecek; tüm doğrulamalar lokal komutlarla çalışabilmeli.

## Başarı kriterleri

MathOS 0.2 tamamlanmış sayılabilmesi için:

- Model kaynaklı experiment kodu host filesystem/network üzerinde sınırsız çalışamamalı.
- Sandbox kullanılamıyorsa experiment fail-closed biçimde `BLOCKED` olmalı.
- `packages/core/src/mathos.ts` belirgin biçimde küçülmeli ve application service'lere delegation yapmalı.
- VerificationGate'in mevcut epistemik kuralları regression testlerle korunmalı.
- Gerçek Lean smoke suite çalışmalı.
- Gerçek model benchmarkı deterministic olmayan skorları release gate'e bağlamadan raporlayabilmeli.
- Retrieval benchmark V3 baseline ve candidate karşılaştırması üretebilmeli.
- Retrieval değişikliği ancak tanımlı promotion gate'lerini geçerse production config'e alınmalı.
- `bun run typecheck`, tam test paketi ve gerçek release-check çalışmalı.
- Hard-coded developer machine path'leri kalmamalı.
- Fresh workspace init → research → formalize → prove → verify → backup → restore akışı smoke test ile doğrulanmalı.

---

# 1. Kapsam, Varsayımlar ve Açık Sorular

## In-scope

### Güvenlik

- Computation sandbox.
- Experiment execution policy.
- Filesystem isolation.
- Network isolation veya fail-closed network policy.
- Environment sanitization.
- Resource limits.
- Timeout.
- Process-tree termination.
- Artifact validation.
- User/model code ayrımı.
- Audit metadata.

### Mimari

- `MathOS` god-service decomposition.
- Application service boundaries.
- Research engine ayrıştırması.
- Verification service ayrıştırması.
- Experiment service ayrıştırması.
- Literature service ayrıştırması.
- Branch/team coordinator ayrıştırması.
- Query/read model servisleri.
- Dependency injection sınırlarının temizlenmesi.

### Matematiksel araştırma

- Gerçek-model research benchmark.
- Gerçek Lean benchmark.
- Retrieval V3 experimentation framework.
- Downstream proof success ölçümü.
- Benchmark governance.
- Regression corpora.

### Product/release

- Gerçek build/typecheck gate.
- Portable tests.
- Fresh-install smoke.
- Backup/restore validation.
- Release readiness raporu.
- Package smoke.
- macOS pilot hardening.
- Linux portability hazırlığı.

## Out-of-scope

Bu planda yapılmayacak:

- GUI/desktop application.
- Electron/Tauri geçişi.
- Web application.
- Windows GA desteği.
- Linux GA desteği.
- Cloud multi-user platform.
- Authentication/RBAC.
- Billing.
- Collaboration server.
- Hosted MathOS.
- Automatic theorem proving model eğitimi.
- Mathlib fork'u.
- Lean replacement.
- General coding IDE.
- Arbitrary shell agent.
- Tam internet browser agent.
- Open problem solver pazarlama iddiası.

## Non-goals

- Daha fazla agent sayısı.
- 10+ paralel agent.
- Daha fazla UI ekranı sırf özellik sayısı artsın diye.
- VerificationGate'i kolaylaştırmak.
- Fake benchmark skorlarını yükseltmek.
- Retrieval metriğini fixture'a overfit etmek.
- Sandbox'ı yalnızca prompt talimatlarıyla güvenli saymak.

## Varsayımlar

- Bun mevcut ana runtime olmaya devam edecek.
- TypeScript ana uygulama dili olmaya devam edecek.
- SQLite workspace-local persistence korunacak.
- Lean 4 + Mathlib formal verification backbone olarak kalacak.
- Python computation backend olmaya devam edecek.
- TUI ana ürün yüzeyi olmaya devam edecek.
- OpenAI-compatible model provider contract korunacak.
- macOS ana development/pilot platform olacak.

---

# 2. Mevcut Bağlam veya Keşif Sonucu

## Gözlemlenen mimari

Mevcut repo aşağıdaki ana modülleri içeriyor:

```text
apps/
  tui/

packages/
  computation/
  core/
  domain/
  events/
  graph/
  lean/
  literature/
  models/
  retrieval/
  shared/
  storage/
  vcs/
  workspace/
```

Bu sınırlar korunmalıdır.

## Güçlü mevcut yapılar

Korunması gereken mevcut davranışlar:

- Claim epistemic statuses.
- Formalization pipeline.
- Human fidelity approval.
- Lean compile.
- Axiom inspection.
- Forbidden proof construct detection.
- VerificationGate.
- Workspace-local SQLite.
- Append-only event log.
- Research run budgets.
- Research action typing.
- Failure classes.
- Research blocker records.
- Multi-agent branch isolation.
- Explicit import.
- Re-verification on import.
- Retrieval benchmarks.
- Backup/restore.
- Doctor checks.
- TUI.

## Mevcut temel riskler

### RISK-A — Experiment host execution

Model-produced Python code host Python subprocess'i üzerinde çalışabiliyor.

Severity:

**CRITICAL**

### RISK-B — MathOS god object

`packages/core/src/mathos.ts` çok fazla application responsibility taşıyor.

Severity:

**HIGH**

### RISK-C — Benchmark interpretation

Harness correctness ile gerçek mathematical capability kolayca karıştırılabilir.

Severity:

**HIGH**

### RISK-D — Retrieval ceiling

Premise retrieval doğruluğu özellikle top-k seviyelerinde gerçek proof success'i sınırlayabilir.

Severity:

**MEDIUM/HIGH**

### RISK-E — Release signal

Build/release gate bazı kontrollerde gerçek verification yerine placeholder sonuç kullanıyor.

Severity:

**HIGH**

### RISK-F — Platform coupling

Hard-coded local filesystem yolları mevcut.

Severity:

**MEDIUM**

---

# 3. Gereksinimler ve Kabul Kriterleri

## Fonksiyonel gereksinimler

### FR-01 Secure experiment execution

MathOS model tarafından üretilen experiment kodunu doğrudan host process olarak çalıştırmamalı.

### FR-02 Experiment policy

Her experiment aşağıdaki execution sınıflarından birine sahip olmalı:

```text
TRUSTED_BUILTIN
USER_AUTHORED
MODEL_GENERATED
```

### FR-03 Model-generated fail closed

`MODEL_GENERATED` experiment yalnızca sandbox hazırsa çalışmalı.

Sandbox yoksa:

```text
EXPERIMENT_BLOCKED_SANDBOX_UNAVAILABLE
```

### FR-04 Verification authority

Hiçbir application service, model, experiment veya literature sonucu doğrudan:

```text
KERNEL_VERIFIED
```

atayamamalı.

### FR-05 Core modularization

`MathOS` facade application service'lere delegation yapmalı.

### FR-06 Real research eval

Real-model benchmark:

- gerçek model,
- gerçek Lean,
- frozen fixtures,
- bütçe,
- timeout,
- reproducibility metadata

kullanmalı.

### FR-07 Retrieval evaluation

Retrieval karşılaştırması:

- baseline,
- candidate,
- per-domain metrics,
- paired regression,
- downstream proof outcomes

raporlamalı.

### FR-08 Real release check

Release-check şu kontrolleri içermeli:

- typecheck,
- tests,
- release tests,
- migration,
- fresh init,
- backup/restore,
- secret redaction,
- schema compatibility,
- package smoke,
- experiment sandbox smoke,
- Lean smoke.

---

# 4. Mimari Karar ve Trade-off Analizi

## Experiment sandbox seçenekleri

### Seçenek A — Docker zorunlu sandbox

Avantaj:

- Güçlü filesystem/network isolation.
- Resource controls.
- Cross-platform yaklaşım.

Dezavantaj:

- Docker zorunluluğu ağır.
- Desktop developer UX kötüleşir.

### Seçenek B — OS-specific sandbox

macOS:

```text
sandbox-exec
```

Linux:

```text
bubblewrap / namespaces
```

Avantaj:

- Hafif.
- Lokal tool deneyimine uygun.

Dezavantaj:

- Platform implementasyonu ayrı.
- `sandbox-exec` uzun vadeli portability açısından ideal değil.

### Seçenek C — Restricted Python AST

Model code parse edilir ve yalnız whitelist syntax/modüller kabul edilir.

Avantaj:

- Hafif.

Dezavantaj:

- Security boundary olarak yeterli değil.
- Python dynamic özellikleri nedeniyle bypass riski.

### Seçilen yaklaşım

**Hybrid sandbox architecture**

```text
ExperimentService
       |
       v
ExperimentPolicy
       |
       v
SandboxRuntime interface
       |
       +-- macOS sandbox
       +-- Linux sandbox
       +-- trusted test fake
       +-- unavailable -> fail closed
```

AST validation yalnız defense-in-depth olacak.

Tek başına sandbox kabul edilmeyecek.

---

# 5. Bileşenler, Modüller ve Sorumluluklar

## 5.1 ExperimentService

Yeni dosya:

```text
packages/core/src/services/experiment-service.ts
```

Sorumluluk:

- experiment create
- policy evaluate
- recipe create
- sandbox execute
- result validate
- persistence
- audit

Girdi:

```ts
ExperimentExecutionRequest
```

Çıktı:

```ts
ExperimentExecutionOutcome
```

---

## 5.2 ExperimentPolicy

Yeni dosya:

```text
packages/computation/src/policy.ts
```

Sorumluluk:

- execution origin classification
- timeout bounds
- network policy
- filesystem policy
- code-size limit
- output limit
- executable allowlist

---

## 5.3 SandboxRuntime

Yeni dosya:

```text
packages/computation/src/sandbox.ts
```

Interface:

```ts
interface SandboxRuntime {
  inspect(): Promise<SandboxCapability>
  execute(
    request: SandboxedExecutionRequest
  ): Promise<ComputationalExecutionResult>
}
```

---

## 5.4 macOSSandboxRuntime

Yeni:

```text
packages/computation/src/platform/macos-sandbox.ts
```

Sorumluluk:

- temp working directory
- readonly/minimum filesystem
- no network
- sanitized environment
- process timeout
- process group termination

---

## 5.5 LinuxSandboxRuntime

Yeni:

```text
packages/computation/src/platform/linux-sandbox.ts
```

İlk aşamada:

- capability detect
- implementation varsa çalıştır
- yoksa BLOCKED

Linux henüz supported claim almayacak.

---

## 5.6 VerificationService

Yeni:

```text
packages/core/src/services/verification-service.ts
```

Taşınacak sorumluluklar:

- current formal lookup
- proof lookup
- Lean axiom audit
- VerificationGate invocation
- verification persistence
- claim promotion

Invariant:

```text
Claim status KERNEL_VERIFIED
iff
VerificationGate.passed === true
```

---

## 5.7 FormalizationService

Yeni:

```text
packages/core/src/services/formalization-service.ts
```

Sorumluluklar:

- formalization draft
- Lean statement check
- fidelity review
- formal revision lifecycle

---

## 5.8 ResearchEngine

Yeni:

```text
packages/core/src/services/research-engine.ts
```

Sorumluluklar:

- single-agent research loop
- decision validation
- budget accounting
- step lifecycle
- idempotency
- failure classification
- stop reasons

---

## 5.9 TeamResearchCoordinator

Yeni:

```text
packages/core/src/services/team-research-coordinator.ts
```

Sorumluluklar:

- agent assignment
- branch isolation
- bounded concurrency
- shared digest
- pause/resume
- import proposal
- import apply
- re-verification

---

## 5.10 LiteratureService

Yeni:

```text
packages/core/src/services/literature-service.ts
```

Sorumluluk:

- search
- source import
- excerpt
- citation
- literature evidence

Invariant:

```text
Literature evidence != proof
```

---

## 5.11 ResearchQueryService

Yeni:

```text
packages/core/src/services/research-query-service.ts
```

Read-only:

- dashboard
- ledger
- timeline
- claim page
- verification explanation
- graph summaries
- blockers
- environment state

TUI burada mutation yapmayacak.

---

# 6. Hedef Dosya ve Klasör Yapısı

Hedef:

```text
packages/core/src/
  mathos.ts

  services/
    claim-service.ts
    formalization-service.ts
    verification-service.ts
    research-engine.ts
    team-research-coordinator.ts
    experiment-service.ts
    literature-service.ts
    branch-service.ts
    research-query-service.ts

  evaluation/
    real-research-eval.ts
    research-case-runner.ts
    research-report.ts

packages/computation/src/
  index.ts
  policy.ts
  sandbox.ts
  environment.ts
  platform/
    macos-sandbox.ts
    linux-sandbox.ts
    unavailable.ts

packages/retrieval/src/
  evaluation/
    metrics.ts
    paired-analysis.ts
    downstream.ts
    report.ts

benchmarks/
  real-research-v1/
    manifest.json
    cases/
  retrieval-v3/
    manifest.json

scripts/
  real-research-eval.ts
  retrieval-v3-eval.ts
  security-sandbox-smoke.ts
  release-check.ts
```

`packages/core/src/mathos.ts` silinmeyecek.

Facade olarak kalacak.

---

# 7. Veri Modeli, Şema ve State Tasarımı

## Experiment origin

Yeni alan:

```ts
type ExperimentOrigin =
  | "TRUSTED_BUILTIN"
  | "USER_AUTHORED"
  | "MODEL_GENERATED"
```

Experiment table:

```text
origin TEXT NOT NULL
sandbox_mode TEXT
network_policy TEXT
execution_policy_version TEXT
```

## Experiment security outcome

Yeni entity:

```ts
interface ExperimentSecurityReport {
  experimentId: string
  sandboxAvailable: boolean
  sandboxBackend: string | null
  networkAllowed: boolean
  filesystemMode: string
  timeoutMs: number
  outputLimitBytes: number
  blockedReason: string | null
}
```

## Real benchmark run

```ts
interface ResearchBenchmarkRun {
  id: string
  fixtureVersion: string
  gitRevision: string
  modelProvider: string
  modelName: string
  leanVersion: string
  mathlibRevision: string
  startedAt: string
  finishedAt: string
}
```

## Benchmark case result

```ts
interface ResearchBenchmarkCaseResult {
  caseId: string
  category: string
  result:
    | "KERNEL_VERIFIED"
    | "FORMALIZED_ONLY"
    | "BLOCKED"
    | "FAILED"
    | "TIMEOUT"

  modelCalls: number
  leanCalls: number
  proofAttempts: number
  wallClockMs: number
}
```

---

# 8. Veri Akışları ve Senaryo Diyagramları

## Secure experiment

```text
Research Planner
      |
      v
RUN_EXPERIMENT
      |
      v
ResearchEngine
      |
      v
ExperimentService
      |
      v
ExperimentPolicy
      |
      +---- DENY ----> BLOCKED
      |
      v
SandboxRuntime.inspect()
      |
      +---- unavailable ----> BLOCKED
      |
      v
Create isolated temp workspace
      |
      v
Execute Python
      |
      v
Validate output
      |
      v
Persist result
      |
      v
COMPUTATIONALLY_SUPPORTED
```

Asla:

```text
Experiment result -> KERNEL_VERIFIED
```

olmamalı.

## Formal verification

```text
Claim
  |
  v
Formalization
  |
  v
Fidelity review
  |
  v
Human approval
  |
  v
Proof attempt
  |
  v
Lean kernel
  |
  v
Axiom audit
  |
  v
VerificationGate
  |
  +--- FAIL --> previous epistemic status
  |
  +--- PASS --> KERNEL_VERIFIED
```

---

# 9. API, Event ve Interface Sözleşmeleri

MathOS public facade mümkün olduğunca geriye uyumlu kalacak.

Örnek:

```ts
await mathos.runExperiment(...)
await mathos.verify(...)
await mathos.runResearch(...)
await mathos.startTeam(...)
```

Facade:

```ts
class MathOS {
  verify(id: string) {
    return this.verificationService.verify(id)
  }
}
```

## Yeni event'ler

```text
EXPERIMENT_POLICY_EVALUATED
EXPERIMENT_SANDBOX_BLOCKED
EXPERIMENT_SANDBOX_STARTED
EXPERIMENT_SANDBOX_FINISHED

VERIFICATION_GATE_STARTED
VERIFICATION_GATE_FINISHED

REAL_RESEARCH_BENCHMARK_STARTED
REAL_RESEARCH_BENCHMARK_FINISHED
```

Event metadata secret içermemeli.

---

# 10. Fonksiyon, Metot ve Tip İmzaları

## ExperimentPolicy

```ts
evaluateExperimentPolicy(
  input: ExperimentPolicyInput
): ExperimentPolicyDecision
```

## Sandbox

```ts
inspectSandbox(): Promise<SandboxCapability>
```

```ts
executeSandboxed(
  request: SandboxedExecutionRequest
): Promise<ComputationalExecutionResult>
```

## Verification

```ts
verifyClaim(
  claimId: string
): Promise<VerificationReport>
```

## Research

```ts
stepResearch(
  runId: string
): Promise<ResearchStep>
```

## Team

```ts
stepTeam(
  sessionId: string
): Promise<MultiAgentRound>
```

```ts
applyImport(
  importId: string
): Promise<ArtifactImport>
```

## Benchmark

```ts
runResearchBenchmark(
  manifest: ResearchBenchmarkManifest
): Promise<ResearchBenchmarkReport>
```

---

# 11. Hata Yönetimi, Uç Durumlar ve Dayanıklılık

## Sandbox unavailable

Model generated:

```text
BLOCK
```

Trusted builtin:

policy'ye göre host execution mümkün olabilir.

User-authored:

default:

```text
BLOCK unless explicitly enabled
```

## Timeout

Child process terminate edilmeli.

Mümkünse process group kapatılmalı.

## Output overflow

Output truncate edilmeli.

Result:

```text
OUTPUT_TRUNCATED
```

audit metadata'da tutulmalı.

## Invalid structured computation result

Status:

```text
INCONCLUSIVE
```

## Sandbox crash

Research run:

```text
BLOCKED
```

veya:

```text
FAILED
```

Policy kararına göre.

Asla otomatik unsafe fallback yapılmamalı.

## SQLite busy

Mevcut busy timeout korunmalı.

Retry yalnız safe/idempotent read paths için uygulanmalı.

## Event append failure

Mutation sonrası event append başarısızlığı reconciliation gerektiren bir durum olarak raporlanmalı.

Sessizce devam edilmemeli.

---

# 12. Güvenlik, Gizlilik ve Uyumluluk

## Threat model

### Varlıklar

- workspace files
- SSH keys
- shell config
- API keys
- source code
- personal documents
- Git repositories
- Lean projects

### Tehdit aktörleri

- malicious model output
- prompt injection via literature
- malformed imported artifact
- buggy experiment
- compromised external model

## Kritik saldırı yüzeyi

```text
MODEL_GENERATED → Python
```

## Güvenlik kuralları

### Environment

Model process'e aktarılmamalı:

```text
HOME
SSH_AUTH_SOCK
AWS_*
GITHUB_*
OPENAI_*
ANTHROPIC_*
MATHOS_API_KEY
TOKEN
SECRET
KEY
```

Sandbox process HOME:

```text
<temporary sandbox home>
```

olmalı.

### Filesystem

Sandbox yalnız:

```text
sandbox/work/
```

yazabilmeli.

Workspace source gerekiyorsa explicit readonly copy yapılmalı.

### Network

Model-generated experiments:

```text
NETWORK_DENY
```

default.

Environment değişkeni tek başına güvenlik sınırı değildir.

### Executables

Allowlist:

```text
python3
```

Başka executable çağrılarına sandbox seviyesinde izin verilmemeli.

### Code size

Önerilen default:

```text
64 KB
```

### Runtime

Default:

```text
10 seconds
```

Maximum:

```text
60 seconds
```

### Output

Default:

```text
1 MB stdout
1 MB stderr
```

---

# 13. Bağımlılıklar ve Entegrasyonlar

Mümkün olduğunca yeni npm dependency ekleme.

Sandbox platform adapter'ları standard OS primitive'leri ile kurulmalı.

Yeni dependency gerekiyorsa:

- neden gerekli
- license
- maintenance
- security surface
- fallback

dokümante edilmeden eklenmemeli.

Docker zorunlu dependency yapılmamalı.

---

# 14. Uygulama Yol Haritası

# FAZ 0 — Baseline Freeze

## Amaç

Mevcut davranışı kayıt altına almak.

## Task 0.1

Çalıştır:

```bash
bun install
bun run typecheck
bun test
bun run release-check
```

Sonuçları:

```text
artifacts/baseline/
```

altına kaydet.

## Task 0.2

Mevcut retrieval benchmark sonuçlarını freeze et.

## Task 0.3

Git revision kaydet.

## Kabul

Başlangıç durumunun hangi testlerde geçtiği/kırıldığı kesin bilinmeli.

---

# FAZ 1 — Critical Experiment Security

Bu faz bitmeden diğer büyük feature geliştirilmemeli.

## Task 1.1 — Experiment origin

Domain'e:

```text
TRUSTED_BUILTIN
USER_AUTHORED
MODEL_GENERATED
```

ekle.

Migration yaz.

## Task 1.2 — Experiment policy

`packages/computation/src/policy.ts`

oluştur.

## Task 1.3 — Sandbox interface

`SandboxRuntime` oluştur.

## Task 1.4 — macOS sandbox

macOS için gerçek sandbox backend oluştur.

## Task 1.5 — Network isolation

Model-generated experiment network erişimini gerçek OS policy ile kapat.

## Task 1.6 — Filesystem isolation

Temporary working root dışını inaccessible veya read-only hale getir.

## Task 1.7 — Environment sanitization

Host HOME ve secrets child process'e aktarılmamalı.

## Task 1.8 — Fail-closed fallback

Sandbox yok:

```text
MODEL_GENERATED -> blocked
```

## Task 1.9 — Security tests

Testler:

```text
experiment cannot read ~/.ssh
experiment cannot read parent workspace secret fixture
experiment cannot access model API key
experiment cannot connect network
experiment timeout terminates child
experiment output is bounded
experiment cannot escape cwd
sandbox unavailable blocks model code
trusted builtin still executes
```

## Exit gate

Faz 1 PASS olmadan Faz 2 final kabul edilmez.

---

# FAZ 2 — Core Architectural Decomposition

## Kural

Big-bang rewrite yapılmayacak.

Her servis extraction sonrası tüm mevcut testler çalışmalı.

## Task 2.1 — VerificationService

İlk ayrıştırılacak servis.

Neden:

Epistemik trust boundary.

## Task 2.2 — FormalizationService

Formal creation + fidelity.

## Task 2.3 — ExperimentService

Yeni sandbox ile birleştir.

## Task 2.4 — LiteratureService

## Task 2.5 — ResearchEngine

Single-agent loop ayrıştır.

## Task 2.6 — TeamResearchCoordinator

## Task 2.7 — BranchService

## Task 2.8 — ResearchQueryService

TUI read models burada.

## Task 2.9 — MathOS facade

MathOS:

- dependency composition
- backward compatible public API
- service delegation

ile sınırlanmalı.

## Target

`mathos.ts` mümkünse:

```text
< 50 KB
```

hedeflenmeli.

Bu kesin release condition değil.

Asıl kriter responsibility reduction.

---

# FAZ 3 — Verification Trust Regression

## Amaç

Refactor sırasında epistemik güven modelinin değişmediğini kanıtlamak.

Test matrisi:

```text
sorry -> reject
admit -> reject
unsafe -> reject
custom axiom -> reject
stale formal -> reject
non-human-approved fidelity -> reject
Lean compile failure -> reject
toolchain unpinned -> reject

all checks PASS -> KERNEL_VERIFIED
```

Ek invariant test:

Repo genelinde:

```text
KERNEL_VERIFIED
```

assignment noktalarını tarayan static test yaz.

Allowlist yalnız:

```text
VerificationService / VerificationGate
```

içermeli.

---

# FAZ 4 — Persistence & Event Consistency Hardening

## Amaç

SQLite + JSONL dual-write riskini yönetmek.

## Task 4.1

Mutation lifecycle belirle.

Önerilen:

```text
DB transaction
   ↓
DB event row
   ↓
commit
   ↓
JSONL projection append
```

JSONL authoritative state olmayacak.

SQLite canonical state olacak.

## Task 4.2

JSONL projection append başarısızlığı durumunda:

```text
EVENT_PROJECTION_DEGRADED
```

state üret.

## Task 4.3

Rebuild command ekle:

```text
mathos events rebuild
```

SQLite event table'dan JSONL yeniden üretilebilmeli.

## Task 4.4

Event health:

```text
mathos doctor
```

projection drift göstermeli.

## Test

Crash injection:

```text
before DB mutation
after DB mutation before event row
after DB transaction
before JSONL append
after JSONL append
```

Recovery deterministic olmalı.

---

# FAZ 5 — Real Mathematical Capability Benchmark V1

Bu MathOS'un en önemli araştırma ölçüm katmanı olacak.

## Amaç

Infrastructure correctness'ten gerçek problem-solving performance'i ayırmak.

## Dataset

İlk sürüm:

```text
40–60 problems
```

Kategori:

```text
elementary algebra
natural numbers
lists
finite sets
basic order
logic
functions
simple combinatorics
intro number theory
```

Open problem kullanılmayacak.

Her fixture:

- natural statement
- expected formal target
- domain
- difficulty
- known proof exists
- required concepts
- benchmark provenance

içermeli.

## Execution

Her case:

```text
fresh workspace
fresh research run
fixed budget
real model
real Lean
real retrieval
```

## Metrics

### Primary

```text
KernelVerifiedRate
```

### Secondary

```text
FormalizationSuccessRate
FidelityApprovalRequiredRate
ProofCompileRate
MedianProofAttempts
MedianModelCalls
MedianLeanCalls
MedianWallClock
BlockedRate
TimeoutRate
```

## Critical rule

Real-model benchmark:

**CI/release hard blocker değildir.**

Çünkü nondeterministic.

Sadece regression signal.

---

# FAZ 6 — Retrieval V3 Research Program

## Amaç

Premise retrieval'i bilimsel yöntemle geliştirmek.

## Baseline

Mevcut frozen V2 korunacak.

Asla overwrite etme.

Yeni:

```text
retrieval-holdout-v3
```

## Dataset leakage guard

Candidate algorithm geliştirilirken holdout gold labels doğrudan tuning için kullanılmamalı.

Development ve holdout ayrılmalı.

## Candidate channels

Sırayla deney:

1. lexical declaration/name
2. formal goal token overlap
3. type-head matching
4. namespace/context
5. semantic operator profile
6. dependency neighborhood
7. theorem metadata
8. lightweight embedding channel

Hepsi aynı anda production'a eklenmemeli.

## Evaluation metrics

```text
candidate recall
top200
inspect30
final20
Hit@1
Hit@5
Hit@10
MRR
latency
```

Ek:

```text
DownstreamProofSuccess@K
```

çok önemli.

Çünkü retrieval'ın amacı rank değil proof başarısı.

## Promotion gate

Candidate production'a ancak:

```text
Hit@10 non-decreasing
MRR materially non-negative
no major domain regression
no complete regression
latency acceptable
downstream proof success non-decreasing
```

ise alınmalı.

Aksi halde:

```text
REJECT
```

veya:

```text
INCONCLUSIVE
```

---

# FAZ 7 — Multi-Agent Research Quality

Yeni agent sayısı ekleme.

Mevcut agent sistemini iyileştir.

## Task 7.1

Independent checker gerçek semantics kazansın.

Checker:

- proof output üretmek yerine
- candidate result critique etsin.

## Task 7.2

Shared digest yalnız verified/unverified ayrımını korusun.

## Task 7.3

Duplicate research detection.

Ajanlar aynı yaklaşımı tekrar ederse:

```text
LOW_ASSIGNMENT_DIVERSITY
```

veya repetition.

## Task 7.4

Import invariants.

Her import:

```text
source verified
source current
target compatible
target reverified
```

olmadan final state'e geçmemeli.

---

# FAZ 8 — TUI Research UX Hardening

Yeni ekran eklemeye çalışma.

Mevcut akışı daha anlaşılır yap.

## Home

Göster:

```text
Objective
Epistemic status
Research state
Open blockers
Last meaningful progress
Environment readiness
```

## Claim detail

Açıkça:

```text
WHY VERIFIED
```

veya:

```text
WHY NOT VERIFIED
```

## Experiment UI

Mutlaka:

```text
MODEL GENERATED CODE
SANDBOXED
NETWORK DENIED
NOT A PROOF
```

gibi trust labels göster.

## Literature UI

Mutlaka:

```text
EXTERNAL SOURCE
NOT A PROOF
```

## Team UI

Verified/unverified findings görsel olarak ayrılmalı.

---

# FAZ 9 — Portability & Path Cleanup

Hard-coded:

```text
$HOME/...
```

gibi test paths kaldır.

## Test workspace helper

Yeni helper:

```ts
createTestWorkspace()
```

kullan.

## macOS

Supported.

## Linux

Doctor detection ekle.

Ancak release claim:

```text
UNTESTED
```

kalsın.

## Windows

Bu fazda:

```text
NOT_TESTED
```

kalsın.

---

# FAZ 10 — Release Gate Rebuild

Mevcut placeholder build gate kaldır.

## package.json

Gerçek script:

```json
"typecheck": "bunx tsc --noEmit -p tsconfig.json"
```

korunmalı.

Build ya gerçek bundle/build yapmalı ya da release gate'ten build kavramı çıkarılmalı.

Fake build PASS kabul edilmeyecek.

## Yeni release-check

Sıra:

```text
1 version
2 typecheck
3 unit/integration tests
4 verification trust tests
5 sandbox security tests
6 migrations
7 schema-too-new
8 fresh-init
9 backup-restore
10 secret-redaction
11 event-rebuild
12 package-smoke
13 Lean smoke
14 research regression
15 UX regression
16 retrieval regression
```

## Çıktı

```json
{
  "version": "...",
  "gitRevision": "...",
  "checks": [],
  "ready": true
}
```

## Rule

Eksik check:

```text
FAIL
```

olmalı.

Silent skip yok.

Platform-specific optional check açıkça:

```text
SKIPPED_UNSUPPORTED_PLATFORM
```

olabilir.

---

# FAZ 11 — Fresh User Pilot Validation

Gerçek temiz workspace ile:

```bash
mathos init pilot
cd pilot
mathos doctor
mathos
```

Akış:

```text
create conjecture
set objective
formalize
approve fidelity
search premise
attempt proof
verify
run experiment
search literature
create branch
start team
pause
reopen
backup
restore
report
```

Her adım manuel pilot checklist'e yazılmalı.

---

# 15. Test Stratejisi ve Test Matrisi

## Unit

- domain parsers
- experiment policy
- sandbox policy
- retrieval scoring
- gate rules

## Integration

- SQLite
- event projection
- Lean
- Python sandbox
- VCS

## Security

- filesystem escape
- secret access
- network
- subprocess
- timeout
- output abuse

## Regression

- verification authority
- branch isolation
- import reverify
- claim statuses
- backup restore

## Performance

Sadece anlamlı alanlarda:

- retrieval latency
- graph context
- DB scale
- multi-agent bounded concurrency

Gereksiz microbenchmark üretme.

---

# 16. Gözlemlenebilirlik ve Operasyon

Doctor'a ekle:

```text
Experiment Sandbox
Sandbox Backend
Network Isolation
Python Runtime
Lean Runtime
Mathlib
Model Provider
Retrieval Index
Event Projection Health
DB Schema Epoch
```

Research run raporu:

```text
steps
model calls
Lean calls
proof attempts
experiments
literature searches
wall clock
stop reason
```

---

# 17. Release, Migration ve Rollback Planı

## Migration

Yeni schema alanları additive migration ile eklenmeli.

Migration:

- idempotent
- transaction wrapped
- versioned

olmalı.

## Rollback

Database destructive rollback yapılmayacak.

Forward migration tercih edilmeli.

## Code rollback

Her faz ayrı commit/PR olacak şekilde uygulanmalı.

Önerilen commit sınırları:

```text
phase-1-sandbox
phase-2-core-services
phase-3-verification-trust
phase-4-event-consistency
phase-5-real-benchmark
phase-6-retrieval-v3
phase-7-team-quality
phase-8-tui-hardening
phase-9-portability
phase-10-release-gate
```

---

# 18. Riskler, Karar Kayıtları ve Açık Noktalar

## Risk 1

Sandbox implementation platform-dependent olabilir.

Karar:

Fail-closed.

## Risk 2

Core refactor regression yaratabilir.

Karar:

Incremental extraction.

## Risk 3

Benchmark overfitting.

Karar:

Dev/holdout separation.

## Risk 4

Real-model benchmark nondeterminism.

Karar:

Release hard gate değil.

## Risk 5

Retrieval metric improvement gerçek proof başarısına dönüşmeyebilir.

Karar:

DownstreamProofSuccess metriği.

## Risk 6

Multi-agent maliyetinin kalite kazancından fazla olması.

Karar:

Single vs multi-agent paired benchmark.

---

# 19. Uygulamaya Geçiş İçin Net Sonraki Adım

Kodlama ajanı şu sırayı değiştirmeden ilerlemelidir:

```text
0 Baseline freeze
        ↓
1 Experiment security
        ↓
2 Core decomposition
        ↓
3 Verification trust regression
        ↓
4 Persistence/event recovery
        ↓
5 Real mathematical benchmark
        ↓
6 Retrieval V3
        ↓
7 Multi-agent quality
        ↓
8 TUI hardening
        ↓
9 Portability
        ↓
10 Release gate
        ↓
11 Pilot validation
```

## Birinci uygulanacak gerçek task

İlk kod değişikliği:

> `ExperimentOrigin + ExperimentPolicy + SandboxRuntime` foundation.

Sebep:

Mevcut sistemde en ciddi risk model kaynaklı Python execution'dır.

Core refactor dahil hiçbir mimari iyileştirme bu güvenlik açığından daha öncelikli değildir.

---

# SON KABUL KAPISI — MATHOS 0.2 READY

Aşağıdaki tüm maddeler sağlanmadan MathOS 0.2 tamamlandı denmemeli.

## Security

- [ ] Model-generated Python sandbox dışında çalışmıyor.
- [ ] Sandbox unavailable → fail closed.
- [ ] Host HOME child process'e aktarılmıyor.
- [ ] Secret environment aktarılmıyor.
- [ ] Network model experiments için gerçekten kapalı.
- [ ] Filesystem escape testi geçiyor.
- [ ] Timeout process'i öldürüyor.

## Architecture

- [ ] VerificationService ayrıldı.
- [ ] FormalizationService ayrıldı.
- [ ] ExperimentService ayrıldı.
- [ ] ResearchEngine ayrıldı.
- [ ] TeamResearchCoordinator ayrıldı.
- [ ] LiteratureService ayrıldı.
- [ ] MathOS facade delegation yapıyor.
- [ ] Public API regression testleri geçiyor.

## Epistemic trust

- [ ] `KERNEL_VERIFIED` yalnız VerificationGate'ten geliyor.
- [ ] `sorry` reject.
- [ ] `admit` reject.
- [ ] custom axiom reject.
- [ ] stale formal reject.
- [ ] fidelity approval yok → reject.
- [ ] compile fail → reject.

## Research

- [ ] Real research benchmark V1 var.
- [ ] Gerçek Lean kullanıyor.
- [ ] Gerçek model kullanabiliyor.
- [ ] Frozen benchmark manifest var.
- [ ] Harness ve model quality raporları ayrılmış.

## Retrieval

- [ ] V3 evaluation framework var.
- [ ] Holdout immutable.
- [ ] Paired regression var.
- [ ] Downstream proof success ölçülüyor.
- [ ] Promotion gate var.
- [ ] Benchmark geçmeyen feature production'a alınmıyor.

## Reliability

- [ ] SQLite canonical state.
- [ ] JSONL projection recoverable.
- [ ] Event rebuild çalışıyor.
- [ ] Crash/reconcile testleri geçiyor.
- [ ] Backup/restore geçiyor.

## Portability

- [ ] Hard-coded geliştirici home path kalmadı; taşınabilir örneklerde `$HOME/...` kullanılıyor.
- [ ] Test workspace temp/repo-relative.
- [ ] macOS clean environment smoke geçiyor.

## Release

- [ ] `bun run typecheck` PASS.
- [ ] `bun test` PASS.
- [ ] Gerçek release-check PASS.
- [ ] Placeholder build PASS kaldırıldı.
- [ ] Lean smoke PASS.
- [ ] Sandbox security smoke PASS.
- [ ] Fresh-init PASS.
- [ ] Package smoke PASS.
- [ ] Backup/restore PASS.
- [ ] Secret-redaction PASS.

---

# UYGULAMA AJANINA SON TALİMAT

Bu planı uygularken aşağıdaki ilkeler bağlayıcıdır:

1. Mevcut çalışan özellikleri yeniden yazma; incremental refactor yap.
2. VerificationGate'i gevşetme.
3. `KERNEL_VERIFIED` statüsünü hiçbir model veya heuristic'e bağlama.
4. Fake Lean sonucunu model quality metriği olarak sunma.
5. Computation sonucunu proof olarak sunma.
6. Literature sonucunu proof olarak sunma.
7. Sandbox başarısız olduğunda unsafe fallback yapma.
8. Benchmark başarısızlığını feature flag veya config ile gizleme.
9. Retrieval fixture'larına özel hard-coded tuning yapma.
10. Yeni abstraction yalnız gerçek sorumluluk ayrımı sağlıyorsa ekle.
11. Gereksiz dependency ekleme.
12. Gereksiz test çoğaltma; kritik trust boundary, regression ve kullanıcı akışlarını test et.
13. Her faz sonunda ilgili testleri çalıştır.
14. Finalde tüm local validation suite'i çalıştır.
15. Başarısız test varken görevi tamamlanmış olarak raporlama.
16. Repo veya kullanıcı dosyalarına destructive işlem yapma.
17. Migration'larda veri kaybı yaratma.
18. Eski workspace'lerin açılabilirliğini koru.
19. Her production claim'i çalıştırılmış kanıtla destekle.
20. Son raporda yapılan değişiklikleri, çalıştırılan testleri, PASS/FAIL durumlarını ve kalan gerçek açıkları ayrı ayrı belirt.

**Final hedef:** MathOS 0.2 daha fazla özellik içeren bir MathOS değil; **daha güvenilir, daha ölçülebilir, daha modüler ve gerçek matematik araştırmasına daha hazır bir MathOS** olmalıdır.
