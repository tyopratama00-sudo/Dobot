// Package dbtest menyiapkan schema Postgres sekali pakai untuk tes yang menulis
// data, supaya tes tidak pernah menyentuh database booth yang sebenarnya.
package dbtest

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// Schema membuat schema kosong di TEST_DATABASE_URL (nama database wajib
// berakhiran _test), memindahkan cwd ke root backend agar migrations/init.sql
// ketemu, lalu mengembalikan URL yang mengarah ke schema itu. Schema dihapus saat
// tes selesai. Tes dilewati kalau TEST_DATABASE_URL belum diset.
func Schema(t *testing.T) string {
	t.Helper()

	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL belum diset")
	}
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal("TEST_DATABASE_URL tidak valid")
	}
	if !strings.HasSuffix(strings.TrimPrefix(u.Path, "/"), "_test") {
		t.Fatal("TEST_DATABASE_URL harus menunjuk database berakhiran _test")
	}

	admin, err := sql.Open("postgres", raw)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	schema := fmt.Sprintf("t_%d", time.Now().UnixNano())
	if _, err := admin.Exec(`CREATE SCHEMA ` + schema); err != nil {
		admin.Close()
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(`DROP SCHEMA ` + schema + ` CASCADE`); err != nil {
			t.Errorf("drop schema: %v", err)
		}
		admin.Close()
	})

	_, file, _, _ := runtime.Caller(0)
	t.Chdir(filepath.Join(filepath.Dir(file), "..", ".."))

	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	return u.String()
}
