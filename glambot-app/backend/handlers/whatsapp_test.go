package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"photobooth/database"
)

type whatsappReply struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	WhatsApp string `json:"whatsapp"`
}

// putRegistration mengirim body JSON apa adanya ke endpoint registrasi.
func putRegistration(t *testing.T, sessionID string, body map[string]any) (int, whatsappReply, string) {
	t.Helper()
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(string(raw)))
	rc := chi.NewRouteContext()
	rc.URLParams.Add("sessionID", sessionID)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	SaveSessionRegistration(w, r)
	var res struct {
		Data  whatsappReply `json:"data"`
		Error string        `json:"error"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	return w.Code, res.Data, res.Error
}

func storedWhatsApp(t *testing.T, sessionID string) string {
	t.Helper()
	var wa string
	if err := database.DB.QueryRow(`SELECT registration_whatsapp FROM sessions WHERE id = ?`, sessionID).Scan(&wa); err != nil {
		t.Fatal(err)
	}
	return wa
}

func TestWhatsAppNumberIsNormalisedAndStored(t *testing.T) {
	isolatedDB(t)
	for _, c := range []struct{ in, want string }{
		{"0812-3456-7890", "6281234567890"},
		{"+62 812 3456 7890", "6281234567890"},
		{"(0812) 3456.7890", "6281234567890"},
		{"6281234567890", "6281234567890"},
		{"+1 (415) 555-2671", "14155552671"},
	} {
		id := paidSession(t)
		code, got, msg := putRegistration(t, id, map[string]any{"name": "Rina", "email": "rina@gmail.com", "whatsapp": c.in})
		if code != http.StatusOK || got.WhatsApp != c.want {
			t.Errorf("%q: %d %q %+v", c.in, code, msg, got)
			continue
		}
		if wa := storedWhatsApp(t, id); wa != c.want {
			t.Errorf("%q stored as %q", c.in, wa)
		}
	}
}

func TestWhatsAppInvalidNumberIsRejected(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)
	for _, in := range []string{"0812345", "62812345678901234", "0812abc34567", "--", "+62 812 34", "08123456789/1"} {
		code, _, msg := putRegistration(t, id, map[string]any{"name": "Rina", "email": "rina@gmail.com", "whatsapp": in})
		if code != http.StatusBadRequest || msg == "" {
			t.Errorf("%q: %d %q", in, code, msg)
		}
	}
	if name, _, at := storedRegistration(t, id); name != "" || at != nil {
		t.Fatalf("invalid number still saved the registration: %q %v", name, at)
	}
}

func TestWhatsAppEmptyNumberIsOptional(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)
	code, got, msg := putRegistration(t, id, map[string]any{"name": "Rina", "email": "rina@gmail.com", "whatsapp": "  "})
	if code != http.StatusOK || got.WhatsApp != "" || storedWhatsApp(t, id) != "" {
		t.Fatalf("empty number: %d %q %+v", code, msg, got)
	}
}

func TestWhatsAppResaveWithoutTheFieldKeepsTheNumberAndEmptyClearsIt(t *testing.T) {
	isolatedDB(t)
	id := paidSession(t)
	putRegistration(t, id, map[string]any{"name": "Rina", "email": "rina@gmail.com", "whatsapp": "081234567890"})

	code, got, _ := putRegistration(t, id, map[string]any{"name": "Rina", "email": "rina.p@gmail.com"})
	if code != http.StatusOK || got.WhatsApp != "6281234567890" || storedWhatsApp(t, id) != "6281234567890" {
		t.Fatalf("without field: %d %+v stored %q", code, got, storedWhatsApp(t, id))
	}
	code, got, _ = putRegistration(t, id, map[string]any{"name": "Rina", "email": "rina.p@gmail.com", "whatsapp": ""})
	if code != http.StatusOK || got.WhatsApp != "" || storedWhatsApp(t, id) != "" {
		t.Fatalf("empty field: %d %+v stored %q", code, got, storedWhatsApp(t, id))
	}
}

// whatsappSession membuat sesi lunas yang registrasi dengan nomor WhatsApp.
func whatsappSession(t *testing.T, name, number string) string {
	t.Helper()
	id := paidSession(t)
	if code, _, msg := putRegistration(t, id, map[string]any{"name": name, "email": "pelanggan@gmail.com", "whatsapp": number}); code != http.StatusOK {
		t.Fatalf("register: %d %s", code, msg)
	}
	return id
}

func TestWhatsAppDeleteRegistrationClearsTheNumber(t *testing.T) {
	isolatedDB(t)
	configureEmail(t)
	id := whatsappSession(t, "Rina", "081234567890")
	if code := adminDeleteRegistration(t, id); code != http.StatusOK {
		t.Fatalf("delete: %d", code)
	}
	if wa := storedWhatsApp(t, id); wa != "" {
		t.Fatalf("number kept after delete: %q", wa)
	}
}

func TestWhatsAppSearchMatchesTheNumber(t *testing.T) {
	isolatedDB(t)
	rina := whatsappSession(t, "Rina", "081234567890")
	budi := whatsappSession(t, "Budi", "085799998888")
	for _, q := range []string{"081234567890", "6281234567890", "%2B62+812-3456", "34567"} {
		got := listedIDs(listSessions(t, "search="+q))
		if !got[rina] || got[budi] || len(got) != 1 {
			t.Errorf("search %q = %v (rina %s)", q, got, rina)
		}
	}
}

type detailWhatsApp struct {
	WhatsApp     string  `json:"whatsapp"`
	WhatsAppLink *string `json:"whatsapp_link"`
	Reason       string  `json:"whatsapp_link_reason"`
}

func whatsappDetail(t *testing.T, id string) detailWhatsApp {
	t.Helper()
	code, body := adminCall(t, AdminGetSession, http.MethodGet, id, "")
	if code != http.StatusOK {
		t.Fatalf("detail: %d %s", code, body)
	}
	var res struct {
		Registration *detailWhatsApp `json:"registration"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		t.Fatal(err)
	}
	if res.Registration == nil {
		t.Fatalf("no registration in %s", body)
	}
	return *res.Registration
}

func setDrive(t *testing.T, id, link string, expires time.Time) {
	t.Helper()
	if _, err := database.DB.Exec(`UPDATE sessions SET drive_url = ?, expires_at = ? WHERE id = ?`, link, expires, id); err != nil {
		t.Fatal(err)
	}
}

func TestWhatsAppLinkCarriesTheReadyMessage(t *testing.T) {
	isolatedDB(t)
	id := whatsappSession(t, "Rina Putri", "0812-3456-7890")
	setDrive(t, id, "https://drive.google.com/drive/folders/abc123", time.Date(2035, 3, 9, 10, 0, 0, 0, time.Local))

	got := whatsappDetail(t, id)
	if got.WhatsApp != "6281234567890" || got.WhatsAppLink == nil || got.Reason != "" {
		t.Fatalf("detail = %+v", got)
	}
	u, err := url.Parse(*got.WhatsAppLink)
	if err != nil {
		t.Fatal(err)
	}
	if u.Scheme != "https" || u.Host != "wa.me" || u.Path != "/6281234567890" {
		t.Fatalf("link = %s", *got.WhatsAppLink)
	}
	want := "Halo Rina Putri, ini foto kamu dari Glambot Photo Booth 📸 https://drive.google.com/drive/folders/abc123 Link berlaku sampai Jumat, 9 Maret 2035 pukul 10.00."
	if text := u.Query().Get("text"); text != want {
		t.Fatalf("text = %q\nwant  %q", text, want)
	}
	if strings.Contains(u.RawQuery, "+") {
		t.Fatalf("spaces must be %%20 for wa.me: %s", u.RawQuery)
	}
}

func TestWhatsAppLinkNeedsANumber(t *testing.T) {
	isolatedDB(t)
	id := whatsappSession(t, "Rina", "")
	setDrive(t, id, "https://drive.google.com/drive/folders/abc123", time.Now().Add(72*time.Hour))
	if got := whatsappDetail(t, id); got.WhatsAppLink != nil || got.Reason != "Belum ada nomor WhatsApp" {
		t.Fatalf("detail = %+v", got)
	}
}

func TestWhatsAppLinkNeedsAResultPage(t *testing.T) {
	isolatedDB(t)
	id := whatsappSession(t, "Rina", "081234567890")
	if got := whatsappDetail(t, id); got.WhatsApp != "6281234567890" || got.WhatsAppLink != nil ||
		got.Reason != "Link Halaman Hasil belum tersedia" {
		t.Fatalf("detail = %+v", got)
	}
}

func TestWhatsAppLinkGoneAfterExpiry(t *testing.T) {
	isolatedDB(t)
	id := whatsappSession(t, "Rina", "081234567890")
	setDrive(t, id, "https://drive.google.com/drive/folders/abc123", time.Now().Add(-time.Hour))
	if got := whatsappDetail(t, id); got.WhatsAppLink != nil || got.Reason == "" {
		t.Fatalf("detail = %+v", got)
	}
}
