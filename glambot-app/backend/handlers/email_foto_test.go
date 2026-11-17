package handlers

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"photobooth/config"
	"photobooth/database"
	"photobooth/mailer"
	"photobooth/mailer/mailertest"
)

// t0 jam dinding tes: semua waktu sesi diatur relatif terhadapnya, dan
// dispatcher dijalankan dengan waktu pilihan tes (bukan jam sungguhan).
var t0 = time.Date(2026, 11, 10, 10, 0, 0, 0, time.Local)

const driveFolderURL = "https://drive.google.com/drive/folders/abc123"

// emailFotoEnv: schema sekali pakai, storage sementara, mailer palsu.
func emailFotoEnv(t *testing.T) *mailertest.Fake {
	t.Helper()
	isolatedDB(t)
	config.App.StoragePath = t.TempDir()
	return configureEmail(t)
}

// emailFotoSession sesi lunas dengan Registrasi atas nama Rina, didaftarkan
// pada t0 dan kedaluwarsa 72 jam kemudian (13 November 2026 10.00).
func emailFotoSession(t *testing.T) string {
	t.Helper()
	id := paidSession(t)
	if code, _, msg := saveRegistration(t, id, "Rina Putri", "rina@gmail.com"); code != 200 {
		t.Fatalf("register: %d %s", code, msg)
	}
	mustExec(t, `UPDATE sessions SET registered_at = ?, expires_at = ? WHERE id = ?`, t0, t0.Add(72*time.Hour), id)
	return id
}

func mustExec(t *testing.T, q string, args ...any) {
	t.Helper()
	if _, err := database.DB.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

// addPhoto menulis file foto ke storage sesi dan mencatatnya di tabel photos.
func addPhoto(t *testing.T, sessionID, typ string, at time.Time) {
	t.Helper()
	name := typ + "_" + at.Format("150405") + ".jpg"
	rel := filepath.ToSlash(filepath.Join("sessions", sessionID, typ, name))
	abs := filepath.Join(config.App.StoragePath, rel)
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(abs, []byte("JPEG "+typ), 0o644); err != nil {
		t.Fatal(err)
	}
	mustExec(t, `INSERT INTO photos (id, session_id, file_path, file_name, type, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		sessionID+"-"+name, sessionID, rel, name, typ, at)
}

// composed: strip final dibuat pada at, sesi selesai.
func composed(t *testing.T, sessionID string, at time.Time) {
	t.Helper()
	addPhoto(t, sessionID, "framed", at)
	mustExec(t, `UPDATE sessions SET status = 'completed', completed_at = ? WHERE id = ?`, at, sessionID)
}

func enableDrive(t *testing.T) {
	t.Helper()
	config.App.GoogleClientID, config.App.GoogleClientSecret, config.App.GoogleRefreshToken = "id", "secret", "token"
}

func driveFolder(t *testing.T, sessionID string, synced bool) {
	t.Helper()
	mustExec(t, `UPDATE sessions SET drive_url = ?, drive_folder_id = 'abc123', drive_synced = ? WHERE id = ?`, driveFolderURL, synced, sessionID)
}

func delivery(t *testing.T, sessionID string) EmailFotoDelivery {
	t.Helper()
	d, err := GetEmailFotoDelivery(sessionID)
	if err != nil {
		t.Fatalf("delivery: %v", err)
	}
	return d
}

func TestEmailFotoSendsLinkAndStripOnceDriveIsComplete(t *testing.T) {
	fake := emailFotoEnv(t)
	enableDrive(t)
	id := emailFotoSession(t)
	composed(t, id, t0.Add(5*time.Minute))
	driveFolder(t, id, true)

	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	sent := fake.Sent()
	if len(sent) != 1 {
		t.Fatalf("sent %d messages", len(sent))
	}
	m := sent[0]
	if m.To.Email != "rina@gmail.com" || m.To.Name != "Rina Putri" {
		t.Fatalf("to = %+v", m.To)
	}
	if m.Subject != "Foto kamu dari Glambot Photo Booth 📸" || m.FromName != "Glambot Photo Booth" {
		t.Fatalf("subject %q, from %q", m.Subject, m.FromName)
	}
	for _, body := range []string{m.Text, m.HTML} {
		for _, want := range []string{"Halo Rina Putri", driveFolderURL, "13 November 2026"} {
			if !strings.Contains(body, want) {
				t.Errorf("body lacks %q:\n%s", want, body)
			}
		}
	}
	if len(m.Attachments) != 1 || string(m.Attachments[0].Data) != "JPEG framed" || m.Attachments[0].ContentType != "image/jpeg" {
		t.Fatalf("attachments = %+v", m.Attachments)
	}
	d := delivery(t, id)
	if d.Status != "sent" || d.Content != "link_strip" || d.Attempts != 1 || d.SentAt == nil || !d.SentAt.Equal(t0.Add(6*time.Minute)) {
		t.Fatalf("delivery = %+v", d)
	}

	// Run berikutnya tidak mengirim ulang.
	RunEmailFotoDispatch(t0.Add(7 * time.Minute))
	if len(fake.Sent()) != 1 {
		t.Fatal("sent twice")
	}
}

func TestEmailFotoWaitsForTheResultPageThenSendsStripOnlyAfterTenMinutes(t *testing.T) {
	fake := emailFotoEnv(t)
	enableDrive(t)
	id := emailFotoSession(t)
	done := t0.Add(5 * time.Minute)
	composed(t, id, done)
	driveFolder(t, id, false) // folder ada, upload belum lengkap

	RunEmailFotoDispatch(done.Add(9 * time.Minute))
	if len(fake.Sent()) != 0 || delivery(t, id).Status != "pending" {
		t.Fatal("sent before Drive finished or 10 minutes passed")
	}

	RunEmailFotoDispatch(done.Add(10 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 1 {
		t.Fatalf("sent %d messages", len(sent))
	}
	m := sent[0]
	if strings.Contains(m.Text, driveFolderURL) || strings.Contains(m.HTML, driveFolderURL) {
		t.Error("strip-only email carries the unfinished result page link")
	}
	if !strings.Contains(m.Text, "Link foto sesimu tidak tersedia") || !strings.Contains(m.Text, "Halo Rina Putri") {
		t.Errorf("text:\n%s", m.Text)
	}
	if len(m.Attachments) != 1 {
		t.Fatalf("attachments = %d", len(m.Attachments))
	}
	if d := delivery(t, id); d.Status != "sent" || d.Content != "strip" {
		t.Fatalf("delivery = %+v", d)
	}
}

func TestEmailFotoWithDriveDisabledSendsStripOnly(t *testing.T) {
	fake := emailFotoEnv(t)
	id := emailFotoSession(t)
	done := t0.Add(5 * time.Minute)
	composed(t, id, done)
	driveFolder(t, id, true) // sisa sesi lama: Drive sudah dimatikan

	RunEmailFotoDispatch(done.Add(time.Minute))
	if len(fake.Sent()) != 0 {
		t.Fatal("sent before 10 minutes")
	}
	RunEmailFotoDispatch(done.Add(11 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 1 || len(sent[0].Attachments) != 1 || strings.Contains(sent[0].Text, driveFolderURL) {
		t.Fatalf("sent = %+v", sent)
	}
	if d := delivery(t, id); d.Content != "strip" {
		t.Fatalf("delivery = %+v", d)
	}
}

func TestEmailFotoWithoutStripSendsLinkOnlyAfterTenQuietMinutes(t *testing.T) {
	fake := emailFotoEnv(t)
	enableDrive(t)
	id := emailFotoSession(t)
	last := t0.Add(4 * time.Minute)
	addPhoto(t, id, "raw", t0.Add(3*time.Minute))
	addPhoto(t, id, "raw", last)
	driveFolder(t, id, false)

	RunEmailFotoDispatch(last.Add(9 * time.Minute))
	if len(fake.Sent()) != 0 {
		t.Fatal("sent while photos may still come")
	}
	RunEmailFotoDispatch(last.Add(10 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 1 {
		t.Fatalf("sent %d", len(sent))
	}
	m := sent[0]
	if len(m.Attachments) != 0 || !strings.Contains(m.Text, driveFolderURL) || !strings.Contains(m.HTML, driveFolderURL) || !strings.Contains(m.Text, "13 November 2026") {
		t.Fatalf("link-only message: %d attachments\n%s", len(m.Attachments), m.Text)
	}
	if d := delivery(t, id); d.Status != "sent" || d.Content != "link" {
		t.Fatalf("delivery = %+v", d)
	}
}

func TestEmailFotoSkippedWhenThereAreNoPhotos(t *testing.T) {
	fake := emailFotoEnv(t)
	enableDrive(t)
	id := emailFotoSession(t)

	// Baru registrasi: foto masih akan diambil.
	RunEmailFotoDispatch(t0.Add(5 * time.Minute))
	if d := delivery(t, id); d.Status != "pending" {
		t.Fatalf("decided too early: %+v", d)
	}

	RunEmailFotoDispatch(t0.Add(10 * time.Minute))
	if d := delivery(t, id); d.Status != "skipped" || d.LastError != "tidak ada foto" {
		t.Fatalf("delivery = %+v", d)
	}
	if len(fake.Sent()) != 0 {
		t.Fatal("sent an email without photos")
	}
}

// readySession sesi yang strip & Drive-nya lengkap pada t0+5 menit.
func readySession(t *testing.T) string {
	t.Helper()
	enableDrive(t)
	id := emailFotoSession(t)
	composed(t, id, t0.Add(5*time.Minute))
	driveFolder(t, id, true)
	return id
}

func TestEmailFotoRetriesWithGrowingDelays(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	fake.FailAlways(errors.New("dial tcp: network is unreachable"))

	at := t0.Add(6 * time.Minute)
	RunEmailFotoDispatch(at)
	for i, wait := range []time.Duration{time.Minute, 5 * time.Minute, 15 * time.Minute, time.Hour, time.Hour} {
		d := delivery(t, id)
		if d.Status != "pending" || d.Attempts != i+1 || d.LastError != "dial tcp: network is unreachable" ||
			d.NextAttemptAt == nil || !d.NextAttemptAt.Equal(at.Add(wait)) {
			t.Fatalf("after attempt %d: %+v", i+1, d)
		}
		RunEmailFotoDispatch(at.Add(wait - time.Second)) // belum waktunya
		if delivery(t, id).Attempts != i+1 {
			t.Fatalf("retried before %s", wait)
		}
		at = at.Add(wait)
		RunEmailFotoDispatch(at)
	}

	fake.FailAlways(nil)
	at = at.Add(time.Hour)
	RunEmailFotoDispatch(at)
	if d := delivery(t, id); d.Status != "sent" || d.Attempts != 7 || d.LastError != "" || len(fake.Sent()) != 1 {
		t.Fatalf("after recovery: %+v", d)
	}
}

func TestEmailFotoFailsAtSessionExpiryWithLastError(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	fake.FailAlways(errors.New("421 try again later"))

	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	expiry := t0.Add(72 * time.Hour)
	fake.FailAlways(nil) // internet pulih, tapi foto sudah kedaluwarsa
	RunEmailFotoDispatch(expiry)
	d := delivery(t, id)
	if d.Status != "failed" || d.LastError != "421 try again later" || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v, sent %d", d, len(fake.Sent()))
	}
}

func TestEmailFotoPermanentRejectionFailsImmediately(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	fake.FailNext(mailer.Permanent(errors.New("550 5.1.1 user unknown")))

	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	d := delivery(t, id)
	if d.Status != "failed" || d.Attempts != 1 || !strings.Contains(d.LastError, "550 5.1.1") {
		t.Fatalf("delivery = %+v", d)
	}
	RunEmailFotoDispatch(t0.Add(time.Hour))
	if len(fake.Sent()) != 0 || delivery(t, id).Attempts != 1 {
		t.Fatal("retried a permanent rejection")
	}
}

func TestEmailFotoNothingSentAfterPhotosAreDeleted(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	// Cleanup sudah menghapus foto sesi (status expired) sebelum dispatcher jalan.
	mustExec(t, `UPDATE sessions SET status = 'expired' WHERE id = ?`, id)

	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	if d := delivery(t, id); d.Status != "failed" || d.LastError == "" || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v, sent %d", d, len(fake.Sent()))
	}
}

func TestEmailFotoUsesTheBrandLabelAsBoothName(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	if err := upsertAppSettings(map[string]string{"brand_label": "Studio Ceria"}); err != nil {
		t.Fatal(err)
	}
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 1 || sent[0].Subject != "Foto kamu dari Studio Ceria 📸" || sent[0].FromName != "Studio Ceria" || !strings.Contains(sent[0].Text, "Studio Ceria") {
		t.Fatalf("sent = %+v (session %s)", sent, id)
	}
}

func TestEmailFotoSenderNameComesFromSMTPFromName(t *testing.T) {
	fake := emailFotoEnv(t)
	config.App.SMTPFromName = "  Glambot Jakarta  "
	readySession(t)
	if err := upsertAppSettings(map[string]string{"brand_label": "Studio Ceria"}); err != nil {
		t.Fatal(err)
	}
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	sent := fake.Sent()
	// Nama pengirim dari SMTP_FROM_NAME; subjek dan isi tetap memakai nama booth.
	if len(sent) != 1 || sent[0].FromName != "Glambot Jakarta" || sent[0].Subject != "Foto kamu dari Studio Ceria 📸" {
		t.Fatalf("sent = %+v", sent)
	}
}

func TestEmailFotoEmailChangedWhilePendingGoesToTheNewAddress(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	if code, _, msg := saveRegistration(t, id, "Rina Putri", "rina.putri@yahoo.com"); code != 200 {
		t.Fatalf("update: %d %s", code, msg)
	}
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 1 || sent[0].To.Email != "rina.putri@yahoo.com" {
		t.Fatalf("sent = %+v", sent)
	}
}

func TestEmailFotoEmailChangedAfterSendingQueuesANewSend(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	// Alamat yang sama disimpan ulang: tidak ada kiriman baru.
	saveRegistration(t, id, "Rina Putri", "rina@gmail.com")
	RunEmailFotoDispatch(t0.Add(7 * time.Minute))
	if len(fake.Sent()) != 1 {
		t.Fatalf("same address re-sent: %d", len(fake.Sent()))
	}

	saveRegistration(t, id, "Rina Putri", "rina.putri@yahoo.com")
	if d := delivery(t, id); d.Status != "pending" || d.Attempts != 0 || d.Recipient != "rina.putri@yahoo.com" {
		t.Fatalf("not requeued: %+v", d)
	}
	RunEmailFotoDispatch(t0.Add(8 * time.Minute))
	sent := fake.Sent()
	if len(sent) != 2 || sent[1].To.Email != "rina.putri@yahoo.com" {
		t.Fatalf("sent = %+v", sent)
	}
}

func TestEmailFotoResendToACorrectedAddress(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	mustExec(t, `UPDATE sessions SET expires_at = ? WHERE id = ?`, time.Now().Add(72*time.Hour), id)
	fake.FailNext(mailer.Permanent(errors.New("550 no such user")))
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	if err := ResendEmailFoto(id, " Rina@Gmail.co.id "); err != nil {
		t.Fatal(err)
	}
	if d := delivery(t, id); d.Status != "pending" || d.Attempts != 0 || d.LastError != "" || d.Recipient != "rina@gmail.co.id" {
		t.Fatalf("after resend: %+v", d)
	}
	if _, email, _ := storedRegistration(t, id); email != "rina@gmail.co.id" {
		t.Fatalf("registration email = %q", email)
	}
	RunEmailFotoDispatch(t0.Add(7 * time.Minute))
	if sent := fake.Sent(); len(sent) != 1 || sent[0].To.Email != "rina@gmail.co.id" {
		t.Fatalf("sent = %+v", sent)
	}

	mustExec(t, `UPDATE sessions SET status = 'expired' WHERE id = ?`, id)
	if err := ResendEmailFoto(id, ""); !errors.Is(err, ErrEmailFotoPhotosGone) {
		t.Fatalf("resend after expiry: %v", err)
	}
}

func TestEmailFotoForgottenRecipientStopsAPendingSend(t *testing.T) {
	fake := emailFotoEnv(t)
	id := readySession(t)
	if err := DeleteSessionRegistration(id); err != nil {
		t.Fatal(err)
	}
	RunEmailFotoDispatch(t0.Add(6 * time.Minute))
	if d := delivery(t, id); d.Status != "skipped" || d.LastError != "data dihapus" || d.Recipient != "" || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v, sent %d", d, len(fake.Sent()))
	}
}

func TestEmailFotoSkippedWhenRawPhotosHaveNoLink(t *testing.T) {
	fake := emailFotoEnv(t)
	id := emailFotoSession(t) // Drive mati: foto raw tidak punya link
	addPhoto(t, id, "raw", t0.Add(2*time.Minute))

	RunEmailFotoDispatch(t0.Add(12 * time.Minute))
	want := "tidak ada yang bisa dikirim: strip belum jadi dan Halaman Hasil tidak aktif"
	if d := delivery(t, id); d.Status != "skipped" || d.LastError != want || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v, sent %d", d, len(fake.Sent()))
	}
}

func TestEmailFotoSkippedWhenRawPhotosHaveNoResultPageLink(t *testing.T) {
	fake := emailFotoEnv(t)
	enableDrive(t)
	id := emailFotoSession(t) // Drive aktif, tapi folder sesi tidak pernah dibuat
	addPhoto(t, id, "raw", t0.Add(2*time.Minute))

	RunEmailFotoDispatch(t0.Add(12 * time.Minute))
	want := "tidak ada yang bisa dikirim: strip belum jadi dan link Halaman Hasil tidak tersedia"
	if d := delivery(t, id); d.Status != "skipped" || d.LastError != want || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v, sent %d", d, len(fake.Sent()))
	}
}
