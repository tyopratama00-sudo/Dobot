package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/lib/pq"
)

type DBWrapper struct {
	inner *sql.DB
}

type TxWrapper struct {
	inner *sql.Tx
}

var DB *DBWrapper

func (d *DBWrapper) Exec(query string, args ...interface{}) (sql.Result, error) {
	return d.inner.Exec(rebindPostgres(query), args...)
}

func (d *DBWrapper) Query(query string, args ...interface{}) (*sql.Rows, error) {
	return d.inner.Query(rebindPostgres(query), args...)
}

func (d *DBWrapper) QueryRow(query string, args ...interface{}) *sql.Row {
	return d.inner.QueryRow(rebindPostgres(query), args...)
}

func (d *DBWrapper) Begin() (*TxWrapper, error) {
	tx, err := d.inner.Begin()
	if err != nil {
		return nil, err
	}
	return &TxWrapper{inner: tx}, nil
}

func (d *DBWrapper) Close() error {
	return d.inner.Close()
}

func (tx *TxWrapper) Exec(query string, args ...interface{}) (sql.Result, error) {
	return tx.inner.Exec(rebindPostgres(query), args...)
}

func (tx *TxWrapper) QueryRow(query string, args ...interface{}) *sql.Row {
	return tx.inner.QueryRow(rebindPostgres(query), args...)
}

func (tx *TxWrapper) Commit() error {
	return tx.inner.Commit()
}

func (tx *TxWrapper) Rollback() error {
	return tx.inner.Rollback()
}

func Init(databaseURL string) error {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	DB = &DBWrapper{inner: db}
	log.Printf("✅ Database connected: %s", sanitizeDatabaseURL(databaseURL))

	return runMigrations(DB)
}

func applyCompatibilityMigrations(db *DBWrapper) error {
	statements := []string{
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS package_code TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ALTER COLUMN category SET DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS final_price INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 3`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
		// Google Drive: link folder publik hasil sesi + ID folder-nya. drive_url
		// kosong = upload belum selesai/tidak aktif.
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drive_url TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drive_folder_id TEXT NOT NULL DEFAULT ''`,
		// drive_synced: semua artefak sesi (strip + GIF + foto) sudah dipastikan
		// ada di Drive. FALSE = masih ada yang gagal → retry job menyusulkannya.
		// DEFAULT-nya sengaja TRUE dulu lalu diturunkan ke FALSE: baris lama
		// (sebelum kolom ini ada) ikut ter-backfill TRUE dalam satu langkah,
		// jadi retry job tidak memborong ulang seluruh riwayat saat pertama
		// kali versi ini jalan. Sesi baru tetap mulai dari FALSE.
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS drive_synced BOOLEAN NOT NULL DEFAULT TRUE`,
		`ALTER TABLE sessions ALTER COLUMN drive_synced SET DEFAULT FALSE`,
		// Filter strip yang dipilih user saat compose. Disimpan supaya GIF live
		// bisa menerapkan filter yang sama ke burst frame (frontend bake-in filter
		// ke hasil akhir, tapi burst mentah perlu difilter ulang server-side).
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS strip_filter TEXT NOT NULL DEFAULT 'original'`,
		// photoId urut slot (boleh duplikat) — sumber kebenaran slot→foto untuk
		// GIF live; photos.selected/position tak bisa wakili 1 foto di N slot.
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS slot_photo_ids TEXT NOT NULL DEFAULT ''`,
		// Zoom/rotate/geser per slot dari photo editor, urut slot (sejajar
		// slot_photo_ids). Hasil akhir sudah baked-in di canvas export, tapi
		// burst GIF live mentah → generator butuh angkanya untuk membingkai
		// burst sama persis. Kosong = sesi lama, generator fallback cover-fit.
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS slot_transforms TEXT NOT NULL DEFAULT ''`,
		// Penanda foto raw yang sudah naik ke Drive (upload streaming per-capture)
		// — cegah dobel-upload, finalize tinggal kirim sisanya.
		`ALTER TABLE photos ADD COLUMN IF NOT EXISTS drive_uploaded BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qris_url TEXT`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS qris_raw_string TEXT`,
		`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS min_price INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS max_uses INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,

		// ─── Admin: kolom tambahan yang dibutuhkan UI admin ───────────────────
		// Packages: UI admin pakai status enum 3-nilai (active|inactive|draft).
		// DB lama hanya punya is_active 0/1 → backfill status dari is_active.
		`ALTER TABLE packages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
		`UPDATE packages SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END WHERE status IS NULL OR status = ''`,

		// Packages: harga cetak ekstra per-paket (dulu di-hardcode "vip"=15000 di
		// kode). Sessions menyimpan snapshot harganya saat sesi dibuat.
		`ALTER TABLE packages ADD COLUMN IF NOT EXISTS print_unit_price INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS print_unit_price INTEGER NOT NULL DEFAULT 0`,
		// Backfill perilaku lama (vip = 15000/cetak) HANYA jika belum ada paket
		// yang dikonfigurasi harga cetaknya — sekali jalan, tidak menimpa
		// pengaturan admin pada boot berikutnya.
		`UPDATE packages SET print_unit_price = 15000
		   WHERE code = 'vip'
		     AND NOT EXISTS (SELECT 1 FROM packages WHERE print_unit_price <> 0)`,

		// Frames: UI admin butuh frame_code, category, description, file_size.
		`ALTER TABLE frames ADD COLUMN IF NOT EXISTS frame_code TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE frames ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Standard'`,
		`ALTER TABLE frames ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE frames ADD COLUMN IF NOT EXISTS file_size TEXT NOT NULL DEFAULT ''`,
		`UPDATE frames SET frame_code = id WHERE frame_code = ''`,

		// Kategori frame kini 'Personal' (1-4 orang) / 'Group'. WHERE dibatasi ke
		// kategori lama → idempoten, tidak menimpa pilihan admin.
		`ALTER TABLE frames ALTER COLUMN category SET DEFAULT 'Personal'`,
		`UPDATE frames SET category = 'Personal' WHERE category NOT IN ('Personal', 'Group')`,

		// Admin accounts untuk login dashboard.
		`CREATE TABLE IF NOT EXISTS admins (
			id BIGSERIAL PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT 'Admin',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		// App settings key-value — dipakai admin untuk mengatur timer halaman
		// user (instruction/photo-editor/get-photos/done). Nilai disimpan sebagai
		// TEXT; handler config.go yang parse + isi default kalau key belum ada.
		`CREATE TABLE IF NOT EXISTS app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		// Cegah transaksi pending duplikat per sesi (dulu SELECT-lalu-INSERT tidak
		// atomik → 2 baris pending). 1) Rapikan data lama: sisakan pending
		// terbaru, sisanya 'expired', supaya unique index di bawah bisa dibuat.
		`UPDATE transactions t SET status = 'expired'
		   WHERE status = 'pending'
		     AND EXISTS (
		       SELECT 1 FROM transactions t2
		       WHERE t2.session_id = t.session_id
		         AND t2.status = 'pending'
		         AND (t2.created_at > t.created_at
		              OR (t2.created_at = t.created_at AND t2.id > t.id))
		     )`,
		// 2) Jaminan level DB: maksimal 1 transaksi 'pending' per sesi.
		`CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_pending_per_session
		   ON transactions (session_id) WHERE status = 'pending'`,
	}

	for _, statement := range statements {
		if _, err := db.inner.Exec(statement); err != nil {
			return err
		}
	}

	if _, err := db.inner.Exec(`
		UPDATE sessions
		SET package_code = COALESCE(package_code, ''),
		    category = COALESCE(category, package_code, ''),
		    discount = COALESCE(discount, 0),
		    final_price = COALESCE(final_price, price),
		    print_count = COALESCE(print_count, 3)
	`); err != nil {
		return err
	}

	return nil
}

func runMigrations(db *DBWrapper) error {
	schemaPaths := []string{
		"migrations/init.sql",
		"backend/migrations/init.sql",
	}

	var schemaSQL string
	for _, path := range schemaPaths {
		b, err := os.ReadFile(path)
		if err == nil {
			schemaSQL = string(b)
			break
		}
	}

	if schemaSQL == "" {
		return fmt.Errorf("migrations/init.sql not found")
	}

	if _, err := db.inner.Exec(schemaSQL); err != nil {
		return fmt.Errorf("failed to apply postgres schema: %w", err)
	}

	if err := applyCompatibilityMigrations(db); err != nil {
		return fmt.Errorf("failed to apply compatibility migrations: %w", err)
	}

	log.Println("✅ PostgreSQL schema applied")
	return nil
}

func Close() {
	if DB != nil {
		_ = DB.Close()
	}
}

func sanitizeDatabaseURL(raw string) string {
	idx := strings.Index(raw, "@")
	if idx == -1 {
		return raw
	}
	left := raw[:idx]
	if creds := strings.LastIndex(left, "://"); creds != -1 {
		return raw[:creds+3] + "***:***" + raw[idx:]
	}
	return "postgres://***:***" + raw[idx:]
}

func rebindPostgres(query string) string {
	var b strings.Builder
	b.Grow(len(query) + 16)

	arg := 1
	inSingle := false
	inDouble := false

	for i := 0; i < len(query); i++ {
		ch := query[i]

		if ch == '\'' && !inDouble {
			if inSingle && i+1 < len(query) && query[i+1] == '\'' {
				b.WriteByte(ch)
				i++
				b.WriteByte(query[i])
				continue
			}
			inSingle = !inSingle
			b.WriteByte(ch)
			continue
		}

		if ch == '"' && !inSingle {
			inDouble = !inDouble
			b.WriteByte(ch)
			continue
		}

		if ch == '?' && !inSingle && !inDouble {
			b.WriteString(fmt.Sprintf("$%d", arg))
			arg++
			continue
		}

		b.WriteByte(ch)
	}

	return b.String()
}
