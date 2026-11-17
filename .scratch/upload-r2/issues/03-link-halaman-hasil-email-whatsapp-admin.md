# 03: Link Halaman Hasil di Email Foto, WhatsApp, dan admin

**What to build:** Email Foto, pesan dan tombol Kirim via WhatsApp, dan detail sesi di admin memakai link Halaman Hasil per sesi (R2, lalu Drive, lalu tidak ada), bukan hanya link Drive. Email Foto versi "link + strip" menunggu sesi tersinkron ke tempat link-nya berada (R2 untuk link R2, Drive untuk link Drive); aturan cadangan "strip saja" tidak berubah. Di detail sesi admin, kolom "Google Drive" menjadi "Halaman Hasil". Alasan tombol WhatsApp nonaktif tidak lagi menyebut Google Drive.

Spec: `.scratch/upload-r2/spec.md`. Glossary: Halaman Hasil, Email Foto.

**Blocked by:** 02 (Finalisasi, retry job, dan compose ulang)

**Status:** ready-for-agent

- [ ] Sesi dengan link R2 yang sudah tersinkron ke R2 mendapat Email Foto berisi link `index.html` dan strip, walaupun Drive mati.
- [ ] Sesi dengan link R2 yang belum tersinkron menunggu, lalu jatuh ke "strip saja" setelah masa tunggu seperti sekarang.
- [ ] Sesi lama yang hanya punya link Drive tetap mendapat link Drive di Email Foto dan WhatsApp.
- [ ] Link WhatsApp memakai link Halaman Hasil per sesi; tombol nonaktif dengan alasan yang tidak menyebut Google Drive kalau sesi belum punya link.
- [ ] Detail sesi admin menampilkan kolom "Halaman Hasil" berisi link per sesi.
