// node master-script-audio.mjs  → master-script-audio.xlsx (same folder)
import { createRequire } from 'node:module';
const XLSX = createRequire('C:/Users/WELCOME/Dobot/glambot-app/frontend/')('xlsx');

const R = 'Rekam ulang', N = 'BARU', NK = 'BARU + kode';
// [tahap, id, status, kapan, naskah, maks detik, arahan]
const rows = [
  ['1. Welcome', 'welcome_idle', R, 'Layar awal, ulang tiap 15 detik', 'Haaai! Aku Dobot, robot fotografer! Aku bisa bergerak sendiri dan memotret kamu dari banyak sudut. Penasaran? Sentuh layar, yuk!', 9, 'Ceria, ekspresif di pembuka; "Sentuh layar" jelas'],
  ['1. Welcome', 'welcome_start', R, 'Robot/layar disentuh', 'Yeay, ayo mulai! Caranya gampang banget: bayar, pilih frame, bergaya bareng aku, edit, lalu cetak. Aku pandu dari awal, ya!', 8, 'Antusias, tempo jelas saat menyebut langkah'],
  ['1. Welcome', 'welcome_maint', R, 'Booth maintenance', 'Sebentar, ya, aku lagi bersiap-siap. Booth akan siap lagi sebentar lagi. Kalau butuh bantuan, panggil petugas, ya!', 7, 'Tenang, ramah'],
  ['2. Bayar', 'pay_qty', R, 'Masuk layar bayar', 'Langkah pertama, pilih mau cetak berapa lembar. Tekan tombol plus atau minus, totalnya langsung muncul di layar.', 7, 'Memandu, jelas'],
  ['2. Bayar', 'pay_show', R, 'Setelah pay_qty', 'Lalu scan kode QRIS ini pakai e-wallet atau mobile banking kamu. Aku tungguin, ya!', 5, 'Tekan kata "QRIS"'],
  ['2. Bayar', 'pay_wait', R, '15 detik sebelum waktu bayar habis', "Masih di sana? Waktu bayarnya hampir habis. Scan sekarang, atau sentuh 'Saya masih di sini', ya!", 6, 'Sedikit mendesak, tetap ramah'],
  ['2. Bayar', 'pay_busy', R, 'Gagal membuat QR', 'Aduh, layanan pembayarannya lagi sibuk. Tunggu sebentar, lalu coba lagi, ya.', 5, 'Menenangkan'],
  ['2. Bayar', 'pay_ok', R, 'Pembayaran sukses', 'Yeay, pembayaran berhasil! Terima kasih! Sekarang kita pilih frame dulu, yuk.', 5, 'Sangat senang'],
  ['2. Bayar', 'pay_qr_expired', R, 'QR kedaluwarsa', "Yah, waktu bayarnya habis. Tenang, tekan 'Coba lagi' untuk dapat kode QR baru.", 5, 'Menenangkan'],
  ['2. Bayar', 'pay_retry', R, 'Pembayaran gagal', "Ups, pembayarannya belum masuk. Cek aplikasimu, lalu tekan 'Coba lagi', ya.", 5, 'Menenangkan'],
  ['3. Pilih frame', 'tpl_type', R, 'Masuk layar frame', 'Sekarang pilih frame! Mau berapa foto dalam satu frame? Ketuk salah satu, ya.', 5, 'Mengajak'],
  ['3. Pilih frame', 'tpl_group', R, 'Jumlah foto diketuk', "Pilihan bagus! Sekarang ketuk desain favoritmu, lalu tekan 'Pilih Frame'.", 5, 'Memuji lalu memandu'],
  ['4. Bersiap & foto', 'countdown', R, 'Layar bersiap (~4,5 detik)', 'Cari posisi yang nyaman, ya. Kamu diam saja, aku yang bergerak!', 4, 'WAJIB singkat'],
  ['4. Bersiap & foto', 'ready_next', R, 'Pindah angle (angle 2+)', 'Pindah angle! Siapkan gaya baru!', 2.5, 'Cepat, semangat'],
  ['4. Bersiap & foto', 'ready_last', R, 'Angle terakhir', 'Ini angle terakhir! Kasih gaya terbaikmu!', 2.5, 'Klimaks, semangat'],
  ['4. Bersiap & foto', 'hold_1', R, 'Setelah pose_*, sebelum 3-2-1 (acak)', 'Aba-aba siap-siap / aku hitung', 1.6, 'Countdown mulai setelah klip selesai'],
  ['4. Bersiap & foto', 'hold_2', R, 'Setelah pose_*, sebelum 3-2-1 (acak)', 'Aba-aba siap-siap / aku hitung', 2.1, 'Countdown mulai setelah klip selesai'],
  ['4. Bersiap & foto', 'hold_4', R, 'Setelah pose_*, sebelum 3-2-1 (acak)', 'Aba-aba siap-siap / aku hitung', 1.4, 'Countdown mulai setelah klip selesai'],
  ['4. Bersiap & foto', 'tiga', R, 'Hitung mundur', 'Tiga!', 0.8, 'Tegas, tanpa jeda kosong'],
  ['4. Bersiap & foto', 'dua', R, 'Hitung mundur', 'Dua!', 0.8, 'Tegas, tanpa jeda kosong'],
  ['4. Bersiap & foto', 'satu', R, 'Hitung mundur', 'Satu!', 0.8, 'Tegas, tanpa jeda kosong'],
];
const poses = [
  ['wave', 'Lambaikan tangan, sapa kameranya kayak ketemu teman lama!', 'Haii!'],
  ['grin', 'Senyum lebar! Matanya ikut senyum, ya!', 'Cheese!'],
  ['peace', 'Tanda peace! Dua jari di samping pipi!', 'Peace!'],
  ['lean', 'Santai aja, miringkan kepala sedikit ke bahu.', 'Santuy~'],
  ['shock', 'Pura-pura kaget! Mulut bentuk O, mata melotot!', 'Wooow!'],
  ['cheek', 'Tangan di pipi, tatap manis kayak lagi melamun.', 'Gemes~'],
  ['cool', 'Sok cool! Dagu sedikit naik, tatapan tenang.', 'Keren!'],
  ['thumbs', 'Dua jempol! Angkat dekat ke kamera!', 'Mantul!'],
  ['hug', 'Rapatkan bahu dengan temanmu! Sendirian? Peluk diri sendiri!', 'Bestie!'],
  ['laugh', 'Tertawa lepas! Bayangkan cerita paling lucu!', 'Hahaha!'],
  ['model', 'Gaya model! Tangan di pinggang, badan agak miring.', 'Slay!'],
  ['pout', 'Manyun imut! Bibir maju sedikit, tatap lensa.', 'Muach!'],
  ['heart', 'Bikin bentuk hati pakai tangan, sendiri atau berdua!', 'Love you!'],
  ['peek', 'Tutup satu mata, kasih senyum miring!', 'Cilukba!'],
  ['point', 'Tunjuk kamera sambil kedip!', 'Kamu!'],
  ['serious', 'Mode serius! Tatapan tajam, tanpa senyum.', 'Fokus!'],
  ['arms', 'Angkat tangan ke atas, kayak baru menang lomba!', 'Horee!'],
  ['hop', 'Tekuk lutut, siap lompat kecil!', 'Hop!'],
  ['fav', 'Kasih ekspresi favoritmu, yang paling kamu banget!', 'Senyum!'],
  ['free', 'Bebas berkreasi! Gaya apa aja, terserah kamu!', 'Bebas!'],
];
for (const [k, tip] of poses) rows.push(['4. Bersiap & foto', 'pose_' + k, R, 'Arahan pose (setelah ready_*)', tip, 4, 'Jelas, memandu gerakan']);
for (const [k, , snap] of poses) rows.push(['4. Bersiap & foto', 'snap_' + k, R, 'Tepat saat jepret', snap, 1, 'Meledak, energik']);
rows.push(
  ['5. Review', 'review_show', R, 'Masuk layar review', "Ini dia hasil fotomu! Ketuk foto untuk lihat lebih dekat. Ada yang kurang pas? Kamu bisa ulang beberapa angle, jumlahnya ada di layar. Kalau sudah, tekan 'Lanjut'.", 10, 'Bangga, memandu'],
  ['5. Review', 'review_retake', R, 'Tombol ulang', 'Oke, kita ulang angle ini! Siap-siap gaya lagi, ya!', 3.5, 'Semangat'],
  ['5. Review', 'review_ok', R, 'Tombol Lanjut', 'Mantap! Sekarang pilih foto yang mau dicetak.', 3, 'Memuji'],
  ['6. Pilih foto', 'pick_show', R, 'Masuk layar pilih foto', "Ketuk foto favoritmu sampai semua kotak frame terisi. Bingung? Tekan 'Pilih otomatis', biar aku yang pilihkan!", 7, 'Memandu'],
  ['6. Pilih foto', 'pick_add', R, 'Foto dipilih (juga di review)', 'Pilihan bagus!', 1.5, 'Reaksi singkat'],
  ['6. Pilih foto', 'pick_remove', R, 'Pilihan dibatalkan', 'Oke, dibatalkan.', 1.5, 'Reaksi singkat'],
  ['6. Pilih foto', 'pick_full', R, 'Semua slot terisi', "Lengkap! Tekan 'Lanjut', yuk!", 2, 'Reaksi singkat'],
  ['6. Pilih foto', 'pick_auto', R, 'Pilih otomatis', 'Sudah aku pilihkan! Mau ganti? Ketuk aja fotonya.', 3, 'Ramah'],
  ['6. Pilih foto', 'pick_clear', R, 'Hapus pilihan', 'Kosong lagi! Pilih ulang, yuk.', 2, 'Reaksi singkat'],
  ['6. Pilih foto', 'pick_ok', R, 'Tombol Lanjut', 'Sip! Saatnya menghias fotomu!', 2, 'Semangat'],
  ['7. Edit', 'edit_show', R, 'Masuk layar edit', 'Selamat datang di studio edit! Ketuk foto di frame untuk memilih. Geser untuk atur posisi, cubit untuk zoom, putar dua jari untuk memutar. Coba juga filternya, ya!', 10, 'Memandu, tempo sedang'],
  ['7. Edit', 'edit_flip', R, 'Tombol Balik', 'Dibalik!', 1, 'Reaksi singkat'],
  ['7. Edit', 'edit_rotate', R, 'Tombol Putar 90°', 'Diputar!', 1, 'Reaksi singkat'],
  ['7. Edit', 'edit_crop', R, 'Tombol Potong', 'Lebih dekat!', 1, 'Reaksi singkat'],
  ['7. Edit', 'edit_reset', R, 'Tombol Reset', 'Kembali seperti semula!', 1.5, 'Reaksi singkat'],
  ['7. Edit', 'edit_bright_up', NK, 'Tombol Terang +', 'Lebih terang!', 1, 'Kode: hapus pengecualian brightness di flow.ts:690'],
  ['7. Edit', 'edit_bright_down', NK, 'Tombol Terang −', 'Agak redup!', 1, 'Kode: hapus pengecualian brightness di flow.ts:690'],
  ['7. Edit', 'flt_original', R, 'Filter Asli', 'Natural, asli!', 1, 'Reaksi singkat'],
  ['7. Edit', 'flt_warm', R, 'Filter Hangat', 'Hangat!', 1, 'Reaksi singkat'],
  ['7. Edit', 'flt_cool', R, 'Filter Dingin', 'Sejuk!', 1, 'Reaksi singkat'],
  ['7. Edit', 'flt_mono', R, 'Filter Mono', 'Hitam putih, klasik!', 1.5, 'Reaksi singkat'],
  ['7. Edit', 'flt_soft', R, 'Filter Lembut', 'Lembut!', 1, 'Reaksi singkat'],
  ['7. Edit', 'edit_warn', R, '15 detik sebelum waktu edit habis', 'Masih di sana? Kalau tidak ada yang disentuh, aku lanjut cetak otomatis, ya.', 5, 'Mengingatkan'],
  ['7. Edit', 'edit_ok', R, 'Tombol Selesai', 'Keren! Kita cek sekali lagi sebelum cetak.', 3, 'Memuji'],
  ['8. Final & cetak', 'final_show', R, 'Masuk layar final', "Cek dulu, ya: frame, jumlah cetak, dan fotomu. Kalau sudah pas, tekan 'Cetak dan Simpan'. Mau ubah? Tekan 'Kembali'.", 8, 'Memandu'],
  ['8. Final & cetak', 'final_ok', R, 'Tombol Cetak', 'Siap! Aku kirim ke printer sekarang!', 2.5, 'Semangat'],
  ['8. Final & cetak', 'print_wait', R, 'Sedang mencetak', 'Fotomu sedang dicetak. Tunggu sebentar, ya, jangan ke mana-mana!', 4, 'Sabar, ramah'],
  ['8. Final & cetak', 'print_done', R, 'Cetak sukses', 'Selesai! Ambil cetakanmu di mesin cetak, ya!', 3, 'Senang'],
  ['8. Final & cetak', 'print_fail', NK, 'Cetak gagal', 'Waduh, printernya lagi bermasalah. Tenang, fotomu aman. Petugas akan bantu cetak ulang, dan foto digital tetap bisa diambil lewat QR.', 7, 'Kode: tambah PRINT_FAILED di App.tsx:44'],
  ['8. Final & cetak', 'qr_show', R, 'Layar QR', "Foto digitalmu sudah siap! Scan QR ini pakai kamera HP untuk lihat dan unduh fotomu, termasuk versi animasinya. Sudah? Tekan 'Selesai'.", 9, 'Memandu'],
  ['8. Final & cetak', 'thanks', R, 'Layar terima kasih', 'Terima kasih sudah foto bareng aku! Jangan lupa bawa cetakanmu, ya. Ajak temanmu lain kali. Sampai jumpa!', 7, 'Hangat, penutup'],
  ['9. Sistem', 'err_general', R, 'Ada error', 'Ada kendala kecil. Tenang, fotomu tersimpan aman. Petugas akan segera membantu.', 5, 'Menenangkan'],
  ['9. Sistem', 'err_reconnect', R, 'Koneksi server putus', 'Sebentar, ya, aku sedang menyambung ulang. Fotomu tetap aman.', 4, 'Menenangkan'],
  ['9. Sistem', 'idle_warn', NK, '15 detik sebelum timeout (frame, review, pilih foto, final, QR)', 'Masih di sana? Sentuh layar kalau masih mau lanjut, ya!', 3.5, 'Kode: putar di App.tsx:81-82'],
);
['Wiii! Geli!', 'Makasih, ya!', 'Eh, kaget!', 'Mantap! Lanjut, yuk!', 'Ayo goyang!', 'Cekrek! Peace!'].forEach((t, i) =>
  rows.push(['10. Maskot', `tap_${i + 1}`, R, 'Maskot diketuk (bergilir 1-6)', t, 1.5, 'Lucu, spontan']));

const head = ['No', 'Tahap', 'ID / Nama file', 'Status', 'Kapan diputar', 'Naskah', 'Maks durasi (detik)', 'Arahan / catatan', 'Sudah direkam? (isi: Ya/Belum)', 'Durasi hasil (detik)'];
const main = XLSX.utils.aoa_to_sheet([head, ...rows.map((r, i) => [i + 1, r[0], r[1] + '.mp3', r[2], r[3], r[4], r[5], r[6], '', ''])]);
main['!cols'] = [5, 18, 22, 13, 34, 80, 10, 40, 16, 12].map((wch) => ({ wch }));
main['!autofilter'] = { ref: `A1:J${rows.length + 1}` };

const info = XLSX.utils.aoa_to_sheet([
  ['Master Script Audio – Dobot Photobooth (UI-DOBOT)'],
  [],
  ['Cara pakai'],
  ['1. Rekam tiap baris di sheet "Master Script", simpan dengan nama persis di kolom "ID / Nama file".'],
  ['2. Simpan ke C:\\Users\\WELCOME\\Dobot\\audio\\ lalu salin ke UI-DOBOT\\apps\\booth\\public\\audio\\.'],
  ['3. Isi kolom "Sudah direkam?" dan "Durasi hasil". Durasi hasil tidak boleh melebihi "Maks durasi".'],
  [],
  ['Status'],
  ['Rekam ulang', 'File sudah ada, rekam ulang dengan naskah baru'],
  ['BARU + kode', 'File belum ada dan butuh perubahan kode agar diputar'],
  [],
  ['Teknis rekaman'],
  ['Format', 'MP3 mono, 44.1 kHz, minimal 128 kbps'],
  ['Nama file', 'huruf kecil + garis bawah, persis sesuai ID (Linux peka huruf besar/kecil)'],
  ['Jeda', 'Potong hening di awal & akhir klip'],
  ['Volume', 'Seragam antar klip'],
  ['Timing foto', 'Persiapan mengikuti audio: ready_* + pose_* + hold_*, lalu 3-2-1. Batas cadangan 15 detik (SEQUENCE_PREP_SEC di glambot-app\\dobot\\.env)'],
  [],
  ['Contoh baris terisi'],
  ['ready_next.mp3', 'Pindah angle! Siapkan gaya baru!', 'Sudah direkam: Ya', 'Durasi hasil: 2.3'],
]);
info['!cols'] = [{ wch: 18 }, { wch: 80 }, { wch: 20 }, { wch: 18 }];

const todo = XLSX.utils.aoa_to_sheet([
  ['Jenis', 'Item', 'Lokasi', 'Keterangan'],
  ['Hapus file', 'pay_fail.mp3', 'apps/booth/public/audio', 'Tidak dipakai kode'],
  ['Hapus file', 'pay_lunas.mp3', 'apps/booth/public/audio', 'Tidak dipakai kode'],
  ['Hapus file', 'pick_print.mp3', 'apps/booth/public/audio', 'Tidak dipakai kode'],
  ['Hapus file', 'review_take.mp3', 'apps/booth/public/audio', 'Tidak dipakai kode'],
  ['Hapus file', 'review_title.mp3', 'apps/booth/public/audio', 'Tidak dipakai kode'],
  ['Hapus file', 'tpl_show.mp3', 'apps/booth/public/audio', 'Tidak dipakai kode'],
  ['Ubah kode', 'edit_bright_up / down', 'apps/booth/src/flow.ts:690', 'Hapus pengecualian brightness'],
  ['Ubah kode', 'print_fail', 'apps/booth/src/App.tsx:44', 'Putar saat status PRINT_FAILED'],
  ['Ubah kode', 'idle_warn', 'apps/booth/src/App.tsx:81-82', 'Putar di layar tpl, review, pick, final, qr'],
  ['Ubah teks', 'Pose free', 'packages/shared/src/poses.ts:19', 'Hapus "Ini angle terakhir" (pose diacak)'],
  ['Ubah teks', '"Sentuh robot"', 'apps/booth/src/screens/Welcome.tsx:38,72', 'Ganti jadi "Sentuh layar" agar sama dengan audio'],
  ['Cek', 'Masa berlaku link QR', 'backend Go / Google Drive', 'Pastikan sebelum disebut di qr_show'],
]);
todo['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 42 }, { wch: 50 }];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, info, 'Panduan');
XLSX.utils.book_append_sheet(wb, main, 'Master Script');
XLSX.utils.book_append_sheet(wb, todo, 'Tindak Lanjut');
XLSX.writeFile(wb, new URL('./master-script-audio.xlsx', import.meta.url).pathname.slice(1));
console.log(rows.length, 'baris');
