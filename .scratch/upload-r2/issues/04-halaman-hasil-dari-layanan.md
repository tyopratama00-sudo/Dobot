# 04: Halaman Hasil dibuat layanan (start + publish)

**What to build:** Ikuti Referensi API pay.photorobot.id v1.0 (pelengkap Panduan Integrasi v4.0). Layanan sekarang menolak upload `index.html` (`invalid_key`) dan membuat Halaman Hasil sendiri. Booth tidak lagi menyusun halaman: saat compose, booth memanggil `POST /v1/sessions/{id}/start` dan menyimpan link-nya (QR langsung siap, halaman "sedang diproses"), lalu mengunggah strip, foto, dan GIF lewat presign, lalu memanggil `POST /v1/sessions/{id}/publish` (setelah strip, dan sekali lagi setelah GIF). Email Foto tetap dikirim booth sendiri, jadi publish dipanggil tanpa email. Mock gateway mengikuti aturan validasi referensi (key, content type, ukuran, order, session, expiry) dan punya start/publish.

Spec: `.scratch/upload-r2/spec.md` (bagian halaman buatan booth digantikan tiket ini). Glossary: Halaman Hasil.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Booth tidak pernah meminta presign untuk `index.html`.
- [ ] Compose memanggil start dan menyimpan link-nya; QR siap walaupun upload strip gagal.
- [ ] Publish dipanggil setelah strip terunggah dan setelah finalisasi (GIF); sesi ditandai tersinkron hanya kalau semua file terunggah dan publish berhasil.
- [ ] Retry job menyusulkan start, upload, dan publish setelah layanan pulih.
- [ ] Session ID dikirim huruf kecil.
- [ ] Mock gateway: start, publish (halaman galeri + email disimpan di `mock-uploads/_email/`), validasi seperti produksi.
