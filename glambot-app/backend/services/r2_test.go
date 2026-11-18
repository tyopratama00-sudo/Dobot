package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Alamat presign bisa dipakai siapa pun selama 5 menit, jadi tidak boleh ikut
// di pesan error yang ditulis ke log.
func TestFailedUploadDoesNotLeakThePresignedURL(t *testing.T) {
	dead := httptest.NewServer(http.NotFoundHandler())
	deadURL := dead.URL
	dead.Close()

	fakeGateway(t, func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"url":     deadURL + "/sessions/x/strip.jpg?X-Amz-Signature=rahasia",
			"headers": map[string]string{"Content-Type": "image/jpeg"},
		})
	})
	path := filepath.Join(t.TempDir(), "strip.jpg")
	os.WriteFile(path, []byte("JPEG"), 0o644)

	_, err := UploadToR2(context.Background(), "sessions/x/strip.jpg", path, "image/jpeg")
	if err == nil {
		t.Fatal("upload ke server mati tidak gagal")
	}
	if strings.Contains(err.Error(), "rahasia") || strings.Contains(err.Error(), deadURL) {
		t.Errorf("error membawa alamat presign: %v", err)
	}
}
