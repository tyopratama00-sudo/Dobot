package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"photobooth/database"
	"photobooth/mailer"
)

// boothHeartbeat memanggil heartbeat booth untuk sesi Go id.
func boothHeartbeat(t *testing.T, id string) int {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, "/", nil)
	rc := chi.NewRouteContext()
	rc.URLParams.Add("sessionID", id)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	SessionHeartbeat(w, r)
	return w.Code
}

// liveSession sesi berregistrasi yang waktunya relatif ke jam sungguhan:
// registrasi 30 menit lalu, satu foto raw 20 menit lalu, Drive aktif dengan
// folder yang belum lengkap (tanpa strip).
func liveSession(t *testing.T) (id string, now time.Time) {
	t.Helper()
	enableDrive(t)
	id = emailFotoSession(t)
	now = time.Now()
	mustExec(t, `UPDATE sessions SET registered_at = ?, expires_at = ? WHERE id = ?`, now.Add(-30*time.Minute), now.Add(72*time.Hour), id)
	addPhoto(t, id, "raw", now.Add(-20*time.Minute))
	driveFolder(t, id, false)
	return id, now
}

// A: pelanggan yang diam lama di layar frame/pilih/edit belum "berhenti di
// tengah jalan"; aturan tanpa strip baru berlaku setelah booth berhenti
// menyebut sesinya.
func TestEmailFotoWaitsWhileTheBoothStillShowsTheSession(t *testing.T) {
	fake := emailFotoEnv(t)
	id, now := liveSession(t)

	if code := boothHeartbeat(t, id); code != http.StatusOK {
		t.Fatalf("heartbeat: %d", code)
	}
	RunEmailFotoDispatch(now.Add(time.Minute))
	if d := delivery(t, id); d.Status != EmailFotoPending || len(fake.Sent()) != 0 {
		t.Fatalf("decided while the session is still on the booth: %+v", d)
	}

	RunEmailFotoDispatch(now.Add(3 * time.Minute))
	if d := delivery(t, id); d.Status != EmailFotoSent || d.Content != EmailFotoLinkOnly {
		t.Fatalf("delivery = %+v", d)
	}
}

func TestEmailFotoHeartbeatForAnUnknownSession(t *testing.T) {
	emailFotoEnv(t)
	if code := boothHeartbeat(t, "no-such-session"); code != http.StatusNotFound {
		t.Fatalf("heartbeat: %d", code)
	}
}

// B: hapus yang commit setelah dispatcher membaca daftar tetap menang.
func TestEmailFotoDeleteAfterARoundLoadedTheSessionSendsNothing(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	now := t0.Add(6 * time.Minute)

	due, err := dueEmailFoto(now)
	if err != nil || len(due) != 1 {
		t.Fatalf("due = %v, %v", due, err)
	}
	if code := adminDeleteRegistration(t, id); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	dispatchEmailFoto(fake, emailFotoBoothName(), now, due[0])

	if len(fake.Sent()) != 0 {
		t.Fatalf("sent after delete: %+v", fake.Sent())
	}
	if d := delivery(t, id); d.Status != EmailFotoSkipped || d.LastError != "data dihapus" {
		t.Fatalf("delivery = %+v", d)
	}
}

// B: ganti email yang commit setelah dispatcher membaca daftar dipakai.
func TestEmailFotoEmailChangeAfterARoundLoadedTheSessionGoesToTheNewAddress(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	now := t0.Add(6 * time.Minute)

	due, err := dueEmailFoto(now)
	if err != nil || len(due) != 1 {
		t.Fatalf("due = %v, %v", due, err)
	}
	if code, _, msg := saveRegistration(t, id, "Rina Putri", "rina.putri@yahoo.com"); code != http.StatusOK {
		t.Fatalf("update: %d %s", code, msg)
	}
	dispatchEmailFoto(fake, emailFotoBoothName(), now, due[0])

	if sent := fake.Sent(); len(sent) != 1 || sent[0].To.Email != "rina.putri@yahoo.com" {
		t.Fatalf("sent = %+v", sent)
	}
}

// blockingMailer menahan Send sampai release ditutup.
type blockingMailer struct {
	started, release chan struct{}
	mu               sync.Mutex
	sent             []mailer.Message
}

func (b *blockingMailer) Send(_ context.Context, m mailer.Message) error {
	close(b.started)
	<-b.release
	b.mu.Lock()
	b.sent = append(b.sent, m)
	b.mu.Unlock()
	return nil
}

// B: hapus yang datang selagi email sedang dikirim menunggu, lalu tetap
// mengosongkan penerima; status terkirim tidak tertimpa.
func TestEmailFotoDeleteDuringASendWaitsAndKeepsTheSentStatus(t *testing.T) {
	emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	m := &blockingMailer{started: make(chan struct{}), release: make(chan struct{})}
	t.Cleanup(mailer.Use(m))

	go RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	<-m.started
	deleted := make(chan int)
	go func() { deleted <- adminDeleteRegistration(t, id) }()
	select {
	case code := <-deleted:
		t.Fatalf("delete finished (%d) while the email was being sent", code)
	case <-time.After(300 * time.Millisecond):
	}
	close(m.release)
	if code := <-deleted; code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	if d := delivery(t, id); d.Status != EmailFotoSent || d.Recipient != "" {
		t.Fatalf("delivery = %+v", d)
	}
}

// C: setelah Hapus data registrasi, booth (Ubah email) tidak bisa
// membuat registrasinya lagi.
func TestRegistrationRefusedAfterTheRegistrationWasDeleted(t *testing.T) {
	fake := emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	if code := adminDeleteRegistration(t, id); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}

	code, _, msg := saveRegistration(t, id, "Rina Putri", "rina@gmail.com")
	if code != http.StatusForbidden || msg == "" {
		t.Fatalf("update after delete: %d %q", code, msg)
	}
	if name, email, _ := storedRegistration(t, id); name != "" || email != "" {
		t.Fatalf("registration re-created: %q %q", name, email)
	}
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	if d := delivery(t, id); d.Status != EmailFotoSkipped || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v, sent %d", d, len(fake.Sent()))
	}
}

// detailRegistrationDeleted membaca penanda hapus pada registrasi detail admin.
func detailRegistrationDeleted(t *testing.T, id string) (present bool, deletedAt *time.Time) {
	t.Helper()
	code, body := adminCall(t, AdminGetSession, http.MethodGet, id, "")
	if code != http.StatusOK {
		t.Fatalf("detail: %d %s", code, body)
	}
	var res struct {
		Registration *struct {
			DeletedAt *time.Time `json:"deleted_at"`
		} `json:"registration"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		t.Fatal(err)
	}
	if res.Registration == nil {
		return false, nil
	}
	return true, res.Registration.DeletedAt
}

// C: admin membaca penanda hapus, bukan menebak dari nama/email kosong.
func TestAdminRegistrationDetailMarksADeletedRegistration(t *testing.T) {
	emailFotoEnv(t)
	id := adminEmailFotoSession(t)
	if present, at := detailRegistrationDeleted(t, id); !present || at != nil {
		t.Fatalf("before delete: present %v, deleted_at %v", present, at)
	}
	adminDeleteRegistration(t, id)
	if present, at := detailRegistrationDeleted(t, id); !present || at == nil {
		t.Fatalf("after delete: present %v, deleted_at %v", present, at)
	}
}

// D: Kirim ulang tidak membuat registrasi.
func TestAdminEmailFotoResendNeedsARegistration(t *testing.T) {
	emailFotoEnv(t)
	plain := paidSession(t)
	if code, _ := adminResend(t, plain, "rina@gmail.com"); code != http.StatusConflict {
		t.Fatalf("resend without registration: %d", code)
	}
	if _, err := GetEmailFotoDelivery(plain); err == nil {
		t.Fatal("resend created a delivery for a session without registration")
	}
	if _, _, at := storedRegistration(t, plain); at != nil {
		t.Fatal("resend created a registration")
	}

	id := adminEmailFotoSession(t)
	adminDeleteRegistration(t, id)
	if code, _ := adminResend(t, id, "rina@gmail.com"); code != http.StatusConflict {
		t.Fatalf("resend after delete with a new address: %d", code)
	}
	if name, email, _ := storedRegistration(t, id); name != "" || email != "" {
		t.Fatalf("registration re-created: %q %q", name, email)
	}
}

// E: status/kedaluwarsa diperiksa di bawah kunci baris sesi. Cleanup yang
// sedang menandai sesi expired (belum commit) harus ditunggu, dan Kirim
// ulang lalu ditolak.
func TestEmailFotoResendWaitsForAConcurrentExpiry(t *testing.T) {
	emailFotoEnv(t)
	id := adminEmailFotoSession(t)

	tx, err := database.DB.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`UPDATE sessions SET status = 'expired' WHERE id = ?`, id); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- ResendEmailFoto(id, "") }()
	select {
	case err := <-done:
		t.Fatalf("resend did not wait for the row lock: %v", err)
	case <-time.After(300 * time.Millisecond):
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; !errors.Is(err, ErrEmailFotoPhotosGone) {
		t.Fatalf("resend after expiry: %v", err)
	}
}
