package database

import "fmt"

// AudioTabs: urutan tab halaman Audio admin. "unused" = file lama yang tidak
// dipanggil kode booth.
var AudioTabs = []string{"welcome", "pay", "pay_free", "package", "frame", "capture", "review", "pick", "edit", "final", "qr", "system", "unused"}

type audioSeed struct {
	id, tab, when string
	secs          float64
}

var poseKeys = []string{"wave", "grin", "peace", "lean", "shock", "cheek", "cool", "thumbs", "hug", "laugh", "model", "pout", "heart", "point", "arms", "peek", "serious", "fav", "hop", "free"}

// audioSeeds = clip yang dipanggil kode booth (voice(...)). Naskah sengaja
// kosong: diisi admin. Ubah daftar ini kalau menambah/menghapus pemicu di booth.
func audioSeeds() []audioSeed {
	s := []audioSeed{
		{"welcome_idle", "welcome", "Tiap 15 detik selama halaman Welcome tampil", 6},
		{"welcome_start", "welcome", "Robot disentuh, sesi dimulai", 3},

		{"pay_show", "pay", "Masuk tahap pembayaran QRIS", 5},
		{"pay_wait", "pay", "Waktu bayar tinggal sedikit", 6},
		{"pay_busy", "pay", "Gagal membuat QR", 5},
		{"pay_ok", "pay", "Pembayaran berhasil", 4},
		{"pay_qr_expired", "pay", "QR kedaluwarsa", 5},
		{"pay_retry", "pay", "Pembayaran gagal", 5},

		{"pay_free", "pay_free", "Masuk halaman bayar Mode Gratis", 6},

		{"pay_mode", "package", "Masuk halaman pilih paket", 6},
		{"pay_qty", "package", "Setelah pay_mode, menjelaskan jumlah cetak", 6},
		{"pay_digital", "package", "Pilih paket Digital saja", 3},
		{"pay_print", "package", "Pilih paket Cetak + Digital", 3},

		{"tpl_type", "frame", "Masuk halaman frame (pilih tipe)", 5},
		{"tpl_group", "frame", "Tipe dipilih, pilih desain frame", 4},

		{"countdown", "capture", "Halaman bersiap, hitung mundur mulai", 5},
		{"ready_next", "capture", "Robot pindah ke angle berikutnya", 3},
		{"ready_last", "capture", "Robot pindah ke angle terakhir", 3},
		{"hold_1", "capture", "Setelah tips pose (acak)", 2},
		{"hold_2", "capture", "Setelah tips pose (acak)", 2},
		{"hold_4", "capture", "Setelah tips pose (acak)", 2},
		{"tiga", "capture", "Hitung mundur: 3", 1},
		{"dua", "capture", "Hitung mundur: 2", 1},
		{"satu", "capture", "Hitung mundur: 1", 1},
		{"sess_done", "capture", "Semua angle selesai", 3},
		{"sess_retake_ok", "capture", "Foto ulang tersimpan", 2},
		{"sess_skip", "capture", "Tombol SELESAI ditekan saat sesi", 3},

		{"review_show", "review", "Masuk halaman review", 5},
		{"review_retake", "review", "Tombol ulang angle ditekan", 3},
		{"review_ok", "review", "Lanjut dari review", 3},

		{"pick_show", "pick", "Masuk halaman pilih foto", 5},
		{"pick_add", "pick", "Foto ditambahkan", 2},
		{"pick_remove", "pick", "Foto dibatalkan", 2},
		{"pick_full", "pick", "Jumlah foto sudah lengkap", 3},
		{"pick_auto", "pick", "Tombol pilih otomatis", 2},
		{"pick_clear", "pick", "Tombol kosongkan pilihan", 2},
		{"pick_ok", "pick", "Lanjut ke edit", 2},

		{"edit_show", "edit", "Masuk halaman edit", 6},
		{"edit_rotate", "edit", "Tombol putar", 2},
		{"edit_flip", "edit", "Tombol balik", 2},
		{"edit_crop", "edit", "Tombol potong", 2},
		{"edit_reset", "edit", "Tombol reset", 2},
		{"edit_warn", "edit", "Waktu edit tinggal sedikit", 5},
		{"edit_ok", "edit", "Edit selesai", 2},

		{"final_show", "final", "Masuk halaman cek terakhir", 5},
		{"final_ok", "final", "Tombol cetak/simpan", 2},
		{"print_wait", "final", "Halaman cetak", 5},
		{"print_done", "final", "Cetak selesai", 3},

		{"qr_show", "qr", "Halaman QR", 6},
		{"thanks", "qr", "Halaman terima kasih", 4},

		{"welcome_maint", "system", "Halaman perawatan", 5},
		{"err_general", "system", "Halaman error", 5},
		{"err_reconnect", "system", "Koneksi terputus", 4},
		{"idle_warn", "system", "Waktu halaman tinggal sedikit (review/frame/pilih/final)", 5},

		{"pay_fail", "unused", "", 0},
		{"pay_lunas", "unused", "", 0},
		{"pick_print", "unused", "", 0},
		{"review_take", "unused", "", 0},
		{"review_title", "unused", "", 0},
		{"tpl_show", "unused", "", 0},
		{"sess_nice", "unused", "", 0},
	}
	for _, k := range poseKeys {
		s = append(s, audioSeed{"pose_" + k, "capture", "Tips pose " + k + " saat robot bersiap", 6})
	}
	for _, k := range poseKeys {
		s = append(s, audioSeed{"snap_" + k, "capture", "Jepret pose " + k, 1.5})
	}
	for i := 1; i <= 8; i++ {
		s = append(s, audioSeed{fmt.Sprintf("sess_nice_%d", i), "capture", "Pujian setelah foto (acak)", 2})
	}
	for _, k := range []string{"original", "warm", "cool", "mono", "soft"} {
		s = append(s, audioSeed{"flt_" + k, "edit", "Filter " + k + " dipilih", 2})
	}
	for i := 1; i <= 6; i++ {
		s = append(s, audioSeed{fmt.Sprintf("tap_%d", i), "system", "Robot disentuh (bergiliran)", 2})
	}
	return s
}

// seedAudioScripts: id/tab/urutan/sumber mengikuti kode; naskah, nada, durasi,
// dan keterangan pemicu yang sudah diedit admin tidak ditimpa.
func seedAudioScripts(db *DBWrapper) error {
	for i, a := range audioSeeds() {
		source := "booth"
		if a.tab == "unused" {
			source = "unused"
		}
		if _, err := db.Exec(`
			INSERT INTO audio_scripts (id, tab, sort, trigger_desc, screen_seconds, source)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET tab = EXCLUDED.tab, sort = EXCLUDED.sort, source = EXCLUDED.source`,
			a.id, a.tab, i, a.when, a.secs, source); err != nil {
			return err
		}
	}
	return nil
}
