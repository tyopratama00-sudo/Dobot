package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"photobooth/config"
	"photobooth/database"
	"photobooth/models"
	"photobooth/services"

	"github.com/go-chi/chi/v5"
)

const r2PublicBase = "https://foto.test/"

type r2Object struct {
	contentType string
	body        []byte
}

// fakeR2 meniru pay.photorobot.id (presign) sekaligus R2 (PUT): setiap file
// yang diunggah kiosk disimpan di memori menurut key-nya.
type fakeR2 struct {
	mu      sync.Mutex
	objects map[string]r2Object
	history map[string][]r2Object // semua versi yang pernah diunggah per key
	down    bool                  // true: presign menjawab 503 seperti layanan yang mati
	srv     *httptest.Server
}

func startFakeR2(t *testing.T) *fakeR2 {
	t.Helper()
	g := &fakeR2{objects: map[string]r2Object{}, history: map[string][]r2Object{}}
	g.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/uploads/presign":
			g.mu.Lock()
			down := g.down
			g.mu.Unlock()
			if down {
				w.WriteHeader(http.StatusServiceUnavailable)
				w.Write([]byte(`{"error":"r2_not_configured"}`))
				return
			}
			if r.Header.Get("Authorization") != "Bearer tok-rahasia" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			var req struct {
				Key         string `json:"key"`
				ContentType string `json:"content_type"`
				Size        int64  `json:"size"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			if !strings.HasPrefix(req.Key, "sessions/") || req.Size < 1 {
				w.WriteHeader(http.StatusBadRequest)
				w.Write([]byte(`{"error":"invalid_key"}`))
				return
			}
			json.NewEncoder(w).Encode(map[string]any{
				"url":        g.srv.URL + "/put/" + req.Key,
				"headers":    map[string]string{"Content-Type": req.ContentType, "Cache-Control": "no-cache"},
				"public_url": r2PublicBase + req.Key,
				"expires_in": 300,
			})
		case r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/put/"):
			var buf bytes.Buffer
			buf.ReadFrom(r.Body)
			if int64(buf.Len()) != r.ContentLength {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			g.mu.Lock()
			key, obj := strings.TrimPrefix(r.URL.Path, "/put/"), r2Object{r.Header.Get("Content-Type"), buf.Bytes()}
			g.objects[key] = obj
			g.history[key] = append(g.history[key], obj)
			g.mu.Unlock()
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(g.srv.Close)
	return g
}

func (g *fakeR2) object(key string) (r2Object, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	o, ok := g.objects[key]
	return o, ok
}

// waitObject menunggu upload latar belakang sampai ke gateway.
func (g *fakeR2) waitObject(t *testing.T, key string) r2Object {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if o, ok := g.object(key); ok {
			return o
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("%s tidak pernah diunggah", key)
	return r2Object{}
}

// r2Env: schema sekali pakai, storage sementara, gateway tiruan, R2 aktif.
func r2Env(t *testing.T) *fakeR2 {
	t.Helper()
	isolatedDB(t)
	config.App.StoragePath = t.TempDir()
	config.App.SessionExpiryHours = 72
	g := startFakeR2(t)
	config.App.PaymentGatewayURL = g.srv.URL
	config.App.PaymentGatewayToken = "tok-rahasia"
	config.App.R2UploadEnabled = true
	t.Cleanup(backgroundUploads.Wait)
	return g
}

func multipartRequest(t *testing.T, fields map[string]string, fileField, fileName string, content []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		mw.WriteField(k, v)
	}
	fw, err := mw.CreateFormFile(fileField, fileName)
	if err != nil {
		t.Fatal(err)
	}
	fw.Write(content)
	mw.Close()
	r := httptest.NewRequest(http.MethodPost, "/", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	return r
}

// capturePhoto mengunggah satu foto raw lewat endpoint booth.
func capturePhoto(t *testing.T, sessionID string, content []byte) string {
	t.Helper()
	w := httptest.NewRecorder()
	UploadPhoto(w, multipartRequest(t, map[string]string{"session_id": sessionID}, "photo", "foto.jpg", content))
	if w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Fatalf("upload foto: %d %s", w.Code, w.Body)
	}
	var res struct {
		Data models.Photo `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	return res.Data.ID
}

// composeStrip menyimpan strip final lewat endpoint booth.
func composeStrip(t *testing.T, sessionID string, photoIDs []string, content []byte) {
	t.Helper()
	ids, _ := json.Marshal(photoIDs)
	w := httptest.NewRecorder()
	ComposeFrame(w, multipartRequest(t, map[string]string{
		"sessionId": sessionID, "frameId": "frame-uji", "photoIds": string(ids),
	}, "image", "strip.jpg", content))
	if w.Code != http.StatusOK {
		t.Fatalf("compose: %d %s", w.Code, w.Body)
	}
}

type qrLink struct {
	Enabled bool   `json:"enabled"`
	Ready   bool   `json:"ready"`
	URL     string `json:"url"`
}

// resultLink jawaban endpoint yang di-poll booth untuk QR.
func resultLink(t *testing.T, sessionID string) qrLink {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	rc := chi.NewRouteContext()
	rc.URLParams.Add("sessionID", sessionID)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rc))
	w := httptest.NewRecorder()
	GetSessionResultLink(w, r)
	var res struct {
		Data qrLink `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("link: %d %s", w.Code, w.Body)
	}
	return res.Data
}

// waitQRReady mem-poll endpoint link seperti booth.
func waitQRReady(t *testing.T, sessionID string) qrLink {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if l := resultLink(t, sessionID); l.Ready {
			return l
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("QR sesi %s tidak pernah siap", sessionID)
	return qrLink{}
}

func TestCapturedPhotosAreUploadedToR2InCaptureOrder(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)

	capturePhoto(t, id, []byte("JPEG satu"))
	capturePhoto(t, id, []byte("JPEG dua"))

	for key, want := range map[string]string{
		"sessions/" + id + "/foto-1.jpg": "JPEG satu",
		"sessions/" + id + "/foto-2.jpg": "JPEG dua",
	} {
		o := g.waitObject(t, key)
		if string(o.body) != want || o.contentType != "image/jpeg" {
			t.Errorf("%s: isi %q, tipe %q", key, o.body, o.contentType)
		}
	}
}

func TestComposedStripMakesTheQRPointToTheResultPage(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	foto := capturePhoto(t, id, []byte("JPEG satu"))
	g.waitObject(t, "sessions/"+id+"/foto-1.jpg")

	composeStrip(t, id, []string{foto}, []byte("JPEG strip"))

	link := waitQRReady(t, id)
	if !link.Enabled || link.URL != r2PublicBase+"sessions/"+id+"/index.html" {
		t.Errorf("link = %+v", link)
	}
	if o, _ := g.object("sessions/" + id + "/strip.jpg"); string(o.body) != "JPEG strip" || o.contentType != "image/jpeg" {
		t.Errorf("strip: isi %q, tipe %q", o.body, o.contentType)
	}
	if o, _ := g.object("sessions/" + id + "/index.html"); o.contentType != "text/html; charset=utf-8" {
		t.Errorf("index.html tipe %q", o.contentType)
	}
}

// resultPageHTML Halaman Hasil sesi versi terakhir, setelah semua upload selesai.
func resultPageHTML(t *testing.T, g *fakeR2, sessionID string) string {
	t.Helper()
	waitQRReady(t, sessionID)
	backgroundUploads.Wait()
	o, ok := g.object("sessions/" + sessionID + "/index.html")
	if !ok {
		t.Fatal("index.html belum diunggah")
	}
	return string(o.body)
}

// firstResultPageHTML versi Halaman Hasil yang pertama kali diunggah (yang
// dilihat pelanggan begitu QR siap, sebelum GIF selesai).
func firstResultPageHTML(t *testing.T, g *fakeR2, sessionID string) string {
	t.Helper()
	waitQRReady(t, sessionID)
	o, ok := g.firstVersion("sessions/" + sessionID + "/index.html")
	if !ok {
		t.Fatal("index.html belum diunggah")
	}
	return string(o.body)
}

// firstVersion versi pertama yang pernah diunggah untuk key.
func (g *fakeR2) firstVersion(key string) (r2Object, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if v := g.history[key]; len(v) > 0 {
		return v[0], true
	}
	return r2Object{}, false
}

func TestFirstResultPageShowsStripUploadedPhotosAndGIFNote(t *testing.T) {
	g := r2Env(t)
	mustExec(t, `INSERT INTO app_settings (key, value) VALUES ('brand_label', 'Booth <Ceria>')
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`)
	id := paidSession(t)

	// Foto pertama diambil sebelum R2 dinyalakan, jadi tidak ada di R2.
	config.App.R2UploadEnabled = false
	f1 := capturePhoto(t, id, []byte("JPEG satu"))
	config.App.R2UploadEnabled = true
	f2 := capturePhoto(t, id, []byte("JPEG dua"))
	g.waitObject(t, "sessions/"+id+"/foto-2.jpg")
	backgroundUploads.Wait() // penanda foto-2 terunggah sudah tersimpan

	composeStrip(t, id, []string{f1, f2}, []byte("JPEG strip"))
	page := firstResultPageHTML(t, g, id)

	for _, want := range []string{
		`lang="id"`,
		`Booth &lt;Ceria&gt;`,
		`href="strip.jpg" download`,
		`href="foto-2.jpg" download`,
		`GIF sedang disiapkan. Muat ulang halaman ini sebentar lagi.`,
	} {
		if !strings.Contains(page, want) {
			t.Errorf("halaman tidak memuat %q", want)
		}
	}
	for _, unwanted := range []string{"foto-1.jpg", "<script", "<form", "base64", "http://", "https://"} {
		if strings.Contains(page, unwanted) {
			t.Errorf("halaman memuat %q", unwanted)
		}
	}
}

func TestQRLinkOfASessionFinishedBeforeR2WasTurnedOnStaysOnDrive(t *testing.T) {
	r2Env(t)
	id := paidSession(t)
	driveFolder(t, id, true)

	if l := resultLink(t, id); !l.Enabled || !l.Ready || l.URL != driveFolderURL {
		t.Errorf("link = %+v, mau folder Drive", l)
	}
}

func TestQRLinkIsDisabledWhenNeitherR2NorDriveIsOn(t *testing.T) {
	r2Env(t)
	config.App.R2UploadEnabled = false
	id := paidSession(t)
	mustExec(t, `UPDATE sessions SET r2_url = 'https://foto.test/x/index.html' WHERE id = ?`, id)

	if l := resultLink(t, id); l.Enabled || l.Ready {
		t.Errorf("link = %+v, mau nonaktif", l)
	}
}

// Jam Windows kasar: dua foto bisa tercatat dengan created_at yang sama. Nomor
// foto-N tetap harus berbeda dan sama dengan yang dicantumkan Halaman Hasil.
func TestPhotosCapturedAtTheSameInstantGetDistinctNumbers(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	at := time.Date(2026, 11, 17, 10, 0, 0, 0, time.UTC)
	addPhoto(t, id, "raw", at)
	mustExec(t, `INSERT INTO photos (id, session_id, file_path, file_name, type, created_at)
		SELECT id || '-kembar', session_id, file_path, file_name, type, created_at FROM photos WHERE session_id = ?`, id)

	rows, err := database.DB.Query(`SELECT id, file_path FROM photos WHERE session_id = ? ORDER BY id`, id)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var pid, rel string
		rows.Scan(&pid, &rel)
		EnqueueRawPhotoUploadR2(id, pid, filepath.Join(config.App.StoragePath, rel))
	}
	rows.Close()

	g.waitObject(t, "sessions/"+id+"/foto-1.jpg")
	g.waitObject(t, "sessions/"+id+"/foto-2.jpg")
}

func (g *fakeR2) setDown(down bool) {
	g.mu.Lock()
	g.down = down
	g.mu.Unlock()
}

// fakeGIFs menaruh kedua GIF sesi seolah generator sudah selesai.
func fakeGIFs(t *testing.T, sessionID string) {
	t.Helper()
	for path, body := range map[string]string{
		services.AnimationOutputPath(sessionID): "GIF slideshow",
		services.LiveStripOutputPath(sessionID): "GIF live",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func r2Synced(t *testing.T, sessionID string) bool {
	t.Helper()
	var synced bool
	if err := database.DB.QueryRow(`SELECT r2_synced FROM sessions WHERE id = ?`, sessionID).Scan(&synced); err != nil {
		t.Fatal(err)
	}
	return synced
}

func TestFinishedGIFsCompleteTheResultPage(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	foto := capturePhoto(t, id, []byte("JPEG satu"))
	fakeGIFs(t, id)

	composeStrip(t, id, []string{foto}, []byte("JPEG strip"))
	backgroundUploads.Wait()

	for key, want := range map[string]string{
		"sessions/" + id + "/slideshow.gif":  "GIF slideshow",
		"sessions/" + id + "/live-strip.gif": "GIF live",
	} {
		if o, _ := g.object(key); string(o.body) != want || o.contentType != "image/gif" {
			t.Errorf("%s: isi %q, tipe %q", key, o.body, o.contentType)
		}
	}
	page := resultPageHTML(t, g, id)
	for _, want := range []string{`href="slideshow.gif" download`, `href="live-strip.gif" download`, `href="foto-1.jpg" download`, `href="strip.jpg" download`} {
		if !strings.Contains(page, want) {
			t.Errorf("halaman akhir tidak memuat %q", want)
		}
	}
	if strings.Contains(page, "GIF sedang disiapkan") {
		t.Error("halaman akhir masih menyebut GIF sedang disiapkan")
	}
	if !r2Synced(t, id) {
		t.Error("sesi belum ditandai tersinkron ke R2")
	}
}

func TestRetryJobCompletesASessionAfterTheGatewayComesBack(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	g.setDown(true)
	foto := capturePhoto(t, id, []byte("JPEG satu"))
	fakeGIFs(t, id)
	composeStrip(t, id, []string{foto}, []byte("JPEG strip"))
	backgroundUploads.Wait()
	if l := resultLink(t, id); l.Ready || r2Synced(t, id) {
		t.Fatalf("gateway mati tapi link = %+v, tersinkron = %v", l, r2Synced(t, id))
	}

	g.setDown(false)
	mustExec(t, `UPDATE sessions SET completed_at = NOW() - INTERVAL '2 minutes' WHERE id = ?`, id)
	retryPendingR2Sessions()

	page := resultPageHTML(t, g, id)
	for _, want := range []string{`href="strip.jpg" download`, `href="foto-1.jpg" download`, `href="slideshow.gif" download`} {
		if !strings.Contains(page, want) {
			t.Errorf("halaman tidak memuat %q", want)
		}
	}
	if !r2Synced(t, id) {
		t.Error("sesi belum ditandai tersinkron setelah retry")
	}
}

func TestRetryJobSkipsFreshAndExpiredSessions(t *testing.T) {
	g := r2Env(t)
	g.setDown(true)
	fresh, expired := paidSession(t), paidSession(t)
	for _, id := range []string{fresh, expired} {
		composeStrip(t, id, nil, []byte("JPEG strip"))
	}
	backgroundUploads.Wait()
	g.setDown(false)
	mustExec(t, `UPDATE sessions SET completed_at = NOW() - INTERVAL '2 minutes', expires_at = NOW() - INTERVAL '1 minute' WHERE id = ?`, expired)

	retryPendingR2Sessions()

	for _, id := range []string{fresh, expired} {
		if _, ok := g.object("sessions/" + id + "/strip.jpg"); ok {
			t.Errorf("sesi %s ikut diunggah retry job", id)
		}
	}
}

func TestRecomposeReplacesTheStripAndNeedsANewSync(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	foto := capturePhoto(t, id, []byte("JPEG satu"))
	composeStrip(t, id, []string{foto}, []byte("JPEG strip lama"))
	backgroundUploads.Wait()
	if !r2Synced(t, id) {
		t.Fatal("compose pertama belum tersinkron")
	}

	// Compose ulang saat layanan sedang mati: versi baru belum naik, jadi sesi
	// harus kembali masuk antrean retry job.
	g.setDown(true)
	composeStrip(t, id, []string{foto}, []byte("JPEG strip baru"))
	backgroundUploads.Wait()
	if r2Synced(t, id) {
		t.Fatal("compose ulang tidak mereset penanda sinkron R2")
	}

	g.setDown(false)
	mustExec(t, `UPDATE sessions SET completed_at = NOW() - INTERVAL '2 minutes' WHERE id = ?`, id)
	retryPendingR2Sessions()
	if o, _ := g.object("sessions/" + id + "/strip.jpg"); string(o.body) != "JPEG strip baru" {
		t.Errorf("strip di R2 = %q, mau versi baru", o.body)
	}
	if !r2Synced(t, id) {
		t.Error("versi baru belum tersinkron setelah retry")
	}
}

// Finalisasi milik compose A yang baru mendapat giliran setelah compose B
// tersimpan tidak boleh menandai sesi tersinkron: GIF dan strip yang ia kirim
// bisa jadi milik A, jadi versi B harus tetap disusulkan retry job.
func TestFinalizeOfAnOlderComposeDoesNotMarkTheSessionSynced(t *testing.T) {
	r2Env(t)
	id := paidSession(t)
	foto := capturePhoto(t, id, []byte("JPEG satu"))
	composeStrip(t, id, []string{foto}, []byte("JPEG strip A"))
	backgroundUploads.Wait()

	var composeA sql.NullTime
	if err := database.DB.QueryRow(`SELECT completed_at FROM sessions WHERE id = ?`, id).Scan(&composeA); err != nil {
		t.Fatal(err)
	}
	// Compose B tersimpan (completed_at baru, penanda sinkron direset).
	mustExec(t, `UPDATE sessions SET completed_at = completed_at + INTERVAL '1 second', r2_synced = FALSE WHERE id = ?`, id)

	finalizeSessionToR2(id, composeA)

	if r2Synced(t, id) {
		t.Error("finalisasi compose lama menandai sesi tersinkron")
	}
}
