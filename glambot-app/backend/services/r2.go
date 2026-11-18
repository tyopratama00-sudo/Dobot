package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"photobooth/config"
	"strings"
	"time"
)

// Upload hasil sesi ke Cloudflare R2 lewat layanan pay.photorobot.id: kiosk
// meminta URL upload sementara (presign), lalu PUT file langsung ke R2. Kiosk
// tidak memegang key R2, dan foto tidak lewat VPS. Halaman Hasil (index.html)
// dibuat layanan sendiri lewat start dan publish; layanan menolak index.html
// dari kiosk. Referensi: Referensi API pay.photorobot.id v1.0 bagian 4.

// Upload di koneksi kiosk bisa lama; URL presign hanya perlu valid saat mulai.
var uploadHTTP = &http.Client{Timeout: 5 * time.Minute}

// IsR2Enabled true kalau layanan aktif dan owner menyalakan R2_UPLOAD_ENABLED.
func IsR2Enabled() bool {
	return PaymentGatewayEnabled() && config.App.R2UploadEnabled
}

// R2Key menyusun key objek per sesi: sessions/{sessionID}/{name}.
// name hanya huruf, angka, titik, minus, garis bawah (aturan layanan).
func R2Key(sessionID, name string) string { return "sessions/" + r2SessionID(sessionID) + "/" + name }

// r2SessionID layanan hanya menerima UUID huruf kecil.
func r2SessionID(sessionID string) string { return strings.ToLower(sessionID) }

// R2ContentType content type yang diterima layanan untuk file gambar sesi.
func R2ContentType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	default:
		return "image/jpeg"
	}
}

// R2Context batas waktu satu putaran upload R2.
func R2Context() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 5*time.Minute)
}

// UploadToR2 mengunggah satu file lokal dan mengembalikan URL publiknya.
func UploadToR2(ctx context.Context, key, localPath, contentType string) (string, error) {
	f, err := os.Open(localPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return "", err
	}
	return putToR2(ctx, key, f, info.Size(), contentType)
}

func putToR2(ctx context.Context, key string, body io.Reader, size int64, contentType string) (string, error) {
	var p struct {
		URL       string            `json:"url"`
		Headers   map[string]string `json:"headers"`
		PublicURL string            `json:"public_url"`
	}
	err := gatewayDo(http.MethodPost, "/v1/uploads/presign", map[string]interface{}{
		"key":          key,
		"content_type": contentType,
		"size":         size,
	}, &p)
	if err != nil {
		return "", fmt.Errorf("presign %s: %w", key, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, p.URL, body)
	if err != nil {
		return "", err
	}
	// Ukuran dan header ini ikut ditandatangani: harus dikirim persis sama.
	req.ContentLength = size
	for k, v := range p.Headers {
		req.Header.Set(k, v)
	}

	resp, err := uploadHTTP.Do(req)
	if err != nil {
		// Error HTTP Go memuat alamat lengkap; alamat presign bisa dipakai
		// siapa pun selama 5 menit, jadi jangan sampai ikut ke log.
		var uerr *url.Error
		if errors.As(err, &uerr) {
			err = uerr.Err
		}
		return "", fmt.Errorf("upload %s: %w", key, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("upload %s: HTTP %d: %s", key, resp.StatusCode, msg)
	}
	return p.PublicURL, nil
}

// StartR2Session menyiapkan Halaman Hasil "sedang diproses" dan mengembalikan
// link-nya. Link tidak berubah sampai akhir, jadi QR bisa langsung dibuat.
// Aman dipanggil berulang; halaman yang sudah final tidak dikembalikan.
func StartR2Session(sessionID string) (string, error) {
	var out struct {
		URL string `json:"url"`
	}
	if err := gatewayDo(http.MethodPost, "/v1/sessions/"+r2SessionID(sessionID)+"/start", nil, &out); err != nil {
		return "", fmt.Errorf("start halaman hasil: %w", err)
	}
	return out.URL, nil
}

// PublishResult jawaban publish: link halaman, jumlah file yang tampil, dan
// hasil kirim email (none, sent, already_sent, failed, rate_limited, disabled).
type PublishResult struct {
	URL   string `json:"url"`
	Files int    `json:"files"`
	Email string `json:"email"`
}

// PublishR2Session menyusun Halaman Hasil dari semua file yang sudah ada di
// folder sesi. Aman dipanggil berulang (mis. lagi setelah GIF menyusul).
// email kosong = tanpa email; kalau diisi, consent wajib true.
func PublishR2Session(sessionID, email string, consent bool) (PublishResult, error) {
	payload := map[string]interface{}{}
	if email != "" {
		payload["email"] = email
		payload["consent"] = consent
	}
	var out PublishResult
	if err := gatewayDo(http.MethodPost, "/v1/sessions/"+r2SessionID(sessionID)+"/publish", payload, &out); err != nil {
		return out, fmt.Errorf("publish halaman hasil: %w", err)
	}
	return out, nil
}
