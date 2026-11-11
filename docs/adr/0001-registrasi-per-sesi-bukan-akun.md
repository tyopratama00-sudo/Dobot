# Registrasi disimpan per sesi, bukan sebagai akun pelanggan

Pelanggan mengisi nama dan email di setiap sesi, hanya untuk mengirim foto sesi itu dan sebagai catatan kunjungan. Karena itu registrasi melekat pada sesi, dan tidak ada tabel pelanggan atau akun yang menggabungkan kunjungan berdasarkan email. Menggabungkannya akan membuat data yang berperilaku seperti akun (riwayat per orang, satu email mewakili satu orang) tanpa ada login yang membuktikan pemiliknya, dan memperluas data pribadi melampaui tujuan yang disetujui pelanggan. Hitungan kunjungan per email cukup dikelompokkan saat ditampilkan di admin.

## Considered Options

- **Akun atau member dengan login:** ditolak. Menambah langkah dan kata sandi di kiosk, padahal tujuannya hanya mengirim foto.
- **Tabel pelanggan yang digabung per email:** ditolak. Email yang salah ketik atau dipakai bersama akan menggabungkan orang yang berbeda, dan menghapus data satu orang jadi ikut mengubah riwayat sesi lain.
