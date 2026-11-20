# Glambot Photo Booth

Booth foto berlengan robot: pelanggan membayar (atau gratis), robot memotret dari beberapa sudut, lalu pelanggan memilih frame, mengedit, mencetak, dan mengunduh fotonya.

## Language

**Pelanggan**:
Orang yang memakai booth dalam satu sesi. Tidak disimpan sebagai data tersendiri: setiap kunjungan berdiri sendiri lewat registrasinya.
_Avoid_: Member, user, akun

**Registrasi**:
Nama dan email yang wajib diisi pelanggan untuk satu sesi, ditambah nomor WhatsApp yang boleh dikosongkan, sebagai jalur cadangan pengiriman foto dan catatan kunjungan. Bukan pembuatan akun, dan registrasi dari sesi berbeda tidak digabung walau emailnya sama.
_Avoid_: Akun, pendaftaran akun, sign up, data member

**Saran Email**:
Alamat pengganti yang ditawarkan booth saat domain email di registrasi kemungkinan salah ketik dari domain umum (misalnya `gmial.com` → `gmail.com`). Hanya tawaran: pelanggan boleh memakainya, memperbaiki sendiri, atau tetap memakai alamat yang diketik.
_Avoid_: Koreksi otomatis, validasi email

**Keyboard di Layar**:
Keyboard sentuh yang digambar booth untuk mengetik registrasi, Ubah email, dan kode voucher. Toggle admin: saat nonaktif, Keyboard di Layar disembunyikan dan pelanggan mengetik dengan keyboard hardware; saat aktif, keyboard hardware diabaikan. Layar sentuh tetap dipakai untuk semua tombol di kedua mode.
_Avoid_: Mode tanpa touchscreen, versi UI kedua, virtual keyboard

**Email Foto**:
Email yang dikirim ke alamat di registrasi setelah foto sesi siap, berisi link Halaman Hasil dan strip foto final. Dikirim ke setiap registrasi, sudah atau belum scan QR.
_Avoid_: Notifikasi, newsletter, email promo

**Halaman Hasil**:
Halaman tempat pelanggan melihat dan mengunduh strip, GIF, dan foto sesinya; satu per sesi, dituju oleh QR di booth, Email Foto, dan pesan WhatsApp.
_Avoid_: Folder Drive, link Drive, link download, halaman download
