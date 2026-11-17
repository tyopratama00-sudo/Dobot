package database

import "testing"

// Menyalakan R2 tidak boleh membuat retry job mengunggah ulang seluruh riwayat:
// sesi yang sudah ada saat kolom R2 ditambahkan dianggap sudah tersinkron,
// sesi baru mulai dari belum tersinkron.
func TestR2ColumnsDoNotBackfillExistingSessions(t *testing.T) {
	freshDB(t)
	exec(t, `ALTER TABLE sessions DROP COLUMN IF EXISTS r2_url, DROP COLUMN IF EXISTS r2_synced`)
	exec(t, `ALTER TABLE photos DROP COLUMN IF EXISTS r2_uploaded`)
	exec(t, `INSERT INTO sessions (id, duration_secs, price, final_price, status, expires_at)
		VALUES ('lama', 60, 0, 0, 'completed', NOW() + INTERVAL '1 day')`)

	restart(t)
	exec(t, `INSERT INTO sessions (id, duration_secs, price, final_price, status, expires_at)
		VALUES ('baru', 60, 0, 0, 'completed', NOW() + INTERVAL '1 day')`)

	for id, want := range map[string]bool{"lama": true, "baru": false} {
		var url string
		var synced bool
		if err := DB.QueryRow(`SELECT r2_url, r2_synced FROM sessions WHERE id = ?`, id).Scan(&url, &synced); err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if synced != want || url != "" {
			t.Errorf("%s: r2_synced = %v, r2_url = %q; mau %v dan kosong", id, synced, url, want)
		}
	}
	restart(t) // migrasi harus aman dijalankan ulang
}
