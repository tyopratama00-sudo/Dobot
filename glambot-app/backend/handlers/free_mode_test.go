package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"photobooth/config"
	"photobooth/database"
)

var (
	dbOnce sync.Once
	dbErr  error
)

// testDB: Postgres dari backend/.env, skip kalau tidak ada.
func testDB(t *testing.T) {
	dbOnce.Do(func() {
		if dbErr = os.Chdir(".."); dbErr != nil { // .env ada di root backend
			return
		}
		config.Load()
		dbErr = database.Init(config.App.DatabaseURL)
	})
	if dbErr != nil {
		t.Skipf("no DB: %v", dbErr)
	}
}

// Skip kalau sudah Mode Gratis.
func TestFreeModeRoundTrip(t *testing.T) {
	testDB(t)
	if cfg, _ := loadTimerConfig(); cfg.FreeMode {
		t.Skip("booth already in free mode")
	}

	prices := func() string {
		var s string
		if err := database.DB.QueryRow(`SELECT COALESCE(string_agg(id || ':' || base_price || '/' || print_unit_price, ',' ORDER BY id), '') FROM packages`).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	set := func(on string) {
		w := httptest.NewRecorder()
		AdminSetFreeMode(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"enabled":`+on+`}`)))
		if w.Code != http.StatusOK {
			t.Fatalf("free-mode %s: %d %s", on, w.Code, w.Body)
		}
	}

	before := prices()
	set("true")
	set("true") // idempotent: backup tidak tertimpa harga 0
	var nonZero int
	database.DB.QueryRow(`SELECT COUNT(*) FROM packages WHERE base_price <> 0 OR print_unit_price <> 0`).Scan(&nonZero)
	if nonZero != 0 {
		t.Fatalf("free mode left %d priced packages", nonZero)
	}
	set("false")
	if after := prices(); after != before {
		t.Fatalf("prices not restored: before %q after %q", before, after)
	}
}
