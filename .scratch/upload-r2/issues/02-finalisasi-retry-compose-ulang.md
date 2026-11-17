# 02: Finalisasi, retry job, dan compose ulang

**What to build:** Setelah GIF selesai, GIF (slideshow dan live strip) serta foto raw yang belum terunggah dikirim ke R2, lalu Halaman Hasil versi akhir (tanpa catatan GIF sedang disiapkan, dengan GIF dan tombol unduhnya). Sesi ditandai tersinkron ke R2 hanya kalau semua file berhasil dan sesi tidak di-compose ulang selama upload berlangsung. Retry job tiap menit menyusulkan sesi selesai yang belum tersinkron (umur lebih dari 90 detik, belum kedaluwarsa, maksimal 3 per putaran). Compose ulang mereset penanda sinkron R2, dan strip baru menimpa strip lama.

Spec: `.scratch/upload-r2/spec.md`.

**Blocked by:** 01 (Upload R2 sampai QR siap)

**Status:** resolved — selesai di 96a1bc5

- [x] Finalisasi mengunggah `slideshow.gif`, `live-strip.gif` (`image/gif`), foto yang tertinggal, dan `index.html` versi akhir, lalu sesi ditandai tersinkron ke R2.
- [x] `index.html` versi akhir menampilkan GIF dan tombol unduhnya, dan tidak lagi memuat catatan GIF sedang disiapkan.
- [x] Kalau satu upload gagal, sesi tidak ditandai tersinkron; retry job menyelesaikannya setelah gateway pulih.
- [x] Compose ulang selama finalisasi berjalan tidak membuat sesi ditandai tersinkron.
- [x] Compose ulang mereset penanda sinkron R2.
- [x] Retry job hanya mengambil sesi yang memenuhi syarat umur, kedaluwarsa, dan batas per putaran.

## Comments

- Hasil review: penanda "compose yang ini" kini diambil saat compose (`RETURNING completed_at`) dan dibawa ke finalisasi, jadi finalisasi compose lama tidak bisa menandai sesi tersinkron. Ada tes plus cek mutasi.
- Setiap file meminta presign tepat sebelum diunggah dengan tenggat 5 menitnya sendiri, tidak berbagi satu tenggat untuk seluruh finalisasi.
- Retry job memakai konstanta sendiri (nilainya sama dengan Drive). Batas 3 sesi per putaran belum diuji otomatis; query-nya sama dengan retry job Drive.
- Finalisasi menunggu Halaman Hasil versi awal selesai, supaya versi awal tidak pernah menimpa versi akhir.
