package services

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"photobooth/config"
	"strings"
	"time"
)

// Upload hasil sesi ke Cloudflare R2 lewat layanan pay.photorobot.id: kiosk
// meminta URL upload sementara (presign), lalu PUT file langsung ke R2. Kiosk
// tidak memegang key R2, dan foto tidak lewat VPS.

// Upload di koneksi kiosk bisa lama; URL presign hanya perlu valid saat mulai.
var uploadHTTP = &http.Client{Timeout: 5 * time.Minute}

// IsR2Enabled true kalau layanan aktif dan owner menyalakan R2_UPLOAD_ENABLED.
func IsR2Enabled() bool {
	return PaymentGatewayEnabled() && config.App.R2UploadEnabled
}

// R2Key menyusun key objek per sesi: sessions/{sessionID}/{name}.
// name hanya huruf, angka, titik, minus, garis bawah (aturan layanan).
func R2Key(sessionID, name string) string { return "sessions/" + sessionID + "/" + name }

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

// R2HTMLContentType satu-satunya content type yang diterima untuk index.html.
const R2HTMLContentType = "text/html; charset=utf-8"

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

// UploadBytesToR2 untuk file yang dibuat di memori, mis. index.html.
func UploadBytesToR2(ctx context.Context, key string, data []byte, contentType string) (string, error) {
	return putToR2(ctx, key, bytes.NewReader(data), int64(len(data)), contentType)
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
		return "", fmt.Errorf("upload %s: %w", key, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("upload %s: HTTP %d: %s", key, resp.StatusCode, msg)
	}
	return p.PublicURL, nil
}
