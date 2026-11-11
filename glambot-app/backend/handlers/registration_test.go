package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"photobooth/config"
	"photobooth/database"
)

type registrationReply struct {
	SessionID    string    `json:"session_id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	RegisteredAt time.Time `json:"registered_at"`
}

// paidSession membuat sesi vip lalu menandainya lunas, seperti alur pembayaran.
func paidSession(t *testing.T) string {
	t.Helper()
	s := createVipSession(t, 1)
	if _, err := database.DB.Exec(`UPDATE sessions SET status = 'paid', expires_at = ? WHERE id = ?`, time.Now().Add(72*time.Hour).UTC(), s.ID); err != nil {
		t.Fatal(err)
	}
	return s.ID
}

func saveRegistration(t *testing.T, sessionID, name, email string) (int, registrationReply, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"name": name, "email": email})
	r := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(string(body)))
	rc := chi.NewRouteContext()
	rc.URLParams.Add("sessionID", sessionID)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	SaveSessionRegistration(w, r)
	var res struct {
		Data  registrationReply `json:"data"`
		Error string            `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	return w.Code, res.Data, res.Error
}

// storedRegistration membaca registrasi yang tersimpan di baris sesi.
func storedRegistration(t *testing.T, sessionID string) (name, email string, at *time.Time) {
	t.Helper()
	if err := database.DB.QueryRow(`SELECT registration_name, registration_email, registered_at FROM sessions WHERE id = ?`, sessionID).Scan(&name, &email, &at); err != nil {
		t.Fatal(err)
	}
	return name, email, at
}

func TestRegistrationIsSavedOnThePaidSession(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)

	code, got, msg := saveRegistration(t, id, "  Rina Putri ", " Rina@Gmail.com ")
	if code != http.StatusOK {
		t.Fatalf("save: %d %s", code, msg)
	}
	if got.SessionID != id || got.Name != "Rina Putri" || got.Email != "rina@gmail.com" || got.RegisteredAt.IsZero() {
		t.Fatalf("reply = %+v", got)
	}
	name, email, at := storedRegistration(t, id)
	if name != "Rina Putri" || email != "rina@gmail.com" || at == nil {
		t.Fatalf("stored = %q %q %v", name, email, at)
	}
}

func patchSettings(t *testing.T, body string) (int, timerConfig, string) {
	t.Helper()
	w := httptest.NewRecorder()
	AdminUpdateSettings(w, httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body)))
	var cfg timerConfig
	_ = json.Unmarshal(w.Body.Bytes(), &cfg)
	var res struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	return w.Code, cfg, res.Error
}

func publicConfig(t *testing.T) timerConfig {
	t.Helper()
	w := httptest.NewRecorder()
	GetAppConfig(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("config: %d %s", w.Code, w.Body)
	}
	var cfg timerConfig
	if err := json.Unmarshal(w.Body.Bytes(), &cfg); err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestRegistrationSwitchRefusesToTurnOnWithoutEmail(t *testing.T) {
	isolatedDB(t)
	code, _, msg := patchSettings(t, `{"registrationEnabled":true}`)
	if code != http.StatusConflict || !strings.Contains(msg, "email") {
		t.Fatalf("enable without email: %d %q", code, msg)
	}
	if publicConfig(t).RegistrationEnabled {
		t.Fatal("registration shown although it was refused")
	}
	// Mematikan tetap boleh tanpa email.
	if code, cfg, msg := patchSettings(t, `{"registrationEnabled":false}`); code != http.StatusOK || cfg.RegistrationEnabled {
		t.Fatalf("disable: %d %q %+v", code, msg, cfg)
	}
}

func TestRegistrationSwitchOnWithEmailShowsInPublicConfig(t *testing.T) {
	isolatedDB(t)
	if publicConfig(t).RegistrationEnabled {
		t.Fatal("registration must be off by default")
	}
	configureEmail(t)
	code, cfg, msg := patchSettings(t, `{"registrationEnabled":true}`)
	if code != http.StatusOK || !cfg.RegistrationEnabled {
		t.Fatalf("enable: %d %q %+v", code, msg, cfg)
	}
	if !publicConfig(t).RegistrationEnabled {
		t.Fatal("public config hides registration that is on")
	}
	// Kredensial email dicabut (mis. .env diubah lalu restart): booth tidak
	// boleh meminta email yang tidak akan terkirim.
	config.App.SMTPAppPassword = ""
	if publicConfig(t).RegistrationEnabled {
		t.Fatal("public config shows registration without a configured mailer")
	}
}

func TestRegistrationTimerIsATimerSetting(t *testing.T) {
	isolatedDB(t)
	if got := publicConfig(t).Timeouts["registrationSeconds"]; got != 120 {
		t.Fatalf("default registrationSeconds = %d", got)
	}
	if code, cfg, msg := patchSettings(t, `{"timeouts":{"registrationSeconds":90}}`); code != http.StatusOK || cfg.Timeouts["registrationSeconds"] != 90 {
		t.Fatalf("set: %d %q %+v", code, msg, cfg.Timeouts)
	}
	if code, _, _ := patchSettings(t, `{"timeouts":{"registrationSeconds":5}}`); code != http.StatusBadRequest {
		t.Fatalf("out of range accepted: %d", code)
	}
	if got := publicConfig(t).Timeouts["registrationSeconds"]; got != 90 {
		t.Fatalf("public registrationSeconds = %d", got)
	}
}

func TestRegistrationUpdateReplacesNameAndEmailButKeepsTheTime(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)
	_, first, _ := saveRegistration(t, id, "Rina", "rina@gmai.com")

	code, got, msg := saveRegistration(t, id, "Rina P", "rina@gmail.com")
	if code != http.StatusOK {
		t.Fatalf("update: %d %s", code, msg)
	}
	if got.Name != "Rina P" || got.Email != "rina@gmail.com" || !got.RegisteredAt.Equal(first.RegisteredAt) {
		t.Fatalf("update = %+v, first = %+v", got, first)
	}
	if name, email, _ := storedRegistration(t, id); name != "Rina P" || email != "rina@gmail.com" {
		t.Fatalf("stored = %q %q", name, email)
	}
}

func TestRegistrationRejectsInvalidData(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)
	for _, c := range []struct{ name, email string }{
		{"", "rina@gmail.com"},
		{"   ", "rina@gmail.com"},
		{strings.Repeat("a", 81), "rina@gmail.com"},
		{"Rina", ""},
		{"Rina", "rina"},
		{"Rina", "rina@gmail"},
		{"Rina", "@gmail.com"},
		{"Rina", "ri na@gmail.com"},
	} {
		if code, _, msg := saveRegistration(t, id, c.name, c.email); code != http.StatusBadRequest || msg == "" {
			t.Errorf("%q %q: %d %q", c.name, c.email, code, msg)
		}
	}
	if name, email, at := storedRegistration(t, id); name != "" || email != "" || at != nil {
		t.Fatalf("invalid data was stored: %q %q %v", name, email, at)
	}
}

func TestRegistrationRefusedAfterExpiry(t *testing.T) {
	isolatedDB(t)
	cleanedUp := paidSession(t)
	if _, err := database.DB.Exec(`UPDATE sessions SET status = 'expired' WHERE id = ?`, cleanedUp); err != nil {
		t.Fatal(err)
	}
	pastExpiry := paidSession(t)
	if _, err := database.DB.Exec(`UPDATE sessions SET status = 'completed', expires_at = ? WHERE id = ?`, time.Now().Add(-time.Minute).UTC(), pastExpiry); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{cleanedUp, pastExpiry} {
		if code, _, msg := saveRegistration(t, id, "Rina", "rina@gmail.com"); code != http.StatusGone {
			t.Errorf("%s: %d %s", id, code, msg)
		}
	}
}

func TestRegistrationNeedsAPaidSession(t *testing.T) {
	isolatedDB(t)
	unpaid := createVipSession(t, 1)
	if code, _, msg := saveRegistration(t, unpaid.ID, "Rina", "rina@gmail.com"); code != http.StatusConflict {
		t.Fatalf("unpaid: %d %s", code, msg)
	}
	if code, _, _ := saveRegistration(t, "tidak-ada", "Rina", "rina@gmail.com"); code != http.StatusNotFound {
		t.Fatalf("unknown session: %d", code)
	}
	// Sesi gratis yang sudah dikonfirmasi (lunas Rp0) boleh registrasi.
	setFreeMode(t, true)
	free := paidSession(t)
	if code, _, msg := saveRegistration(t, free, "Rina", "rina@gmail.com"); code != http.StatusOK {
		t.Fatalf("free: %d %s", code, msg)
	}
}
