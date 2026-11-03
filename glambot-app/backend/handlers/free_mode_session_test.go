package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"photobooth/config"
	"photobooth/database"
	"photobooth/database/dbtest"
	"photobooth/models"
)

// isolatedDB memakai schema sekali pakai dan mengembalikan DB/config global
// sesudahnya, supaya tes lain dalam paket ini tidak ikut berpindah database.
func isolatedDB(t *testing.T) (restart func()) {
	t.Helper()
	url := dbtest.Schema(t)
	prevDB, prevApp := database.DB, config.App
	t.Cleanup(func() {
		database.Close()
		database.DB, config.App = prevDB, prevApp
	})
	config.App = &config.Config{PaymentExpiryMins: 2}
	restart = func() {
		t.Helper()
		if err := database.Init(url); err != nil {
			t.Fatalf("init: %v", err)
		}
	}
	restart()
	return restart
}

func setFreeMode(t *testing.T, on bool) {
	t.Helper()
	w := httptest.NewRecorder()
	AdminSetFreeMode(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"enabled":`+strconv.FormatBool(on)+`}`)))
	if w.Code != http.StatusOK {
		t.Fatalf("free-mode %v: %d %s", on, w.Code, w.Body)
	}
}

func createVipSession(t *testing.T, printCount int) models.Session {
	t.Helper()
	var id int
	if err := database.DB.QueryRow(`SELECT id FROM packages WHERE code = 'vip'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	body := `{"packageId":` + strconv.Itoa(id) + `,"printCount":` + strconv.Itoa(printCount) + `}`
	w := httptest.NewRecorder()
	CreateSession(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
	if w.Code != http.StatusCreated {
		t.Fatalf("create session: %d %s", w.Code, w.Body)
	}
	var res struct {
		Data models.Session `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res.Data
}

func TestCreateSessionChargesPricesOutsideFreeMode(t *testing.T) {
	isolatedDB(t)
	s := createVipSession(t, 2)
	if s.FinalPrice != s.Price+2*s.PrintUnitPrice || s.PrintUnitPrice == 0 {
		t.Fatalf("final %d, price %d, print %d", s.FinalPrice, s.Price, s.PrintUnitPrice)
	}
}

func TestCreateSessionIsFreeEvenWhenPackageTableIsNot(t *testing.T) {
	isolatedDB(t)
	setFreeMode(t, true)
	if _, err := database.DB.Exec(`UPDATE packages SET base_price = 65000, print_unit_price = 15000 WHERE code = 'vip'`); err != nil {
		t.Fatal(err)
	}

	s := createVipSession(t, 3)
	if s.FinalPrice != 0 || s.Price != 0 || s.PrintUnitPrice != 0 || s.PrintCount != 1 {
		t.Fatalf("session = final %d price %d print %d count %d", s.FinalPrice, s.Price, s.PrintUnitPrice, s.PrintCount)
	}

	var stored int
	if err := database.DB.QueryRow(`SELECT final_price FROM sessions WHERE id = ?`, s.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != 0 {
		t.Fatalf("stored final price = %d", stored)
	}
}

func TestCreateSessionFreeDigitalOnlyHasNoPrint(t *testing.T) {
	isolatedDB(t)
	setFreeMode(t, true)
	if err := upsertAppSettings(map[string]string{keyFreeDigitalOnly: "1"}); err != nil {
		t.Fatal(err)
	}
	if s := createVipSession(t, 3); s.PrintCount != 0 || s.FinalPrice != 0 {
		t.Fatalf("count %d final %d", s.PrintCount, s.FinalPrice)
	}
}

// Skenario bug lengkap: restart saat Mode Gratis tidak membuat sesi jadi berbayar,
// dan mematikan Mode Gratis mengembalikan harga semula.
func TestFreeModeSurvivesRestartThenRestoresPrices(t *testing.T) {
	restart := isolatedDB(t)
	before := createVipSession(t, 1)

	setFreeMode(t, true)
	restart()
	if s := createVipSession(t, 1); s.FinalPrice != 0 {
		t.Fatalf("free session after restart costs %d", s.FinalPrice)
	}

	setFreeMode(t, false)
	restart()
	if s := createVipSession(t, 1); s.FinalPrice != before.FinalPrice || s.PrintUnitPrice != before.PrintUnitPrice {
		t.Fatalf("prices not restored: final %d want %d", s.FinalPrice, before.FinalPrice)
	}
}
