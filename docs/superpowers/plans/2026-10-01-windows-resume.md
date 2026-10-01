# MathOS Windows doğrulama ve hata düzeltme planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Görevleri aşağıdaki kontrol listesiyle takip et.

**Goal:** 28 Eylül devrindeki Windows test ve masaüstü doğrulama işlerini güncel kanıtla kapatmak.

**Architecture:** Ürün davranışını değiştirmeden önce hataları yeniden üret. Testlerdeki taşınabilirlik ve kaynak ömrü sorunlarını düzelt; gerçek Lean/Mathlib eksiklerini ayrıca hazırla. Grafik ve asistan akışını ayrı deneme çalışma alanında kontrol et.

**Tech Stack:** Bun 1.4.2, TypeScript, React/Vite, Tauri/WebView2, Lean/Mathlib.

**Spec:** `docs/assistant-bugfix-2026-09-28.md` ve Beyin MathOS Log 28 Eylül devri.

## Global Constraints

- Kullanıcının çalışma alanlarını ve mevcut Cargo.lock/Cargo.toml farklarını koru.
- Testi atlayarak hatayı gizleme; ortam gereksinimini ve gerçek doğrulamayı ayrı raporla.
- Anlam onayı ve Lean kernel yetkisini koru.
- Alt ajan sonuçlarını ana ajan komut çıktısıyla doğrula.

## Review Focus

- Windows yolları ve PATH ayırıcısı.
- Assertion veya timeout sonrası açık SQLite, alt süreç ve çalışma dizini kalmaması.
- Lean komutunun bulunması ile Mathlib hazır olmasının ayrımı.
- Windows'ta zorla sonlandırılan Atlas'ın oturum bağlantısı dosyası.
- Gerçek WebView2 sonucu ile tarayıcı geliştirme köprüsü sonucunun ayrımı.

## Görevler

- [x] Güncel `bun test` hatalarını kaydet ve sınıflandır (ilk koşu uzun alt süreçler nedeniyle durduruldu; tam sonuç son koşudan alınacak).
- [x] Lean testlerinin yol/PATH sorunlarını odaklı RED/GREEN koşularıyla düzelt (Lean alt ajanı).
- [x] Literatür ve alignment testlerinin kaynak/timeout sorunlarını düzelt (test temizliği alt ajanı).
- [x] Windows'ta Atlas'ın zarif kapanış testini taşınabilir hale getir (üretim kapanış kodu değişmedi).
- [x] Gerçek Lean/Mathlib ortamını doğrula (paylaşılan kurulum zaten hazır; yeniden indirme gerekmedi).
- [x] Kök/masaüstü typecheck, build ve tam test paketini çalıştır: 982 geçti, 13 atlandı, 0 hata; exit 0.
- [x] Tauri grafik ve anlam onayı/ispat akışını deneme çalışma alanında doğrula: L-003 KERNEL_VERIFIED, yeniden açılışta kalıcı.
- [x] Danışman incelemesi ve sonuç raporu: `docs/windows-validation-2026-10-01.md`; önemli alt süreç temizleme yarışı giderildi.
- [x] Beyin devrini güncelle: `111180dbc380` ve `mathos-lean-tests-windows-20261001` devirleri kapatıldı.
