# Glambot Photo Booth

Booth foto berlengan robot: pelanggan membayar (atau gratis), robot memotret dari beberapa sudut, lalu pelanggan memilih frame, mengedit, mencetak, dan mengunduh fotonya.

## Language

**Pelanggan**:
Orang yang memakai booth dalam satu sesi. Tidak disimpan sebagai data tersendiri: setiap kunjungan berdiri sendiri lewat registrasinya.
_Avoid_: Member, user, akun

**Registrasi**:
Nama dan email yang wajib diisi pelanggan untuk satu sesi, ditambah nomor WhatsApp yang boleh dikosongkan, sebagai jalur cadangan pengiriman foto dan catatan kunjungan. Bukan pembuatan akun, dan registrasi dari sesi berbeda tidak digabung walau emailnya sama.
_Avoid_: Akun, pendaftaran akun, sign up, data member

**Email Foto**:
Email yang dikirim ke alamat di registrasi setelah foto sesi siap, berisi link folder foto dan strip foto final. Dikirim ke setiap registrasi, sudah atau belum scan QR.
_Avoid_: Notifikasi, newsletter, email promo
