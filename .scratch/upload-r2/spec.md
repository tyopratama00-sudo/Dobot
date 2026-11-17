# Upload hasil sesi ke Cloudflare R2

Status: ready-for-agent

Sumber: panduan "Pembayaran QRIS & Upload R2 lewat pay.photorobot.id" v3.0 (12 November 2026), bagian 4. Istilah mengikuti `GLOSSARY.md` (Pelanggan, Email Foto, Halaman Hasil). Pekerjaan 1 dari panduan yang sama (pembayaran QRIS lewat gateway) sudah selesai dan menyediakan klien gateway, konfigurasi `PAYMENT_GATEWAY_URL`/`PAYMENT_GATEWAY_TOKEN`/`R2_UPLOAD_ENABLED`, dan mock gateway.

## Problem Statement

Hasil sesi pelanggan saat ini hanya diunggah ke Google Drive milik booth. Owner ingin memindahkannya ke bucket Cloudflare R2 milik perusahaan, yang diakses lewat layanan pay.photorobot.id, supaya foto tampil di domain perusahaan dan kiosk tidak memegang kredensial penyimpanan. Kiosk tidak boleh memegang key R2: layanan hanya memberi URL upload sementara.

Link hasil sesi juga tersebar di beberapa tempat yang semuanya mengandaikan Google Drive: QR di booth, Email Foto, pesan WhatsApp dari admin, dan halaman Sessions admin. Kalau owner mematikan Drive setelah R2 aktif dan tempat-tempat itu tidak ikut pindah, pelanggan kehilangan link fotonya. Bucket publik juga tidak menampilkan daftar isi folder, jadi pelanggan butuh satu halaman yang menampilkan semua hasilnya.

## Solution

Saat R2 aktif, booth mengunggah hasil sesi ke R2 di titik yang sama dengan upload Drive sekarang, dan membuat satu Halaman Hasil per sesi berisi strip, GIF, dan tombol unduh tiap foto. QR di booth, Email Foto, pesan WhatsApp, dan admin memakai link Halaman Hasil yang berlaku untuk sesi itu. Upload Drive tidak dijalankan selama R2 aktif. Sesi lama yang hanya punya folder Drive tetap memakai link Drive-nya.

## User Stories

1. Sebagai pelanggan, saya ingin QR di layar akhir mengarah ke Halaman Hasil sesi saya, supaya saya bisa melihat dan mengunduh foto dari ponsel.
2. Sebagai pelanggan, saya ingin QR siap segera setelah strip selesai, tanpa menunggu GIF, supaya saya tidak lama menunggu di depan booth.
3. Sebagai pelanggan, saya ingin Halaman Hasil menampilkan strip foto final di bagian atas, supaya hasil utama langsung terlihat.
4. Sebagai pelanggan, saya ingin bisa mengunduh strip, setiap foto, dan GIF dari Halaman Hasil, supaya saya menyimpan file yang saya mau.
5. Sebagai pelanggan, saya ingin Halaman Hasil memberi tahu kalau GIF masih disiapkan dan meminta saya memuat ulang halaman, supaya saya tidak mengira GIF hilang.
6. Sebagai pelanggan, saya tidak ingin melihat tombol unduh yang mengarah ke file yang belum tersedia.
7. Sebagai pelanggan, saya ingin Halaman Hasil berbahasa Indonesia dan memakai nama booth, supaya saya tahu ini foto dari booth yang saya kunjungi.
8. Sebagai pelanggan yang memilih frame ulang, saya ingin Halaman Hasil menampilkan strip versi terbaru.
9. Sebagai pelanggan, saya ingin Email Foto berisi link Halaman Hasil setelah semua file sesi saya tersedia.
10. Sebagai pelanggan, saya ingin tetap menerima Email Foto berisi strip walaupun upload ke R2 lama atau gagal.
11. Sebagai staf, saya ingin tombol Kirim via WhatsApp memakai link Halaman Hasil sesi itu, entah di R2 atau di Drive.
12. Sebagai staf, saya ingin halaman Sessions admin menampilkan link Halaman Hasil tiap sesi, supaya saya bisa membukanya untuk pelanggan yang bertanya.
13. Sebagai staf, saya ingin sesi yang selesai sebelum R2 dinyalakan tetap menampilkan dan mengirim link Drive-nya.
14. Sebagai owner, saya ingin kiosk tidak memegang key R2, supaya key hanya ada di layanan milik saya.
15. Sebagai owner, saya ingin foto tidak diunggah ke Drive dan R2 sekaligus, supaya uplink kiosk tidak terbebani dua kali.
16. Sebagai owner, saya ingin upload yang gagal karena internet putus disusulkan otomatis, supaya tidak ada sesi yang hasilnya tidak lengkap.
17. Sebagai owner, saya ingin menyalakan R2 tidak memicu upload ulang semua sesi lama, supaya uplink kiosk tidak penuh setelah deploy.
18. Sebagai owner, saya ingin R2 bisa dimatikan lewat `R2_UPLOAD_ENABLED=false` tanpa mengubah kode, supaya Drive bisa dipakai lagi sebagai cadangan.
19. Sebagai owner, saya ingin Halaman Hasil tidak memuat script atau form, karena halaman itu tampil di domain perusahaan.
20. Sebagai developer, saya ingin seluruh alur upload bisa diuji dengan mock gateway tanpa key apa pun.

## Implementation Decisions

- **Penyimpanan R2** dipakai lewat layanan pay.photorobot.id: kiosk meminta presign untuk satu key, lalu melakukan PUT langsung ke URL yang diberikan dengan header dan ukuran persis seperti presign. Kode service-nya mengikuti panduan bagian 4.2.
- **R2 aktif** berarti gateway pembayaran terkonfigurasi dan `R2_UPLOAD_ENABLED=true`.
- **Key objek** per sesi: `sessions/{session_id}/` lalu `strip.<ext>`, `foto-N.<ext>` (N berurutan menurut waktu capture, sama seperti penamaan Drive), `slideshow.gif`, `live-strip.gif`, dan `index.html`. Content type ditentukan dari ekstensi (`image/jpeg`, `image/png`, `image/gif`); `index.html` memakai `text/html; charset=utf-8`.
- **Titik upload** sama dengan Drive:
  - foto raw diunggah per capture;
  - strip dan Halaman Hasil awal diunggah segera setelah compose; setelah itu link R2 sesi disimpan, sehingga QR siap;
  - saat finalisasi (GIF selesai), GIF, foto raw yang belum terunggah, dan Halaman Hasil akhir diunggah. Sesi ditandai tersinkron ke R2 hanya kalau semuanya berhasil dan sesi tidak di-compose ulang selama upload berlangsung (guard `completed_at` seperti Drive);
  - retry job tiap menit menyusulkan sesi selesai yang belum tersinkron ke R2, umur lebih dari 90 detik, belum kedaluwarsa, maksimal 3 sesi per putaran.
- **Compose ulang** menandai sesi belum tersinkron ke R2, sama seperti Drive.
- **Skema**: kolom link R2 dan penanda sinkron R2 di sesi, serta penanda terunggah ke R2 di foto. Sesi yang sudah ada saat migrasi dianggap sudah tersinkron (tidak ada backfill); sesi baru mulai dari belum tersinkron. Ini menyimpang dari panduan, yang memberi default belum tersinkron untuk semua baris.
- **Drive dilewati selama R2 aktif**: semua titik upload Drive dan retry job Drive tidak berjalan kalau R2 aktif, walaupun kredensial Drive masih terisi. Kode Drive tetap ada sebagai cadangan.
- **Link Halaman Hasil per sesi**: link R2 sesi kalau ada, kalau tidak link Drive sesi, kalau tidak ada keduanya maka tidak ada link. Satu aturan ini dipakai oleh:
  - endpoint link QR booth (kontrak `{enabled, ready, url}` tidak berubah; `enabled` benar kalau R2 atau Drive aktif, `ready` benar kalau sesi punya link);
  - Email Foto;
  - pesan dan tombol WhatsApp di admin;
  - kolom di halaman Sessions admin.
- **Kesiapan Email Foto**: versi "link + strip" menunggu sesi tersinkron ke tempat link-nya berada (R2 untuk link R2, Drive untuk link Drive). Aturan cadangan "strip saja" setelah masa tunggu tidak berubah.
- **Masa berlaku link** di Email Foto dan WhatsApp tetap dihitung dari kedaluwarsa sesi. Penghapusan file di R2 dilakukan aturan bucket milik owner; tidak ada kode hapus R2 di cleanup.
- **Halaman Hasil** dibuat dengan template HTML yang meng-escape isi:
  - berbahasa Indonesia, memakai nama booth yang sama dengan isi Email Foto (brand label dari Pengaturan admin, atau nama bawaan);
  - berisi strip di atas, GIF (kalau sudah ada), dan tombol unduh untuk strip, setiap foto yang sudah terunggah, dan GIF; semua link relatif ke folder sesi;
  - versi sebelum GIF menampilkan catatan bahwa GIF sedang disiapkan dan halaman perlu dimuat ulang;
  - tanpa script, form, gambar base64, atau sumber pihak ketiga; ukuran jauh di bawah 1 MB.
- **Admin**: kolom "Google Drive" di detail sesi menjadi "Halaman Hasil" berisi link per sesi. Field API admin yang membawa link ikut memakai aturan link per sesi. Alasan tombol WhatsApp nonaktif tidak lagi menyebut Google Drive.

## Testing Decisions

- Tes hanya memeriksa perilaku yang terlihat dari luar: file yang sampai ke gateway (key, content type, isi), isi Halaman Hasil yang terunggah, jawaban endpoint link QR, link di Email Foto dan WhatsApp, dan data sesi di admin. Tes tidak memeriksa fungsi internal.
- Satu seam: gateway tiruan berbasis `httptest` yang menjawab presign dan menyimpan setiap PUT di memori, ditambah schema Postgres sekali pakai di `photobooth_test` (`dbtest.Schema`). Tes menjalankan titik masuk yang dipakai booth (capture, compose, finalisasi, retry job).
- Contoh yang sudah ada: tes alur pembayaran gateway (`payment_gateway_test.go` di handlers), tes Email Foto, dan tes free mode yang memakai `isolatedDB`.
- Tes tidak boleh memakai `testDB(t)` yang terhubung ke database booth sungguhan, dan dijalankan dengan filter `-run`.

## Out of Scope

- Menghapus file di R2 saat sesi kedaluwarsa (diatur aturan bucket owner).
- Memindahkan sesi lama dari Drive ke R2.
- Mengubah tampilan atau alur booth.
- Menghapus kode Drive.
- Uji nyata ke R2 (dilakukan owner setelah deploy).

## Further Notes

Catatan untuk serah terima ke owner:
- Aturan hapus otomatis bucket harus minimal sama dengan `SESSION_EXPIRY_HOURS` (sekarang 72 jam), karena Email Foto dan WhatsApp menjanjikan link berlaku sampai sesi kedaluwarsa.
- Biarkan `R2_UPLOAD_ENABLED=false` sampai R2 dinyalakan di layanan; sebelum itu presign menjawab `503 r2_not_configured`.
- Sesi yang sudah ada saat migrasi tidak diunggah ke R2.
- Selama R2 aktif, Drive tidak dipakai walaupun `GOOGLE_REFRESH_TOKEN` masih terisi.
