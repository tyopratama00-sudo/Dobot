# 01: Upload R2 sampai QR siap

**What to build:** Saat R2 aktif, hasil sesi pelanggan mulai diunggah ke R2 lewat layanan pay.photorobot.id (presign lalu PUT), dan QR di booth mengarah ke Halaman Hasil sesi itu begitu strip selesai. Foto raw diunggah per capture. Setelah compose, strip dan Halaman Hasil versi awal diunggah, lalu link R2 sesi disimpan. Halaman Hasil versi awal menampilkan strip, tombol unduh strip dan foto yang sudah terunggah, serta catatan bahwa GIF sedang disiapkan. Endpoint link QR memakai aturan link per sesi: R2, lalu Drive, lalu tidak ada. Selama R2 aktif, upload Drive dan retry job Drive tidak berjalan.

Keputusan (lihat spec):
- Skema baru: link R2 dan penanda sinkron R2 di sesi, penanda terunggah ke R2 di foto. Sesi yang sudah ada saat migrasi dianggap tersinkron (tanpa backfill).
- Key `sessions/{id}/strip.<ext>`, `foto-N.<ext>`, `index.html`. Content type dari ekstensi; `index.html` memakai `text/html; charset=utf-8`.
- Halaman Hasil: bahasa Indonesia, nama booth sama dengan isi Email Foto (brand label), link relatif, tanpa script/form/base64/sumber pihak ketiga, isi di-escape.

Spec: `.scratch/upload-r2/spec.md`. Glossary: Halaman Hasil.

**Blocked by:** None (can start immediately)

**Status:** resolved — selesai di aed16b5

- [x] Dengan R2 aktif, foto raw yang di-capture sampai ke gateway sebagai `foto-N` dengan content type yang benar, dan fotonya ditandai terunggah ke R2.
- [x] Setelah compose, strip dan `index.html` sampai ke gateway, dan endpoint link QR menjawab `ready: true` dengan URL publik `index.html`.
- [x] `index.html` versi awal memuat strip, tombol unduh untuk foto yang sudah terunggah saja, catatan GIF sedang disiapkan, brand label, dan tidak memuat `<script>` atau `<form>`.
- [x] Endpoint link QR: sesi tanpa link R2 tapi punya link Drive menjawab link Drive; R2 dan Drive mati menjawab `enabled: false`.
- [x] Dengan R2 aktif, tidak ada upload Drive walaupun kredensial Drive terisi.
- [x] Dengan `R2_UPLOAD_ENABLED=false`, perilaku Drive tidak berubah.
- [x] Migrasi: sesi yang sudah ada dianggap tersinkron ke R2, sesi baru belum.

## Comments

- Kriteria "tidak ada upload Drive selama R2 aktif" dijaga lewat `driveUploadsActive()` di semua titik upload Drive dan retry job Drive. Tidak ada tes otomatis: tanpa Google sungguhan tes itu akan selalu lolos.
- Hasil review: race compose ulang (kunci per sesi, strip terbaru dibaca ulang) dan nomor `foto-N` untuk foto dengan `created_at` kembar sudah diperbaiki.
- Jangan rilis tanpa tiket 02: upload strip/halaman yang gagal baru dicoba ulang oleh retry job di tiket 02.
