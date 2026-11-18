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
	"regexp"
	"sort"
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

// r2ContentTypes ekstensi yang diterima presign layanan (Referensi API 4.2).
var r2ContentTypes = map[string]string{
	".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
	".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4",
}

var r2KeyPattern = regexp.MustCompile(`^sessions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`)

// fakeR2 meniru pay.photorobot.id (start, presign, publish) sekaligus R2
// (PUT): setiap file yang diunggah kiosk disimpan di memori menurut key-nya,
// dan setiap publish mencatat file apa saja yang tampil di Halaman Hasil.
type fakeR2 struct {
	mu          sync.Mutex
	objects     map[string]r2Object
	presigned   []string            // semua key yang pernah diminta presign
	published   map[string][]string // sesi -> nama file pada publish terakhir
	emails      []string            // isi field email setiap publish
	down        bool                // true: layanan menjawab 503 di semua endpoint R2
	uploadsDown bool                // true: hanya presign yang gagal
	srv         *httptest.Server
}

func startFakeR2(t *testing.T) *fakeR2 {
	t.Helper()
	g := &fakeR2{objects: map[string]r2Object{}, published: map[string][]string{}}
	fail := func(w http.ResponseWriter, code int, msg string) {
		w.WriteHeader(code)
		json.NewEncoder(w).Encode(map[string]string{"error": msg})
	}
	g.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/put/") {
			var buf bytes.Buffer
			buf.ReadFrom(r.Body)
			if int64(buf.Len()) != r.ContentLength || r.Header.Get("Authorization") != "" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			g.mu.Lock()
			g.objects[strings.TrimPrefix(r.URL.Path, "/put/")] = r2Object{r.Header.Get("Content-Type"), buf.Bytes()}
			g.mu.Unlock()
			return
		}
		if r.Header.Get("Authorization") != "Bearer tok-rahasia" {
			fail(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		g.mu.Lock()
		defer g.mu.Unlock()
		if g.down {
			fail(w, http.StatusServiceUnavailable, "r2_not_configured")
			return
		}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/uploads/presign":
			if g.uploadsDown {
				fail(w, http.StatusBadGateway, "r2_error")
				return
			}
			var req struct {
				Key         string `json:"key"`
				ContentType string `json:"content_type"`
				Size        int64  `json:"size"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			g.presigned = append(g.presigned, req.Key)
			if !r2KeyPattern.MatchString(req.Key) || strings.HasSuffix(req.Key, "/index.html") {
				fail(w, http.StatusBadRequest, "invalid_key")
				return
			}
			if r2ContentTypes[strings.ToLower(filepath.Ext(req.Key))] != req.ContentType {
				fail(w, http.StatusBadRequest, "invalid_content_type")
				return
			}
			if req.Size < 1 {
				fail(w, http.StatusBadRequest, "invalid_size")
				return
			}
			json.NewEncoder(w).Encode(map[string]any{
				"url":        g.srv.URL + "/put/" + req.Key,
				"headers":    map[string]string{"Content-Type": req.ContentType, "Cache-Control": "public, max-age=86400"},
				"public_url": r2PublicBase + req.Key,
				"expires_in": 300,
			})
		case r.Method == http.MethodPost && len(parts) == 4 && parts[1] == "sessions" && parts[3] == "start":
			json.NewEncoder(w).Encode(map[string]string{"url": r2PublicBase + "sessions/" + parts[2] + "/index.html"})
		case r.Method == http.MethodPost && len(parts) == 4 && parts[1] == "sessions" && parts[3] == "publish":
			var req struct {
				Email string `json:"email"`
			}
			json.NewDecoder(r.Body).Decode(&req)
			prefix := "sessions/" + parts[2] + "/"
			var files []string
			for key := range g.objects {
				if strings.HasPrefix(key, prefix) {
					files = append(files, strings.TrimPrefix(key, prefix))
				}
			}
			if len(files) == 0 {
				fail(w, http.StatusConflict, "no_files")
				return
			}
			sort.Strings(files)
			g.published[parts[2]] = files
			g.emails = append(g.emails, req.Email)
			json.NewEncoder(w).Encode(map[string]any{
				"url": r2PublicBase + prefix + "index.html", "files": len(files), "email": "none",
			})
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

// publishedFiles isi Halaman Hasil sesi menurut publish terakhir.
func (g *fakeR2) publishedFiles(sessionID string) string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return strings.Join(g.published[sessionID], ",")
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
	backgroundUploads.Wait()
	if o, _ := g.object("sessions/" + id + "/strip.jpg"); string(o.body) != "JPEG strip" || o.contentType != "image/jpeg" {
		t.Errorf("strip: isi %q, tipe %q", o.body, o.contentType)
	}
	if got := g.publishedFiles(id); got != "foto-1.jpg,strip.jpg" {
		t.Errorf("Halaman Hasil berisi %q", got)
	}
}

// Halaman Hasil dibuat layanan; layanan menolak index.html dari booth.
func TestBoothNeverUploadsItsOwnResultPage(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	foto := capturePhoto(t, id, []byte("JPEG satu"))
	fakeGIFs(t, id)
	composeStrip(t, id, []string{foto}, []byte("JPEG strip"))
	backgroundUploads.Wait()

	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.presigned) == 0 {
		t.Fatal("tidak ada upload sama sekali")
	}
	for _, key := range g.presigned {
		if strings.HasSuffix(key, "/index.html") {
			t.Errorf("booth meminta presign %s", key)
		}
	}
}

// Link dari start tidak berubah sampai akhir, jadi QR bisa tampil walaupun
// upload strip sedang gagal; sesinya disusulkan retry job.
func TestQRIsReadyEvenWhenTheStripUploadFails(t *testing.T) {
	g := r2Env(t)
	id := paidSession(t)
	g.mu.Lock()
	g.uploadsDown = true
	g.mu.Unlock()

	composeStrip(t, id, nil, []byte("JPEG strip"))

	if l := waitQRReady(t, id); l.URL != r2PublicBase+"sessions/"+id+"/index.html" {
		t.Errorf("link = %+v", l)
	}
	backgroundUploads.Wait()
	if r2Synced(t, id) {
		t.Error("sesi ditandai tersinkron padahal strip belum terunggah")
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
// foto-N tetap harus berbeda dan tetap sama setiap kali diunggah.
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
	if got := g.publishedFiles(id); got != "foto-1.jpg,live-strip.gif,slideshow.gif,strip.jpg" {
		t.Errorf("Halaman Hasil akhir berisi %q", got)
	}
	// Email Foto dikirim booth sendiri, bukan oleh publish.
	g.mu.Lock()
	for _, e := range g.emails {
		if e != "" {
			t.Errorf("publish mengirim email %q", e)
		}
	}
	g.mu.Unlock()
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

	if l := resultLink(t, id); !l.Ready {
		t.Errorf("link setelah retry = %+v", l)
	}
	if got := g.publishedFiles(id); got != "foto-1.jpg,live-strip.gif,slideshow.gif,strip.jpg" {
		t.Errorf("Halaman Hasil setelah retry berisi %q", got)
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
