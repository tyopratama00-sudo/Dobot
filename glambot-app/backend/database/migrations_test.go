package database

import (
	"testing"

	"photobooth/database/dbtest"
)

func freshDB(t *testing.T) {
	t.Helper()
	if err := Init(dbtest.Schema(t)); err != nil {
		t.Fatalf("init: %v", err)
	}
	t.Cleanup(Close)
}

func restart(t *testing.T) {
	t.Helper()
	if err := runMigrations(DB); err != nil {
		t.Fatalf("migrations: %v", err)
	}
}

func exec(t *testing.T, query string, args ...interface{}) {
	t.Helper()
	if _, err := DB.Exec(query, args...); err != nil {
		t.Fatalf("exec %q: %v", query, err)
	}
}

func vipPrices(t *testing.T) (base, print int) {
	t.Helper()
	if err := DB.QueryRow(`SELECT base_price, print_unit_price FROM packages WHERE code = 'vip'`).Scan(&base, &print); err != nil {
		t.Fatalf("read vip: %v", err)
	}
	return base, print
}

// Mode Gratis seperti yang disimpan handler: backup untuk semua paket lalu harga 0.
func enterFreeMode(t *testing.T) {
	t.Helper()
	exec(t, `INSERT INTO app_settings (key, value)
		SELECT 'free_mode_backup', json_object_agg(id, json_build_array(base_price, print_unit_price))::text FROM packages`)
	exec(t, `UPDATE packages SET base_price = 0, print_unit_price = 0`)
}

func TestFreshInstallGetsVipPrintPrice(t *testing.T) {
	freshDB(t)
	if _, print := vipPrices(t); print != 15000 {
		t.Fatalf("vip print price = %d, want 15000", print)
	}
}

func TestAdminZeroPrintPriceSurvivesRestart(t *testing.T) {
	freshDB(t)
	exec(t, `UPDATE packages SET print_unit_price = 0`)
	restart(t)
	if _, print := vipPrices(t); print != 0 {
		t.Fatalf("restart overwrote admin print price: %d", print)
	}
}

func TestFreeModeSurvivesRestart(t *testing.T) {
	freshDB(t)
	enterFreeMode(t)
	restart(t)
	restart(t)
	if base, print := vipPrices(t); base != 0 || print != 0 {
		t.Fatalf("vip after restart in free mode = %d/%d, want 0/0", base, print)
	}
}

// Kondisi database yang terkena bug: Mode Gratis aktif, penanda belum ada, dan
// restart lama sudah menaikkan harga cetak vip.
func TestRestartHealsFreeModeDamagedByOldBackfill(t *testing.T) {
	freshDB(t)
	enterFreeMode(t)
	exec(t, `DELETE FROM app_settings WHERE key = 'print_price_backfilled'`)
	exec(t, `UPDATE packages SET print_unit_price = 15000 WHERE code = 'vip'`)
	var before string
	if err := DB.QueryRow(`SELECT value FROM app_settings WHERE key = 'free_mode_backup'`).Scan(&before); err != nil {
		t.Fatal(err)
	}

	restart(t)

	if base, print := vipPrices(t); base != 0 || print != 0 {
		t.Fatalf("vip not healed: %d/%d", base, print)
	}
	var after string
	if err := DB.QueryRow(`SELECT value FROM app_settings WHERE key = 'free_mode_backup'`).Scan(&after); err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Fatalf("backup changed: %q -> %q", before, after)
	}
}

// Mode Gratis pada database yang belum pernah dipenuhi backfill: tidak boleh
// terisi selama aktif, dan penanda mencegahnya terisi setelah dimatikan. vip
// sengaja tidak ada di backup supaya pemulihan harga tidak menutupi backfill.
func TestFreeModeBeforeMarkerDoesNotBackfill(t *testing.T) {
	freshDB(t)
	exec(t, `DELETE FROM app_settings WHERE key = 'print_price_backfilled'`)
	exec(t, `UPDATE packages SET base_price = 0, print_unit_price = 0`)
	exec(t, `INSERT INTO app_settings (key, value) VALUES ('free_mode_backup', '{}')`)
	restart(t)
	if _, print := vipPrices(t); print != 0 {
		t.Fatalf("backfill ran during free mode: %d", print)
	}

	exec(t, `DELETE FROM app_settings WHERE key = 'free_mode_backup'`)
	restart(t)
	if _, print := vipPrices(t); print != 0 {
		t.Fatalf("backfill ran after free mode: %d", print)
	}
}

// Paket tanpa salinan di backup tidak punya tempat kembali, jadi harganya dijaga.
func TestRestartKeepsPriceOfPackageOutsideBackup(t *testing.T) {
	freshDB(t)
	enterFreeMode(t)
	exec(t, `INSERT INTO packages (code, name, base_price, duration_secs, print_unit_price, is_active)
		VALUES ('baru', 'Baru', 50000, 600, 5000, 1)`)
	restart(t)
	var base int
	if err := DB.QueryRow(`SELECT base_price FROM packages WHERE code = 'baru'`).Scan(&base); err != nil {
		t.Fatal(err)
	}
	if base != 50000 {
		t.Fatalf("price of package outside backup = %d, want 50000", base)
	}
}
