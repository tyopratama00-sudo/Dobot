// Command mock-gateway meniru API pay.photorobot.id untuk development, tanpa
// Midtrans dan tanpa R2. Pembayaran disimulasikan dengan membuka
// http://localhost:8090/mock/pay/{order_id} di browser; file upload disimpan
// di folder ./mock-uploads dan bisa dibuka lewat /mock/files/. Email dari
// publish tidak dikirim, hanya disimpan di mock-uploads/_email/.
//
//	go run ./cmd/mock-gateway   (lalu isi PAYMENT_GATEWAY_URL=http://localhost:8090 di backend/.env)
//
// Aturan validasi mengikuti Referensi API pay.photorobot.id v1.0 (sama dengan
// produksi). Rate limit tidak ditiru.
package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	addr       = "localhost:8090"
	dir        = "mock-uploads"
	maxBody    = 8 << 10
	maxSize    = 100 << 20
	maxAmount  = 1_000_000
	maxFiles   = 200
	publicBase = "http://" + addr + "/mock/files/"
)

var (
	orderPattern   = regexp.MustCompile(`^BOOTH-[0-9a-f]{8}$`)
	qrisSessionPat = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)
	uuidPattern    = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	fileNamePat    = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`)
	contentTypes   = map[string]string{
		".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
		".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4",
	}
)

var (
	mu        sync.Mutex
	orders    = map[string]string{} // order_id -> status
	published = map[string]bool{}   // session_id -> halaman sudah final
	emailed   = map[string]bool{}   // session_id -> email sudah terkirim
)

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// authed meniru layanan asli: tanpa header Bearer ditolak 401.
func authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if tok, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); !ok || tok == "" {
			fail(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}

// decodeBody membaca body JSON maksimal 8 KB. Body kosong dianggap {} kalau
// optional.
func decodeBody(r *http.Request, v any, optional bool) bool {
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(raw) > maxBody {
		return false
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return optional
	}
	return json.Unmarshal(raw, v) == nil
}

func sessionDir(id string) string { return filepath.Join(dir, "sessions", id) }
func pageURL(id string) string    { return publicBase + "sessions/" + id + "/index.html" }

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	// ── Pembayaran QRIS ──
	mux.HandleFunc("POST /v1/qris", authed(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			OrderID       string `json:"order_id"`
			Amount        int64  `json:"amount"`
			SessionID     string `json:"session_id"`
			ExpiryMinutes int    `json:"expiry_minutes"`
		}
		switch {
		case !decodeBody(r, &req, false):
			fail(w, http.StatusBadRequest, "invalid_body")
		case !orderPattern.MatchString(req.OrderID):
			fail(w, http.StatusBadRequest, "invalid_order_id")
		case req.Amount < 1 || req.Amount > maxAmount:
			fail(w, http.StatusBadRequest, "invalid_amount")
		case !qrisSessionPat.MatchString(req.SessionID):
			fail(w, http.StatusBadRequest, "invalid_session_id")
		case req.ExpiryMinutes < 1 || req.ExpiryMinutes > 60:
			fail(w, http.StatusBadRequest, "invalid_expiry")
		default:
			mu.Lock()
			_, dup := orders[req.OrderID]
			if !dup {
				orders[req.OrderID] = "pending"
			}
			mu.Unlock()
			if dup {
				fail(w, http.StatusBadGateway, "midtrans_error")
				return
			}
			log.Printf("QRIS %s Rp %d (sesi %s, %d menit) — bayar: http://%s/mock/pay/%s",
				req.OrderID, req.Amount, req.SessionID, req.ExpiryMinutes, addr, req.OrderID)
			writeJSON(w, http.StatusCreated, map[string]string{"qris_url": "", "qris_raw": "MOCK-QRIS-" + req.OrderID})
		}
	}))

	mux.HandleFunc("GET /v1/qris/{orderID}", authed(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("orderID")
		if !orderPattern.MatchString(id) {
			fail(w, http.StatusBadRequest, "invalid_order_id")
			return
		}
		mu.Lock()
		st, ok := orders[id]
		mu.Unlock()
		if !ok {
			fail(w, http.StatusNotFound, "order_not_found")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": st})
	}))

	mux.HandleFunc("POST /v1/qris/{orderID}/expire", authed(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("orderID")
		if !orderPattern.MatchString(id) {
			fail(w, http.StatusBadRequest, "invalid_order_id")
			return
		}
		mu.Lock()
		defer mu.Unlock()
		switch orders[id] {
		case "":
			fail(w, http.StatusNotFound, "order_not_found")
		case "paid", "expired":
			fail(w, http.StatusBadGateway, "midtrans_error")
		default:
			orders[id] = "expired"
			log.Printf("QRIS %s ditutup (expired)", id)
			writeJSON(w, http.StatusOK, map[string]string{"status": "expired"})
		}
	}))

	mux.HandleFunc("GET /mock/pay/{orderID}", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if _, ok := orders[r.PathValue("orderID")]; !ok {
			http.Error(w, "order tidak dikenal", http.StatusNotFound)
			return
		}
		orders[r.PathValue("orderID")] = "paid"
		fmt.Fprintf(w, "%s ditandai LUNAS\n", r.PathValue("orderID"))
	})

	// ── Upload dan Halaman Hasil ──
	mux.HandleFunc("POST /v1/sessions/{sessionID}/start", authed(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("sessionID")
		if !uuidPattern.MatchString(id) {
			fail(w, http.StatusBadRequest, "invalid_session_id")
			return
		}
		mu.Lock()
		final := published[id]
		mu.Unlock()
		if !final {
			if err := writePage(id, nil); err != nil {
				log.Printf("start %s: %v", id, err)
				fail(w, http.StatusBadGateway, "r2_error")
				return
			}
		}
		log.Printf("start %s", id)
		writeJSON(w, http.StatusOK, map[string]string{"url": pageURL(id)})
	}))

	mux.HandleFunc("POST /v1/uploads/presign", authed(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Key         string `json:"key"`
			ContentType string `json:"content_type"`
			Size        int64  `json:"size"`
		}
		if !decodeBody(r, &req, false) {
			fail(w, http.StatusBadRequest, "invalid_body")
			return
		}
		parts := strings.Split(req.Key, "/")
		if len(parts) != 3 || parts[0] != "sessions" || !uuidPattern.MatchString(parts[1]) ||
			!fileNamePat.MatchString(parts[2]) || parts[2] == "index.html" {
			fail(w, http.StatusBadRequest, "invalid_key")
			return
		}
		if ct, ok := contentTypes[strings.ToLower(filepath.Ext(parts[2]))]; !ok || ct != req.ContentType {
			fail(w, http.StatusBadRequest, "invalid_content_type")
			return
		}
		if req.Size < 1 || req.Size > maxSize {
			fail(w, http.StatusBadRequest, "invalid_size")
			return
		}
		// "Tanda tangan" mock: ukuran dan tipe ikut di URL, dicek saat PUT.
		writeJSON(w, http.StatusOK, map[string]any{
			"url": fmt.Sprintf("http://%s/mock/upload/%s?size=%d&ct=%s", addr, req.Key, req.Size,
				strings.ReplaceAll(req.ContentType, "/", "%2F")),
			"headers":    map[string]string{"Content-Type": req.ContentType, "Cache-Control": "public, max-age=86400"},
			"public_url": publicBase + req.Key,
			"expires_in": 300,
		})
	}))

	mux.HandleFunc("PUT /mock/upload/{key...}", func(w http.ResponseWriter, r *http.Request) {
		size, _ := strconv.ParseInt(r.URL.Query().Get("size"), 10, 64)
		if r.ContentLength != size || r.Header.Get("Content-Type") != r.URL.Query().Get("ct") ||
			r.Header.Get("Cache-Control") != "public, max-age=86400" {
			http.Error(w, "<Error><Code>SignatureDoesNotMatch</Code></Error>", http.StatusForbidden)
			return
		}
		path := filepath.Join(dir, filepath.FromSlash(r.PathValue("key")))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		f, err := os.Create(path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()
		n, _ := io.Copy(f, r.Body)
		log.Printf("upload %s (%d byte, %s)", r.PathValue("key"), n, r.Header.Get("Content-Type"))
	})

	mux.HandleFunc("POST /v1/sessions/{sessionID}/publish", authed(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("sessionID")
		var req struct {
			Email   string `json:"email"`
			Consent bool   `json:"consent"`
		}
		if !decodeBody(r, &req, true) {
			fail(w, http.StatusBadRequest, "invalid_body")
			return
		}
		if !uuidPattern.MatchString(id) {
			fail(w, http.StatusBadRequest, "invalid_session_id")
			return
		}
		email := strings.TrimSpace(req.Email)
		if email != "" && (len(email) > 254 || strings.ContainsAny(email, " \t") || !strings.Contains(email, "@")) {
			fail(w, http.StatusBadRequest, "invalid_email")
			return
		}
		if email != "" && !req.Consent {
			fail(w, http.StatusBadRequest, "consent_required")
			return
		}
		files := sessionFiles(id)
		if len(files) == 0 {
			fail(w, http.StatusConflict, "no_files")
			return
		}
		if err := writePage(id, files); err != nil {
			log.Printf("publish %s: %v", id, err)
			fail(w, http.StatusBadGateway, "r2_error")
			return
		}

		mu.Lock()
		published[id] = true
		emailStatus := "none"
		if email != "" {
			if emailed[id] {
				emailStatus = "already_sent"
			} else if err := saveEmail(id, email); err != nil {
				emailStatus = "failed"
			} else {
				emailed[id], emailStatus = true, "sent"
			}
		}
		mu.Unlock()
		log.Printf("publish %s: %d file, email %s", id, len(files), emailStatus)
		writeJSON(w, http.StatusOK, map[string]any{"url": pageURL(id), "files": len(files), "email": emailStatus})
	}))

	mux.Handle("GET /mock/files/", http.StripPrefix("/mock/files/", http.FileServer(http.Dir(dir))))

	log.Printf("mock gateway di http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// sessionFiles file sesi urut tampil: strip*, lalu .gif, lalu foto lain, lalu
// .mp4; di dalam kelompok urut alami (foto-2 sebelum foto-10). File 0 byte
// diabaikan, maksimal 200.
func sessionFiles(id string) []string {
	entries, _ := os.ReadDir(sessionDir(id))
	var files []string
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || e.IsDir() || info.Size() == 0 || e.Name() == "index.html" {
			continue
		}
		if _, ok := contentTypes[strings.ToLower(filepath.Ext(e.Name()))]; ok {
			files = append(files, e.Name())
		}
	}
	group := func(name string) int {
		ext := strings.ToLower(filepath.Ext(name))
		switch {
		case strings.HasPrefix(name, "strip"):
			return 0
		case ext == ".gif":
			return 1
		case ext == ".mp4":
			return 3
		}
		return 2
	}
	sort.Slice(files, func(i, j int) bool {
		if gi, gj := group(files[i]), group(files[j]); gi != gj {
			return gi < gj
		}
		return naturalLess(files[i], files[j])
	})
	if len(files) > maxFiles {
		files = files[:maxFiles]
	}
	return files
}

var digits = regexp.MustCompile(`\d+|\D+`)

func naturalLess(a, b string) bool {
	pa, pb := digits.FindAllString(a, -1), digits.FindAllString(b, -1)
	for i := 0; i < len(pa) && i < len(pb); i++ {
		if pa[i] == pb[i] {
			continue
		}
		na, ea := strconv.Atoi(pa[i])
		nb, eb := strconv.Atoi(pb[i])
		if ea == nil && eb == nil {
			return na < nb
		}
		return pa[i] < pb[i]
	}
	return len(pa) < len(pb)
}

var pageTemplate = template.Must(template.New("page").Parse(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foto sesi (mock)</title>
<style>body{font-family:sans-serif;max-width:720px;margin:0 auto;padding:16px}img,video{max-width:100%;display:block;margin:8px 0}</style>
</head><body>
<p><small>MOCK pay.photorobot.id — halaman produksi dibuat layanan dengan tampilan sendiri.</small></p>
{{if .Files}}<h1>Foto sesimu</h1>
{{range .Files}}{{if .Video}}<video src="{{.Name}}" controls></video>{{else}}<img src="{{.Name}}" alt="{{.Name}}">{{end}}
<a href="{{.Name}}" download>Unduh {{.Name}}</a>
{{end}}{{else}}<h1>Foto sedang diproses</h1><p>Muat ulang halaman ini sebentar lagi.</p>{{end}}
</body></html>
`))

// writePage menulis index.html sesi: "sedang diproses" kalau files kosong,
// galeri kalau ada.
func writePage(id string, files []string) error {
	type item struct {
		Name  string
		Video bool
	}
	var items []item
	for _, f := range files {
		items = append(items, item{f, strings.EqualFold(filepath.Ext(f), ".mp4")})
	}
	if err := os.MkdirAll(sessionDir(id), 0o755); err != nil {
		return err
	}
	f, err := os.Create(filepath.Join(sessionDir(id), "index.html"))
	if err != nil {
		return err
	}
	defer f.Close()
	return pageTemplate.Execute(f, map[string]any{"Files": items})
}

func saveEmail(id, email string) error {
	if err := os.MkdirAll(filepath.Join(dir, "_email"), 0o755); err != nil {
		return err
	}
	body := fmt.Sprintf("Kepada: %s\nWaktu: %s\n\nFoto sesimu sudah siap: %s\n", email, time.Now().Format(time.RFC3339), pageURL(id))
	return os.WriteFile(filepath.Join(dir, "_email", id+".txt"), []byte(body), 0o644)
}
