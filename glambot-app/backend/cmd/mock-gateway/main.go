// Command mock-gateway meniru API pay.photorobot.id untuk development, tanpa
// Midtrans dan tanpa R2. Pembayaran disimulasikan dengan membuka
// http://localhost:8090/mock/pay/{order_id} di browser; file upload disimpan
// di folder ./mock-uploads dan bisa dibuka lewat /mock/files/.
//
//	go run ./cmd/mock-gateway   (lalu isi PAYMENT_GATEWAY_URL=http://localhost:8090 di backend/.env)
//
// Mock TIDAK memeriksa tanda tangan URL, batas ukuran, maupun rate limit
// sepersis layanan asli. Sumber: Lampiran A panduan integrasi v3.0.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	addr = "localhost:8090"
	dir  = "mock-uploads"
)

var (
	mu     sync.Mutex
	orders = map[string]string{} // order_id -> status
)

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// authed meniru layanan asli: tanpa header Bearer ditolak 401.
func authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("POST /v1/qris", authed(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			OrderID string `json:"order_id"`
			Amount  int64  `json:"amount"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil || !strings.HasPrefix(req.OrderID, "BOOTH-") || req.Amount < 1 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_body"})
			return
		}
		mu.Lock()
		orders[req.OrderID] = "pending"
		mu.Unlock()
		log.Printf("QRIS %s Rp %d — bayar: http://%s/mock/pay/%s", req.OrderID, req.Amount, addr, req.OrderID)
		writeJSON(w, http.StatusCreated, map[string]string{"qris_url": "", "qris_raw": "MOCK-QRIS-" + req.OrderID})
	}))

	mux.HandleFunc("GET /v1/qris/{orderID}", authed(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		st, ok := orders[r.PathValue("orderID")]
		mu.Unlock()
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "order_not_found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": st})
	}))

	mux.HandleFunc("POST /v1/qris/{orderID}/expire", authed(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if orders[r.PathValue("orderID")] == "paid" {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "midtrans_error"})
			return
		}
		orders[r.PathValue("orderID")] = "expired"
		log.Printf("QRIS %s ditutup (expired)", r.PathValue("orderID"))
		writeJSON(w, http.StatusOK, map[string]string{"status": "expired"})
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

	mux.HandleFunc("POST /v1/uploads/presign", authed(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Key         string `json:"key"`
			ContentType string `json:"content_type"`
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil || !strings.HasPrefix(req.Key, "sessions/") || strings.Contains(req.Key, "..") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_key"})
			return
		}
		cache := "public, max-age=86400"
		if strings.HasSuffix(req.Key, "/index.html") {
			cache = "no-cache"
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"url":        "http://" + addr + "/mock/upload/" + req.Key,
			"headers":    map[string]string{"Content-Type": req.ContentType, "Cache-Control": cache},
			"public_url": "http://" + addr + "/mock/files/" + req.Key,
			"expires_in": 300,
		})
	}))

	mux.HandleFunc("PUT /mock/upload/{key...}", func(w http.ResponseWriter, r *http.Request) {
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
		if n != r.ContentLength {
			http.Error(w, "ukuran tidak sama dengan Content-Length", http.StatusBadRequest)
			return
		}
		log.Printf("upload %s (%d byte, %s)", r.PathValue("key"), n, r.Header.Get("Content-Type"))
	})
	mux.Handle("GET /mock/files/", http.StripPrefix("/mock/files/", http.FileServer(http.Dir(dir))))

	log.Printf("mock gateway di http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
