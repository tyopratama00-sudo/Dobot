package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"photobooth/config"
	"photobooth/mailer"
	"photobooth/mailer/mailertest"
)

func emailStatus(t *testing.T) (configured bool, sender string, body string) {
	t.Helper()
	w := httptest.NewRecorder()
	AdminEmailStatus(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("email status: %d %s", w.Code, w.Body)
	}
	var res struct {
		Configured bool   `json:"configured"`
		Sender     string `json:"sender"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res.Configured, res.Sender, w.Body.String()
}

// configureEmail mengisi kredensial Gmail palsu dan memasang mailer palsu,
// supaya tes tidak pernah menghubungi Gmail.
func configureEmail(t *testing.T) *mailertest.Fake {
	t.Helper()
	config.App.SMTPUser = "booth@gmail.com"
	config.App.SMTPAppPassword = "abcd efgh ijkl mnop"
	fake := &mailertest.Fake{}
	t.Cleanup(mailer.Use(fake))
	return fake
}

func sendTestEmail(t *testing.T, to string) (code int, errText string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"to": to})
	w := httptest.NewRecorder()
	AdminSendTestEmail(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body))))
	var res struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	return w.Code, res.Error
}

func TestTestEmailIsSentToTheGivenAddress(t *testing.T) {
	isolatedDB(t)
	fake := configureEmail(t)
	if code, msg := sendTestEmail(t, "owner@example.com"); code != http.StatusOK {
		t.Fatalf("send: %d %s", code, msg)
	}
	sent := fake.Sent()
	if len(sent) != 1 {
		t.Fatalf("sent %d messages, want 1", len(sent))
	}
	m := sent[0]
	if m.To.Email != "owner@example.com" || m.Subject == "" || m.Text == "" || m.HTML == "" {
		t.Fatalf("message %+v", m)
	}
}

func TestTestEmailFailureReturnsTheErrorText(t *testing.T) {
	isolatedDB(t)
	fake := configureEmail(t)
	fake.FailNext(errors.New("535 5.7.8 Username and Password not accepted"))
	code, msg := sendTestEmail(t, "owner@example.com")
	if code != http.StatusBadGateway || !strings.Contains(msg, "Username and Password not accepted") {
		t.Fatalf("got %d %q", code, msg)
	}
}

func TestTestEmailRefusedWhenEmailIsNotConfigured(t *testing.T) {
	isolatedDB(t)
	fake := &mailertest.Fake{}
	t.Cleanup(mailer.Use(fake))
	code, msg := sendTestEmail(t, "owner@example.com")
	if code != http.StatusConflict || msg == "" {
		t.Fatalf("got %d %q", code, msg)
	}
	if len(fake.Sent()) != 0 {
		t.Fatal("sent while not configured")
	}
}

func TestTestEmailRejectsAnInvalidAddress(t *testing.T) {
	isolatedDB(t)
	fake := configureEmail(t)
	for _, to := range []string{"", "owner", "owner@example", "@example.com"} {
		if code, _ := sendTestEmail(t, to); code != http.StatusBadRequest {
			t.Errorf("%q: got %d, want 400", to, code)
		}
	}
	if len(fake.Sent()) != 0 {
		t.Fatal("sent to an invalid address")
	}
}

func TestEmailStatusNotConfiguredWithoutCredentials(t *testing.T) {
	isolatedDB(t)
	if ok, sender, _ := emailStatus(t); ok || sender != "" {
		t.Fatalf("configured %v sender %q, want not configured", ok, sender)
	}
}

func TestEmailStatusNeedsBothUserAndPassword(t *testing.T) {
	isolatedDB(t)
	config.App.SMTPUser = "booth@gmail.com"
	if ok, _, _ := emailStatus(t); ok {
		t.Fatal("configured with user only")
	}
	config.App.SMTPUser, config.App.SMTPAppPassword = "", "secret"
	if ok, _, _ := emailStatus(t); ok {
		t.Fatal("configured with password only")
	}
}

func TestEmailStatusShowsSenderWithoutPassword(t *testing.T) {
	isolatedDB(t)
	configureEmail(t)
	ok, sender, body := emailStatus(t)
	if !ok || sender != "booth@gmail.com" {
		t.Fatalf("configured %v sender %q", ok, sender)
	}
	if strings.Contains(body, "abcd") {
		t.Fatalf("status leaks password: %s", body)
	}
}
