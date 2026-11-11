package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"photobooth/mailer"
)

// adminCall memanggil handler admin sesi dengan {id} dan body JSON opsional.
func adminCall(t *testing.T, h http.HandlerFunc, method, id, body string) (int, []byte) {
	t.Helper()
	r := httptest.NewRequest(method, "/", strings.NewReader(body))
	rc := chi.NewRouteContext()
	rc.URLParams.Add("id", id)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	h(w, r)
	return w.Code, w.Body.Bytes()
}

type detailEmailFoto struct {
	Status    string     `json:"status"`
	Recipient string     `json:"recipient"`
	Attempts  int        `json:"attempts"`
	Reason    string     `json:"reason"`
	SentAt    *time.Time `json:"sent_at"`
}

// detailEmailFotoOf membaca bagian Email Foto dari detail sesi admin.
func detailEmailFotoOf(t *testing.T, id string) *detailEmailFoto {
	t.Helper()
	code, body := adminCall(t, AdminGetSession, http.MethodGet, id, "")
	if code != http.StatusOK {
		t.Fatalf("detail: %d %s", code, body)
	}
	var res struct {
		EmailFoto *detailEmailFoto `json:"email_foto"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		t.Fatal(err)
	}
	return res.EmailFoto
}

// adminResend memanggil Kirim ulang; email kosong = alamat registrasi yang ada.
func adminResend(t *testing.T, id, email string) (int, string) {
	t.Helper()
	b, _ := json.Marshal(map[string]string{"email": email})
	code, body := adminCall(t, AdminResendEmailFoto, http.MethodPost, id, string(b))
	var res struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(body, &res)
	return code, res.Error
}

func adminDeleteRegistration(t *testing.T, id string) int {
	t.Helper()
	code, _ := adminCall(t, AdminDeleteRegistration, http.MethodDelete, id, "")
	return code
}

// adminEmailFotoSession sesi siap kirim yang kedaluwarsanya relatif ke jam
// sungguhan, karena Kirim ulang menolak sesi yang sudah lewat expires_at.
func adminEmailFotoSession(t *testing.T) string {
	t.Helper()
	id := readySession(t)
	mustExec(t, `UPDATE sessions SET expires_at = ? WHERE id = ?`, time.Now().Add(72*time.Hour), id)
	return id
}

func TestAdminEmailFotoDetailShowsTheDelivery(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	if got := detailEmailFotoOf(t, id); got == nil || got.Status != "pending" || got.Recipient != "rina@gmail.com" || got.Attempts != 0 || got.SentAt != nil {
		t.Fatalf("pending = %+v", got)
	}

	fake.FailNext(mailer.Permanent(errors.New("550 no such user")))
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	if got := detailEmailFotoOf(t, id); got == nil || got.Status != "failed" || got.Attempts != 1 || !strings.Contains(got.Reason, "550 no such user") {
		t.Fatalf("failed = %+v", got)
	}

	if got := detailEmailFotoOf(t, paidSession(t)); got != nil {
		t.Fatalf("no registration = %+v, want null", got)
	}
}

func TestAdminEmailFotoResendAfterFailure(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	fake.FailNext(mailer.Permanent(errors.New("550 mailbox full")))
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	if code, msg := adminResend(t, id, ""); code != http.StatusOK {
		t.Fatalf("resend: %d %s", code, msg)
	}
	if got := detailEmailFotoOf(t, id); got.Status != "pending" || got.Attempts != 0 || got.Reason != "" {
		t.Fatalf("after resend = %+v", got)
	}
	RunEmailFotoDispatch(t0.Add(7 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 1 || sent[0].To.Email != "rina@gmail.com" {
		t.Fatalf("sent = %+v", sent)
	}
	if got := detailEmailFotoOf(t, id); got.Status != "sent" || got.Attempts != 1 || got.SentAt == nil || !got.SentAt.Equal(t0.Add(7*time.Minute)) {
		t.Fatalf("after send = %+v", got)
	}
}

func TestAdminEmailFotoResendToACorrectedAddress(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	fake.FailNext(mailer.Permanent(errors.New("550 no such user")))
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	if code, _ := adminResend(t, id, "rina@gmial"); code != http.StatusBadRequest {
		t.Fatalf("invalid address: %d", code)
	}
	if code, msg := adminResend(t, id, " Rina@Gmail.com.sg "); code != http.StatusOK {
		t.Fatalf("resend: %d %s", code, msg)
	}
	if got := sessionDetail(t, id); got == nil || got.Email != "rina@gmail.com.sg" || got.Name != "Rina Putri" {
		t.Fatalf("registration = %+v", got)
	}
	if got := detailEmailFotoOf(t, id); got.Status != "pending" || got.Recipient != "rina@gmail.com.sg" {
		t.Fatalf("delivery = %+v", got)
	}
	RunEmailFotoDispatch(t0.Add(7 * time.Minute))
	if sent := fake.Sent(); len(sent) != 1 || sent[0].To.Email != "rina@gmail.com.sg" {
		t.Fatalf("sent = %+v", sent)
	}
}

func TestAdminEmailFotoResendAfterASuccessfulSend(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	if code, msg := adminResend(t, id, ""); code != http.StatusOK {
		t.Fatalf("resend: %d %s", code, msg)
	}
	if got := detailEmailFotoOf(t, id); got.Status != "pending" || got.Attempts != 0 || got.SentAt != nil {
		t.Fatalf("after resend = %+v", got)
	}
	RunEmailFotoDispatch(t0.Add(7 * time.Minute))
	if sent := fake.Sent(); len(sent) != 2 || sent[1].To.Email != "rina@gmail.com" {
		t.Fatalf("sent = %+v", sent)
	}
}

func TestAdminEmailFotoResendRefusals(t *testing.T) {
	emailFotoEnv(t)
	if code, _ := adminResend(t, "no-such-session", ""); code != http.StatusNotFound {
		t.Fatalf("unknown session: %d", code)
	}
	if code, _ := adminResend(t, paidSession(t), ""); code != http.StatusConflict {
		t.Fatalf("no registration: %d", code)
	}
	id := adminEmailFotoSession(t)
	mustExec(t, `UPDATE sessions SET status = 'expired' WHERE id = ?`, id)
	if code, _ := adminResend(t, id, ""); code != http.StatusGone {
		t.Fatalf("photos deleted: %d", code)
	}
}

func TestAdminEmailFotoDeleteWhilePendingSendsNothing(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)

	if code := adminDeleteRegistration(t, id); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	RunEmailFotoDispatch(t0.Add(2 * time.Hour))
	if len(fake.Sent()) != 0 {
		t.Fatalf("sent after delete: %+v", fake.Sent())
	}
	if got := detailEmailFotoOf(t, id); got == nil || got.Status != "skipped" || got.Reason != "data dihapus" || got.Recipient != "" {
		t.Fatalf("delivery = %+v", got)
	}
	if name, email, _ := storedRegistration(t, id); name != "" || email != "" {
		t.Fatalf("registration kept: %q %q", name, email)
	}
	// Riwayat sesi dan fotonya tetap ada.
	code, body := adminCall(t, AdminGetSession, http.MethodGet, id, "")
	var res struct {
		Session struct {
			Status string `json:"status"`
		} `json:"session"`
		Photos []struct{} `json:"photos"`
	}
	_ = json.Unmarshal(body, &res)
	if code != http.StatusOK || res.Session.Status != "completed" || len(res.Photos) != 1 {
		t.Fatalf("session after delete: %d %s", code, body)
	}
}

func TestAdminEmailFotoDeleteAfterSentKeepsTheStatus(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	if code := adminDeleteRegistration(t, id); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	if got := detailEmailFotoOf(t, id); got == nil || got.Status != "sent" || got.Recipient != "" || got.SentAt == nil {
		t.Fatalf("delivery = %+v", got)
	}
	if name, email, _ := storedRegistration(t, id); name != "" || email != "" {
		t.Fatalf("registration kept: %q %q", name, email)
	}
	// Tanpa alamat, Kirim ulang tanpa email baru ditolak.
	if code, _ := adminResend(t, id, ""); code != http.StatusConflict {
		t.Fatalf("resend after delete: %d", code)
	}
	RunEmailFotoDispatch(t0.Add(2 * time.Hour))
	if len(fake.Sent()) != 1 {
		t.Fatalf("sent = %d", len(fake.Sent()))
	}
	if code := adminDeleteRegistration(t, "no-such-session"); code != http.StatusNotFound {
		t.Fatalf("unknown session: %d", code)
	}
}
