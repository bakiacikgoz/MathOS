# MathOS Windows doğrulaması — 1 Ekim 2026

28 Eylül devrindeki grafik ve anlam onayı/ispat akışı, gerçek Tauri/WebView2 penceresinde kontrol edildi. Ayrı `mathos-qa-20261001` çalışma alanı kullanıldı; kullanıcının araştırma kayıtları değiştirilmedi.

## Düzeltmeler

- Kök `desktop:dev` / `desktop:build` komutlarında Bun `run --cwd` sıralaması düzeltildi. Önce uygulama yerine Bun komut listesi çıkıyordu; artık Tauri komutuna ulaşılıyor.
- Lean kurulum testinin sahte çalıştırıcısı Windows `\\` yollarını da ayıklıyor; iki ağ hatası testi gerçekten hata yolunu çalıştırıyor.
- Gerçek Lean testleri, diğer testlerden yalıtılmış başlangıç ayarını yalnız kendi çalışmaları sırasında hazır ve sabitlenmiş Mathlib ortamına geçiriyor. İş bitince önceki ortam geri yükleniyor; eksik Mathlib açık hata veriyor.
- Native alt süreç PATH'i işletim sisteminin ayırıcısını kullanıyor; SQLite kaynakları assertion başarısızlığında da kapanıyor.
- Alignment CLI testi boş model yapılandırmalı ayrı süreçlerde çalışıyor; gerçek kullanıcı modeline bağlanmıyor ve ana test sürecinin cwd/stdout'unu değiştirmiyor.
- Literatür testinde açık bırakılan iki veritabanı kapatılıyor.
- Atlas testi, Windows'ta zorla sonlandırma yerine gerçek CLI'nin sinyal işleyicisini IPC üzerinden çalıştırıyor; çıkış kodu 0 ve özel oturum dosyasının silinmesi kontrol ediliyor. Windows konsolunun Ctrl+C iletimi bu testin kapsamı değildir.

## Masaüstü kanıtı

Windows Tauri derlemesi tamamlandı. WebView2'nin yerel hata ayıklama bağlantısına bağlanıldı; `window.__TAURI_INTERNALS__` mevcut olduğu doğrulandı. Tarayıcı geliştirme köprüsü kullanılmadı.

- Kart sürükleme: ızgaraya oturma ve Alt ile serbest sürükleme kontrol edildi. Serbest sürüklemede 60 px / -40 px fare hareketi aynı kart hareketini verdi; görünüm kartı izleyerek yeniden sığdırılmadı.
- Kart konumu sayfa yeniden açıldığında aynen korundu.
- Tekerlek yakınlaştırması ve boş tuval sürüklemesi çalıştı; bağlantı okları hedef kartlara ulaştı.
- Önceki büyük deneme alanı gerçek masaüstünde 101 düğüm / 230 bağlantıyla yüklendi. Burada 50 px / 20 px sürükleme yaklaşık 49,92 px / 19,92 px kart hareketi verdi; deneme sonunda önceki yerleşim tercihleri geri yüklendi.
- OpenCode Go / `gpt-6-luna` ile L-003 formalize edildi, anlam karşılaştırması MATCH döndü, sohbet içi anlam kartı onay bekledi.
- Deneme önermesi `Her doğal sayı kendisine eşittir.` ile `theorem naturalNumberEqualsSelf (n : ℕ) : n = n` eşleştirildi. Deneme amacıyla bu anlam eşleşmesi onaylandı.
- Asistan `check_proof` ile `by rfl` gövdesini denetledi. Bir ispat denemesinde KERNEL_ACCEPTED ve sonrasında KERNEL_VERIFIED elde edildi.
- Yeniden açılan sohbet sonucu korudu. Ayrı CLI `claim show L-003 --json` sonucu da HUMAN_APPROVED, verified=true, tüm doğrulama kontrolleri PASS ve axioms=[] gösterdi.
- Kontrol sonunda uygulama önceki `ispat` çalışma alanına geri döndürüldü.

Kanıtlar: `artifacts/windows-resume-20261001/` içinde grafik, anlam kartı ve doğrulanmış sohbet PNG'leri ile `verified-claim.json` bulunur.

## Komut doğrulamaları

- Kök TypeScript kontrolü: geçti.
- Masaüstü TypeScript kontrolü ve Vite üretim derlemesi: geçti.
- Kök dağıtım derlemesi: geçti.
- Masaüstü host/helper testleri: 35 geçti, 0 hata.
- Alignment, Atlas, literatür ve Lean kurulum odaklı testleri: 27 geçti, 0 hata.
- Tam test paketi: **982 geçti, 13 atlandı, 0 hata**, 995 test / 276 dosya, 5537 assertion, çıkış kodu 0. Süre 1113,69 saniye (18 dakika 34 saniye); `bun test` komutu kullanıldı.
- Gerçek çok ajanlı üç test, araştırma akışının üç Lean testi ve iki dondurulmuş teorem arama veri seti geçti. Teorem arama v2 kontrolü 173,58 saniye, v1 kontrolü 102,57 saniye sürdü.
- `git diff --check`: geçti.

Atlanan 13 testin adları tam logun sonunda kayıtlıdır: deney sandbox'ına bağlı 7 test, sabitlenmiş Mathlib ile sonlu toplam sözdizimi testi, sağlayıcı CLI durum testi, PATH'siz release komutu testi ve önceden hazırlanmış indeks gerektiren 3 retrieval validation testi. Bunlar için atlama kuralı eklenmedi. Holdout-v1'in Lean kontrolünden gereksiz indeks koşulu kaldırıldığı için önce atlanan bir gerçek kontrol artık çalışıyor.

İlk tam test denemesi, model profilini yanlışlıkla kullanan alignment timeout'u ve eski Mathlib varsayımlarıyla hata verdi; uzun pilot alt süreçleri nedeniyle durduruldu. Bu koşu tamamlanmış bir test sonucu olarak raporlanmaz.

## Sınırlar

Tauri'nin yerel bağımlılıklarında sürüm eşleşme uyarısı ve Vite'ta büyük paket uyarısı mevcut; Windows geliştirme derlemesi ve gerçek IPC akışı çalıştı. Kurulum paketi, macOS, Docker ve tüm 1.0 RC yayın kapıları bu doğrulamanın kapsamına eklenmedi. Önceden mevcut Cargo dosya farkları korundu.

Danışman incelemesindeki alt süreç kapanış yarışı giderildi. Windows masaüstü devrindeki grafik ve anlam onayı/ispat kontrolleri tamamlandı; bu rapor bütün 1.0 RC yayın kapılarının tamamlandığını iddia etmez.

## Push öncesi yayın değerlendirmesi

1 Ekim'de `bun run typecheck` tekrar çalıştırıldı ve geçti. `bun scripts/providers/security-scan.ts` 92 dosyada PASS verdi; bu tarama canlı sağlayıcı qualification'ı değildir. Önceki tam test koşusundan sonra uygulama/test kodu değişmedi.

`bun scripts/final-product-capabilities.ts` çıkış kodu 1 ve `ready: false` döndürdü. Beklenen final-revision qualification kayıtları bulunmadığı için `realModel`, `sandbox`, `vscodeHost`, `standaloneArtifact`, `windowsRuntimeEvidence` ve `macosRuntimeEvidence` kapıları açık. Bu kayıt eksikliği, yukarıda gerçekten çalıştırılan model ve WebView kontrollerini geçersiz kılmaz; onların bütün RC kapsamını karşılamadığını gösterir. Docker daemon erişilemediği için üretim sandbox'ı bu host'ta ayrıca kullanılamıyor.

Değerlendirme: mevcut geliştirme sürümü sınırlı bir Windows pilotuna aday; dağıtılabilir beta/RC için installer ve sidecar temiz makinede denenmeli. Herkese açık 1.0 yayını için aynı kaynak revizyonunda Windows/macOS, OCI sandbox güvenliği, VS Code host ve diğer zorunlu qualification kapıları tamamlanmalı. Tauri/Rust ile JavaScript bağımlılıklarının sürüm uyarısı paketlemeden önce ele alınmalı. Bu push bir release tag'i veya GitHub Release oluşturmaz; daha önce mevcut Cargo farkları commit dışında korunur.
