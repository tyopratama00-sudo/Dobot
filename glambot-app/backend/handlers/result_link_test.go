package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"photobooth/config"
)

// Link Halaman Hasil per sesi di Email Foto, WhatsApp, dan admin: halaman R2
// kalau sesi punya, kalau tidak folder Drive-nya.

const r2PageURL = "https://foto.test/sessions/abc/index.html"

// enableR2Config menyalakan R2 tanpa gateway sungguhan (tes ini tidak
// mengunggah apa pun) dan memastikan Drive mati.
func enableR2Config(t *testing.T) {
	t.Helper()
	config.App.PaymentGatewayURL = "http://gateway.invalid"
	config.App.PaymentGatewayToken = "tok"
	config.App.R2UploadEnabled = true
	config.App.GoogleRefreshToken = ""
}

func r2Page(t *testing.T, sessionID string, synced bool) {
	t.Helper()
	mustExec(t, `UPDATE sessions SET r2_url = ?, r2_synced = ? WHERE id = ?`, r2PageURL, synced, sessionID)
}

func TestEmailFotoSendsTheR2ResultPageOnceSyncedEvenWithDriveOff(t *testing.T) {
	fake := emailFotoEnv(t)
	enableR2Config(t)
	id := emailFotoSession(t)
	composed(t, id, t0.Add(5*time.Minute))
	r2Page(t, id, true)

	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	sent := fake.Sent()
	if len(sent) != 1 || !strings.Contains(sent[0].Text, r2PageURL) || len(sent[0].Attachments) != 1 {
		t.Fatalf("sent = %+v", sent)
	}
	if d := delivery(t, id); d.Content != "link_strip" {
		t.Fatalf("delivery = %+v", d)
	}
}

func TestEmailFotoWaitsForR2SyncThenSendsStripOnly(t *testing.T) {
	fake := emailFotoEnv(t)
	enableR2Config(t)
	id := emailFotoSession(t)
	done := t0.Add(5 * time.Minute)
	composed(t, id, done)
	r2Page(t, id, false) // QR sudah siap, GIF belum naik

	RunEmailFotoDispatch(done.Add(time.Minute))
	if len(fake.Sent()) != 0 {
		t.Fatal("terkirim sebelum sesi tersinkron ke R2")
	}
	RunEmailFotoDispatch(done.Add(11 * time.Minute))
	if d := delivery(t, id); d.Content != "strip" || len(fake.Sent()) != 1 {
		t.Fatalf("delivery = %+v, terkirim %d", d, len(fake.Sent()))
	}
}

func TestEmailFotoOfAnOldSessionKeepsItsDriveLinkAfterR2IsOn(t *testing.T) {
	fake := emailFotoEnv(t)
	enableR2Config(t)
	id := emailFotoSession(t)
	composed(t, id, t0.Add(5*time.Minute))
	driveFolder(t, id, true)

	RunEmailFotoDispatch(t0.Add(6 * time.Minute))

	if sent := fake.Sent(); len(sent) != 1 || !strings.Contains(sent[0].Text, driveFolderURL) {
		t.Fatalf("sent = %+v", sent)
	}
}

func TestEmailFotoWithoutStripAndWithoutAnyLinkServiceIsSkippedWithoutMentioningDrive(t *testing.T) {
	fake := emailFotoEnv(t)
	id := emailFotoSession(t)
	addPhoto(t, id, "raw", t0.Add(2*time.Minute))

	RunEmailFotoDispatch(t0.Add(12 * time.Minute))
	want := "tidak ada yang bisa dikirim: strip belum jadi dan Halaman Hasil tidak aktif"
	if d := delivery(t, id); d.Status != "skipped" || d.LastError != want || len(fake.Sent()) != 0 {
		t.Fatalf("delivery = %+v", d)
	}
}

func TestWhatsAppLinkUsesTheR2ResultPage(t *testing.T) {
	isolatedDB(t)
	id := whatsappSession(t, "Rina", "081234567890")
	setDrive(t, id, "", time.Now().Add(72*time.Hour))
	r2Page(t, id, false)

	got := whatsappDetail(t, id)
	if got.WhatsAppLink == nil {
		t.Fatalf("detail = %+v", got)
	}
	u, _ := url.Parse(*got.WhatsAppLink)
	if !strings.Contains(u.Query().Get("text"), r2PageURL) {
		t.Fatalf("pesan = %q", u.Query().Get("text"))
	}
}

func TestAdminSessionShowsTheResultPageLink(t *testing.T) {
	isolatedDB(t)
	r2Only, driveOnly := whatsappSession(t, "Rina", ""), whatsappSession(t, "Budi", "")
	r2Page(t, r2Only, true)
	setDrive(t, driveOnly, driveFolderURL, time.Now().Add(72*time.Hour))

	for id, want := range map[string]string{r2Only: r2PageURL, driveOnly: driveFolderURL} {
		if got := adminSessionDetail(t, id).ResultURL; got != want {
			t.Errorf("result_url = %q, mau %q", got, want)
		}
	}
}

type adminSessionLink struct {
	ResultURL string `json:"result_url"`
}

func adminSessionDetail(t *testing.T, id string) adminSessionLink {
	t.Helper()
	code, body := adminCall(t, AdminGetSession, http.MethodGet, id, "")
	if code != http.StatusOK {
		t.Fatalf("detail: %d %s", code, body)
	}
	var res struct {
		Session adminSessionLink `json:"session"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		t.Fatal(err)
	}
	return res.Session
}
